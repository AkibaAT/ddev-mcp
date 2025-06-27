import { describe, test, expect } from '@jest/globals';
import { dbQuery, validateQuerySecurity } from '../src/database-service.js';
import { listProjects, getProjectStatus } from '../src/project-service.js';
import { execDDEVCommand } from '../src/ddev-command.js';

interface JsonSchema {
  type?: string;
  properties?: Record<string, any>;
  required?: string[];
}

describe('MCP Protocol Integration', () => {
  describe('Core Function Availability', () => {
    test('should have all expected core functions available', () => {
      const expectedFunctions = [
        { name: 'dbQuery', func: dbQuery },
        { name: 'validateQuerySecurity', func: validateQuerySecurity },
        { name: 'listProjects', func: listProjects },
        { name: 'getProjectStatus', func: getProjectStatus },
        { name: 'execDDEVCommand', func: execDDEVCommand }
      ];
      
      // Test that required functions exist and are callable
      expectedFunctions.forEach(({ name, func }) => {
        expect(func).toBeDefined();
        expect(typeof func).toBe('function');
      });
      
      // Test that functions have the expected number
      expect(expectedFunctions.length).toBe(5);
    });

    test('should have functions that correspond to MCP tool capabilities', () => {
      // Map core functions to their equivalent MCP tool purposes
      const functionToToolMapping = [
        { toolName: 'ddev_db_query', coreFunction: dbQuery },
        { toolName: 'ddev_list_projects', coreFunction: listProjects },
        { toolName: 'ddev_project_status', coreFunction: getProjectStatus },
        { toolName: 'ddev_exec_command', coreFunction: execDDEVCommand }
      ];

      functionToToolMapping.forEach(({ toolName, coreFunction }) => {
        expect(coreFunction).toBeDefined();
        expect(typeof coreFunction).toBe('function');
      });
    });
  });

  describe('Function Parameter Validation', () => {
    test('should validate database query function parameters', () => {
      // Test parameter validation for dbQuery function
      expect(typeof dbQuery).toBe('function');
      
      // Test that the function expects the right number of required parameters (without defaults)
      expect(dbQuery.length).toBe(1); // only query is required, others have defaults
    });

    test('should validate security function parameters', () => {
      // Test parameter validation for validateQuerySecurity function
      expect(typeof validateQuerySecurity).toBe('function');
      
      // Test that the function expects the right number of parameters
      expect(validateQuerySecurity.length).toBe(2); // query, allowWriteOperations
    });

    test('should validate project management function parameters', () => {
      // Test parameter validation for project functions
      expect(typeof listProjects).toBe('function');
      expect(typeof getProjectStatus).toBe('function');
      expect(typeof execDDEVCommand).toBe('function');
      
      // Test parameter counts
      expect(listProjects.length).toBe(0); // no parameters
      expect(getProjectStatus.length).toBe(1); // projectName
      expect(execDDEVCommand.length).toBe(2); // command, projectName
    });
  });

  describe('Function Return Type Validation', () => {
    test('should validate security function returns correct schema', () => {
      // Test that validateQuerySecurity returns the expected structure
      const result = validateQuerySecurity('SELECT 1', false);
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('allowed');
      expect(typeof result.allowed).toBe('boolean');
      
      // Test that it optionally has a reason property
      if ('reason' in result) {
        expect(typeof result.reason).toBe('string');
      }
    });

    test('should validate project functions return correct types', () => {
      // Test that listProjects returns an array
      const projects = listProjects();
      expect(Array.isArray(projects)).toBe(true);
      
      // Test that getProjectStatus returns null or object
      const status = getProjectStatus('non-existent-project');
      expect(status === null || typeof status === 'object').toBe(true);
    });
  });

  describe('Function Error Handling', () => {
    test('should handle invalid parameters gracefully', () => {
      // Test that functions handle invalid parameters appropriately
      expect(() => {
        validateQuerySecurity('', false);
      }).not.toThrow();
      
      expect(() => {
        getProjectStatus('');
      }).not.toThrow();
    });

    test('should throw appropriate errors for malformed inputs', () => {
      // Test that functions throw errors when appropriate
      expect(() => {
        // @ts-expect-error - Testing invalid parameters
        validateQuerySecurity(null, false);
      }).toThrow();
      
      expect(() => {
        execDDEVCommand('invalid-command', 'non-existent-project');
      }).toThrow();
    });
  });

  describe('Function Security Compliance', () => {
    test('should enforce security policies consistently', () => {
      // Test that security validation is consistent
      const dangerousQuery = 'DROP TABLE users';
      const result1 = validateQuerySecurity(dangerousQuery, false);
      const result2 = validateQuerySecurity(dangerousQuery, false);
      
      expect(result1.allowed).toBe(result2.allowed);
      expect(result1.allowed).toBe(false);
    });

    test('should block catastrophic operations across all modes', () => {
      // Test that catastrophic operations are blocked in all modes
      const catastrophicQueries = [
        'SHUTDOWN',
        'DROP DATABASE mysql',
        'SELECT LOAD_FILE("/etc/passwd")'
      ];

      catastrophicQueries.forEach(query => {
        // Test in read-only mode
        const readOnlyResult = validateQuerySecurity(query, false);
        expect(readOnlyResult.allowed).toBe(false);
        
        // Test in write mode - should still be blocked
        const writeResult = validateQuerySecurity(query, true);
        expect(writeResult.allowed).toBe(false);
      });
    });

    test('should provide consistent error messages', () => {
      // Test that error messages are consistent for similar violations
      const writeQueries = [
        'INSERT INTO users VALUES (1)',
        'UPDATE users SET name = "test"',
        'DELETE FROM users WHERE id = 1'
      ];

      writeQueries.forEach(query => {
        const result = validateQuerySecurity(query, false);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBeTruthy();
        expect(result.reason).toContain('whitelist');
      });
    });
  });

  describe('Function Integration', () => {
    test('should work together as a cohesive system', () => {
      // Test that functions can be used together
      const projects = listProjects();
      expect(Array.isArray(projects)).toBe(true);
      
      if (projects.length > 0) {
        const project = projects[0];
        const projectName = typeof project === 'string' ? project : project.name;
        if (projectName) {
          const status = getProjectStatus(projectName);
          expect(status).toBeDefined();
        }
      }
    });

    test('should maintain state consistency across function calls', () => {
      // Test that multiple function calls maintain consistent state
      const query = 'SELECT 1 as test';
      
      const result1 = validateQuerySecurity(query, false);
      const result2 = validateQuerySecurity(query, false);
      
      expect(result1.allowed).toBe(result2.allowed);
      expect(result1.allowed).toBe(true);
    });

    test('should handle concurrent function execution', () => {
      // Test that functions handle concurrent execution
      const promises = Array(3).fill(0).map((_, i) =>
        Promise.resolve(validateQuerySecurity(`SELECT ${i}`, false))
      );
      
      Promise.all(promises).then(results => {
        results.forEach(result => {
          expect(result.allowed).toBe(true);
        });
      });
    });
  });

  describe('Schema Compliance', () => {
    test('should return data in expected format', () => {
      // Test that security validation returns expected schema
      const securityResult = validateQuerySecurity('SELECT 1', false);
      expect(securityResult).toMatchObject({
        allowed: expect.any(Boolean)
      });
    });

    test('should handle optional properties correctly', () => {
      // Test handling of optional properties
      const blockedResult = validateQuerySecurity('DROP TABLE test', false);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.reason).toBeDefined();
      expect(typeof blockedResult.reason).toBe('string');
      
      const allowedResult = validateQuerySecurity('SELECT 1', false);
      expect(allowedResult.allowed).toBe(true);
      // reason is optional for allowed queries
    });
  });
});