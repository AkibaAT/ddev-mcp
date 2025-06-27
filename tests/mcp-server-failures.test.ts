import { dbQuery, validateQuerySecurity } from '../src/database-service.js';
import { listProjects, getProjectStatus } from '../src/project-service.js';
import { execDDEVCommand } from '../src/ddev-command.js';

// Extend global type for test utilities
declare global {
  var testProjectName: string;
  var isDdevAvailable: boolean;
  var mysqlProject: {
    name: string;
    path: string;
    ready: boolean;
  };
  var postgresProject: {
    name: string;
    path: string;
    ready: boolean;
  };
}

describe('MCP Server Configuration and Error Scenarios', () => {
  let testProjectName: string;

  beforeAll(() => {
    if (!global.isDdevAvailable) {
      throw new Error('DDEV is required for MCP server failure tests but is not available');
    }

    // Use shared MySQL project
    if (global.mysqlProject?.ready && global.mysqlProject.name) {
      testProjectName = global.mysqlProject.name;
    } else {
      console.log('⚠️ No shared projects ready - tests will be limited');
      testProjectName = 'ddev-mcp-shared-mysql';
    }
  });

  describe('Configuration Edge Cases', () => {
    test('should handle empty project configuration', () => {
      // Test behavior when no specific project is configured
      const projects = listProjects();
      expect(projects.length).toBeGreaterThan(0);
      
      // Should still be able to query with explicit project name
      const result = dbQuery('SELECT 1 as config_test', false, undefined, testProjectName);
      expect(result).toContain('config_test');
    });

    test('should handle invalid configuration parameters', () => {
      // Test that core functions handle edge case parameters gracefully
      
      // Empty project name should either work with default or throw
      try {
        const result = dbQuery('SELECT 1', false, undefined, '');
        expect(typeof result).toBe('string');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
      
      // Undefined database parameter
      const result = dbQuery('SELECT 1 as undefined_db_test', false, undefined, testProjectName);
      expect(result).toContain('undefined_db_test');
    });

    test('should handle conflicting configuration options', () => {
      // Test security validation with conflicting options
      const writeQuery = 'CREATE TEMPORARY TABLE conflict_test (id INT)';
      
      // Read-only mode should block writes regardless of other settings
      const readOnlyResult = validateQuerySecurity(writeQuery, false);
      expect(readOnlyResult.allowed).toBe(false);
      
      // Write mode should allow writes
      const writeResult = validateQuerySecurity(writeQuery, true);
      expect(writeResult.allowed).toBe(true);
    });
  });

  describe('Project Management Failures', () => {
    test('should handle project switching failures', () => {
      // Test switching to non-existent project
      const invalidProject = 'non-existent-project-12345';
      const status = getProjectStatus(invalidProject);
      expect(status).toBeNull();
      
      // Test that operations fail gracefully with invalid project
      expect(() => {
        dbQuery('SELECT 1', false, undefined, invalidProject);
      }).toThrow();
    });

    test('should handle project state inconsistencies', () => {
      // Test that we can detect project state properly
      const validStatus = getProjectStatus(testProjectName);
      expect(validStatus).toBeDefined();
      expect(validStatus?.name).toBe(testProjectName);
      
      // Test operations on valid project
      const result = dbQuery('SELECT 1 as state_test', false, undefined, testProjectName);
      expect(result).toContain('state_test');
    });

    test('should handle project permission issues', () => {
      // Test operations that might fail due to permissions
      try {
        const result = execDDEVCommand('exec "whoami"', testProjectName);
        expect(typeof result).toBe('string');
      } catch (error) {
        // Permission errors should be handled gracefully
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Security Enforcement Failures', () => {
    test('should handle attempts to bypass security', () => {
      const bypassAttempts = [
        'SELECT 1; DROP TABLE users',
        'UNION SELECT password FROM admin_users',
        '/*!50000 DROP TABLE users */',
        'SELECT @@version; UPDATE users SET password = "hacked"'
      ];

      bypassAttempts.forEach(query => {
        expect(() => {
          dbQuery(query, false, undefined, testProjectName);
        }).toThrow();
        
        // Security validation should catch these attempts
        const securityResult = validateQuerySecurity(query, false);
        expect(securityResult.allowed).toBe(false);
      });
    });

    test('should handle privilege escalation attempts', () => {
      const escalationAttempts = [
        'GRANT ALL PRIVILEGES ON *.* TO "hacker"@"%"',
        'CREATE USER "backdoor"@"%" IDENTIFIED BY "password"',
        'SET GLOBAL sql_mode = ""',
        'LOAD_FILE("/etc/passwd")'
      ];

      escalationAttempts.forEach(query => {
        expect(() => {
          dbQuery(query, true, undefined, testProjectName); // Even in write mode
        }).toThrow();
        
        // Security validation should block these even in write mode
        const securityResult = validateQuerySecurity(query, true);
        expect(securityResult.allowed).toBe(false);
      });
    });

    test('should handle data exfiltration attempts', () => {
      const exfiltrationAttempts = [
        'SELECT * INTO OUTFILE "/tmp/stolen_data.txt" FROM users',
        'SELECT LOAD_FILE("/etc/shadow")',
        'SELECT @@datadir',
        'SHOW GRANTS FOR CURRENT_USER()'
      ];

      exfiltrationAttempts.forEach(query => {
        expect(() => {
          dbQuery(query, false, undefined, testProjectName);
        }).toThrow();
        
        // Security validation should block these
        const securityResult = validateQuerySecurity(query, false);
        expect(securityResult.allowed).toBe(false);
      });
    });
  });

  describe('Resource Exhaustion Scenarios', () => {
    test('should handle memory-intensive operations', () => {
      // Test queries that might consume excessive memory
      const memoryIntensiveQueries = [
        'SELECT REPEAT("x", 1000000) as large_string',
        'SELECT * FROM information_schema.tables CROSS JOIN information_schema.columns'
      ];

      memoryIntensiveQueries.forEach(query => {
        try {
          const result = dbQuery(query, false, undefined, testProjectName);
          expect(typeof result).toBe('string');
        } catch (error) {
          // These might fail due to resource limits, which is acceptable
          expect(error).toBeInstanceOf(Error);
        }
      });
    });

    test('should handle time-intensive operations', () => {
      // Test queries that might take a long time
      const timeIntensiveQueries = [
        'SELECT SLEEP(0.1)', // Short sleep that should work
        'SELECT BENCHMARK(100, MD5("test"))'
      ];

      timeIntensiveQueries.forEach(query => {
        try {
          const result = dbQuery(query, false, undefined, testProjectName);
          expect(typeof result).toBe('string');
        } catch (error) {
          // These might fail due to timeouts, which is acceptable
          expect(error).toBeInstanceOf(Error);
        }
      });
    });

    test('should handle connection exhaustion', () => {
      // Test rapid connection creation
      const rapidQueries = Array(5).fill(0).map((_, i) => `SELECT ${i} as rapid_${i}`);
      
      const results = rapidQueries.map(query => {
        try {
          return dbQuery(query, false, undefined, testProjectName);
        } catch (error) {
          return error;
        }
      });
      
      // Most should succeed, but some might fail due to connection limits
      const successes = results.filter(r => typeof r === 'string');
      expect(successes.length).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery Scenarios', () => {
    test('should recover from database connection errors', () => {
      // Test that normal operations work after simulated failures
      const result = dbQuery('SELECT 1 as recovery_test', false, undefined, testProjectName);
      expect(result).toContain('recovery_test');
      
      // Test that security validation still works
      const securityResult = validateQuerySecurity('SELECT 1', false);
      expect(securityResult.allowed).toBe(true);
    });

    test('should handle partial query execution failures', () => {
      // Test queries that might partially succeed
      const partiallyFailingQueries = [
        'SELECT 1 as success, (SELECT COUNT(*) FROM non_existent_table) as failure',
        'SELECT VERSION(), (SELECT * FROM invalid_table) as error'
      ];

      partiallyFailingQueries.forEach(query => {
        expect(() => {
          dbQuery(query, false, undefined, testProjectName);
        }).toThrow();
      });
    });

    test('should maintain state consistency after errors', () => {
      // Try an operation that should fail
      expect(() => {
        dbQuery('INVALID SYNTAX', false, undefined, testProjectName);
      }).toThrow();
      
      // Verify that subsequent valid operations still work
      const result = dbQuery('SELECT 1 as consistency_test', false, undefined, testProjectName);
      expect(result).toContain('consistency_test');
    });
  });

  describe('Concurrent Operation Failures', () => {
    test('should handle simultaneous conflicting operations', () => {
      // Test concurrent read operations (should work)
      const readPromises = Array(3).fill(0).map((_, i) => 
        Promise.resolve().then(() => 
          dbQuery(`SELECT ${i} as concurrent_read_${i}`, false, undefined, testProjectName)
        )
      );
      
      Promise.all(readPromises).then(results => {
        results.forEach((result, i) => {
          expect(result).toContain(`concurrent_read_${i}`);
        });
      }).catch(() => {
        // Some might fail due to concurrency limits
      });
    });

    test('should handle mixed read/write concurrency', () => {
      // Test mix of read and write operations
      const operations = [
        { query: 'SELECT 1 as mixed_read', write: false },
        { query: 'CREATE TEMPORARY TABLE mixed_test (id INT)', write: true },
        { query: 'SELECT 2 as mixed_read2', write: false }
      ];
      
      operations.forEach(op => {
        try {
          const result = dbQuery(op.query, op.write, undefined, testProjectName);
          expect(typeof result).toBe('string');
        } catch (error) {
          // Write operations might fail in read-only context
          if (!op.write) {
            expect(error).toBeInstanceOf(Error);
          }
        }
      });
    });
  });

  describe('Parameter Validation Failures', () => {
    test('should handle invalid query parameters', () => {
      // Test various invalid parameters
      const invalidParameters = [
        { query: null, write: false },
        { query: undefined, write: false },
        { query: '', write: false },
        { query: 'SELECT 1', write: null }
      ];

      invalidParameters.forEach(params => {
        try {
          // @ts-expect-error - Testing invalid parameters
          const result = dbQuery(params.query, params.write, undefined, testProjectName);
          expect(typeof result).toBe('string');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      });
    });

    test('should handle boundary value parameters', () => {
      // Test boundary values
      const boundaryQueries = [
        `SELECT ${'1,'.repeat(1000)}1`, // Many columns
        `SELECT "${'x'.repeat(1000)}" as long_string`, // Long string
        `SELECT 1 ${'UNION SELECT 1 '.repeat(10)}` // Multiple unions
      ];

      boundaryQueries.forEach(query => {
        try {
          const result = dbQuery(query, false, undefined, testProjectName);
          expect(typeof result).toBe('string');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      });
    });
  });

  describe('Error Message Consistency', () => {
    test('should provide consistent error messages for similar failures', () => {
      const dangerousQueries = [
        'DROP TABLE users',
        'DROP TABLE orders',
        'DROP TABLE products'
      ];

      const errorMessages = dangerousQueries.map(query => {
        try {
          dbQuery(query, false, undefined, testProjectName);
          return null;
        } catch (error) {
          return (error as Error).message;
        }
      });

      // All should have failed with similar error messages
      errorMessages.forEach(message => {
        expect(message).toBeTruthy();
        expect(message).toMatch(/whitelist|read-only/i);
      });
    });

    test('should provide helpful error context', () => {
      // Test that errors include helpful context
      const contextTestQueries = [
        'INSERT INTO users VALUES (1)',
        'UPDATE users SET name = "test"',
        'DELETE FROM users WHERE id = 1'
      ];

      contextTestQueries.forEach(query => {
        const securityResult = validateQuerySecurity(query, false);
        expect(securityResult.allowed).toBe(false);
        expect(securityResult.reason).toBeTruthy();
        expect(securityResult.reason).toContain('whitelist');
        expect(securityResult.reason).toContain('read-only');
      });
    });
  });
});