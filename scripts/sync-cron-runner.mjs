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
const statusPath = path.join(stateDir, 'stream-sync-runner.json');
const retryMinutes = parseRetryMinutes(process.env.STREAM_SYNC_RETRY_MINUTES || '5,15,30,60');

let activeChild = null;
let heartbeat = null;
let retryTimer = null;
let stopping = false;
let runnerStatus = {
  pid: process.pid,
  startedAt: new Date().toISOString(),
  retryMinutes,
};

function parseRetryMinutes(value) {
  const parsed = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((minutes) => Number.isFinite(minutes) && minutes > 0);
  if (!parsed.length) throw new Error(`Invalid STREAM_SYNC_RETRY_MINUTES: ${value}`);
  return parsed;
}

function updateRunnerStatus(patch) {
  runnerStatus = { ...runnerStatus, ...patch, updatedAt: new Date().toISOString() };
  fs.mkdirSync(stateDir, { recursive: true });
  const temporaryPath = `${statusPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(runnerStatus, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, statusPath);
}

function runSync(attempt) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    updateRunnerStatus({
      phase: 'running',
      attempt,
      lastRunStartedAt: startedAt,
      nextRetryAt: null,
    });

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      activeChild = null;
      updateRunnerStatus({
        phase: result.ok ? 'idle' : 'waiting-to-retry',
        lastRunFinishedAt: new Date().toISOString(),
        lastRunOk: result.ok,
        lastExitCode: result.exitCode ?? null,
        lastSignal: result.signal ?? null,
        lastError: result.error ?? null,
      });
      resolve(result);
    };

    activeChild = spawn(process.execPath, [path.join(scriptDir, 'sync-and-push.mjs')], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    activeChild.once('error', (error) => finish({ ok: false, error: error.message }));
    activeChild.once('exit', (code, signal) => finish({
      ok: code === 0,
      exitCode: code,
      signal,
    }));
  });
}

function waitForRetry(milliseconds) {
  return new Promise((resolve) => {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      resolve();
    }, milliseconds);
  });
}

async function runUntilSuccess() {
  let attempt = 1;
  while (!stopping) {
    const result = await runSync(attempt);
    if (result.ok || stopping) return result.ok;

    const retryIndex = Math.min(attempt - 1, retryMinutes.length - 1);
    const delayMs = retryMinutes[retryIndex] * 60 * 1000;
    updateRunnerStatus({
      phase: 'waiting-to-retry',
      nextRetryAt: new Date(Date.now() + delayMs).toISOString(),
    });
    await waitForRetry(delayMs);
    attempt += 1;
  }
  return false;
}

function stopRunner(signal) {
  if (stopping) return;
  stopping = true;
  if (heartbeat) clearInterval(heartbeat);
  if (retryTimer) clearTimeout(retryTimer);
  updateRunnerStatus({ phase: 'stopping', stopSignal: signal });

  if (!activeChild) {
    process.exit(0);
  }
  activeChild.once('exit', () => process.exit(0));
  activeChild.kill('SIGTERM');
  setTimeout(() => process.exit(0), 10000).unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stopRunner(signal));
}

updateRunnerStatus({ phase: 'starting', aliveAt: new Date().toISOString() });
heartbeat = setInterval(() => {
  updateRunnerStatus({ aliveAt: new Date().toISOString() });
}, heartbeatMs);

await runUntilSuccess();
if (!stopping) updateRunnerStatus({ phase: 'idle', nextRetryAt: null });
