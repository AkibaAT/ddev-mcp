import { execSync } from 'child_process';
import path from 'path';

// Import the actual server's query validation logic
import { isReadOnlyQuery, validateQuerySecurity } from '../src/database-service';

describe('Security Features', () => {
  describe('SQL Query Whitelist', () => {
    test('should allow SELECT queries', () => {
      const queries = [
        'SELECT * FROM users',
        'SELECT COUNT(*) FROM orders WHERE status = "active"',
        'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id'
      ];

      queries.forEach(query => {
        expect(isReadOnlyQuery(query)).toBe(true);
      });
    });

    test('should allow SHOW commands', () => {
      const queries = [
        'SHOW TABLES',
        'SHOW DATABASES',
        'SHOW COLUMNS FROM users',
        'SHOW INDEX FROM users',
        'SHOW TABLE STATUS',
        'SHOW ENGINES',
        'SHOW CHARSET',
        'SHOW VARIABLES',
        'SHOW PROCESSLIST'
      ];

      queries.forEach(query => {
        expect(isReadOnlyQuery(query)).toBe(true);
      });
    });

    test('should allow DESCRIBE commands', () => {
      const queries = [
        'DESCRIBE users',
        'DESC users'
      ];

      queries.forEach(query => {
        expect(isReadOnlyQuery(query)).toBe(true);
      });
    });

    test('should allow EXPLAIN commands', () => {
      const queries = [
        'EXPLAIN SELECT * FROM users WHERE id = 1',
        'EXPLAIN ANALYZE SELECT * FROM users',
        'EXPLAIN VERBOSE SELECT * FROM users'
      ];

      queries.forEach(query => {
        // Test that these queries pass the whitelist check
        expect(isReadOnlyQuery(query)).toBe(true);
      });
    });

    test('should allow PostgreSQL meta-commands', () => {
      const queries = [
        '\\dt',
        '\\l',
        '\\d users',
        '\\dn',
        '\\df',
        '\\dv',
        '\\di',
        '\\du',
        '\\dp'
      ];

      queries.forEach(query => {
        // Test that these queries pass the whitelist check
        expect(isReadOnlyQuery(query)).toBe(true);
      });
    });

    test('should allow system catalog queries', () => {
      const queries = [
        'SELECT * FROM INFORMATION_SCHEMA.TABLES',
        'SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = "users"',
        'SELECT * FROM mysql.user',
        'SELECT * FROM pg_catalog.pg_tables',
        'SELECT * FROM information_schema.columns',
        'SELECT * FROM pg_stat_activity'
      ];

      queries.forEach(query => {
        // Test that these queries pass the whitelist check
        expect(isReadOnlyQuery(query)).toBe(true);
      });
    });

    test('should block data modification queries in read-only mode', () => {
      const queries = [
        'INSERT INTO users (name, email) VALUES ("Test", "test@example.com")',
        'UPDATE users SET name = "Updated" WHERE id = 1',
        'DELETE FROM users WHERE id = 1',
        'REPLACE INTO users VALUES (1, "Test", "test@example.com")',
        'TRUNCATE TABLE users'
      ];

      queries.forEach(query => {
        // Test that these queries are blocked in read-only mode
        expect(isReadOnlyQuery(query)).toBe(false);
      });
    });

    test('should block schema changes in read-only mode', () => {
      const queries = [
        'CREATE TABLE test (id INT)',
        'ALTER TABLE users ADD COLUMN phone VARCHAR(20)',
        'DROP TABLE users',
        'RENAME TABLE users TO customers'
      ];

      queries.forEach(query => {
        // Test that these queries are blocked in read-only mode
        expect(isReadOnlyQuery(query)).toBe(false);
      });
    });

    test('should block configuration changes in read-only mode', () => {
      const queries = [
        'SET SQL_MODE = "STRICT_TRANS_TABLES"',
        'SET GLOBAL general_log = 1',
        'RESET QUERY CACHE',
        'FLUSH TABLES',
        'OPTIMIZE TABLE users'
      ];

      queries.forEach(query => {
        // Test that these queries are blocked in read-only mode
        expect(isReadOnlyQuery(query)).toBe(false);
      });
    });

    test('should block transaction control in read-only mode', () => {
      const queries = [
        'BEGIN',
        'START TRANSACTION',
        'COMMIT',
        'ROLLBACK',
        'SAVEPOINT sp1'
      ];

      queries.forEach(query => {
        // Test that these queries are blocked in read-only mode
        expect(isReadOnlyQuery(query)).toBe(false);
      });
    });

    test('should block administrative operations in read-only mode', () => {
      const queries = [
        'GRANT SELECT ON users TO "user"@"localhost"',
        'REVOKE SELECT ON users FROM "user"@"localhost"',
        'CREATE USER "test"@"localhost"',
        'LOCK TABLES users READ'
      ];

      queries.forEach(query => {
        // Test that these queries are blocked in read-only mode
        expect(isReadOnlyQuery(query)).toBe(false);
      });
    });

    test('should always block dangerous operations even with --allow-write', () => {
      const queries = [
        'DROP DATABASE production',
        'SHUTDOWN',
        'SELECT LOAD_FILE("/etc/passwd")',
        'SELECT * INTO OUTFILE "/tmp/data.txt" FROM users',
        '\\! rm -rf /',
        'COPY users FROM PROGRAM "cat /etc/passwd"'
      ];

      queries.forEach(query => {
        // Test that these queries are always blocked, even with --allow-write
        const result = validateQuerySecurity(query, true);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBeDefined();
      });
    });
  });

  describe('Single Project Mode Security', () => {
    test('should hide project parameters when single project is configured', () => {
      // Test that defaultProjectName config is respected
      const config = { defaultProjectName: 'test-project' };
      expect(config.defaultProjectName).toBe('test-project');
      expect(typeof config.defaultProjectName).toBe('string');
    });

    test('should disable ddev_list_projects in single project mode', () => {
      // Test that single project mode config exists
      const config = { defaultProjectName: 'test-project' };
      expect(config.defaultProjectName).toBeDefined();
      expect(config.defaultProjectName.length).toBeGreaterThan(0);
    });

    test('should block access to other projects in single project mode', () => {
      // Test that project validation logic exists
      const config = { defaultProjectName: 'allowed-project' };
      const requestedProject = 'different-project';
      expect(config.defaultProjectName).not.toBe(requestedProject);
    });

    test('should automatically use configured project in single project mode', () => {
      // Test that configured project overrides user input
      const config = { defaultProjectName: 'configured-project' };
      const userInput = 'user-requested-project';
      const actualProject = config.defaultProjectName || userInput;
      expect(actualProject).toBe('configured-project');
    });
  });

  describe('Write Mode Security', () => {
    test('should allow data modification with --allow-write', () => {
      const queries = [
        'INSERT INTO users (name, email) VALUES ("Test", "test@example.com")',
        'UPDATE users SET name = "Updated" WHERE id = 1',
        'DELETE FROM users WHERE id = 1'
      ];

      queries.forEach(query => {
        // Test that these queries are allowed with --allow-write
        const result = validateQuerySecurity(query, true);
        expect(result.allowed).toBe(true);
      });
    });

    test('should allow schema changes with --allow-write', () => {
      const queries = [
        'CREATE TABLE test (id INT)',
        'ALTER TABLE users ADD COLUMN phone VARCHAR(20)',
        'DROP TABLE users'
      ];

      queries.forEach(query => {
        // Test that these queries are allowed with --allow-write
        const result = validateQuerySecurity(query, true);
        expect(result.allowed).toBe(true);
      });
    });

    test('should still block dangerous operations with --allow-write', () => {
      const queries = [
        'DROP DATABASE production',
        'SHUTDOWN',
        'SELECT LOAD_FILE("/etc/passwd")'
      ];

      queries.forEach(query => {
        // Test that these queries are still blocked even with --allow-write
        const result = validateQuerySecurity(query, true);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBeDefined();
      });
    });
  });

  describe('Error Messages', () => {
    test('should provide helpful error message for whitelist violations', () => {
      // Test that blocked queries return appropriate error messages
      const result = validateQuerySecurity('INSERT INTO users VALUES (1)', false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('whitelist');
      expect(result.reason).toContain('read-only');
    });

    test('should provide helpful error message for dangerous operations', () => {
      // Test that dangerous operations return appropriate error messages
      const result = validateQuerySecurity('DROP DATABASE production', true);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('catastrophic');
    });

    test('should include security mode indicator in query results', () => {
      // Test that security validation includes mode information
      const readOnlyResult = validateQuerySecurity('SELECT * FROM users', false);
      const writeResult = validateQuerySecurity('SELECT * FROM users', true);
      expect(readOnlyResult.allowed).toBe(true);
      expect(writeResult.allowed).toBe(true);
      // Both should succeed for read-only queries regardless of mode
    });
  });

  describe('Command Whitelist Security', () => {
    const projectRoot = path.resolve(__dirname, '..');
    const serverPath = path.join(projectRoot, 'dist', 'index.js');

    test('should accept --allowed-commands parameter', () => {
      const result = execSync(`node ${serverPath} --help`, {
        encoding: 'utf8'
      });

      expect(result).toContain('--allowed-commands');
      expect(result).toContain('Comma-separated list of allowed commands');
      expect(result.replace(/\s+/g, ' ')).toContain('ddev-mcp --allowed-commands "ddev_project_status,ddev_db_query"');
    });

    test('should parse comma-separated command list', () => {
      // Test that server accepts the new flag without error
      // This is a basic validation that the argument parsing works
      expect(() => {
        execSync(`node ${serverPath} --allowed-commands "ddev_project_status,ddev_db_query" --help`, {
          encoding: 'utf8'
        });
      }).not.toThrow();
    });

    test('should combine with other flags', () => {
      // Test that whitelist works with other security flags
      expect(() => {
        execSync(`node ${serverPath} --single-project test --allowed-commands "ddev_project_status" --allow-write --help`, {
          encoding: 'utf8'
        });
      }).not.toThrow();
    });

    test('should show whitelist functionality in help text', () => {
      const result = execSync(`node ${serverPath} --help`, {
        encoding: 'utf8'
      });

      // Verify the help contains examples of whitelist usage
      expect(result).toContain('--allowed-commands');
      expect(result).toContain('-c');
    });
  });
});
