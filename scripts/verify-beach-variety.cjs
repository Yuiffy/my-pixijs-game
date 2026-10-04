const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { instrumentAudio } = require('./verify-beach-audio.cjs');
const url = process.env.BEACH_VOLLEY_URL || 'http://localhost:4016/game/beach-volley';
const output = path.resolve(process.env.BEACH_VARIETY_OUTPUT || process.env.BEACH_AUDIO_OUTPUT || 'tmp/beach-variety-dev');
const names = { sui: '岁己.*SUI', shiori: '栞栞.*SHIORI', nagisa: '米汀.*NAGISA' };
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate(ms => window.advanceTime(ms), ms);
const report = { checks: [], movies: [], screenshots: [], probes: [], errors: [] };

async function capture(p, name) {
  const metrics = inspectPng(await p.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }));
  const canvas = await p.locator('canvas').evaluate(c => ({ width: c.width, height: c.height, displayWidth: c.clientWidth, displayHeight: c.clientHeight }));
  assert.equal(canvas.width, 1280); assert.equal(canvas.height, 720); assert.ok(canvas.displayWidth && canvas.displayHeight);
  report.screenshots.push({ name, metrics, canvas, state: await state(p), dom: await p.locator('main').innerText() });
}
async function load(browser, actor, cinema = 'all', mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });
  await context.addInitScript(instrumentAudio);
  await context.addInitScript(() => { Math.random = () => 0; if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
  const p = await context.newPage();
  p.on('pageerror', e => report.errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await p.goto(url, { waitUntil: 'domcontentloaded' }); await p.bringToFront();
  await p.waitForFunction(() => window.beachVolley && JSON.parse(window.render_game_to_text()).assetsReady);
  await p.evaluate(() => window.beachVolley.manual(true));
  await p.getByRole('button', { name: '同机双人', exact: true }).click();
  await p.getByRole('button', { name: new RegExp(names[actor]) }).click();
  await p.locator('#beach-opponent').selectOption(actor); await p.locator('#beach-cinema').selectOption(cinema);
  await p.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.audio.loaded > 0 && !s.audio.fetching && !s.audio.queued; }, null, { timeout: 60000 });
  if (cinema !== 'off') await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).mediaCache.liteReady === 11, null, { timeout: 60000 });
  await p.locator('#beach-start').click(); await p.keyboard.press('Enter');
  return { p, context };
}
async function special(p, side = 0) {
  await p.evaluate(side => {
    const g = window.beachVolley.game(); Object.assign(g, { phase: 'rally', phaseTime: 0, paused: false, freeze: 0, cutin: null, specialWindup: null, trail: [], effects: [] });
    const idle = { left: false, right: false, jump: false, hit: false, dive: false, special: false, aimUp: false, aimDown: false };
    g.players.forEach((player, i) => Object.assign(player, { x: i ? 1110 : 170, y: 606, vx: 0, vy: 0, swing: 0, special: 0, dive: 0, cooldown: 0, lastInput: { ...idle } }));
    Object.assign(g.players[side], { x: side ? 830 : 450, y: 378, energy: 100 });
    g.ball = { x: g.players[side].x, y: 260, vx: 0, vy: 100, spin: 0, lastHit: 1 - side, lock: 0, power: null };
  }, side);
  await p.keyboard.down(side ? 'Comma' : 'KeyL'); await advance(p, 9); await p.keyboard.up(side ? 'Comma' : 'KeyL');
}
async function point(p, final = false) {
  await p.evaluate(final => {
    const g = window.beachVolley.game(); Object.assign(g, { phase: 'rally', phaseTime: 0, paused: false, freeze: 0, cutin: null, specialWindup: null, score: final ? [6, 0] : [0, 0], winner: null, trail: [], effects: [] });
    g.players.forEach((player, i) => Object.assign(player, { x: i ? 985 : 295, y: 606, vx: 0, vy: 0, swing: 0, special: 0, dive: 0, cooldown: 0 }));
    g.ball = { x: 1150, y: 605, vx: 0, vy: 100, spin: 0, lastHit: 0, lock: 0, power: null };
  }, final);
  await advance(p, 18);
}
async function naturalMovie(p, expectedKind, name) {
  await p.waitForFunction(() => { const v = document.querySelector('video'); return v && v.readyState >= 2 && v.currentTime > 0.12 && !v.paused; });
  const s = await state(p), movie = s.cinematic; assert.equal(movie.kind, expectedKind);
  const probe = await p.evaluate(() => window.audioProbe());
  if (movie.dialogue) {
    assert.equal(s.audio.voice, null); assert.equal(s.audio.pendingVoices, 0); assert.equal(s.audio.cinemaDialogue, true);
    assert.equal(await p.locator('video').evaluate(v => v.muted), false);
    assert.ok(!probe.starts.some(r => r.src?.includes(`/${movie.character}-${expectedKind === 'special' ? 'special' : expectedKind === 'point' ? movie.outcome === 'win' ? 'pointWin' : 'pointLose' : movie.outcome === 'win' ? 'victory' : 'defeat'}-`) && !r.ended && !r.stopped));
    await capture(p, name);
  } else if (expectedKind === 'special') {
    await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.voicePlaying);
    assert.match((await state(p)).audio.voice.src, /\/audio-v[23]\//);
  }
  report.movies.push({ movie, voice: (await state(p)).audio.voice });
  const frozen = JSON.stringify({ score: s.score, ball: s.ball, players: s.players });
  if (expectedKind === 'special') {
    await p.keyboard.press('Enter'); assert.equal((await state(p)).cinematic.id, movie.id);
    await advance(p, 160); const during = await state(p); assert.equal(JSON.stringify({ score: during.score, ball: during.ball, players: during.players }), frozen);
    if (movie.dialogue) {
      await p.keyboard.press('KeyP'); assert.equal((await state(p)).audio.context, 'suspended');
      const time = await p.locator('video').evaluate(v => v.currentTime); await p.waitForTimeout(140);
      assert.ok(Math.abs(await p.locator('video').evaluate(v => v.currentTime) - time) < 0.03);
      await p.keyboard.press('KeyP');
    }
  }
  await p.waitForFunction(id => JSON.parse(window.render_game_to_text()).cinematic?.id !== id, movie.id, { timeout: 20000 });
}
async function main() {
  fs.mkdirSync(output, { recursive: true }); const response = await fetch(url); assert.equal(response.status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const actors = process.env.BEACH_VARIETY_ACTORS?.split(',') || Object.keys(names);
    for (const actor of actors) {
      const { p, context } = await load(browser, actor);
      let previous = null;
      for (let round = 0; round < 2; round++) {
        await special(p); const selected = (await state(p)).cinematic.src; assert.notEqual(selected, previous); previous = selected;
        await naturalMovie(p, 'special', `${actor}-special-embedded-${round}`);
        assert.equal((await state(p)).specialWindup.remaining, 0.8);
        const prior = (await state(p)).audio.effortPlayed; await advance(p, 790); assert.equal((await state(p)).audio.effortPlayed, prior);
        await advance(p, 18); assert.equal((await state(p)).audio.effortPlayed, prior + 1);
      }
      for (let round = 0; round < 2; round++) {
        await point(p); await naturalMovie(p, 'point', `${actor}-point-win-embedded-${round}`); await naturalMovie(p, 'point', `${actor}-point-lose-embedded-${round}`);
        await advance(p, 2400);
      }
      for (let round = 0; round < 2; round++) {
        await point(p, true);
        assert.equal((await state(p)).phase, 'result');
        assert.equal((await state(p)).cinematic.kind, 'result');
        await naturalMovie(p, 'result', `${actor}-result-win-embedded-${round}`); await naturalMovie(p, 'result', `${actor}-result-lose-embedded-${round}`);
        if (round === 0) { await p.getByRole('button', { name: '再来一场' }).click(); await p.keyboard.press('Enter'); }
      }
      report.probes.push({ actor, probe: await p.evaluate(() => window.audioProbe()) });
      report.checks.push(`${actor}: both special/point/result variants end naturally; native speech has no external overlap; special stays unskippable with 0.8 s defender window`);
      await context.close();
    }
    {
      const { p, context } = await load(browser, 'sui', 'off', true);
      await p.keyboard.down('KeyJ'); await advance(p, 9); await p.keyboard.up('KeyJ');
      const s = await state(p); assert.equal(s.audio.lastEffort.character, 'sui');
      const probe = await p.evaluate(() => window.audioProbe()); const effort = probe.starts.filter(r => r.src?.includes('effort-')).at(-1);
      assert.ok(effort.rms > 0.04 && effort.duration < 0.7); await capture(p, 'mobile-effort');
      await p.getByRole('button', { name: '玩法说明', exact: true }).click();
      await p.getByLabel('角色语音', { exact: true }).uncheck(); await p.getByRole('button', { name: '关闭玩法说明' }).click();
      await p.getByRole('button', { name: '继续比赛', exact: true }).click();
      assert.equal((await state(p)).audio.voices, false);
      report.checks.push('mobile real serve plays decoded effort immediately; voice toggle stops effort without changing music'); await context.close();
    }
    assert.equal(report.movies.filter(m => m.movie.dialogue).length, actors.length * 5);
    assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
    console.log(JSON.stringify({ checks: report.checks, movies: report.movies.length, screenshots: report.screenshots.length, errors: report.errors }));
  } finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
}
module.exports = { main };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
