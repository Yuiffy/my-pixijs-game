import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { engine, riverCompleted } from './tests/helpers/night-rain-sky.mjs';
import { skyCompleted } from './tests/helpers/night-rain-bell.mjs';

const destination = new URL('../public/games/night-rain/test-saves/', import.meta.url);
await fs.mkdir(destination, { recursive: true });
for (const [file, make] of [['after-two.json', riverCompleted], ['after-three.json', skyCompleted]]) {
  const state = make();
  state.playerSkin = 'sui';
  state.litLamps = ['courtyard', 'lower-lamp', 'archive-lamp', 'royal-lamp', 'village-lamp', 'monastery-lamp', 'confluence-lamp'];
  if (state.skyComplete) state.litLamps.push('sky-lamp', 'sky-court-lamp', 'sky-home-lamp');
  state.checkpoint = state.skyComplete ? 'sky-home-lamp' : 'confluence-lamp';
  state.player.flasks = engine.maxFlasks(state);
  const save = engine.saveGame(state);
  const loaded = engine.loadGame(save);
  assert.ok(loaded, `${file} passes the real save validator`);
  assert.equal(loaded.chapterComplete, true);
  assert.equal(loaded.valleyComplete, true);
  assert.equal(loaded.skyComplete, file === 'after-three.json');
  assert.equal(loaded.bellComplete, false);
  assert.deepEqual(loaded.bellGates, []);
  await fs.writeFile(new URL(file, destination), save + '\n');
  console.log(`${file}: ${Buffer.byteLength(save)} bytes; ${loaded.checkpoint}`);
}
