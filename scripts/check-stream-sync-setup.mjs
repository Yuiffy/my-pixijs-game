import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { liverConfigs } from './liver-config.js';
import {
  getAssignedShard,
  getIndexStreamsRoot,
  getRepoPath,
  getReposRoot,
  listConfiguredRepos,
  loadShardConfig,
  projectRoot,
} from './stream-shards.mjs';

const offline = process.argv.includes('--offline');
const jsonOutput = process.argv.includes('--json');
const config = loadShardConfig();
const reposRoot = getReposRoot();
const stateDir = path.resolve(
  process.env.STREAM_SYNC_STATE_DIR || path.join(projectRoot, 'logs', 'state'),
);
const checks = [];

function record(level, check, details = {}) {
  checks.push({ level, check, ...details });
}

function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, NO_COLOR: '1', GIT_TERMINAL_PROMPT: '0' },
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    error: result.error?.message,
  };
}

function normalizeRemote(value) {
  return value
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function checkGit() {
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= 20) record('pass', 'node', { message: `Node.js ${process.versions.node}` });
  else record('fail', 'node', { message: `Node.js 20 or newer is required; current ${process.versions.node}` });

  const version = run('git', ['--version']);
  if (version.ok) record('pass', 'git', { message: version.stdout });
  else record('fail', 'git', { message: version.error || version.stderr || 'git is unavailable' });

  const gh = run('gh', ['auth', 'status']);
  if (gh.ok) record('pass', 'github-auth', { message: 'GitHub CLI is authenticated' });
  else record('fail', 'github-auth', { message: 'Run gh auth login and gh auth setup-git' });

  const pm2 = run('pm2', ['--version']);
  if (pm2.ok) record('pass', 'pm2', { message: `PM2 ${pm2.stdout.split(/\r?\n/).at(-1)}` });
  else record('fail', 'pm2', { message: 'Install PM2 with npm install -g pm2' });
}

function checkStateDirectory() {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    const probe = path.join(stateDir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok\n', 'utf8');
    fs.rmSync(probe, { force: true });
    record('pass', 'state-directory', { path: stateDir });
  } catch (error) {
    record('fail', 'state-directory', { path: stateDir, message: error.message });
  }

  const transactionPath = path.join(stateDir, 'stream-sync-transaction.json');
  if (fs.existsSync(transactionPath)) {
    record('warn', 'pending-transaction', {
      path: transactionPath,
      message: 'The next publication will resume this transaction.',
    });
  }
}

function checkRepository(entry) {
  const repoDir = getRepoPath(entry.repo, reposRoot);
  if (!fs.existsSync(path.join(repoDir, '.git'))) {
    record('fail', 'repository', { repo: entry.repo, path: repoDir, message: 'Git checkout is missing' });
    return;
  }

  const branch = run('git', ['branch', '--show-current'], repoDir);
  if (!branch.ok || branch.stdout !== entry.branch) {
    record('fail', 'repository-branch', {
      repo: entry.repo,
      expected: entry.branch,
      actual: branch.stdout || '(detached)',
    });
  } else record('pass', 'repository-branch', { repo: entry.repo, branch: entry.branch });

  const origin = run('git', ['remote', 'get-url', 'origin'], repoDir);
  const expectedOrigin = `https://github.com/${entry.repo}`;
  if (!origin.ok || normalizeRemote(origin.stdout) !== normalizeRemote(expectedOrigin)) {
    record('fail', 'repository-origin', {
      repo: entry.repo,
      expected: expectedOrigin,
      actual: origin.stdout || origin.stderr,
    });
  } else record('pass', 'repository-origin', { repo: entry.repo, origin: origin.stdout });

  const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], repoDir);
  if (!status.ok || status.stdout) {
    record('fail', 'repository-clean', {
      repo: entry.repo,
      message: status.stdout || status.stderr || 'git status failed',
    });
  } else record('pass', 'repository-clean', { repo: entry.repo });

  for (const key of ['user.name', 'user.email']) {
    const value = run('git', ['config', '--get', key], repoDir);
    if (!value.ok || !value.stdout) {
      record('fail', 'git-identity', { repo: entry.repo, key, message: 'Git commit identity is missing' });
    }
  }

  if (offline) return;
  const local = run('git', ['rev-parse', 'HEAD'], repoDir);
  const remote = run('git', ['ls-remote', '--heads', 'origin', entry.branch], repoDir);
  const remoteSha = remote.stdout ? remote.stdout.split(/\s+/)[0] : null;
  if (!local.ok || !remote.ok || !remoteSha) {
    record('fail', 'repository-remote', {
      repo: entry.repo,
      message: remote.error || remote.stderr || 'Remote branch is unavailable',
    });
  } else if (local.stdout !== remoteSha) {
    record('fail', 'repository-up-to-date', {
      repo: entry.repo,
      local: local.stdout,
      remote: remoteSha,
      message: 'Run git pull --ff-only before starting the publisher.',
    });
  } else record('pass', 'repository-up-to-date', { repo: entry.repo, sha: remoteSha });
}

function checkLiver(liverId, liverConfig) {
  const configured = liverConfig.sourceDirs || [];
  const available = configured.filter((sourceDir) => fs.existsSync(sourceDir));
  for (const sourceDir of configured.filter((sourceDir) => !fs.existsSync(sourceDir))) {
    record('warn', 'source-directory', { liverId, path: sourceDir, message: 'Directory is unavailable' });
  }
  if (!configured.length || !available.length) {
    record('fail', 'source-directory', {
      liverId,
      paths: configured,
      message: configured.length ? 'No configured source directory is available' : 'No source directory is configured',
    });
  } else record('pass', 'source-directory', { liverId, available });

  const years = new Set();
  for (const sourceDir of available) {
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      const match = entry.isDirectory() ? /^(\d{4})_/.exec(entry.name) : null;
      if (match) years.add(Number(match[1]));
    }
  }
  for (const year of years) {
    try {
      const assignment = getAssignedShard(liverId, year, config);
      record('pass', 'shard-assignment', { liverId, year, shardId: assignment.shardId });
    } catch (error) {
      record('fail', 'shard-assignment', { liverId, year, message: error.message });
    }
  }

  const indexPath = path.join(getIndexStreamsRoot(config, reposRoot), liverId, 'streams.json');
  if (fs.existsSync(indexPath)) record('pass', 'liver-index', { liverId, path: indexPath });
  else record('fail', 'liver-index', { liverId, path: indexPath, message: 'streams.json is missing' });
}

checkGit();
checkStateDirectory();
for (const entry of listConfiguredRepos(config)) checkRepository(entry);
for (const [liverId, liverConfig] of Object.entries(liverConfigs)) checkLiver(liverId, liverConfig);

const report = {
  checkedAt: new Date().toISOString(),
  offline,
  reposRoot,
  stateDir,
  passCount: checks.filter((check) => check.level === 'pass').length,
  warningCount: checks.filter((check) => check.level === 'warn').length,
  failureCount: checks.filter((check) => check.level === 'fail').length,
  checks,
};

if (jsonOutput) console.log(JSON.stringify(report, null, 2));
else {
  for (const check of checks) {
    const subject = check.repo || check.liverId || check.path || '';
    const message = check.message || check.sha || check.branch || '';
    console.log(`[${check.level.toUpperCase()}] ${check.check}${subject ? ` ${subject}` : ''}${message ? ` - ${message}` : ''}`);
  }
  console.log(`Setup check: ${report.passCount} passed, ${report.warningCount} warnings, ${report.failureCount} failed.`);
}
if (report.failureCount) process.exitCode = 1;
