import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const AUTOCHESS_ROLLOUT_CACHE_FILE_SCHEMA = "autochess-rollout-cache-v1";

const ROLLOUT_SOURCE_PATHS = [
  "src/components/autoChessGame/core",
  "src/components/autoChessGame/ai/goCombatScenario.ts",
  "src/components/autoChessGame/ai/rolloutCombat.ts",
  "src/components/autoChessGame/ai/rolloutCacheSchema.ts",
];

const collectSourceFiles = async (sourcePath) => {
  const entries = await readdir(sourcePath, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(sourcePath, entry.name);
    return entry.isDirectory() ? collectSourceFiles(entryPath) : [entryPath];
  }));
  return nested.flat();
};

export const computeAutoChessRolloutSourceFingerprint = async (
  workspaceRoot = process.cwd(),
) => {
  const resolvedSources = await Promise.all(ROLLOUT_SOURCE_PATHS.map(async (sourcePath) => {
    const absolutePath = path.resolve(workspaceRoot, sourcePath);
    return path.extname(absolutePath)
      ? [absolutePath]
      : collectSourceFiles(absolutePath);
  }));
  const sourceFiles = resolvedSources.flat().sort((left, right) => left.localeCompare(right));
  const hash = createHash("sha256");
  for (const sourceFile of sourceFiles) {
    const relativePath = path.relative(workspaceRoot, sourceFile).replaceAll("\\", "/");
    hash.update(relativePath);
    hash.update("\0");
    hash.update(await readFile(sourceFile));
    hash.update("\0");
  }
  return {
    hash: hash.digest("hex"),
    sourceFiles: sourceFiles.map((sourceFile) => (
      path.relative(workspaceRoot, sourceFile).replaceAll("\\", "/")
    )),
  };
};

export const inspectAutoChessRolloutCachePayload = (payload, expectedFingerprint) => {
  if (!payload || payload.schema !== AUTOCHESS_ROLLOUT_CACHE_FILE_SCHEMA) {
    return {
      compatible: false,
      reason: "missing-or-legacy-cache-schema",
      entries: [],
    };
  }
  if (payload.sourceFingerprint !== expectedFingerprint) {
    return {
      compatible: false,
      reason: "source-fingerprint-mismatch",
      entries: [],
    };
  }
  if (!Array.isArray(payload.entries)) {
    return {
      compatible: false,
      reason: "invalid-cache-entries",
      entries: [],
    };
  }
  return {
    compatible: true,
    reason: null,
    entries: payload.entries,
  };
};

export const createAutoChessRolloutCachePayload = (entries, sourceFingerprint) => ({
  schema: AUTOCHESS_ROLLOUT_CACHE_FILE_SCHEMA,
  sourceFingerprint,
  generatedAt: new Date().toISOString(),
  entries,
});
