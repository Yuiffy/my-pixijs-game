import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const streamsDir = path.join(rootDir, 'public', 'data', 'streams');
const dryRun = process.argv.includes('--dry-run');
const preferredLocalLiverIds = new Set(['sui']);

function toPublicPath(filePath) {
  return `/${path.relative(path.join(rootDir, 'public'), filePath).replace(/\\/g, '/')}`;
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function getLiverId(filePath) {
  const relativePath = path.relative(streamsDir, filePath);
  if (relativePath.startsWith('..')) return null;
  return relativePath.split(path.sep)[0] || null;
}

function compareCoverPriority(a, b) {
  const aPreferred = preferredLocalLiverIds.has(getLiverId(a.filePath));
  const bPreferred = preferredLocalLiverIds.has(getLiverId(b.filePath));
  if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
  return a.publicPath.localeCompare(b.publicPath);
}

function walk(dir, onFile) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath, onFile);
    } else {
      onFile(entryPath);
    }
  }
}

const coverGroups = new Map();
const streamsJsonFiles = [];

walk(streamsDir, (filePath) => {
  if (/\.cover\.jpg$/i.test(path.basename(filePath))) {
    const hash = hashFile(filePath);
    const stat = fs.statSync(filePath);
    const covers = coverGroups.get(hash) || [];
    covers.push({ filePath, publicPath: toPublicPath(filePath), size: stat.size });
    coverGroups.set(hash, covers);
  } else if (path.basename(filePath) === 'streams.json') {
    streamsJsonFiles.push(filePath);
  }
});

const replacements = new Map();
let duplicateGroups = 0;
let duplicateFiles = 0;
let duplicateBytes = 0;

for (const covers of coverGroups.values()) {
  if (covers.length <= 1) continue;

  covers.sort(compareCoverPriority);
  const canonical = covers[0];
  duplicateGroups += 1;

  for (const duplicate of covers.slice(1)) {
    replacements.set(duplicate.publicPath, canonical.publicPath);
    duplicateFiles += 1;
    duplicateBytes += duplicate.size;
  }
}

let updatedStreamsJsonFiles = 0;
let updatedCoverReferences = 0;

for (const streamsJsonFile of streamsJsonFiles) {
  const streams = JSON.parse(fs.readFileSync(streamsJsonFile, 'utf8'));
  if (!Array.isArray(streams)) continue;

  let changed = false;
  for (const stream of streams) {
    const replacement = replacements.get(stream.cover);
    if (replacement) {
      stream.cover = replacement;
      updatedCoverReferences += 1;
      changed = true;
    }
  }

  if (changed) {
    updatedStreamsJsonFiles += 1;
    if (!dryRun) {
      fs.writeFileSync(streamsJsonFile, `${JSON.stringify(streams, null, 2)}\n`, 'utf8');
    }
  }
}

if (!dryRun) {
  for (const publicPath of replacements.keys()) {
    fs.unlinkSync(path.join(rootDir, 'public', publicPath.replace(/^\//, '')));
  }
}

console.log(
  [
    `Cover image dedupe ${dryRun ? 'dry run ' : ''}complete.`,
    `Cover files scanned: ${Array.from(coverGroups.values()).reduce((sum, group) => sum + group.length, 0)}`,
    `Unique cover hashes: ${coverGroups.size}`,
    `Duplicate groups: ${duplicateGroups}`,
    `Duplicate cover files: ${duplicateFiles}`,
    `Potential saved size: ${(duplicateBytes / 1024 / 1024).toFixed(2)} MB`,
    `Updated streams.json files: ${updatedStreamsJsonFiles}`,
    `Updated cover references: ${updatedCoverReferences}`,
  ].join('\n')
);
