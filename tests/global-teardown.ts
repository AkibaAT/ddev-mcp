// Global teardown - runs once after all test suites
import { execSync } from 'child_process';

export default async function globalTeardown() {
  if (process.env.DDEV_AVAILABLE === 'true') {
    console.log('🧹 Global test teardown - cleaning up shared DDEV projects...');
    
    // Clean up MySQL project
    if (process.env.MYSQL_PROJECT_NAME) {
      try {
        execSync(`ddev delete -Oy ${process.env.MYSQL_PROJECT_NAME}`, { stdio: 'pipe', timeout: 30000 });
      } catch (error) {
        // Best effort cleanup
      }
    }
    
    // Clean up PostgreSQL project
    if (process.env.POSTGRES_PROJECT_NAME) {
      try {
        execSync(`ddev delete -Oy ${process.env.POSTGRES_PROJECT_NAME}`, { stdio: 'pipe', timeout: 30000 });
      } catch (error) {
        // Best effort cleanup
      }
    }
    
    // Power off DDEV to clean up containers
    try {
      execSync('ddev poweroff', { stdio: 'pipe', timeout: 30000 });
    } catch (error) {
      // Best effort cleanup
    }
    
    console.log('✅ Global test teardown complete');
  }
};
