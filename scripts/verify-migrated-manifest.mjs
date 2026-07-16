import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getRepoPath, getReposRoot } from './stream-shards.mjs';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const manifestPath = valueAfter('--manifest');
const outputPath = valueAfter('--output');
if (!manifestPath || !outputPath) {
  throw new Error('Usage: node scripts/verify-migrated-manifest.mjs --manifest <file> --output <file>');
}
const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
const reposRoot = getReposRoot();
const failures = [];
let checkedBytes = 0;

function collectDataFiles(repoPath) {
  const root = path.join(repoPath, 'public', 'data', 'streams');
  if (!fs.existsSync(root)) return [];
  const files = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) files.push(path.relative(repoPath, entryPath).split(path.sep).join('/'));
    }
  }
  return files;
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

for (let index = 0; index < manifest.entries.length; index += 1) {
  const entry = manifest.entries[index];
  const filePath = path.join(getRepoPath(entry.repo, reposRoot), ...entry.path.split('/'));
  if (!fs.existsSync(filePath)) {
    failures.push({ type: 'missing', path: entry.path, repo: entry.repo });
    continue;
  }
  const bytes = fs.statSync(filePath).size;
  if (bytes !== entry.bytes) {
    failures.push({ type: 'size', path: entry.path, repo: entry.repo, expected: entry.bytes, actual: bytes });
    continue;
  }
  const digest = await sha256(filePath);
  if (digest !== entry.sha256) {
    failures.push({ type: 'sha256', path: entry.path, repo: entry.repo, expected: entry.sha256, actual: digest });
  }
  checkedBytes += bytes;
  if ((index + 1) % 250 === 0) console.log(`Verified ${index + 1}/${manifest.entries.length} files`);
}

const expectedByRepo = new Map();
for (const entry of manifest.entries) {
  if (!expectedByRepo.has(entry.repo)) expectedByRepo.set(entry.repo, new Set());
  expectedByRepo.get(entry.repo).add(entry.path);
}
for (const [repo, expected] of expectedByRepo) {
  for (const actual of collectDataFiles(getRepoPath(repo, reposRoot))) {
    if (!expected.has(actual)) failures.push({ type: 'unexpected', path: actual, repo });
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  expectedFiles: manifest.fileCount,
  checkedFiles: manifest.fileCount - failures.filter((item) => item.type === 'missing').length,
  checkedBytes,
  failureCount: failures.length,
  failures,
};
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
