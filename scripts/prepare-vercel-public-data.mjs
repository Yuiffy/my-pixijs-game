import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const streamsDir = path.join(rootDir, 'public', 'data', 'streams');

const isVercel = process.env.VERCEL === '1';
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const gitRef = process.env.VERCEL_GIT_COMMIT_SHA || 'master';
const streamAssetBaseUrl = (
  process.env.NEXT_PUBLIC_STREAM_ASSET_BASE_URL ||
  `https://raw.githubusercontent.com/Yuiffy/my-pixijs-game/${gitRef}`
).replace(/\/$/, '');

if (!isVercel && !force && !dryRun) {
  console.log('Skipping Vercel public data pruning outside Vercel. Use --force to run locally.');
  process.exit(0);
}

const removeExtensions = new Set(['.png', '.jpg', '.jpeg', '.xml']);
let removedFiles = 0;
let removedBytes = 0;
let updatedStreamJsonFiles = 0;
let updatedStreamEntries = 0;

function toRemoteAssetUrl(publicPath) {
  if (!publicPath || /^https?:\/\//i.test(publicPath)) return publicPath;

  const normalizedPath = publicPath.startsWith('/') ? publicPath : `/${publicPath}`;
  const encodedPath = normalizedPath
    .split('/')
    .map((segment, index) => (index === 0 ? segment : encodeURIComponent(segment)))
    .join('/');

  return `${streamAssetBaseUrl}/public${encodedPath}`;
}

function pruneFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!removeExtensions.has(ext)) return;

  const size = fs.statSync(filePath).size;
  removedFiles += 1;
  removedBytes += size;

  if (!dryRun) {
    fs.unlinkSync(filePath);
  }
}

function pruneStreamJson(filePath) {
  const streams = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(streams)) return;

  let changed = false;
  for (const stream of streams) {
    let entryChanged = false;
    if (stream.cover && !/^https?:\/\//i.test(stream.cover)) {
      stream.cover = toRemoteAssetUrl(stream.cover);
      entryChanged = true;
    }
    if (stream.xml && !/^https?:\/\//i.test(stream.xml)) {
      stream.xml = toRemoteAssetUrl(stream.xml);
      entryChanged = true;
    }
    if (Array.isArray(stream.images) && stream.images.length > 0) {
      const remoteImages = stream.images.map(toRemoteAssetUrl);
      if (remoteImages.some((image, index) => image !== stream.images[index])) {
        stream.images = remoteImages;
        entryChanged = true;
      }
    }
    if (entryChanged) {
      changed = true;
      updatedStreamEntries += 1;
    }
  }

  if (changed) {
    updatedStreamJsonFiles += 1;
    if (!dryRun) {
      fs.writeFileSync(filePath, `${JSON.stringify(streams, null, 2)}\n`, 'utf8');
    }
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath);
      continue;
    }

    if (entry.name === 'streams.json') {
      pruneStreamJson(entryPath);
    } else {
      pruneFile(entryPath);
    }
  }
}

walk(streamsDir);

console.log(
  [
    `Vercel public data pruning ${dryRun ? 'dry run ' : ''}complete.`,
    `Removed files: ${removedFiles}`,
    `Removed size: ${(removedBytes / 1024 / 1024).toFixed(2)} MB`,
    `Updated streams.json files: ${updatedStreamJsonFiles}`,
    `Updated stream entries: ${updatedStreamEntries}`,
    `Remote asset base URL: ${streamAssetBaseUrl}`,
  ].join('\n')
);
