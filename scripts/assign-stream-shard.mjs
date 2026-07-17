import fs from 'fs';
import path from 'path';
import { liverConfigs } from './liver-config.js';
import {
  assignmentKey,
  directorySize,
  getRepoPath,
  getReposRoot,
  loadShardConfig,
  recommendShard,
  shardConfigPath,
} from './stream-shards.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const readValue = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : null;
  };
  const liverId = readValue('--liver');
  const yearValue = readValue('--year');
  if (!liverId || !yearValue || !/^\d{4}$/.test(yearValue)) {
    throw new Error('Usage: node scripts/assign-stream-shard.mjs --liver <id> --year <yyyy> [--write]');
  }
  return { liverId, year: Number(yearValue), write: args.includes('--write') };
}

function sourceYearSize(liverId, year) {
  const config = liverConfigs[liverId];
  if (!config) throw new Error(`Unknown liver: ${liverId}`);
  let bytes = 0;
  for (const sourceDir of config.sourceDirs || []) {
    if (!fs.existsSync(sourceDir)) continue;
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith(`${year}_`)) {
        bytes += directorySize(path.join(sourceDir, entry.name));
      }
    }
  }
  return bytes || null;
}

const { liverId, year, write } = parseArgs();
const config = loadShardConfig();
const reposRoot = getReposRoot();
const shardUsage = {};
for (const [shardId, shard] of Object.entries(config.shards)) {
  shardUsage[shardId] = directorySize(path.join(getRepoPath(shard.repo, reposRoot), 'public'));
}

const estimatedBytes = sourceYearSize(liverId, year);
const recommendation = recommendShard({ liverId, year, estimatedBytes, config, shardUsage });
if (!recommendation) {
  throw new Error(`No shard for ${year}:${liverId} has enough soft-limit capacity; create a new shard first.`);
}

console.log(JSON.stringify({ liverId, year, estimatedBytes, recommendation }, null, 2));
if (write && !recommendation.existing) {
  config.assignments[assignmentKey(year, liverId)] = recommendation.shardId;
  const sorted = Object.fromEntries(Object.entries(config.assignments).sort(([a], [b]) => a.localeCompare(b)));
  config.assignments = sorted;
  fs.writeFileSync(shardConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  console.log(`Updated ${shardConfigPath}`);
}
