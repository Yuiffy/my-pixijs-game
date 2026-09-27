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
const roomMap = new Map();
const response = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
function api(route) {
  if (route.request().method() === 'GET') {
    return response(route, { rooms: [...roomMap.values()].filter(entry => entry.isPublic && !entry.state)
      .map(rooms.summarizeRoom) });
  }
  const body = route.request().postDataJSON();
  if (body.operation === 'create') {
    const token = rooms.newToken();
    const room = { code: rooms.newCode(), revision: 0, rounds: 3,
      roster: engine.ROSTERS[0].members, isPublic: true,
      players: [{ name: '房主', ai: false }, { name: '等待玩家', ai: false }],
      tokens: [rooms.tokenHash(token), null], state: null };
    roomMap.set(room.code, room);
    return response(route, { token, room: rooms.viewRoom(room, 0) });
  }
  const room = roomMap.get(body.code);
  if (!room || body.code !== room.code) return body.operation === 'status'
    ? response(route, { room: null, expired: true }) : response(route, { error: '房间不存在' }, 404);
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
  if (seat < 0) return body.operation === 'status'
    ? response(route, { room: null, expired: true }) : response(route, { error: '身份无效' }, 403);
  if (body.operation === 'status') return response(route, { room: rooms.viewRoom(room, seat) });
  if (body.operation === 'leave') {
    if (room.state) return response(route, { error: '对局已开始' }, 409);
    if (seat === 0) roomMap.delete(room.code);
    else {
      room.players[seat] = { name: '等待玩家', ai: false };
      room.tokens[seat] = null;
      room.revision++;
    }
    return response(route, { ok: true });
  }
  if (body.revision !== room.revision) return response(route, { error: '状态已更新', room: rooms.viewRoom(room, seat) }, 409);
  const changed = rooms.applyRoomCommand(room, seat, body.command);
  if (!changed) return response(route, { error: '非法操作', room: rooms.viewRoom(room, seat) }, 409);
  const next = { ...changed, revision: room.revision + 1 };
  if (body.command.kind === 'start') next.state.event = 2;
  roomMap.set(room.code, next);
  return response(route, { room: rooms.viewRoom(next, seat) });
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
    await context.route('**/api/record', route => route.fulfill({ status: 204, body: '' }));
    await context.route(/google-analytics|googlesyndication|hm\.baidu\.com/, route => route.fulfill({ status: 204, body: '' }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', result => {
      if (result.status() < 400) return;
      const request = result.request();
      const operation = request.method() === 'POST' ? request.postDataJSON()?.operation : request.method();
      errors.push(`${result.status()} ${result.url()} (${operation})`);
    });
    return page;
  }
  try {
    const host = await makePage({ width: 1440, height: 1000 });
    const guest = await makePage({ width: 390, height: 844 });
    await host.goto(`${base}/game/hype-harbor`, { waitUntil: 'networkidle' });
    await host.getByTestId('online-mode').click();
    await host.getByTestId('online-room-list').waitFor();
    captures.push(await capture(host, 'public-lobby'));
    await host.getByTestId('online-create').click();
    await host.getByTestId('online-start').waitFor();
    assert.equal((await state(host)).online.players.length, 2);
    assert.equal((await state(host)).online.players[1].joined, false);
    await host.getByTestId('online-seats-4').click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).online.players.length === 4);
    await host.getByTestId('online-ai-2').click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).online.players.filter(p => p.ai).length === 2);
    await host.getByTestId('online-rounds-5').click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).rounds === 5 ||
      document.querySelector('[data-testid="online-rounds-5"]').getAttribute('aria-pressed') === 'true');
    captures.push(await capture(host, 'host-room-settings'));
    const code = (await state(host)).online.code;
    await host.getByTestId('online-rounds-3').click();
    await host.getByTestId('online-ai-0').click();
    await host.getByTestId('online-seats-2').click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).online.players.length === 2);
    await guest.goto(`${base}/game/hype-harbor`, { waitUntil: 'networkidle' });
    await guest.getByTestId('online-mode').click();
    await guest.getByRole('button', { name: '刷新房间列表' }).click();
    await guest.getByTestId('online-room-list').getByText(new RegExp(code)).waitFor();
    captures.push(await capture(guest, 'guest-public-list'));
    await guest.getByTestId('online-room-list').getByRole('button', { name: new RegExp(code) }).click();
    await guest.getByLabel('你的名字').fill('远方朋友');
    await guest.getByTestId('online-join').click();
    await guest.getByText('等待房主开始…').waitFor();
    assert.equal((await state(guest)).online.players[1].name, '远方朋友');
    await guest.getByRole('button', { name: '离开房间' }).click();
    await guest.getByTestId('online-room-list').waitFor();
    await guest.getByTestId('online-room-list').getByRole('button', { name: new RegExp(code) }).click();
    await guest.getByLabel('你的名字').fill('远方朋友');
    await guest.getByTestId('online-join').click();
    await guest.getByRole('button', { name: '同机 / AI' }).click();
    await guest.getByTestId('online-mode').click();
    await guest.getByRole('button', { name: new RegExp(code) }).first().click();
    await guest.getByText('等待房主开始…').waitFor();
    await host.getByTestId('online-start').waitFor({ state: 'visible' });
    await host.waitForFunction(() => !document.querySelector('[data-testid="online-start"]').disabled);
    await host.getByTestId('online-start').click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'preparing');
    await waitRevision(guest, (await state(host)).online.revision);
    assert.equal((await state(guest)).phase, 'preparing');
    assert.equal(await guest.getByTestId('resting-dock').isDisabled(), true, 'only producer can arrange');
    await host.getByTestId('boat-0').click();
    await host.getByTestId('boat-1').click();
    await waitRevision(guest, (await state(host)).online.revision);
    await guest.waitForFunction(() => JSON.parse(window.render_game_to_text()).boats[0].streamer === 'nagisa');
    assert.deepEqual((await state(guest)).boats.map(b => b.streamer), ['nagisa', 'sui', 'shiori']);
    await host.getByTestId('warmup-2').focus(); await host.keyboard.press('End');
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).boats[2].position === 6);
    await waitRevision(guest, (await state(host)).online.revision);
    assert.deepEqual((await state(guest)).boats.map(b => b.position), (await state(host)).boats.map(b => b.position));
    assert.equal((await state(guest)).boats.reduce((sum, b) => sum + b.position, 0), 12);
    captures.push(await capture(host, 'balanced-start-synced'));
    await host.getByTestId('launch').click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'placing');
    await waitRevision(guest, (await state(host)).online.revision);
    await host.getByRole('button', { name: '返回大厅' }).click();
    await host.getByTestId('online-create').click();
    await host.getByTestId('online-start').waitFor();
    assert.notEqual((await state(host)).online.code, code);
    captures.push(await capture(host, 'new-room-during-game'));
    await host.getByRole('button', { name: '关闭房间' }).click();
    await host.getByRole('button', { name: new RegExp(code) }).first().click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'placing');
    await guest.reload({ waitUntil: 'networkidle' });
    await waitRevision(guest, (await state(host)).online.revision);
    assert.equal((await state(guest)).online.seat, 1);
    captures.push(await capture(guest, 'guest-placing'));
    await host.getByTestId('boat-1').click();
    await host.getByTestId('confirm-action').click();
    await host.waitForFunction(() => JSON.parse(window.render_game_to_text()).turn === 1);
    await waitRevision(guest, (await state(host)).online.revision);
    assert.equal((await state(guest)).boats[1].payoutPerSeat, 24);
    await guest.getByTestId('boat-1').click();
    await guest.getByTestId('confirm-action').click();
    await guest.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'sailing');
    await waitRevision(host, (await state(guest)).online.revision);
    assert.deepEqual((await state(host)).players.map(p => p.cash), [27, 26]);
    assert.equal((await state(host)).boats[1].payoutPerSeat, 12);
    captures.push(await capture(host, 'shared-pool-synced'));
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
