import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  getRepoPath,
  getReposRoot,
  listConfiguredRepos,
  loadShardConfig,
} from './stream-shards.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const config = loadShardConfig();
const reposRoot = getReposRoot();
const stateDir = path.resolve(
  process.env.STREAM_SYNC_STATE_DIR || path.join(projectRoot, 'logs', 'state'),
);
const transactionPath = path.join(stateDir, 'stream-sync-transaction.json');
const lastRunPath = path.join(stateDir, 'stream-sync-last-run.json');
const lockPath = path.join(stateDir, 'stream-sync.lock');
const syncArgs = process.argv.slice(2);
const gitRetryAttempts = positiveInteger(process.env.STREAM_GIT_RETRY_ATTEMPTS, 4);
const gitRetryDelayMs = positiveInteger(process.env.STREAM_GIT_RETRY_DELAY_MS, 5000);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function withRetry(label, operation) {
  let lastError;
  for (let attempt = 1; attempt <= gitRetryAttempts; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      lastError = error;
      if (attempt === gitRetryAttempts) break;
      const delay = gitRetryDelayMs * (2 ** (attempt - 1));
      console.warn(`${label} failed (attempt ${attempt}/${gitRetryAttempts}); retrying in ${delay} ms`);
      sleepSync(delay);
    }
  }
  throw lastError;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    encoding: 'utf8',
    windowsHide: true,
    stdio: options.inherit ? 'inherit' : 'pipe',
    env: { ...process.env, NO_COLOR: '1', GIT_TERMINAL_PROMPT: '0' },
  });
  const allowed = options.allowedExitCodes || [0];
  if (!allowed.includes(result.status)) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}${details ? `\n${details}` : ''}`);
  }
  return result;
}

function git(repoDir, args, options = {}) {
  return run('git', args, { ...options, cwd: repoDir });
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function saveTransaction(transaction) {
  transaction.updatedAt = new Date().toISOString();
  atomicWriteJson(transactionPath, transaction);
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  fs.mkdirSync(stateDir, { recursive: true });
  try {
    const handle = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(handle, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`);
    fs.closeSync(handle);
    return;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  let existing = null;
  try {
    existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    // A malformed lock is stale unless a process can be identified below.
  }
  if (existing && processExists(existing.pid)) {
    throw new Error(`Another stream sync is active with PID ${existing.pid}`);
  }
  fs.rmSync(lockPath, { force: true });
  acquireLock();
}

function releaseLock() {
  fs.rmSync(lockPath, { force: true });
}

function repoRecords() {
  return listConfiguredRepos(config).map((entry) => ({
    ...entry,
    path: getRepoPath(entry.repo, reposRoot),
  }));
}

