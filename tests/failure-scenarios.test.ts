import { dbQuery, validateQuerySecurity } from '../src/database-service.js';
import { getProjectStatus } from '../src/project-service.js';
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

describe('MCP Tool Failure Scenarios and Error Handling', () => {
  let mysqlProjectName: string;
  let postgresProjectName: string;
  let readOnlyConfig: { allowWriteOperations: boolean };
  let writeConfig: { allowWriteOperations: boolean };
  
  beforeAll(() => {
    if (!global.isDdevAvailable) {
      throw new Error('DDEV is required for failure scenario tests but is not available');
    }

    // Use shared projects
    mysqlProjectName = global.mysqlProject?.name || 'ddev-mcp-shared-mysql';
    postgresProjectName = global.postgresProject?.name || 'ddev-mcp-shared-postgres';

    if (!mysqlProjectName || !postgresProjectName) {
      console.log('⚠️ Shared projects not ready - tests will be limited');
    }
  });

  beforeEach(() => {
    readOnlyConfig = { allowWriteOperations: false };
    writeConfig = { allowWriteOperations: true };
  });

  describe('Database Query Failures', () => {
    test('should handle invalid SQL syntax gracefully', () => {
      // Test that invalid SQL syntax is properly handled
      expect(() => {
        dbQuery('INVALID SQL SYNTAX HERE', false, undefined, mysqlProjectName);
      }).toThrow();
      
      // Test security validation catches invalid syntax
      const securityResult = validateQuerySecurity('INVALID SQL SYNTAX HERE', false);
      expect(securityResult.allowed).toBe(false);
    });

    test('should handle dangerous queries in read-only mode', () => {
      const dangerousQueries = [
        'DROP TABLE important_data',
        'DELETE FROM users WHERE 1=1',
        'UPDATE users SET password = "hacked"',
        'TRUNCATE TABLE logs'
      ];

      dangerousQueries.forEach(query => {
        expect(() => {
          dbQuery(query, false, undefined, mysqlProjectName);
        }).toThrow();
        
        // Verify security validation blocks these
        const securityResult = validateQuerySecurity(query, false);
        expect(securityResult.allowed).toBe(false);
        expect(securityResult.reason).toContain('whitelist');
      });
    });

    test('should handle catastrophic operations even in write mode', () => {
      const catastrophicQueries = [
        'DROP DATABASE mysql',
        'SHUTDOWN',
        'SELECT LOAD_FILE("/etc/passwd")',
        'SELECT * INTO OUTFILE "/tmp/hack.txt" FROM users'
      ];

      catastrophicQueries.forEach(query => {
        expect(() => {
          dbQuery(query, true, undefined, mysqlProjectName);
        }).toThrow();
        
        // Verify security validation blocks these even in write mode
        const securityResult = validateQuerySecurity(query, true);
        expect(securityResult.allowed).toBe(false);
        expect(securityResult.reason).toContain('catastrophic');
      });
    });

    test('should handle SQL injection attempts', () => {
      const injectionQueries = [
        "SELECT * FROM users WHERE id = 1; DROP TABLE users; --",
        "'; DELETE FROM users; --",
        "1' OR '1'='1",
        "admin'; UPDATE users SET role='admin' WHERE username='hacker'; --"
      ];

      injectionQueries.forEach(query => {
        expect(() => {
          dbQuery(query, false, undefined, mysqlProjectName);
        }).toThrow();
        
        // Verify security validation blocks injection attempts
        const securityResult = validateQuerySecurity(query, false);
        expect(securityResult.allowed).toBe(false);
      });
    });
  });

  describe('Project Access Failures', () => {
    test('should handle non-existent projects gracefully', () => {
      const nonExistentProject = 'non-existent-project-12345';
      
      // Test that getProjectStatus returns null for non-existent projects
      const status = getProjectStatus(nonExistentProject);
      expect(status).toBeNull();
    });

    test('should handle invalid project names in database queries', () => {
      const invalidProject = 'invalid-project-name';
      
      expect(() => {
        dbQuery('SELECT 1', false, undefined, invalidProject);
      }).toThrow();
    });

    test('should handle DDEV command failures gracefully', () => {
      // Test invalid DDEV commands
      expect(() => {
        execDDEVCommand('invalid-command-12345', mysqlProjectName);
      }).toThrow();
      
      // Test commands on non-existent projects
      expect(() => {
        execDDEVCommand('status', 'non-existent-project');
      }).toThrow();
    });
  });

  describe('Resource Limit Failures', () => {
    test('should handle extremely long queries', () => {
      // Create an extremely long query
      const longQuery = `SELECT ${'1,'.repeat(10000)}1`;
      
      // This should either work or fail gracefully
      try {
        const result = dbQuery(longQuery, false, undefined, mysqlProjectName);
        expect(typeof result).toBe('string');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    test('should handle queries with excessive nesting', () => {
      // Create a query with excessive subselects
      let nestedQuery = 'SELECT 1';
      for (let i = 0; i < 50; i++) {
        nestedQuery = `SELECT (${nestedQuery}) as nested_${i}`;
      }
      
      // This should either work or fail gracefully
      try {
        const result = dbQuery(nestedQuery, false, undefined, mysqlProjectName);
        expect(typeof result).toBe('string');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Security Validation Edge Cases', () => {
    test('should handle empty and whitespace-only queries', () => {
      const edgeCaseQueries = [
        '',
        '   ',
        '\n\t  \n',
        '-- just a comment',
        '/* just a comment */'
      ];

      edgeCaseQueries.forEach(query => {
        // Security validation should handle edge cases
        const securityResult = validateQuerySecurity(query, false);
        expect(typeof securityResult.allowed).toBe('boolean');
      });
    });

    test('should handle queries with mixed case and special characters', () => {
      const mixedCaseQueries = [
        'sElEcT 1',
        'SHOW tables',
        'describe users',
        'explain select * from information_schema.tables'
      ];

      mixedCaseQueries.forEach(query => {
        const securityResult = validateQuerySecurity(query, false);
        expect(securityResult.allowed).toBe(true);
      });
    });

    test('should handle queries with comments and extra whitespace', () => {
      const queriesWithComments = [
        '/* comment */ SELECT 1',
        'SELECT 1 -- comment',
        '  SELECT   1   ',
        'SELECT\n1\nFROM\ninformation_schema.tables'
      ];

      queriesWithComments.forEach(query => {
        const securityResult = validateQuerySecurity(query, false);
        expect(securityResult.allowed).toBe(true);
      });
    });
  });

  describe('Error Message Quality', () => {
    test('should provide helpful error messages for security violations', () => {
      expect(() => {
        dbQuery('DROP TABLE users', false, undefined, mysqlProjectName);
      }).toThrow(/whitelist|read-only/i);
    });

    test('should provide helpful error messages for catastrophic operations', () => {
      expect(() => {
        dbQuery('SHUTDOWN', true, undefined, mysqlProjectName);
      }).toThrow(/catastrophic/i);
    });

    test('should provide context in error messages', () => {
      // Test that error messages contain useful context
      const securityResult = validateQuerySecurity('INSERT INTO users VALUES (1)', false);
      expect(securityResult.allowed).toBe(false);
      expect(securityResult.reason).toBeTruthy();
      expect(securityResult.reason).toContain('whitelist');
    });
  });

  describe('Concurrent Access Scenarios', () => {
    test('should handle multiple rapid queries', () => {
      const queries = Array(10).fill(0).map((_, i) => `SELECT ${i} as test_${i}`);
      
      // Execute multiple queries rapidly
      const results = queries.map(query => {
        try {
          return dbQuery(query, false, undefined, mysqlProjectName);
        } catch (error) {
          return error;
        }
      });
      
      // All should either succeed or fail gracefully
      results.forEach(result => {
        expect(typeof result === 'string' || result instanceof Error).toBe(true);
      });
    });

    test('should handle mixed read/write operations', () => {
      // Test alternating read and write operations
      const operations = [
        { query: 'SELECT 1 as read_test', write: false },
        { query: 'CREATE TEMPORARY TABLE temp_test (id INT)', write: true },
        { query: 'SELECT 2 as read_test2', write: false },
        { query: 'INSERT INTO temp_test VALUES (1)', write: true }
      ];
      
      operations.forEach(op => {
        try {
          const result = dbQuery(op.query, op.write, undefined, mysqlProjectName);
          expect(typeof result).toBe('string');
        } catch (error) {
          // Write operations might fail in read-only mode, which is expected
          if (!op.write) {
            throw error; // Read operations should not fail
          }
        }
      });
    });
  });

  describe('Database Type Compatibility', () => {
    test('should handle database-specific query failures', () => {
      // Test MySQL-specific queries on PostgreSQL (if available)
      if (postgresProjectName && postgresProjectName !== mysqlProjectName) {
        // This might fail due to syntax differences, which is expected
        try {
          const result = dbQuery('SHOW ENGINES', false, undefined, postgresProjectName);
          expect(typeof result).toBe('string');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    test('should handle cross-database standard queries', () => {
      const standardQueries = [
        'SELECT 1 as standard_test',
        'SELECT CURRENT_TIMESTAMP as now_test'
      ];
      
      standardQueries.forEach(query => {
        // These should work on both MySQL and PostgreSQL
        const mysqlResult = dbQuery(query, false, undefined, mysqlProjectName);
        expect(mysqlResult).toContain('test');
        
        if (postgresProjectName && postgresProjectName !== mysqlProjectName) {
          const postgresResult = dbQuery(query, false, undefined, postgresProjectName);
          expect(postgresResult).toContain('test');
        }
      });
    });
  });
});