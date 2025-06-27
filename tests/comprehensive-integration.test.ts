import { dbQuery, getDatabaseType, validateQuerySecurity } from '../src/database-service.js';
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

describe('Comprehensive MCP DDEV Server Integration Tests', () => {
  let mysqlProjectName: string;
  let postgresProjectName: string;
  let readOnlyConfig: { allowWriteOperations: boolean };
  let writeConfig: { allowWriteOperations: boolean };
  
  beforeAll(() => {
    if (!global.isDdevAvailable) {
      throw new Error('DDEV is required for comprehensive integration tests but is not available');
    }

    // Use shared projects
    if (global.mysqlProject?.ready) {
      mysqlProjectName = global.mysqlProject.name;
    }

    if (global.postgresProject?.ready) {
      postgresProjectName = global.postgresProject.name;
    }

    if (!mysqlProjectName || !postgresProjectName) {
      console.log('⚠️ Shared projects not ready - tests will be limited');
    }
  });

  beforeEach(() => {
    readOnlyConfig = { allowWriteOperations: false };
    writeConfig = { allowWriteOperations: true };
  });

  describe('Database Type Testing', () => {
    test('MySQL database operations should work through core functions', () => {
      // Test database type detection
      const dbType = getDatabaseType(mysqlProjectName);
      expect(['mysql', 'mariadb']).toContain(dbType);
      
      // Test basic MySQL query through database service
      const basicResult = dbQuery('SELECT 1 as mysql_test', false, undefined, mysqlProjectName);
      expect(basicResult).toContain('mysql_test');
      
      // Test MySQL-specific commands
      const showTablesResult = dbQuery('SHOW TABLES', false, undefined, mysqlProjectName);
      expect(typeof showTablesResult).toBe('string');
      
      // Test MySQL version query
      const versionResult = dbQuery('SELECT VERSION() as mysql_version', false, undefined, mysqlProjectName);
      expect(versionResult).toContain('mysql_version');
    });

    test('PostgreSQL database operations should work through core functions', () => {
      // Test database type detection
      const dbType = getDatabaseType(postgresProjectName);
      expect(dbType).toBe('postgres');
      
      // Test basic PostgreSQL query through database service
      const basicResult = dbQuery('SELECT 1 as postgres_test', false, undefined, postgresProjectName);
      expect(basicResult).toContain('postgres_test');
      
      // Test PostgreSQL version query
      const versionResult = dbQuery('SELECT version() as postgres_version', false, undefined, postgresProjectName);
      expect(versionResult).toContain('postgres_version');
    });
  });

  describe('Server Mode Testing', () => {
    test('Multi-project mode should allow access to multiple projects', () => {
      // Test project listing functionality
      const projects = listProjects();
      const projectNames = projects.map(p => typeof p === 'string' ? p : p.name);
      expect(projectNames).toContain(mysqlProjectName);
      expect(projectNames).toContain(postgresProjectName);
      expect(projectNames.join(' ')).toContain('ddev-mcp-shared');
    });

    test('Single-project mode should work with specific project', () => {
      // Test project status functionality for specific project
      const status = getProjectStatus(mysqlProjectName);
      expect(status).toBeDefined();
      expect(status?.name).toBe(mysqlProjectName);
      
      // Test that we can work with the configured project
      const basicResult = dbQuery('SELECT 1 as single_project_test', false, undefined, mysqlProjectName);
      expect(basicResult).toContain('single_project_test');
    });

    test('Project status should work for both database types', () => {
      // Test MySQL project status
      const mysqlStatus = getProjectStatus(mysqlProjectName);
      expect(mysqlStatus).toBeDefined();
      expect(['mysql', 'mariadb']).toContain(mysqlStatus?.database?.type?.toLowerCase());
      
      // Test PostgreSQL project status
      const postgresStatus = getProjectStatus(postgresProjectName);
      expect(postgresStatus).toBeDefined();
      expect(postgresStatus?.database?.type?.toLowerCase()).toBe('postgres');
    });
    test('Read-only mode should block write operations', () => {
      // Write operations should be blocked in read-only mode
      expect(() => {
        dbQuery('CREATE TEMPORARY TABLE test_write (id INT)', false, undefined, mysqlProjectName);
      }).toThrow();
      
      // Validate that security check blocks the operation
      const securityResult = validateQuerySecurity('CREATE TEMPORARY TABLE test_write (id INT)', false);
      expect(securityResult.allowed).toBe(false);
    });

    test('Write mode should allow write operations', () => {
      // Write operations should be allowed in write mode
      const result = dbQuery('CREATE TEMPORARY TABLE test_write (id INT)', true, undefined, mysqlProjectName);
      expect(typeof result).toBe('string');
      
      // Validate that security check allows the operation
      const securityResult = validateQuerySecurity('CREATE TEMPORARY TABLE test_write (id INT)', true);
      expect(securityResult.allowed).toBe(true);
    });
  });

  describe('Security Mode Integration', () => {
    test('Read-only mode should allow safe operations', () => {
      // Safe read operations should work
      const result = dbQuery('SELECT \'read-only-test\' as mode_test', false, undefined, mysqlProjectName);
      expect(result).toContain('read-only-test');
      
      // Validate security check allows safe operations
      const securityResult = validateQuerySecurity('SELECT \'read-only-test\' as mode_test', false);
      expect(securityResult.allowed).toBe(true);
    });

    test('Security validation should block dangerous operations', () => {
      // Dangerous operations should be blocked by security validation
      const dangerousQueries = [
        'DROP TABLE users',
        'DELETE FROM important_data',
        'UPDATE users SET password = "hacked"',
        'INSERT INTO admin_users VALUES (1, "backdoor")'
      ];

      dangerousQueries.forEach(query => {
        expect(() => {
          dbQuery(query, false, undefined, mysqlProjectName);
        }).toThrow();
        
        // Validate that security check blocks each operation
        const securityResult = validateQuerySecurity(query, false);
        expect(securityResult.allowed).toBe(false);
      });
    });
  });

  describe('Project Isolation Testing', () => {
    test('Multi-project mode should handle project switching', () => {
      // Test MySQL project access
      const mysqlStatus = getProjectStatus(mysqlProjectName);
      expect(mysqlStatus).toBeDefined();
      expect(mysqlStatus?.name).toBe(mysqlProjectName);

      // Test PostgreSQL project access
      const postgresStatus = getProjectStatus(postgresProjectName);
      expect(postgresStatus).toBeDefined();
      expect(postgresStatus?.name).toBe(postgresProjectName);
      
      // Test database operations work for both projects
      const mysqlResult = dbQuery('SELECT 1 as mysql_isolation_test', false, undefined, mysqlProjectName);
      expect(mysqlResult).toContain('mysql_isolation_test');
      
      const postgresResult = dbQuery('SELECT 1 as postgres_isolation_test', false, undefined, postgresProjectName);
      expect(postgresResult).toContain('postgres_isolation_test');
    });

    test('Project commands should work through DDEV execution', () => {
      // Test command execution in specific project
      const result = execDDEVCommand('exec "echo project-test"', mysqlProjectName);
      expect(result).toContain('project-test');
      
      // Test that we can execute basic commands
      const phpResult = execDDEVCommand('exec "php --version"', mysqlProjectName);
      expect(phpResult).toContain('PHP');
    });
  });

  describe('Cross-Database Compatibility', () => {
    test('Standard SQL should work on both MySQL and PostgreSQL', () => {
      // Test standard SQL on MySQL
      const mysqlResult = dbQuery('SELECT 1 as standard_sql', false, undefined, mysqlProjectName);
      expect(mysqlResult).toContain('standard_sql');
      
      // Test standard SQL on PostgreSQL
      const postgresResult = dbQuery('SELECT 1 as standard_sql', false, undefined, postgresProjectName);
      expect(postgresResult).toContain('standard_sql');
      
      // Test that both database types work with security validation
      const securityResult = validateQuerySecurity('SELECT 1 as standard_sql', false);
      expect(securityResult.allowed).toBe(true);
    });

    test('Database-specific commands should work through core functions', () => {
      // MySQL specific commands
      const mysqlResult = dbQuery('SHOW ENGINES', false, undefined, mysqlProjectName);
      expect(mysqlResult).toContain('Engine');

      // PostgreSQL specific commands
      const postgresResult = dbQuery('SELECT current_database() as db_name', false, undefined, postgresProjectName);
      expect(postgresResult).toContain('db_name');
      
      // Test that both work with security validation
      expect(validateQuerySecurity('SHOW ENGINES', false).allowed).toBe(true);
      expect(validateQuerySecurity('SELECT current_database() as db_name', false).allowed).toBe(true);
    });
  });

  describe('Core Function Integration', () => {
    test('All core functions should be properly integrated', () => {
      // Test that core database functions work
      expect(typeof dbQuery).toBe('function');
      expect(typeof getDatabaseType).toBe('function');
      expect(typeof validateQuerySecurity).toBe('function');
      
      // Test that project functions work
      expect(typeof listProjects).toBe('function');
      expect(typeof getProjectStatus).toBe('function');
      
      // Test that DDEV command function works
      expect(typeof execDDEVCommand).toBe('function');
      
      // Test that functions actually work with our test projects
      const projects = listProjects();
      expect(projects.length).toBeGreaterThan(0);
      const projectNames = projects.map(p => p.name || p);
      expect(projectNames).toContain(mysqlProjectName);
    });

    test('Functions should handle project-specific operations', () => {
      // Test that functions properly handle project_name parameter
      const result = execDDEVCommand('exec "pwd"', mysqlProjectName);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      
      // Test project status for specific project
      const status = getProjectStatus(mysqlProjectName);
      expect(status).toBeDefined();
      expect(status?.name).toBe(mysqlProjectName);
    });

    test('Functions should enforce security policies', () => {
      // Security should be enforced regardless of project
      expect(() => {
        dbQuery('DROP DATABASE mysql', false, undefined, mysqlProjectName);
      }).toThrow();

      // Same should apply to PostgreSQL project
      expect(() => {
        dbQuery('DROP DATABASE postgres', false, undefined, postgresProjectName);
      }).toThrow();
      
      // Validate security checks work for both
      expect(validateQuerySecurity('DROP DATABASE mysql', false).allowed).toBe(false);
      expect(validateQuerySecurity('DROP DATABASE postgres', false).allowed).toBe(false);
    });
  });
});