function normalizeRemote(value) {
  return value
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function assertRepo(record) {
  if (!fs.existsSync(path.join(record.path, '.git'))) {
    throw new Error(`Missing Git checkout for ${record.repo}: ${record.path}`);
  }
  const branch = git(record.path, ['branch', '--show-current']).stdout.trim();
  if (branch !== record.branch) {
    throw new Error(`${record.repo} must be on ${record.branch}; current branch is ${branch || '(detached)'}`);
  }
  const remote = git(record.path, ['remote', 'get-url', 'origin']).stdout.trim();
  const expected = `https://github.com/${record.repo}`;
  if (normalizeRemote(remote) !== normalizeRemote(expected)) {
    throw new Error(`${record.repo} has unexpected origin: ${remote}`);
  }
}

function status(record) {
  return git(record.path, ['status', '--porcelain=v1', '--untracked-files=all']).stdout.trim();
}

function head(record) {
  return git(record.path, ['rev-parse', 'HEAD']).stdout.trim();
}

function remoteHead(record) {
  const output = withRetry(
    `Reading remote head for ${record.repo}`,
    () => git(record.path, ['ls-remote', '--heads', 'origin', record.branch]).stdout.trim(),
  );
  return output ? output.split(/\s+/)[0] : null;
}

function commitIfNeeded(record, message) {
  git(record.path, ['add', '--all']);
  const diff = git(record.path, ['diff', '--cached', '--quiet'], { allowedExitCodes: [0, 1] });
  if (diff.status === 1) git(record.path, ['commit', '-m', message]);
  return head(record);
}

function verifyRemote(record, expectedSha) {
  const actual = remoteHead(record);
  if (actual !== expectedSha) {
    throw new Error(`Remote verification failed for ${record.repo}: expected ${expectedSha}, got ${actual}`);
  }
}

function pushAndVerify(record, expectedSha) {
  withRetry(
    `Pushing ${record.repo}`,
    () => git(record.path, ['push', 'origin', `${record.branch}:${record.branch}`], { inherit: true }),
  );
  verifyRemote(record, expectedSha);
}

function validateLocalData() {
  run(process.execPath, [path.join(scriptDir, 'verify-stream-data.mjs'), '--local', '--references-only'], {
    inherit: true,
  });
}

function loadOrCreateTransaction(records) {
  if (fs.existsSync(transactionPath)) {
    const transaction = JSON.parse(fs.readFileSync(transactionPath, 'utf8'));
    console.log(`Resuming stream sync transaction ${transaction.id} at phase ${transaction.phase}`);
    return transaction;
  }
  for (const record of records) {
    assertRepo(record);
    if (status(record)) throw new Error(`Repository is dirty before sync: ${record.repo}`);
    const localSha = head(record);
    const remoteSha = remoteHead(record);
    if (remoteSha !== localSha) {
      throw new Error(
        `${record.repo} is not synchronized with origin/${record.branch}: `
        + `local ${localSha}, remote ${remoteSha || '(missing)'}. Run git pull --ff-only first.`,
      );
    }
  }
  const transaction = {
    id: new Date().toISOString().replace(/[:.]/g, '-'),
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phase: 'created',
    syncArgs,
    repositories: Object.fromEntries(records.map((record) => [record.id, {
      repo: record.repo,
      kind: record.kind,
      oldSha: head(record),
      newSha: null,
      pushed: false,
    }])),
    lastError: null,
  };
  saveTransaction(transaction);
  return transaction;
}

function executeTransaction(transaction, records) {
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const record of records) assertRepo(record);

  if (['created', 'syncing'].includes(transaction.phase)) {
    transaction.phase = 'syncing';
    saveTransaction(transaction);
    run(process.execPath, [path.join(scriptDir, 'sync_streams.mjs'), ...transaction.syncArgs], { inherit: true });
    validateLocalData();
    transaction.phase = 'validated';
    saveTransaction(transaction);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const assets = records.filter((record) => record.kind === 'asset');
  for (const record of assets) {
    const state = transaction.repositories[record.id];
    if (!state.newSha) {
      state.newSha = commitIfNeeded(record, `chore: sync stream assets ${timestamp}`);
      saveTransaction(transaction);
    }
    if (state.pushed) {
      verifyRemote(record, state.newSha);
    } else if (state.newSha !== state.oldSha) {
      pushAndVerify(record, state.newSha);
      state.pushed = true;
      saveTransaction(transaction);
    } else {
      verifyRemote(record, state.newSha);
      state.pushed = true;
      saveTransaction(transaction);
    }
  }

  transaction.phase = 'assets-pushed';
  saveTransaction(transaction);

  const indexRecord = records.find((record) => record.kind === 'index');
  const indexState = transaction.repositories[indexRecord.id];
  if (!indexState.newSha) {
    indexState.newSha = commitIfNeeded(indexRecord, `chore: publish stream index ${timestamp}`);
    transaction.phase = 'index-committed';
    saveTransaction(transaction);
  }
  if (indexState.pushed) {
    verifyRemote(indexRecord, indexState.newSha);
  } else if (indexState.newSha !== indexState.oldSha) {
    pushAndVerify(indexRecord, indexState.newSha);
    indexState.pushed = true;
    saveTransaction(transaction);
  } else {
    verifyRemote(indexRecord, indexState.newSha);
    indexState.pushed = true;
    saveTransaction(transaction);
  }

  transaction.phase = 'complete';
  transaction.completedAt = new Date().toISOString();
  saveTransaction(transaction);
  atomicWriteJson(lastRunPath, transaction);
  fs.rmSync(transactionPath, { force: true });

  for (const record of byId.values()) {
    if (status(record)) throw new Error(`Repository remained dirty after publication: ${record.repo}`);
  }
  console.log(`Stream sync transaction ${transaction.id} completed.`);
}

acquireLock();
try {
  const records = repoRecords();
  const transaction = loadOrCreateTransaction(records);
  executeTransaction(transaction, records);
} catch (error) {
  if (fs.existsSync(transactionPath)) {
    const transaction = JSON.parse(fs.readFileSync(transactionPath, 'utf8'));
    transaction.lastError = { at: new Date().toISOString(), message: error.message };
    saveTransaction(transaction);
  }
  console.error(`[${new Date().toISOString()}] Stream sync failed:`, error);
  process.exitCode = 1;
} finally {
  releaseLock();
}
