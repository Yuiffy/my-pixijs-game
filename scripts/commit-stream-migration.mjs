import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { getRepoPath, getReposRoot } from './stream-shards.mjs';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const manifestPath = valueAfter('--manifest');
const maxBatchBytes = Number(valueAfter('--max-batch-bytes') || 966367641);
const push = args.includes('--push');
if (!manifestPath || !args.includes('--commit')) {
  throw new Error('Usage: node scripts/commit-stream-migration.mjs --manifest <file> --commit [--push] [--max-batch-bytes <bytes>]');
}
const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
const reposRoot = getReposRoot();

function git(cwd, gitArgs, allowed = [0]) {
  const result = spawnSync('git', gitArgs, { cwd, encoding: 'utf8', windowsHide: true });
  if (!allowed.includes(result.status)) {
    throw new Error(`git ${gitArgs.join(' ')} failed in ${cwd}: ${result.stderr}`);
  }
  return result;
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function pushAndVerify(repoPath) {
  if (!push) return;
  let result;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    result = git(repoPath, ['push', '--set-upstream', 'origin', 'main'], [0, 1, 128]);
    if (result.status === 0) break;
    if (attempt < 5) sleep(1000 * 2 ** (attempt - 1));
  }
  if (result.status !== 0) throw new Error(`Unable to push ${repoPath}: ${result.stderr}`);
  const localSha = git(repoPath, ['rev-parse', 'HEAD']).stdout.trim();
  const remoteLine = git(repoPath, ['ls-remote', '--heads', 'origin', 'refs/heads/main']).stdout.trim();
  const remoteSha = remoteLine.split(/\s+/)[0];
  if (remoteSha !== localSha) {
    throw new Error(`Remote SHA mismatch for ${repoPath}: local ${localSha}, remote ${remoteSha || '<missing>'}`);
  }
}

function commitIfStaged(repoPath, message) {
  const quiet = git(repoPath, ['diff', '--cached', '--quiet'], [0, 1]);
  if (quiet.status === 0) return false;
  git(repoPath, ['commit', '-m', message]);
  pushAndVerify(repoPath);
  return true;
}

const byRepo = new Map();
for (const entry of manifest.entries) {
  if (!byRepo.has(entry.repo)) byRepo.set(entry.repo, []);
  byRepo.get(entry.repo).push(entry);
}
for (const [repo, entries] of byRepo) {
  const repoPath = getRepoPath(repo, reposRoot);
  git(repoPath, ['add', '--', 'README.md', '.gitattributes']);
  if (repo.endsWith('/liver-streams-index')) {
    const migrationDir = path.join(repoPath, 'migration');
    fs.mkdirSync(migrationDir, { recursive: true });
    fs.copyFileSync(path.resolve(manifestPath), path.join(migrationDir, 'source-manifest.json'));
    git(repoPath, ['add', '--', 'migration/source-manifest.json']);
  }
  commitIfStaged(repoPath, 'chore: initialize stream data repository');

  const tracked = new Set(
    git(repoPath, ['ls-files', '-z']).stdout.split('\0').filter(Boolean).map((value) => value.replaceAll('\\', '/')),
  );

  let batch = [];
  let batchBytes = 0;
  let batchNumber = 1;
  const flush = () => {
    if (!batch.length) return;
    for (let offset = 0; offset < batch.length; offset += 50) {
      git(repoPath, ['add', '--', ...batch.slice(offset, offset + 50)]);
    }
    commitIfStaged(repoPath, `chore: import stream data batch ${batchNumber}`);
    console.log(`${repo}: committed batch ${batchNumber} (${batch.length} files, ${batchBytes} bytes)`);
    batch = [];
    batchBytes = 0;
    batchNumber += 1;
  };

  for (const entry of entries.sort((a, b) => a.path.localeCompare(b.path))) {
    if (tracked.has(entry.path)) continue;
    if (batch.length && batchBytes + entry.bytes > maxBatchBytes) flush();
    batch.push(entry.path);
    batchBytes += entry.bytes;
  }
  flush();
}
