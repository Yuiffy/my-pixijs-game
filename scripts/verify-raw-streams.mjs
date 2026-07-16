import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { rawGitHubBase } from './stream-shards.mjs';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const manifestPath = valueAfter('--manifest');
const reportPath = valueAfter('--output');
const statusConcurrency = Number(valueAfter('--concurrency') || 8);
const contentConcurrency = Number(valueAfter('--content-concurrency') || 2);
if (!manifestPath || !reportPath) {
  throw new Error('Usage: node scripts/verify-raw-streams.mjs --manifest <file> --output <file> [--concurrency 8] [--content-concurrency 2]');
}
const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
const checkpointPath = path.resolve(valueAfter('--checkpoint') || `${reportPath}.checkpoint.json`);
let checkpoint = {
  sourceCommit: manifest.sourceCommit,
  fileCount: manifest.fileCount,
  statusSucceeded: [],
  contentSucceeded: [],
  retries: 0,
};
if (fs.existsSync(checkpointPath)) {
  checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
  if (checkpoint.sourceCommit !== manifest.sourceCommit || checkpoint.fileCount !== manifest.fileCount) {
    throw new Error(`Checkpoint does not match manifest: ${checkpointPath}`);
  }
}
const statusSucceeded = new Set(checkpoint.statusSucceeded || []);
const contentSucceeded = new Set(checkpoint.contentSucceeded || []);
let retries = checkpoint.retries || 0;
let completionsSinceCheckpoint = 0;
const failures = [];
const contentFailures = [];

function entryKey(entry) {
  return `${entry.repo}\0${entry.path}`;
}

function saveCheckpoint(complete = false) {
  const value = {
    sourceCommit: manifest.sourceCommit,
    fileCount: manifest.fileCount,
    updatedAt: new Date().toISOString(),
    complete,
    retries,
    statusSucceeded: [...statusSucceeded],
    contentSucceeded: [...contentSucceeded],
  };
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  const temporaryPath = `${checkpointPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value)}\n`, 'utf8');
  fs.renameSync(temporaryPath, checkpointPath);
  completionsSinceCheckpoint = 0;
}

function markSucceeded(target, entry) {
  target.add(entryKey(entry));
  completionsSinceCheckpoint += 1;
  if (completionsSinceCheckpoint >= 100) saveCheckpoint();
}

function rawUrl(entry) {
  const encodedPath = entry.path.split('/').map(encodeURIComponent).join('/');
  return `${rawGitHubBase(entry.repo, entry.branch)}/${encodedPath}`;
}

async function requestWithRetry(entry, method = 'HEAD') {
  const url = rawUrl(entry);
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { method, redirect: 'follow' });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    retries += 1;
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  const failure = { path: entry.path, repo: entry.repo, url, method, error: lastError?.message };
  if (method === 'GET') contentFailures.push(failure);
  else failures.push(failure);
  return null;
}

async function runPool(entries, concurrency, handler) {
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= entries.length) return;
      await handler(entries[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
}

const pendingStatusEntries = manifest.entries.filter((entry) => !statusSucceeded.has(entryKey(entry)));
await runPool(pendingStatusEntries, statusConcurrency, async (entry, index) => {
  const response = await requestWithRetry(entry);
  if (response) markSucceeded(statusSucceeded, entry);
  if ((index + 1) % 250 === 0) {
    console.log(`Checked ${statusSucceeded.size}/${manifest.entries.length} Raw URLs`);
  }
});
saveCheckpoint();

const extensionRepresentative = new Map();
const contentEntries = [];
for (const entry of manifest.entries) {
  const extension = path.extname(entry.path).toLowerCase() || '<none>';
  if (!extensionRepresentative.has(extension)) extensionRepresentative.set(extension, entry);
  if (/[^A-Za-z0-9._/-]/u.test(entry.path)) contentEntries.push(entry);
}
for (const entry of extensionRepresentative.values()) {
  if (!contentEntries.includes(entry)) contentEntries.push(entry);
}

const pendingContentEntries = contentEntries.filter((entry) => !contentSucceeded.has(entryKey(entry)));
await runPool(pendingContentEntries, contentConcurrency, async (entry, index) => {
  const response = await requestWithRetry(entry, 'GET');
  if (!response?.body) return;
  const hash = crypto.createHash('sha256');
  for await (const chunk of Readable.fromWeb(response.body)) hash.update(chunk);
  const actual = hash.digest('hex');
  if (actual !== entry.sha256) {
    contentFailures.push({
      path: entry.path,
      repo: entry.repo,
      url: rawUrl(entry),
      method: 'GET',
      error: `SHA-256 mismatch: expected ${entry.sha256}, got ${actual}`,
    });
  } else {
    markSucceeded(contentSucceeded, entry);
  }
  if ((index + 1) % 100 === 0) {
    console.log(`Content-verified ${contentSucceeded.size}/${contentEntries.length} special/type URLs`);
  }
});

const report = {
  checkedAt: new Date().toISOString(),
  total: manifest.entries.length,
  succeeded: statusSucceeded.size,
  retries,
  contentCheckTotal: contentEntries.length,
  contentCheckSucceeded: contentSucceeded.size,
  failureCount: failures.length + contentFailures.length,
  failures,
  contentFailures,
};
fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
fs.writeFileSync(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
saveCheckpoint(report.failureCount === 0 && report.succeeded === report.total && report.contentCheckSucceeded === report.contentCheckTotal);
console.log(JSON.stringify(report, null, 2));
if (failures.length || contentFailures.length) process.exitCode = 1;
