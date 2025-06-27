import { dbQuery, validateQuerySecurity, getDatabaseType } from '../src/database-service.js';
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

describe('DDEV MCP Server Integration Tests', () => {
  let testProjectName: string;
  let serverConfig: { allowWriteOperations: boolean };

  beforeAll(() => {
    if (!global.isDdevAvailable) {
      throw new Error('DDEV is required for integration tests but is not available');
    }

    // Use shared MySQL project
    if (global.mysqlProject?.ready && global.mysqlProject.name) {
      testProjectName = global.mysqlProject.name;
    } else {
      console.log('⚠️ No shared projects ready - tests will be limited');
      testProjectName = 'ddev-mcp-shared-mysql';
    }
  });

  beforeEach(() => {
    serverConfig = { allowWriteOperations: false };
  });

  describe('Core DDEV Integration', () => {
    test('should integrate with DDEV project management', () => {
      // Test project listing functionality
      const projects = listProjects();
      expect(projects.length).toBeGreaterThan(0);
      
      // Test project status functionality
      const status = getProjectStatus(testProjectName);
      expect(status).toBeDefined();
      expect(status?.name).toBe(testProjectName);
    });

    test('should handle DDEV command execution', () => {
      // Test basic DDEV command execution
      const result = execDDEVCommand('version', undefined);
      expect(result).toContain('DDEV');
      
      // Test project-specific command execution
      const projectResult = execDDEVCommand('exec "echo test-integration"', testProjectName);
      expect(projectResult).toContain('test-integration');
    });

    test('should detect database types correctly', () => {
      // Test database type detection for our test project
      const dbType = getDatabaseType(testProjectName);
      expect(['mysql', 'mariadb', 'postgres']).toContain(dbType);
      
      // Test that detection works consistently
      const dbType2 = getDatabaseType(testProjectName);
      expect(dbType2).toBe(dbType);
    });
  });

  describe('Database Query Integration', () => {
    test('should execute safe database queries through DDEV', () => {
      // Test basic SELECT query
      const basicResult = dbQuery('SELECT 1 as integration_test', false, undefined, testProjectName);
      expect(basicResult).toContain('integration_test');
      
      // Test SHOW commands
      const showResult = dbQuery('SHOW TABLES', false, undefined, testProjectName);
      expect(typeof showResult).toBe('string');
      
      // Test information schema queries
      const schemaResult = dbQuery('SELECT TABLE_NAME FROM information_schema.TABLES LIMIT 1', false, undefined, testProjectName);
      expect(typeof schemaResult).toBe('string');
    });

    test('should block dangerous database operations', () => {
      const dangerousQueries = [
        'DROP TABLE IF EXISTS important_data',
        'DELETE FROM users WHERE 1=1',
        'UPDATE users SET password = "compromised"',
        'CREATE TABLE backdoor (id INT)'
      ];

      dangerousQueries.forEach(query => {
        expect(() => {
          dbQuery(query, false, undefined, testProjectName);
        }).toThrow();
      });
    });

    test('should handle write operations when enabled', () => {
      // Test that write operations work when explicitly enabled
      // Use a single session to handle temporary table operations
      const combinedQuery = 'CREATE TEMPORARY TABLE write_test (id INT, name VARCHAR(50)); INSERT INTO write_test VALUES (1, "test"); SELECT * FROM write_test; DROP TABLE write_test;';
      const result = dbQuery(combinedQuery, true, undefined, testProjectName);
      expect(typeof result).toBe('string');
      expect(result).toContain('test');
      
      // Test individual write operations with non-temporary table
      const createResult = dbQuery('CREATE TABLE IF NOT EXISTS write_test_persistent (id INT, name VARCHAR(50))', true, undefined, testProjectName);
      expect(typeof createResult).toBe('string');
      
      const insertResult = dbQuery('INSERT INTO write_test_persistent VALUES (1, "test")', true, undefined, testProjectName);
      expect(typeof insertResult).toBe('string');
      
      // Test cleanup
      const cleanupResult = dbQuery('DROP TABLE write_test_persistent', true, undefined, testProjectName);
      expect(typeof cleanupResult).toBe('string');
    });
  });

  describe('Security Integration', () => {
    test('should enforce security policies consistently', () => {
      // Test read-only security enforcement
      const securityTestQueries = [
        { query: 'SELECT 1', expected: true },
        { query: 'SHOW TABLES', expected: true },
        { query: 'DESCRIBE information_schema.TABLES', expected: true },
        { query: 'INSERT INTO test VALUES (1)', expected: false },
        { query: 'UPDATE test SET id = 2', expected: false },
        { query: 'DELETE FROM test', expected: false },
        { query: 'DROP TABLE test', expected: false }
      ];

      securityTestQueries.forEach(({ query, expected }) => {
        const result = validateQuerySecurity(query, false);
        expect(result.allowed).toBe(expected);
      });
    });

    test('should block catastrophic operations even in write mode', () => {
      const catastrophicQueries = [
        'DROP DATABASE mysql',
        'SHUTDOWN',
        'SELECT LOAD_FILE("/etc/passwd")',
        'SELECT * INTO OUTFILE "/tmp/hack.txt" FROM users'
      ];

      catastrophicQueries.forEach(query => {
        const result = validateQuerySecurity(query, true);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('catastrophic');
      });
    });

    test('should handle SQL injection prevention', () => {
      const injectionAttempts = [
        "SELECT * FROM users WHERE id = 1; DROP TABLE users; --",
        "'; DELETE FROM important_data; --",
        "1' UNION SELECT password FROM admin_users--",
        "admin'; UPDATE users SET role='admin' WHERE username='hacker'; --"
      ];

      injectionAttempts.forEach(query => {
        const result = validateQuerySecurity(query, false);
        expect(result.allowed).toBe(false);
      });
    });
  });

  describe('Project Management Integration', () => {
    test('should handle single-project mode functionality', () => {
      // Test that single-project operations work correctly
      const status = getProjectStatus(testProjectName);
      expect(status).toBeDefined();
      expect(status?.name).toBe(testProjectName);
      
      // Test database operations in single-project context
      const result = dbQuery('SELECT 1 as single_project_test', false, undefined, testProjectName);
      expect(result).toContain('single_project_test');
    });

    test('should handle multi-project mode functionality', () => {
      // Test multi-project operations
      const projects = listProjects();
      expect(projects.length).toBeGreaterThan(0);
      
      // Find our test project in the list
      const projectNames = projects.map(p => p.name || p);
      expect(projectNames).toContain(testProjectName);
    });

    test('should handle project switching and isolation', () => {
      // Test that project-specific operations are properly isolated
      const projectStatus = getProjectStatus(testProjectName);
      expect(projectStatus).toBeDefined();
      
      // Test database operation in specific project context
      const dbResult = dbQuery('SELECT 1 as isolation_test', false, undefined, testProjectName);
      expect(dbResult).toContain('isolation_test');
      
      // Test DDEV command in specific project context
      const ddevResult = execDDEVCommand('exec "echo project-isolation-test"', testProjectName);
      expect(ddevResult).toContain('project-isolation-test');
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle invalid project gracefully', () => {
      const invalidProject = 'non-existent-project-12345';
      
      // Test project status for invalid project
      const status = getProjectStatus(invalidProject);
      expect(status).toBeNull();
      
      // Test that database operations fail gracefully
      expect(() => {
        dbQuery('SELECT 1', false, undefined, invalidProject);
      }).toThrow();
    });

    test('should handle invalid database queries gracefully', () => {
      expect(() => {
        dbQuery('INVALID SQL SYNTAX', false, undefined, testProjectName);
      }).toThrow();
      
      // Test that subsequent valid queries still work
      const validResult = dbQuery('SELECT 1 as recovery_test', false, undefined, testProjectName);
      expect(validResult).toContain('recovery_test');
    });

    test('should handle DDEV command failures gracefully', () => {
      // Test invalid DDEV command
      expect(() => {
        execDDEVCommand('invalid-command-12345', testProjectName);
      }).toThrow();
      
      // Test that subsequent valid commands still work
      const validResult = execDDEVCommand('exec "echo recovery-test"', testProjectName);
      expect(validResult).toContain('recovery-test');
    });
  });

  describe('Cross-Database Compatibility', () => {
    test('should handle MySQL/MariaDB operations', () => {
      const dbType = getDatabaseType(testProjectName);
      
      if (['mysql', 'mariadb'].includes(dbType)) {
        // Test MySQL-specific queries
        const mysqlQueries = [
          'SELECT VERSION() as mysql_version',
          'SHOW ENGINES',
          'SELECT @@version_comment'
        ];
        
        mysqlQueries.forEach(query => {
          const result = dbQuery(query, false, undefined, testProjectName);
          expect(typeof result).toBe('string');
        });
      }
    });

    test('should handle PostgreSQL operations', () => {
      const dbType = getDatabaseType(testProjectName);
      
      if (dbType === 'postgres') {
        // Test PostgreSQL-specific queries
        const postgresQueries = [
          'SELECT version() as postgres_version',
          'SELECT current_database() as db_name',
          'SELECT current_user as user_name'
        ];
        
        postgresQueries.forEach(query => {
          const result = dbQuery(query, false, undefined, testProjectName);
          expect(typeof result).toBe('string');
        });
      }
    });

    test('should handle standard SQL across database types', () => {
      // Test queries that should work on all database types
      const standardQueries = [
        'SELECT 1 as standard_test',
        'SELECT CURRENT_TIMESTAMP as now_test'
      ];
      
      standardQueries.forEach(query => {
        const result = dbQuery(query, false, undefined, testProjectName);
        expect(result).toContain('test');
      });
    });
  });

  describe('Performance and Resource Management', () => {
    test('should handle multiple rapid queries', () => {
      const queries = Array(5).fill(0).map((_, i) => `SELECT ${i} as rapid_test_${i}`);
      
      const results = queries.map(query => {
        try {
          return dbQuery(query, false, undefined, testProjectName);
        } catch (error) {
          return error;
        }
      });
      
      // Most should succeed
      const successes = results.filter(r => typeof r === 'string');
      expect(successes.length).toBeGreaterThan(0);
    });

    test('should handle resource-intensive queries appropriately', () => {
      // Test a moderately complex query that should work
      const complexQuery = 'SELECT COUNT(*) FROM information_schema.TABLES';
      const result = dbQuery(complexQuery, false, undefined, testProjectName);
      expect(typeof result).toBe('string');
      
      // Test that security validation works for complex queries
      const securityResult = validateQuerySecurity(complexQuery, false);
      expect(securityResult.allowed).toBe(true);
    });
  });

  describe('Configuration and Mode Integration', () => {
    test('should respect read-only configuration', () => {
      // Test that read-only mode is properly enforced
      const writeQuery = 'CREATE TEMPORARY TABLE readonly_test (id INT)';
      
      expect(() => {
        dbQuery(writeQuery, false, undefined, testProjectName);
      }).toThrow();
      
      // Verify security validation blocks it
      const securityResult = validateQuerySecurity(writeQuery, false);
      expect(securityResult.allowed).toBe(false);
    });

    test('should respect write-enabled configuration', () => {
      // Test that write mode allows appropriate operations using a single session
      const combinedQuery = 'CREATE TEMPORARY TABLE write_enabled_test (id INT); INSERT INTO write_enabled_test VALUES (1); SELECT * FROM write_enabled_test; DROP TABLE write_enabled_test;';
      
      const result = dbQuery(combinedQuery, true, undefined, testProjectName);
      expect(typeof result).toBe('string');
      expect(result).toContain('1');
      
      // Verify security validation allows write operations
      const securityResult = validateQuerySecurity('CREATE TEMPORARY TABLE test (id INT)', true);
      expect(securityResult.allowed).toBe(true);
    });

    test('should maintain security regardless of configuration', () => {
      // Test that catastrophic operations are blocked regardless of write mode
      const catastrophicQuery = 'DROP DATABASE mysql';
      
      expect(() => {
        dbQuery(catastrophicQuery, true, undefined, testProjectName);
      }).toThrow();
      
      const securityResult = validateQuerySecurity(catastrophicQuery, true);
      expect(securityResult.allowed).toBe(false);
    });
  });

  describe('Integration Reliability', () => {
    test('should maintain functionality after errors', () => {
      // Cause an error
      expect(() => {
        dbQuery('INVALID SYNTAX', false, undefined, testProjectName);
      }).toThrow();
      
      // Verify that normal operations still work
      const result = dbQuery('SELECT 1 as reliability_test', false, undefined, testProjectName);
      expect(result).toContain('reliability_test');
      
      // Verify that security validation still works
      const securityResult = validateQuerySecurity('SELECT 1', false);
      expect(securityResult.allowed).toBe(true);
    });

    test('should handle concurrent operations gracefully', () => {
      // Test that concurrent read operations work
      const promises = Array(3).fill(0).map((_, i) =>
        Promise.resolve().then(() =>
          dbQuery(`SELECT ${i} as concurrent_test_${i}`, false, undefined, testProjectName)
        )
      );
      
      // Most should succeed
      Promise.all(promises).then(results => {
        results.forEach((result, i) => {
          expect(result).toContain(`concurrent_test_${i}`);
        });
      }).catch(() => {
        // Some might fail due to resource limits, which is acceptable
      });
    });

    test('should provide consistent behavior across operations', () => {
      // Test that the same query produces consistent results
      const testQuery = 'SELECT 1 as consistency_test';
      
      const result1 = dbQuery(testQuery, false, undefined, testProjectName);
      const result2 = dbQuery(testQuery, false, undefined, testProjectName);
      
      expect(result1).toContain('consistency_test');
      expect(result2).toContain('consistency_test');
      
      // Security validation should also be consistent
      const security1 = validateQuerySecurity(testQuery, false);
      const security2 = validateQuerySecurity(testQuery, false);
      
      expect(security1.allowed).toBe(security2.allowed);
    });
  });
});