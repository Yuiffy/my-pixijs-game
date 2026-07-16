import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const heartbeatMs = 60 * 60 * 1000;
const stateDir = path.resolve(
  process.env.STREAM_SYNC_STATE_DIR || path.join(projectRoot, 'logs', 'state'),
);

function writeRunnerStatus(value) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'stream-sync-runner.json'),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
}

function runSync() {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const child = spawn(process.execPath, [path.join(scriptDir, 'sync-and-push.mjs')], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', (error) => {
      writeRunnerStatus({ startedAt, finishedAt: new Date().toISOString(), ok: false, error: error.message });
      resolve();
    });
    child.on('exit', (code, signal) => {
      writeRunnerStatus({
        startedAt,
        finishedAt: new Date().toISOString(),
        ok: code === 0,
        exitCode: code,
        signal,
      });
      resolve();
    });
  });
}

await runSync();
const heartbeat = setInterval(() => {
  writeRunnerStatus({ aliveAt: new Date().toISOString(), pid: process.pid });
}, heartbeatMs);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(heartbeat);
    process.exit(0);
  });
}
