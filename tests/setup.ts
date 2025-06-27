// Test setup file
// This file runs before all tests

import { execSync } from 'child_process';

// Global test utilities
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

// Check if DDEV is available
function checkDdevAvailable(): boolean {
  try {
    console.log('🔍 Checking DDEV availability...');

    // Check DDEV command exists
    const version = execSync('ddev version', { stdio: 'pipe', encoding: 'utf8', timeout: 10000 });
    // Extract just the version number from the output
    const versionMatch = version.match(/DDEV version\s+v?([0-9]+\.[0-9]+\.[0-9]+)/);
    const versionNumber = versionMatch ? versionMatch[1] : version.split('\n')[0].trim();
    console.log(`  ✅ DDEV version: v${versionNumber}`);

    // Check Docker is running
    try {
      execSync('docker ps', { stdio: 'pipe', timeout: 10000 });
      console.log('  ✅ Docker is running');
    } catch (dockerError) {
      console.log('  ⚠️  Docker check failed, but continuing...');
    }

    // Try a simple DDEV command
    try {
      execSync('ddev list', { stdio: 'pipe', timeout: 15000 });
      console.log('  ✅ DDEV list command works');
    } catch (listError) {
      console.log('  ⚠️  DDEV list failed, but DDEV is available');
    }

    return true;
  } catch (error) {
    console.log(`  ❌ DDEV not available: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

// Check if we're in CI environment
function isCI(): boolean {
  return Boolean(process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI);
}

// Set up test environment
beforeAll(async () => {
  console.log('🔧 Setting up test environment...');

  if (isCI()) {
    console.log('🤖 Running in CI environment');
  } else {
    console.log('💻 Running in local environment');
  }

  (global as any).isDdevAvailable = checkDdevAvailable();
  // Use timestamp to ensure unique project names
  const timestamp = Date.now();
  (global as any).testProjectName = `ddev-mcp-test-${timestamp}`;

  if (global.isDdevAvailable) {
    console.log('✅ DDEV available - running integration tests');
    console.log(`📝 Test project name: ${global.testProjectName}`);

    // Clean up any existing test projects (broad cleanup)
    console.log('🧹 Cleaning up any existing test projects...');
    try {
      console.log('  📋 Attempting to list DDEV projects...');
      const result = execSync('ddev list --json-output', { encoding: 'utf8', stdio: 'pipe', timeout: 30000 });
      const jsonData = JSON.parse(result || '{"raw":[]}');
      const projects = jsonData.raw || [];
      console.log(`  📊 Found ${projects.length} DDEV projects`);

      // Clean up any old test projects
      let cleanedCount = 0;
      for (const project of projects) {
        if (project.name && project.name.includes('ddev-mcp-test')) {
          try {
            console.log(`  🗑️  Removing old test project: ${project.name}`);
            execSync(`ddev delete -Oy ${project.name}`, { stdio: 'pipe', timeout: 30000 });
            cleanedCount++;
          } catch (error) {
            console.log(`  ⚠️  Failed to remove ${project.name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      console.log(`✅ Cleaned up ${cleanedCount} old test projects`);
    } catch (error) {
      // If we can't list projects, try specific cleanup and diagnose
      console.log('⚠️  Could not list projects, diagnosing DDEV status...');

      // Check DDEV version and status
      try {
        const version = execSync('ddev version', { encoding: 'utf8', stdio: 'pipe', timeout: 10000 });
        const versionMatch = version.match(/DDEV version\s+v?([0-9]+\.[0-9]+\.[0-9]+)/);
        const versionNumber = versionMatch ? `v${versionMatch[1]}` : 'unknown';
        console.log(`  ℹ️  DDEV version: ${versionNumber}`);
      } catch (versionError) {
        console.log(`  ❌ DDEV version check failed: ${versionError instanceof Error ? versionError.message : String(versionError)}`);
      }

      // Check Docker status
      try {
        const dockerStatus = execSync('docker ps', { encoding: 'utf8', stdio: 'pipe', timeout: 10000 });
        console.log(`  ℹ️  Docker is running (${dockerStatus.split('\n').length - 1} containers)`);
      } catch (dockerError) {
        console.log(`  ❌ Docker check failed: ${dockerError instanceof Error ? dockerError.message : String(dockerError)}`);
      }

      // Try specific cleanup
      console.log('  🧹 Attempting specific project cleanup...');
      const cleanupProjects = ['ddev-mcp-test', 'ddev-mcp-test-tools', 'mysql-fail-project', 'postgres-fail-project', 'server-failure-test'];
      for (const projectName of cleanupProjects) {
        try {
          execSync(`ddev delete -Oy ${projectName}`, { stdio: 'pipe', timeout: 30000 });
          console.log(`  ✅ Removed ${projectName}`);
        } catch (cleanupError) {
          // Projects might not exist, that's fine
          console.log(`  ℹ️  ${projectName} not found (OK)`);
        }
      }
    }
  } else {
    console.log('⚠️  DDEV not available - running unit tests only');
  }

  console.log('🚀 Test environment setup complete');
});

// Clean up after all tests
afterAll(async () => {
  if (global.isDdevAvailable && global.testProjectName) {
    console.log('🧹 Cleaning up test environment...');
    try {
      // Clean up the specific test projects
      console.log(`  🗑️  Removing test project: ${global.testProjectName}`);
      execSync(`ddev delete -Oy ${global.testProjectName}`, { stdio: 'pipe' });
      console.log(`  🗑️  Removing test project: ${global.testProjectName}-tools`);
      execSync(`ddev delete -Oy ${global.testProjectName}-tools`, { stdio: 'pipe' });

      // Also clean up any orphaned containers
      console.log('  🐳 Powering off DDEV containers...');
      execSync('ddev poweroff', { stdio: 'pipe' });
      console.log('✅ Test cleanup complete');
    } catch (error) {
      console.log('⚠️  Best effort cleanup completed');
    }
  }
});
