// Test setup - runs before each test file (reads global state)

// Global test utilities
export {};

declare global {
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
  // Legacy compatibility
  var testProjectName: string;
}

// Set up global variables from environment
beforeAll(() => {
  // Read DDEV availability from global setup
  (global as any).isDdevAvailable = process.env.DDEV_AVAILABLE === 'true';
  
  // Read MySQL project info
  if (process.env.MYSQL_PROJECT_NAME && process.env.MYSQL_PROJECT_PATH) {
    (global as any).mysqlProject = {
      name: process.env.MYSQL_PROJECT_NAME,
      path: process.env.MYSQL_PROJECT_PATH,
      ready: true
    };
    // Legacy compatibility
    (global as any).testProjectName = process.env.MYSQL_PROJECT_NAME;
  } else {
    (global as any).mysqlProject = { name: '', path: '', ready: false };
  }
  
  // Read PostgreSQL project info
  if (process.env.POSTGRES_PROJECT_NAME && process.env.POSTGRES_PROJECT_PATH) {
    (global as any).postgresProject = {
      name: process.env.POSTGRES_PROJECT_NAME,
      path: process.env.POSTGRES_PROJECT_PATH,
      ready: true
    };
  } else {
    (global as any).postgresProject = { name: '', path: '', ready: false };
  }
});
