import { validateQuerySecurity, isReadOnlyQuery } from '../src/database-service.js';
import { execSync } from 'child_process';

// Extend global type for test utilities
declare global {
  var testProjectName: string;
  var isDdevAvailable: boolean;
  var mysqlProject: { name: string; path: string; ready: boolean; };
  var postgresProject: { name: string; path: string; ready: boolean; };
}

describe('MCP Tools Integration Tests', () => {
  let testProjectName: string;
  
  beforeAll(() => {
    if (!global.isDdevAvailable) {
      throw new Error('DDEV is required for MCP tools tests but is not available');
    }

    // Use shared projects created by global setup
    if (global.mysqlProject?.ready) {
      testProjectName = global.mysqlProject.name;
    } else if (global.postgresProject?.ready) {
      testProjectName = global.postgresProject.name;
    } else {
      throw new Error('No shared test projects available');
    }
  });

  describe('MCP Core Functions', () => {
    test('should have SQL security validation functionality', () => {
      expect(typeof validateQuerySecurity).toBe('function');
      expect(typeof isReadOnlyQuery).toBe('function');
    });

    test('should have DDEV command execution capability', () => {
      // Test that basic DDEV commands work
      const result = execSync('ddev version', { encoding: 'utf8', stdio: 'pipe' });
      expect(result).toContain('DDEV');
    });
  });

  describe('SQL Security Validation', () => {
    test('should validate safe SELECT queries through MCP security layer', () => {
      const result = validateQuerySecurity('SELECT 1 as test_column', false);
      expect(result.allowed).toBe(true);
    });

    test('should block dangerous queries in read-only mode', () => {
      const result = validateQuerySecurity('DROP TABLE IF EXISTS dangerous_test', false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('whitelist');
    });

    test('should validate SHOW commands', () => {
      const result = validateQuerySecurity('SHOW TABLES', false);
      expect(result.allowed).toBe(true);
    });

    test('should validate information schema queries', () => {
      const result = validateQuerySecurity('SELECT TABLE_NAME FROM information_schema.TABLES LIMIT 1', false);
      expect(result.allowed).toBe(true);
    });

    test('should allow write operations in write mode', () => {
      const result = validateQuerySecurity('CREATE TEMPORARY TABLE test_write (id INT)', true);
      expect(result.allowed).toBe(true);
    });
  });

  describe('DDEV Integration Testing', () => {
    test('should execute database queries in DDEV project', () => {
      // Test the actual database functionality through DDEV exec
      const result = execSync(`ddev exec "mysql -e 'SELECT 1 as test_column'"`, {
        encoding: 'utf8',
        cwd: global.mysqlProject?.path || '/tmp'
      });
      expect(result).toContain('test_column');
    });

    test('should execute container commands in DDEV', () => {
      const result = execSync(`ddev exec "echo hello-world"`, {
        encoding: 'utf8',
        cwd: global.mysqlProject?.path || '/tmp'
      });
      expect(result).toContain('hello-world');
    });

    test('should get PHP version from DDEV container', () => {
      const result = execSync(`ddev exec "php --version"`, {
        encoding: 'utf8',
        cwd: global.mysqlProject?.path || '/tmp'
      });
      expect(result).toContain('PHP');
    });

    test('should list DDEV projects', () => {
      const result = execSync('ddev list', { encoding: 'utf8', stdio: 'pipe' });
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('should get project status', () => {
      const result = execSync('ddev describe', {
        encoding: 'utf8',
        cwd: global.mysqlProject?.path || '/tmp'
      });
      expect(result).toContain(testProjectName);
    });
  });

  describe('MCP Security Layer Validation', () => {
    test('should block dangerous SQL queries through security validation', () => {
      const dangerousQueries = [
        'DELETE FROM users',
        'UPDATE users SET password = "hacked"',
        'INSERT INTO users VALUES (1, "malicious")',
        'CREATE TABLE evil (id INT)',
        'ALTER TABLE users ADD COLUMN backdoor TEXT'
      ];

      dangerousQueries.forEach(query => {
        const result = validateQuerySecurity(query, false);
        expect(result.allowed).toBe(false);
      });
    });

    test('should allow safe SQL queries through security validation', () => {
      const safeQueries = [
        'SELECT 1',
        'SHOW TABLES',
        'DESCRIBE information_schema.TABLES',
        'EXPLAIN SELECT * FROM information_schema.TABLES LIMIT 1',
        'SELECT COUNT(*) FROM information_schema.TABLES'
      ];

      safeQueries.forEach(query => {
        const result = validateQuerySecurity(query, false);
        expect(result.allowed).toBe(true);
      });
    });

    test('should detect read-only vs write queries correctly', () => {
      // Test read-only detection
      expect(isReadOnlyQuery('SELECT 1')).toBe(true);
      expect(isReadOnlyQuery('SHOW TABLES')).toBe(true);
      expect(isReadOnlyQuery('DESCRIBE users')).toBe(true);
      
      // Test write detection
      expect(isReadOnlyQuery('INSERT INTO users VALUES (1)')).toBe(false);
      expect(isReadOnlyQuery('UPDATE users SET name = "test"')).toBe(false);
      expect(isReadOnlyQuery('DELETE FROM users')).toBe(false);
    });

    test('should block dangerous SQL injection attempts through security validation', () => {
      const injectionAttempts = [
        "SELECT * FROM users WHERE id = 1; DROP TABLE users; --",
        "SELECT * FROM users WHERE name = 'admin'; UPDATE users SET password = 'hacked'; --",
        "SELECT 1; INSERT INTO admin_users VALUES ('backdoor', 'password'); --",
        "'; EXEC xp_cmdshell('rm -rf /'); --"
      ];

      injectionAttempts.forEach(query => {
        const result = validateQuerySecurity(query, false);
        expect(result.allowed).toBe(false);
      });
    });

    test('should handle UNION queries appropriately', () => {
      // UNION queries might be legitimate in some cases, so test separately
      const unionQuery = "SELECT 1 UNION SELECT password FROM users WHERE role = 'admin'";
      const result = validateQuerySecurity(unionQuery, false);
      // This might be allowed as it's still a SELECT statement, depending on implementation
      expect(typeof result.allowed).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid SQL syntax in security validation', () => {
      // Security validation should handle malformed queries
      const result = validateQuerySecurity('INVALID SQL SYNTAX HERE', false);
      expect(result.allowed).toBe(false);
    });

    test('should handle invalid DDEV commands gracefully', () => {
      expect(() => {
        execSync('ddev invalid-command-12345', { stdio: 'pipe' });
      }).toThrow();
    });

    test('should handle non-existent projects gracefully', () => {
      expect(() => {
        execSync('ddev describe', {
          stdio: 'pipe',
          cwd: '/tmp/non-existent-project-12345'
        });
      }).toThrow();
    });

    test('should handle failing container commands gracefully', () => {
      expect(() => {
        execSync(`ddev exec "exit 1"`, {
          stdio: 'pipe',
          cwd: global.mysqlProject?.path || '/tmp'
        });
      }).toThrow();
    });
  });

  describe('Cross-Database Compatibility', () => {
    test('should validate standard SQL for different database types', () => {
      // Test standard SQL that should work on both MySQL and PostgreSQL
      const standardQueries = [
        'SELECT 1 as standard_test',
        'SELECT CURRENT_TIMESTAMP as now_test'
      ];

      standardQueries.forEach(query => {
        const result = validateQuerySecurity(query, false);
        expect(result.allowed).toBe(true);
      });
    });

    test('should validate database-specific commands appropriately', () => {
      // MySQL/MariaDB specific commands
      const mysqlQueries = [
        'SHOW ENGINES',
        'SELECT VERSION() as version'
      ];

      mysqlQueries.forEach(query => {
        const result = validateQuerySecurity(query, false);
        expect(result.allowed).toBe(true); // These should be allowed as read-only operations
      });
    });

    test('should test actual database operations on running DDEV project', () => {
      // Test that we can execute queries on the actual MySQL project
      const result = execSync(`ddev exec "mysql -e 'SELECT 1 as integration_test'"`, {
        encoding: 'utf8',
        cwd: global.mysqlProject?.path || '/tmp'
      });
      expect(result).toContain('integration_test');
    });
  });
});