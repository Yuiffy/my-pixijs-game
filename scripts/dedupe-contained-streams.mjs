import fs from 'node:fs';
import path from 'node:path';
import { getIndexStreamsRoot, getReposRoot, loadShardConfig } from './stream-shards.mjs';
import { isContainedDuplicate } from './stream-sync-helpers.mjs';

const config = loadShardConfig();
const root = getIndexStreamsRoot(config, getReposRoot());
const dryRun = process.argv.includes('--dry-run');
const report = [];

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(root, entry.name, 'streams.json');
  if (!fs.existsSync(file)) continue;
  const streams = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ordered = [...streams].sort((a, b) => Number(b.duration || 0) - Number(a.duration || 0));
  const kept = [];
  const removed = [];
  for (const stream of ordered) {
    const container = kept.find(candidate => isContainedDuplicate(stream, candidate));
    if (container) removed.push({ id: stream.id, containedBy: container.id });
    else kept.push(stream);
  }
  if (!removed.length) continue;
  kept.sort((a, b) => String(b.id).localeCompare(String(a.id)));
  report.push({ liverId: entry.name, path: file, before: streams.length, after: kept.length, removed });
  if (!dryRun) fs.writeFileSync(file, `${JSON.stringify(kept, null, 2)}\n`);
}

console.log(JSON.stringify({ dryRun, totalRemoved: report.reduce((sum, item) => sum + item.removed.length, 0), report }, null, 2));
