import fs from 'fs';
import path from 'path';
import {
  getRepoPath,
  getReposRoot,
  loadShardConfig,
  projectRoot,
} from './stream-shards.mjs';

const args = process.argv.slice(2);
const manifestIndex = args.indexOf('--manifest');
const manifestPath = manifestIndex >= 0 ? args[manifestIndex + 1] : null;
if (!manifestPath) {
  throw new Error('Usage: node scripts/migrate-stream-shards.mjs --manifest <manifest.json> [--copy]');
}
const copy = args.includes('--copy');
const config = loadShardConfig();
const reposRoot = getReposRoot();
const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
let copied = 0;
let skipped = 0;

for (const entry of manifest.entries) {
  const source = path.join(projectRoot, ...entry.path.split('/'));
  const target = path.join(getRepoPath(entry.repo, reposRoot), ...entry.path.split('/'));
  if (!fs.existsSync(path.join(getRepoPath(entry.repo, reposRoot), '.git'))) {
    throw new Error(`Target repository is not a Git checkout: ${getRepoPath(entry.repo, reposRoot)}`);
  }
  if (fs.existsSync(target) && fs.statSync(target).size === entry.bytes) {
    skipped += 1;
    continue;
  }
  if (!copy) continue;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  copied += 1;
  if (copied % 250 === 0) console.log(`Copied ${copied} files`);
}

console.log(JSON.stringify({ dryRun: !copy, manifestFiles: manifest.fileCount, copied, skipped }, null, 2));
