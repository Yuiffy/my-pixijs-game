const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const Module = require('node:module');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const localRequire = createRequire(__filename);
const ts = localRequire('typescript');
function load(file, aliases = {}) {
  const filename = path.resolve(file);
  const module = new Module(filename);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = module.require.bind(module);
  module.require = id => aliases[id] || original(id);
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return module.exports;
}
const engine = load('src/components/hypeHarbor/engine.ts');
const rooms = load('src/lib/hypeHarbor/room.ts', { '@/components/hypeHarbor/engine': engine });
let chromium;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'].filter(Boolean)) {
  try { ({ chromium } = localRequire(candidate)); break; } catch { /* try installed copies */ }
}
if (!chromium) throw new Error('Set PLAYWRIGHT_MODULE to an installed Playwright package.');

const base = process.env.HARBOR_BASE_URL || 'http://127.0.0.1:3886';
const realApi = process.env.HARBOR_REAL_API === '1';
const out = process.env.HARBOR_QA_DIR || (realApi ? 'tmp/hype-harbor-online-real' : 'tmp/hype-harbor-online');
const errors = [];
let room = null;
const response = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
function api(route) {
  const body = route.request().postDataJSON();
  if (body.operation === 'create') {
    const token = rooms.newToken();
    room = { code: rooms.newCode(), revision: 0, rounds: body.rounds,
      roster: engine.ROSTERS[body.rosterIndex].members, players: body.players,
      tokens: body.players.map((_, i) => i === 0 ? rooms.tokenHash(token) : null), state: null };
    return response(route, { token, room: rooms.viewRoom(room, 0) });
  }
  if (!room || body.code !== room.code) return response(route, { error: '房间不存在' }, 404);
  if (body.operation === 'join') {
    const seat = room.players.findIndex((player, i) => !player.ai && !room.tokens[i]);
    if (seat < 0) return response(route, { error: '房间已满' }, 409);
    const token = rooms.newToken();
    room.players[seat] = { ...room.players[seat], name: body.name };
    room.tokens[seat] = rooms.tokenHash(token);
    room.revision++;
    return response(route, { token, room: rooms.viewRoom(room, seat) });
  }
  const seat = rooms.seatFor(room, body.token);
  if (seat < 0) return response(route, { error: '身份无效' }, 403);
  if (body.operation === 'status') return response(route, { room: rooms.viewRoom(room, seat) });
  if (body.revision !== room.revision) return response(route, { error: '状态已更新', room: rooms.viewRoom(room, seat) }, 409);
  const changed = rooms.applyRoomCommand(room, seat, body.command);
  if (!changed) return response(route, { error: '非法操作', room: rooms.viewRoom(room, seat) }, 409);
  room = { ...changed, revision: room.revision + 1 };
  return response(route, { room: rooms.viewRoom(room, seat) });
}
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function waitRevision(page, revision) {
  await page.waitForFunction(expected => JSON.parse(window.render_game_to_text()).online?.revision >= expected, revision);
}
async function capture(page, name) {
  const file = path.join(out, `${name}.png`);
  const metrics = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector('[data-game-canvas="hype-harbor"]');
    return { canvas: [canvas.width, canvas.height], overflow: document.documentElement.scrollWidth > innerWidth + 1,
      images: [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src) };
  });
  assert.ok(layout.canvas.every(value => value > 0));
  assert.equal(layout.overflow, false);
  assert.deepEqual(layout.images, []);
  assert.ok(metrics.colors > 1 && metrics.nearBlackRatio < 0.95, `invalid screenshot: ${name}`);
  return { file, metrics, layout, phase: (await state(page)).phase };
}

(async () => {
  assert.equal((await fetch(`${base}/game/hype-harbor`, { signal: AbortSignal.timeout(55000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  const captures = [];
  async function makePage(viewport) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    if (!realApi) await context.route('**/api/hype-harbor', api);
    await context.route(/google-analytics|googlesyndication|hm\.baidu\.com/, route => route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    return page;
  }
  try {
    const host = await makePage({ width: 1440, height: 1000 });
    const guest = await makePage({ width: 390, height: 844 });
    await host.goto(`${base}/game/hype-harbor`, { waitUntil: 'networkidle' });
    await host.getByTestId('online-mode').click();
    await host.getByRole('button', { name: '2 人' }).click();
    await host.getByTestId('online-create').click();
    await host.getByTestId('online-start').waitFor();
    assert.equal((await state(host)).online.players[1].joined, false);
    captures.push(await capture(host, 'host-lobby'));
    const code = (await state(host)).online.code;
    await guest.goto(`${base}/game/hype-harbor?room=${code}`, { waitUntil: 'networkidle' });
    await guest.getByLabel('你的名字').fill('远方朋友');
    await guest.getByTestId('online-join').click();
    await guest.getByText('等待房主开始…').waitFor();
    await host.getByTestId('online-start').waitFor({ state: 'visible' });
    await host.waitForFunction(() => !document.querySelector('[data-testid="online-start"]').disabled);
    await host.getByTestId('online-start').click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'preparing');
    await waitRevision(guest, (await state(host)).online.revision);
    assert.equal((await state(guest)).phase, 'preparing');
    await host.getByTestId('launch').click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'placing');
    await waitRevision(guest, (await state(host)).online.revision);
    await guest.reload({ waitUntil: 'networkidle' });
    await waitRevision(guest, (await state(host)).online.revision);
    assert.equal((await state(guest)).online.seat, 1);
    captures.push(await capture(guest, 'guest-placing'));
    for (let step = 0; step < 100; step++) {
      const current = await state(host);
      if (current.phase === 'finished') break;
      const phase = current.phase;
      const actor = current.turn === 0 ? host : guest;
      const selector = phase === 'preparing' ? 'launch' : phase === 'placing' ? 'work'
        : phase === 'sailing' ? 'roll' : phase === 'reveal' ? 'continue'
          : phase === 'settlement' ? 'next-round' : 'clip-hold';
      const page = ['preparing', 'placing', 'spotlight'].includes(phase) ? actor : host;
      await waitRevision(page, current.online.revision);
      const before = current.online.revision;
      await page.getByTestId(selector).click();
      await waitRevision(page, before + 1);
      const after = (await state(page)).online.revision;
      assert.ok(after > before, `${phase} did not advance`);
      await Promise.all([waitRevision(host, after), waitRevision(guest, after)]);
    }
    assert.equal((await state(host)).phase, 'finished');
    assert.equal((await state(guest)).phase, 'finished');
    captures.push(await capture(host, 'host-finished'));
    captures.push(await capture(guest, 'guest-finished'));
    assert.deepEqual(errors, []);
    const final = await state(host);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ captures, errors,
      rounds: final.round, revision: final.online.revision, realApi }, null, 2));
    console.log(JSON.stringify({ captures, rounds: final.round, revision: final.online.revision, realApi }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
