import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, '..', '..');

test('stream collection exits non-zero for an unknown liver', () => {
  const reposRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-sync-test-'));
  const indexRepo = path.join(reposRoot, 'liver-streams-index');
  fs.mkdirSync(path.join(indexRepo, '.git'), { recursive: true });

  try {
    const result = spawnSync(
      process.execPath,
      [path.join(projectRoot, 'scripts', 'sync_streams.mjs'), '--liver', 'not-configured'],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        env: { ...process.env, STREAM_REPOS_ROOT: reposRoot },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown liver configuration: not-configured/);
  } finally {
    fs.rmSync(reposRoot, { recursive: true, force: true });
  }
});
