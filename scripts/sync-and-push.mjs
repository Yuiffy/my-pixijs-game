import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log(`[${new Date().toISOString()}] Starting sync and push process...`);

try {
  // Run sync-livers
  console.log('Running npm run run-sync...');
  execSync('npm run run-sync-scripts', { cwd: projectRoot, stdio: 'inherit' });

  // Git add all
  console.log('Running git add .');
  execSync('git add .', { cwd: projectRoot, stdio: 'inherit' });

  // Git commit
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const commitMessage = `chore: auto sync livers ${timestamp}`;
  console.log(`Running git commit -m "${commitMessage}"`);
  execSync(`git commit -m "${commitMessage}"`, { cwd: projectRoot, stdio: 'inherit' });

  // Git push
  console.log('Running git push');
  execSync('git push', { cwd: projectRoot, stdio: 'inherit' });

  console.log(`[${new Date().toISOString()}] Sync and push completed successfully!`);
} catch (error) {
  console.error(`[${new Date().toISOString()}] Error:`, error.message);
  process.exit(1);
}
