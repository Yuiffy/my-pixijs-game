import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptsDir, '..');
export const shardConfigPath = path.join(projectRoot, 'config', 'stream-shards.json');

export function loadShardConfig(configPath = shardConfigPath) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.version !== 1 || !config.index?.repo || !config.shards || !config.assignments) {
    throw new Error(`Invalid stream shard config: ${configPath}`);
  }
  return config;
}

export function repoName(repo) {
  return repo.split('/').at(-1);
}

export function getReposRoot() {
  return path.resolve(
    process.env.STREAM_REPOS_ROOT || path.join(projectRoot, '..', 'VirtualBeing-Hub'),
  );
}

export function getRepoPath(repo, reposRoot = getReposRoot()) {
  return path.join(reposRoot, repoName(repo));
}

export function getIndexStreamsRoot(config = loadShardConfig(), reposRoot = getReposRoot()) {
  return path.join(getRepoPath(config.index.repo, reposRoot), 'public', 'data', 'streams');
}

export function getIndexLiverDir(liverId, config = loadShardConfig(), reposRoot = getReposRoot()) {
  return path.join(getIndexStreamsRoot(config, reposRoot), liverId);
}

export function extractStreamYear(streamId) {
  const match = /^(\d{4})_/.exec(streamId);
  if (!match) throw new Error(`Stream id does not start with a four-digit year: ${streamId}`);
  return Number(match[1]);
}

export function assignmentKey(year, liverId) {
  return `${year}:${liverId}`;
}

export function getAssignedShard(liverId, year, config = loadShardConfig()) {
  const key = assignmentKey(year, liverId);
  const shardId = config.assignments[key];
  if (!shardId) throw new Error(`Missing stream shard assignment: ${key}`);
  const shard = config.shards[shardId];
  if (!shard) throw new Error(`Assignment ${key} references unknown shard: ${shardId}`);
  if (Number(shard.year) !== Number(year)) {
    throw new Error(`Assignment ${key} points to shard ${shardId} for year ${shard.year}`);
  }
  return { shardId, shard };
}

export function resolveStreamTargetDir(
  liverId,
  streamId,
  config = loadShardConfig(),
  reposRoot = getReposRoot(),
) {
  const year = extractStreamYear(streamId);
  const { shard } = getAssignedShard(liverId, year, config);
  return path.join(
    getRepoPath(shard.repo, reposRoot),
    'public',
    'data',
    'streams',
    liverId,
    streamId,
  );
}

export function listConfiguredRepos(config = loadShardConfig()) {
  const entries = [{ id: 'index', ...config.index, kind: 'index' }];
  for (const [id, shard] of Object.entries(config.shards)) {
    entries.push({ id, ...shard, kind: 'asset' });
  }
  return entries;
}

export function directorySize(root) {
  if (!fs.existsSync(root)) return 0;
  let total = 0;
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) total += fs.statSync(entryPath).size;
    }
  }
  return total;
}

function hashUnitInterval(value) {
  const digest = crypto.createHash('sha256').update(value).digest();
  const integer = digest.readBigUInt64BE(0);
  return (Number(integer >> 11n) + 1) / (2 ** 53 + 1);
}

export function recommendShard({
  liverId,
  year,
  estimatedBytes,
  config = loadShardConfig(),
  shardUsage = {},
}) {
  const existing = config.assignments[assignmentKey(year, liverId)];
  if (existing) return { shardId: existing, existing: true };

  const reservation = estimatedBytes ?? config.allocation?.defaultReservationBytes ?? 536870912;
  const candidates = Object.entries(config.shards)
    .filter(([, shard]) => Number(shard.year) === Number(year))
    .map(([shardId, shard]) => {
      const used = shardUsage[shardId] || 0;
      const remaining = shard.softLimitBytes - used - reservation;
      if (remaining < 0) return null;
      const unit = hashUnitInterval(`${year}:${liverId}:${shardId}`);
      return {
        shardId,
        usedBytes: used,
        remainingBytes: remaining,
        score: -Math.log(unit) / Math.max(remaining, 1),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || a.shardId.localeCompare(b.shardId));

  if (!candidates.length) return null;
  return { ...candidates[0], existing: false, estimatedBytes: reservation };
}

export function rawGitHubBase(repo, branch) {
  return `https://raw.githubusercontent.com/${repo}/${branch}`;
}
