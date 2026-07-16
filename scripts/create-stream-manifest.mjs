import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  extractStreamYear,
  getAssignedShard,
  loadShardConfig,
  projectRoot,
  repoName,
} from './stream-shards.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const output = outputIndex >= 0 ? args[outputIndex + 1] : null;
  if (!output) throw new Error('Usage: node scripts/create-stream-manifest.mjs --output <file>');
  return { output: path.resolve(output) };
}

function collectFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
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

function targetFor(relative, config) {
  const parts = relative.split('/');
  if (parts.length === 5 && parts.at(-1) === 'streams.json') {
    return { repo: config.index.repo, branch: config.index.branch };
  }
  const liverId = parts[3];
  const streamId = parts[4];
  const year = extractStreamYear(streamId);
  const { shardId, shard } = getAssignedShard(liverId, year, config);
  return { repo: shard.repo, branch: shard.branch, shardId };
}

const { output } = parseArgs();
const config = loadShardConfig();
const sourceRoot = path.join(projectRoot, 'public', 'data', 'streams');
const files = collectFiles(sourceRoot);
const entries = [];
let totalBytes = 0;
for (let index = 0; index < files.length; index += 1) {
  const filePath = files[index];
  const relative = path.relative(projectRoot, filePath).split(path.sep).join('/');
  const stat = fs.statSync(filePath);
  const target = targetFor(relative, config);
  entries.push({
    path: relative,
    bytes: stat.size,
    sha256: await sha256(filePath),
    ...target,
    repoName: repoName(target.repo),
  });
  totalBytes += stat.size;
  if ((index + 1) % 250 === 0 || index + 1 === files.length) {
    console.log(`Hashed ${index + 1}/${files.length} files`);
  }
}

const manifest = {
  version: 1,
  createdAt: new Date().toISOString(),
  sourceCommit: process.env.STREAM_SOURCE_COMMIT || null,
  fileCount: entries.length,
  totalBytes,
  entries,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output, fileCount: entries.length, totalBytes }, null, 2));
