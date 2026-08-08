import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOCHESS_ROLLOUT_CACHE_FILE_SCHEMA,
  createAutoChessRolloutCachePayload,
  inspectAutoChessRolloutCachePayload,
} from "../lib/autochess-rollout-cache.mjs";

test("rollout cache rejects legacy files without a source fingerprint", () => {
  const inspection = inspectAutoChessRolloutCachePayload(
    { entries: [["combat-go-v2/example", 1]] },
    "current-source",
  );
  assert.equal(inspection.compatible, false);
  assert.equal(inspection.reason, "missing-or-legacy-cache-schema");
  assert.deepEqual(inspection.entries, []);
});

test("rollout cache rejects entries produced by different combat sources", () => {
  const payload = createAutoChessRolloutCachePayload(
    [["combat-go-v3/example", 1]],
    "old-source",
  );
  const inspection = inspectAutoChessRolloutCachePayload(payload, "current-source");
  assert.equal(inspection.compatible, false);
  assert.equal(inspection.reason, "source-fingerprint-mismatch");
});

test("rollout cache accepts matching source fingerprints", () => {
  const entries = [["combat-go-v3/example", 1]];
  const payload = createAutoChessRolloutCachePayload(entries, "current-source");
  assert.equal(payload.schema, AUTOCHESS_ROLLOUT_CACHE_FILE_SCHEMA);
  const inspection = inspectAutoChessRolloutCachePayload(payload, "current-source");
  assert.equal(inspection.compatible, true);
  assert.deepEqual(inspection.entries, entries);
});
