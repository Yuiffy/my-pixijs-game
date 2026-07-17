import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignmentKey,
  extractStreamYear,
  getAssignedShard,
  recommendShard,
} from '../stream-shards.mjs';

test('extracts years and resolves configured assignments', () => {
  assert.equal(extractStreamYear('2026_07_16_04_00_00'), 2026);
  assert.equal(assignmentKey(2026, 'sui'), '2026:sui');
  assert.equal(getAssignedShard('sui', 2026).shardId, '2026-a');
});

test('rejects malformed and unassigned streams before writing', () => {
  assert.throws(() => extractStreamYear('invalid'), /four-digit year/);
  assert.throws(() => getAssignedShard('new-liver', 2026), /Missing stream shard assignment/);
});

test('capacity-aware rendezvous selection is deterministic and respects limits', () => {
  const config = {
    allocation: { defaultReservationBytes: 50 },
    assignments: {},
    shards: {
      a: { year: 2030, softLimitBytes: 100 },
      b: { year: 2030, softLimitBytes: 100 },
      old: { year: 2029, softLimitBytes: 1000 },
    },
  };
  const first = recommendShard({
    liverId: 'example',
    year: 2030,
    estimatedBytes: 20,
    config,
    shardUsage: { a: 90, b: 10 },
  });
  const second = recommendShard({
    liverId: 'example',
    year: 2030,
    estimatedBytes: 20,
    config,
    shardUsage: { a: 90, b: 10 },
  });
  assert.equal(first.shardId, 'b');
  assert.deepEqual(first, second);
});

test('returns existing assignments without remapping', () => {
  const config = {
    assignments: { '2030:example': 'a' },
    shards: { a: { year: 2030, softLimitBytes: 1 } },
  };
  assert.deepEqual(recommendShard({ liverId: 'example', year: 2030, config }), {
    shardId: 'a',
    existing: true,
  });
});
