import fs from 'fs';
import path from 'path';
import {
  getIndexStreamsRoot,
  getReposRoot,
  loadShardConfig,
  resolveStreamTargetDir,
} from './stream-shards.mjs';

const config = loadShardConfig();
const reposRoot = getReposRoot();
const indexRoot = getIndexStreamsRoot(config, reposRoot);
const referencesOnly = process.argv.includes('--references-only');
const failures = [];
let streamCount = 0;
let referenceCount = 0;

function failure(type, details) {
  failures.push({ type, ...details });
}

function referencedPaths(stream) {
  const values = [];
  for (const field of ['cover', 'xml', 'srt', 'highlights']) {
    if (stream[field]) values.push({ field, value: stream[field] });
  }
  for (const value of stream.images || []) values.push({ field: 'images', value });
  return values;
}

function decodePathPart(value) {
  return decodeURIComponent(value.replace(/%(?![0-9a-f]{2})/gi, '%25'));
}

function resolveReference(value) {
  if (!value.startsWith('/data/streams/')) throw new Error(`Not a stream-relative URL: ${value}`);
  const parts = value.split('/').filter(Boolean).map(decodePathPart);
  if (parts.length < 5 || parts[0] !== 'data' || parts[1] !== 'streams') {
    throw new Error(`Malformed stream URL: ${value}`);
  }
  const referencedLiverId = parts[2];
  const streamId = parts[3];
  return path.join(resolveStreamTargetDir(referencedLiverId, streamId, config, reposRoot), ...parts.slice(4));
}

if (!fs.existsSync(indexRoot)) throw new Error(`Index stream directory does not exist: ${indexRoot}`);
for (const entry of fs.readdirSync(indexRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const liverId = entry.name;
  const jsonPath = path.join(indexRoot, liverId, 'streams.json');
  if (!fs.existsSync(jsonPath)) {
    failure('missing-index', { liverId, path: jsonPath });
    continue;
  }
  let streams;
  try {
    streams = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!Array.isArray(streams)) throw new Error('root must be an array');
  } catch (error) {
    failure('invalid-index', { liverId, path: jsonPath, message: error.message });
    continue;
  }
  const ids = new Set();
  for (const stream of streams) {
    streamCount += 1;
    if (!stream.id) {
      failure('missing-stream-id', { liverId });
      continue;
    }
    if (ids.has(stream.id)) failure('duplicate-stream-id', { liverId, streamId: stream.id });
    ids.add(stream.id);
    for (const reference of referencedPaths(stream)) {
      referenceCount += 1;
      try {
        const filePath = resolveReference(reference.value);
        if (!fs.existsSync(filePath)) {
          failure('missing-reference', {
            liverId,
            streamId: stream.id,
            field: reference.field,
            value: reference.value,
            path: filePath,
          });
        }
      } catch (error) {
        failure('invalid-reference', {
          liverId,
          streamId: stream.id,
          field: reference.field,
          value: reference.value,
          message: error.message,
        });
      }
    }
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  mode: referencesOnly ? 'references-only' : 'local',
  streamCount,
  referenceCount,
  failureCount: failures.length,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
