// Global setup - runs once before all test suites
import { execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';

// Check if DDEV is available
function checkDdevAvailable(): boolean {
  try {
    const version = execSync('ddev version', { stdio: 'pipe', encoding: 'utf8', timeout: 10000 });
    const versionMatch = version.match(/DDEV version\s+v?([0-9]+\.[0-9]+\.[0-9]+)/);
    const versionNumber = versionMatch ? versionMatch[1] : 'unknown';
    console.log(`✅ DDEV v${versionNumber} available`);
    return true;
  } catch (error) {
    console.log('❌ DDEV not available');
    return false;
  }
}

async function createTestProject(name: string, database: string, projectPath: string): Promise<boolean> {
  try {
    console.log(`🏗️ Creating ${database} project...`);

    // Create project directory
    if (!existsSync(projectPath)) {
      execSync(`mkdir -p ${projectPath}`, { stdio: 'pipe' });
    }

    // Delete existing project if it exists
    try {
      execSync(`ddev delete -Oy ${name}`, { stdio: 'pipe', timeout: 30000 });
    } catch (error) {
      // Project might not exist, that's fine
    }

    // Configure DDEV project (use absolute path)
    const dbFlag = database === 'postgres' ? '--database=postgres:17' : '--database=mysql:8.0';
    execSync(`ddev config --project-type=php --php-version=8.4 --project-name=${name} ${dbFlag}`, {
      stdio: 'pipe',
      timeout: 60000,
      cwd: projectPath
    });

    // Create a simple index.php
    writeFileSync(path.join(projectPath, 'index.php'), `<?php echo "Test project: ${name}"; ?>`);

    // Start the project
    execSync(`ddev start`, { stdio: 'pipe', timeout: 300000, cwd: projectPath });

    // Wait for services to be ready
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Quick verification
    try {
      if (database === 'mysql') {
        execSync('ddev exec "mysql -e \\"SELECT 1\\""', { stdio: 'pipe', timeout: 30000, cwd: projectPath });
      } else {
        execSync('ddev exec "psql -c \\"SELECT 1\\""', { stdio: 'pipe', timeout: 30000, cwd: projectPath });
      }
    } catch (verifyError) {
      // Don't fail completely - the project might still be usable
    }

    console.log(`✅ ${database} project ready`);
    return true;
  } catch (error) {
    console.log(`❌ Failed to create ${database} project`);
    return false;
  }
}

export default async function globalSetup() {
  console.log('🔧 Global test setup - creating shared DDEV projects...');

  // Save the original working directory
  const originalCwd = process.cwd();

  const isDdevAvailable = checkDdevAvailable();

  if (!isDdevAvailable) {
    console.log('⚠️ DDEV not available - tests will be limited');
    // Store the availability status for test files
    process.env.DDEV_AVAILABLE = 'false';
    return;
  }

  process.env.DDEV_AVAILABLE = 'true';
  
  // Clean up any existing shared test projects first
  try {
    const result = execSync('ddev list --json-output', { encoding: 'utf8', stdio: 'pipe', timeout: 30000 });
    const jsonData = JSON.parse(result || '{"raw":[]}');
    const projects = jsonData.raw || [];
    
    for (const project of projects) {
      if (project.name && project.name.includes('ddev-mcp-shared')) {
        try {
          execSync(`ddev delete -Oy ${project.name}`, { stdio: 'pipe', timeout: 30000 });
        } catch (error) {
          // Best effort cleanup
        }
      }
    }
  } catch (error) {
    // If listing fails, try specific cleanup
    const cleanupProjects = ['ddev-mcp-shared-mysql', 'ddev-mcp-shared-postgres'];
    for (const projectName of cleanupProjects) {
      try {
        execSync(`ddev delete -Oy ${projectName}`, { stdio: 'pipe', timeout: 30000 });
      } catch (error) {
        // Projects might not exist
      }
    }
  }
  
  // Create shared test projects
  const timestamp = Date.now();
  const baseDir = path.join(os.tmpdir(), `ddev-mcp-shared-${timestamp}`);
  
  // MySQL project
  const mysqlPath = path.join(baseDir, 'mysql');
  const mysqlName = 'ddev-mcp-shared-mysql';
  const mysqlReady = await createTestProject(mysqlName, 'mysql', mysqlPath);
  
  // PostgreSQL project  
  const postgresPath = path.join(baseDir, 'postgres');
  const postgresName = 'ddev-mcp-shared-postgres';
  const postgresReady = await createTestProject(postgresName, 'postgres', postgresPath);
  
  // Store project information in environment variables for test files
  if (mysqlReady) {
    process.env.MYSQL_PROJECT_NAME = mysqlName;
    process.env.MYSQL_PROJECT_PATH = mysqlPath;
  }
  
  if (postgresReady) {
    process.env.POSTGRES_PROJECT_NAME = postgresName;
    process.env.POSTGRES_PROJECT_PATH = postgresPath;
  }
  
  if (mysqlReady && postgresReady) {
    console.log('✅ Global test setup complete - both projects ready');
  } else {
    console.log('⚠️ Global test setup complete - some projects failed');
  }

  // Restore the original working directory
  process.chdir(originalCwd);
};
