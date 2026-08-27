import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { AUTOCHESS_RELEASE, AUTOCHESS_RELEASE_HISTORY } = await loadTypescriptModule(
  "src/components/autoChessGame/version.ts",
);
const changelog = await readFile("CHANGELOG.md", "utf8");
const releaseNotesSource = await readFile("src/components/autoChessGame/ReleaseNotes.tsx", "utf8");
const releaseStyles = await readFile("src/components/autoChessGame/RiftHud.css", "utf8");

test("游戏内更新日志展示 CHANGELOG 中的全部版本", () => {
  const changelogVersions = [...changelog.matchAll(/^## \[([^\]]+)\]/gm)].map((match) => match[1]);

  assert.deepEqual(
    AUTOCHESS_RELEASE_HISTORY.map((release) => release.version),
    changelogVersions,
  );
  assert.equal(AUTOCHESS_RELEASE, AUTOCHESS_RELEASE_HISTORY[0]);
  assert.ok(AUTOCHESS_RELEASE_HISTORY.every((release) => (
    release.sections.length > 0
    && release.sections.every((section) => section.items.length > 0)
  )));
  assert.match(releaseNotesSource, /AUTOCHESS_RELEASE_HISTORY\.map\(\(release, index\)/);
  assert.match(releaseStyles, /\.rift-release-notes[^}]*overflow: auto/);
});
