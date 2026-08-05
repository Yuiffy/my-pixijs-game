import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const versionSource = await readFile("src/components/autoChessGame/version.ts", "utf8");
const changelog = await readFile("CHANGELOG.md", "utf8");

const sourceVersion = versionSource.match(/AUTOCHESS_VERSION = "([^"]+)"/)?.[1];
const releaseDate = versionSource.match(/AUTOCHESS_RELEASE_DATE = "(\d{4}-\d{2}-\d{2})"/)?.[1];

assert.match(packageJson.version, /^\d+\.\d+\.\d+$/, "package.json must use a semantic version");
assert.equal(sourceVersion, packageJson.version, "package.json and the in-game autochess version must match");
assert.ok(releaseDate, "version.ts must include an ISO release date");
assert.match(
  changelog,
  new RegExp(`^## \\[${packageJson.version.replaceAll(".", "\\.")}\\] - ${releaseDate}$`, "m"),
  "CHANGELOG.md must contain the current version and release date",
);

console.log(`Autochess release metadata is consistent: v${packageJson.version} (${releaseDate})`);
