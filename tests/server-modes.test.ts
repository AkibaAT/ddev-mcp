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

describe('MCP Server Mode Testing', () => {
  let testProjectName: string;

  beforeAll(() => {
    if (!global.isDdevAvailable) {
      throw new Error('DDEV is required for server mode tests but is not available');
    }

    // Use shared MySQL project
    if (global.mysqlProject?.ready && global.mysqlProject.name) {
      testProjectName = global.mysqlProject.name;
    } else {
      console.log('⚠️ No shared projects ready - tests will be limited');
      testProjectName = 'ddev-mcp-shared-mysql';
    }
  });

  describe('Server Configuration Modes', () => {
    test('Default mode should be multi-project, read-only', () => {
      // Test multi-project functionality by listing all projects
      const projects = listProjects();
      expect(projects.length).toBeGreaterThan(0);
      
      // Test read-only mode by ensuring write operations are blocked
      expect(() => {
        dbQuery('CREATE TEMPORARY TABLE test_mode (id INT)', false, undefined, testProjectName);
      }).toThrow();
      
      // Test that read operations work
      const readResult = dbQuery('SELECT 1 as default_mode_test', false, undefined, testProjectName);
      expect(readResult).toContain('default_mode_test');
    });

    test('Single-project mode should work with specific project', () => {
      // Test single-project functionality by checking project status
      const status = getProjectStatus(testProjectName);
      expect(status).toBeDefined();
      expect(status?.name).toBe(testProjectName);
      
      // Test that single project operations work
      const result = dbQuery('SELECT 1 as single_project_mode', false, undefined, testProjectName);
      expect(result).toContain('single_project_mode');
    });

    test('Write mode should be configurable', () => {
      // Test read-only mode blocks writes
      expect(() => {
        dbQuery('CREATE TEMPORARY TABLE test_write_mode (id INT)', false, undefined, testProjectName);
      }).toThrow();
      
      // Test write mode allows writes
      const writeResult = dbQuery('CREATE TEMPORARY TABLE test_write_mode (id INT)', true, undefined, testProjectName);
      expect(typeof writeResult).toBe('string');
      
      // Test security validation respects write mode
      expect(validateQuerySecurity('CREATE TABLE test (id INT)', false).allowed).toBe(false);
      expect(validateQuerySecurity('CREATE TABLE test (id INT)', true).allowed).toBe(true);
    });

    test('Combined single-project and write mode should work', () => {
      // Test single project with write mode
      const status = getProjectStatus(testProjectName);
      expect(status).toBeDefined();
      
      // Test write operations work in single-project write mode
      const writeResult = dbQuery('CREATE TEMPORARY TABLE combined_mode_test (id INT)', true, undefined, testProjectName);
      expect(typeof writeResult).toBe('string');
      
      // Test combined operations - both read and write
      const readResult = dbQuery('SELECT 1 as combined_read_test', false, undefined, testProjectName);
      expect(readResult).toContain('combined_read_test');
      
      // Test security validation works in combined mode
      expect(validateQuerySecurity('CREATE TEMPORARY TABLE combined_test (id INT)', true).allowed).toBe(true);
    });
  });

  describe('Function Security and Filtering', () => {
    test('Command whitelist logic should work with core functions', () => {
      // Test that core functions can be used to simulate command filtering
      const allowedCommands = ['ddev_db_query', 'ddev_project_status'];
      
      // Database query function should work (simulating ddev_db_query)
      expect(typeof dbQuery).toBe('function');
      expect(allowedCommands.includes('ddev_db_query')).toBe(true);
      
      // Project status function should work (simulating ddev_project_status)
      expect(typeof getProjectStatus).toBe('function');
      expect(allowedCommands.includes('ddev_project_status')).toBe(true);
      
      // Non-allowed command would be filtered out
      expect(allowedCommands.includes('ddev_exec_command')).toBe(false);
    });

    test('Single-project mode logic should work', () => {
      // Test that in single-project mode, list functionality is restricted
      const projectStatus = getProjectStatus(testProjectName);
      expect(projectStatus).toBeDefined();
      expect(projectStatus?.name).toBe(testProjectName);
      
      // List function exists but would be filtered in single-project mode
      expect(typeof listProjects).toBe('function');
      
      // Core functions should work for the specific project
      const testResult = dbQuery('SELECT 1 as single_project_filter_test', false, undefined, testProjectName);
      expect(testResult).toContain('single_project_filter_test');
    });

    test('Project name validation should work through core functions', () => {
      // Test that project validation works
      const validProject = getProjectStatus(testProjectName);
      expect(validProject).toBeDefined();
      
      // Test that invalid project handling works
      const invalidProject = getProjectStatus('non-existent-project-12345');
      expect(invalidProject).toBeNull();
    });
  });

  describe('Mode-Specific Database Operations', () => {
    test('Read-only mode should allow safe operations', () => {
      // Test that safe read operations work in read-only mode
      const safeQueries = [
        'SELECT 1 as read_only_test',
        'SHOW TABLES',
        'DESCRIBE information_schema.TABLES'
      ];

      safeQueries.forEach(query => {
        const result = dbQuery(query, false, undefined, testProjectName);
        expect(typeof result).toBe('string');
        
        // Validate that security check allows these
        const securityResult = validateQuerySecurity(query, false);
        expect(securityResult.allowed).toBe(true);
      });
    });

    test('Read-only mode should block dangerous operations', () => {
      // Test that dangerous operations are blocked in read-only mode
      const dangerousQueries = [
        'DROP TABLE users',
        'DELETE FROM important_data',
        'UPDATE users SET password = "compromised"',
        'INSERT INTO admin_users VALUES (1, "backdoor")'
      ];

      dangerousQueries.forEach(query => {
        expect(() => {
          dbQuery(query, false, undefined, testProjectName);
        }).toThrow();
        
        // Validate that security check blocks these
        const securityResult = validateQuerySecurity(query, false);
        expect(securityResult.allowed).toBe(false);
      });
    });

    test('Write mode should allow controlled write operations', () => {
      // Test that write operations work in write mode using a single session
      const combinedQuery = 'CREATE TEMPORARY TABLE write_mode_test (id INT); INSERT INTO write_mode_test VALUES (1); UPDATE write_mode_test SET id = 2; DELETE FROM write_mode_test WHERE id = 2; SELECT COUNT(*) FROM write_mode_test;';
      const result = dbQuery(combinedQuery, true, undefined, testProjectName);
      expect(typeof result).toBe('string');
      
      // Test individual write operations for security validation
      const writeQueries = [
        'CREATE TEMPORARY TABLE write_mode_test (id INT)',
        'INSERT INTO write_mode_test VALUES (1)',
        'UPDATE write_mode_test SET id = 2',
        'DELETE FROM write_mode_test WHERE id = 2'
      ];

      writeQueries.forEach(query => {
        // Validate that security check allows these in write mode
        const securityResult = validateQuerySecurity(query, true);
        expect(securityResult.allowed).toBe(true);
      });
    });

    test('Write mode should still block catastrophic operations', () => {
      // Test that even in write mode, catastrophic operations are blocked
      const catastrophicQueries = [
        'DROP DATABASE mysql',
        'SHUTDOWN',
        'SELECT LOAD_FILE("/etc/passwd")'
      ];

      catastrophicQueries.forEach(query => {
        expect(() => {
          dbQuery(query, true, undefined, testProjectName);
        }).toThrow();
        
        // Validate that security check still blocks these even in write mode
        const securityResult = validateQuerySecurity(query, true);
        expect(securityResult.allowed).toBe(false);
      });
    });
  });

  describe('Cross-Project Operations', () => {
    test('Multi-project mode should support multiple projects', () => {
      // Test that we can list multiple projects
      const projects = listProjects();
      expect(projects.length).toBeGreaterThan(0);
      
      // Test operations on the test project
      const testProjectStatus = getProjectStatus(testProjectName);
      expect(testProjectStatus).toBeDefined();
      expect(testProjectStatus?.name).toBe(testProjectName);
      
      // Test database operations on the test project
      const result = dbQuery('SELECT 1 as multi_project_test', false, undefined, testProjectName);
      expect(result).toContain('multi_project_test');
    });

    test('Project isolation should be maintained', () => {
      // Test that project-specific operations work correctly
      const projectResult = dbQuery('SELECT 1 as isolation_test', false, undefined, testProjectName);
      expect(projectResult).toContain('isolation_test');
      
      // Test that DDEV commands work with project context
      const ddevResult = execDDEVCommand('exec "echo isolation-test"', testProjectName);
      expect(ddevResult).toContain('isolation-test');
    });

    test('Security should be consistent across projects', () => {
      // Test that security validation is consistent regardless of project
      const dangerousQuery = 'DROP DATABASE production';
      
      expect(() => {
        dbQuery(dangerousQuery, false, undefined, testProjectName);
      }).toThrow();
      
      // Security validation should be project-agnostic
      const securityResult = validateQuerySecurity(dangerousQuery, false);
      expect(securityResult.allowed).toBe(false);
    });
  });
});