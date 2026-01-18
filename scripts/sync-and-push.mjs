import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const execOptions = {
  cwd: projectRoot,
  stdio: 'pipe',
  windowsHide: true,
  shell: process.platform === 'win32' ? 'cmd.exe' : true,
  env: { ...process.env, NO_COLOR: '1' },
};

function execSilent(command) {
  if (process.platform === 'win32') {
    return execSync(`cmd /c "${command}"`, execOptions);
  }
  return execSync(command, execOptions);
}

console.log(`[${new Date().toISOString()}] Starting sync and push process...`);

try {
  // Run sync-livers directly with node
  console.log('Running sync_livers.mjs...');
  execSilent('node scripts/sync_livers.mjs');

  // Git add all
  console.log('Running git add .');
  execSilent('git add .');

  // Git commit
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const commitMessage = `chore: auto sync livers ${timestamp}`;
  console.log(`Running git commit -m "${commitMessage}"`);
  execSilent(`git commit -m "${commitMessage}"`);

  // Git push
  console.log('Running git push');
  execSilent('git push');

  console.log(`[${new Date().toISOString()}] Sync and push completed successfully!`);
} catch (error) {
  console.error(`[${new Date().toISOString()}] Error:`, error.message);
  process.exit(1);
}
