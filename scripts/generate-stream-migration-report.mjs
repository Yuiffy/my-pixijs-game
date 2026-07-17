import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  getRepoPath,
  getReposRoot,
  listConfiguredRepos,
  loadShardConfig,
} from './stream-shards.mjs';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const manifestPath = valueAfter('--manifest');
const integrityPath = valueAfter('--integrity-report');
const rawPath = valueAfter('--raw-report');
const outputPath = valueAfter('--output');
const previewUrl = valueAfter('--preview-url');
const previewVerified = args.includes('--preview-verified');
const syncVerified = args.includes('--sync-verified');
if (!manifestPath || !integrityPath || !rawPath || !outputPath) {
  throw new Error(
    'Usage: node scripts/generate-stream-migration-report.mjs '
    + '--manifest <file> --integrity-report <file> --raw-report <file> --output <file> '
    + '[--preview-url <url>]',
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function gitHead(repoPath) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoPath,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

const config = loadShardConfig();
const reposRoot = getReposRoot();
const manifest = readJson(manifestPath);
const integrity = readJson(integrityPath);
const raw = readJson(rawPath);
const repositories = listConfiguredRepos(config).map((repo) => ({
  repo: repo.repo,
  branch: repo.branch,
  commit: gitHead(getRepoPath(repo.repo, reposRoot)),
}));
const failures = integrity.failureCount + raw.failureCount;
const report = {
  generatedAt: new Date().toISOString(),
  approved: false,
  cleanupAllowed: false,
  sourceCommit: manifest.sourceCommit,
  fileCount: manifest.fileCount,
  totalBytes: manifest.totalBytes,
  repositories,
  integrity,
  raw,
  preview: {
    url: previewUrl || null,
    verified: previewVerified,
  },
  syncCycle: {
    verified: syncVerified,
  },
  failureCount: failures,
  gateMessage: failures === 0
    ? 'Automated data checks passed; any unverified Preview/full sync checks and manual approval are still required.'
    : 'Automated data checks failed. Do not remove source data or rewrite history.',
};
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
