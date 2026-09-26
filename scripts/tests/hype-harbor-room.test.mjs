import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = fileURLToPath(new URL('../../', import.meta.url));
const load = (file, aliases = {}) => {
  const filename = path.join(root, file);
  const compiled = new Module(filename);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = compiled.require.bind(compiled);
  compiled.require = id => aliases[id] || nativeRequire(id);
  compiled._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return compiled.exports;
};
const engine = load('src/components/hypeHarbor/engine.ts');
const rooms = load('src/lib/hypeHarbor/room.ts', { '@/components/hypeHarbor/engine': engine });
const makeRoom = () => {
  const host = rooms.newToken();
  const guest = rooms.newToken();
  return { host, guest, row: {
    code: rooms.newCode(), revision: 0, rounds: 3, roster: engine.ROSTERS[0].members,
    players: [{ name: '房主', ai: false }, { name: '朋友', ai: false }, { name: '电脑', ai: true }],
    tokens: [rooms.tokenHash(host), rooms.tokenHash(guest), null], state: null,
  } };
};

test('room identity and public state protect seats and the random seed', () => {
  const { row, host, guest } = makeRoom();
  assert.match(row.code, /^[A-Z2-9]{8}$/);
  assert.equal(rooms.seatFor(row, host), 0);
  assert.equal(rooms.seatFor(row, guest), 1);
  assert.equal(rooms.seatFor(row, rooms.newToken()), -1);
  assert.equal(rooms.validPlayers(row.players), true);
  assert.equal(rooms.applyRoomCommand({ ...row, tokens: [row.tokens[0], null, null] }, 0, { kind: 'start' }), null);
  const started = rooms.applyRoomCommand(row, 0, { kind: 'start' });
  assert.equal(started.state.phase, 'preparing');
  assert.notEqual(started.state.seed, 0);
  assert.equal(rooms.viewRoom(started, 1).state.seed, 0);
  assert.equal(rooms.applyRoomCommand(row, 1, { kind: 'start' }), null);
  assert.equal(rooms.applyRoomCommand(started, 0, { kind: 'start' }), null);
});

test('only the active seat may prepare, invest or choose a clip', () => {
  const { row } = makeRoom();
  const started = rooms.applyRoomCommand(row, 0, { kind: 'start' });
  assert.equal(rooms.applyRoomCommand(started, 1, { kind: 'launch' }), null);
  const launched = rooms.applyRoomCommand(started, 0, { kind: 'launch' });
  assert.equal(launched.state.phase, 'placing');
  assert.equal(rooms.applyRoomCommand(launched, 1, { kind: 'action', action: { kind: 'work', boat: 0 } }), null);
  const afterHost = rooms.applyRoomCommand(launched, 0, { kind: 'action', action: { kind: 'work', boat: 0 } });
  assert.equal(afterHost.state.turn, 1);
  assert.equal(rooms.applyRoomCommand(afterHost, 0, { kind: 'action', action: { kind: 'work', boat: 0 } }), null);
  const afterGuest = rooms.applyRoomCommand(afterHost, 1, { kind: 'action', action: { kind: 'work', boat: 0 } });
  assert.equal(afterGuest.state.phase, 'sailing', 'server completed the AI turn');
  assert.deepEqual(afterGuest.state.players.slice(0, 2).map(p => p.cash), [31, 31]);
  assert.equal(afterGuest.state.placed, 3);
  const revealed = rooms.applyRoomCommand(afterGuest, 1, { kind: 'roll' });
  assert.equal(revealed.state.phase, 'reveal');
  assert.equal(rooms.applyRoomCommand(revealed, 1, { kind: 'roll' }), null);
});

test('persisted rows validate complete engine state and room settings', () => {
  const { row } = makeRoom();
  assert.deepEqual(rooms.parseRoomRow(row), row);
  const started = rooms.applyRoomCommand(row, 0, { kind: 'start' });
  assert.ok(rooms.parseRoomRow(JSON.parse(JSON.stringify(started))));
  assert.equal(rooms.parseRoomRow({ ...row, roster: ['sui'] }), null);
  assert.equal(rooms.parseRoomRow({ ...row, state: {} }), null);
  assert.equal(rooms.parseRoomRow({ ...row, tokens: [] }), null);
});

test('room migration and revision guard accept one concurrent turn', async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync(path.join(root, 'scripts/sql/hype-harbor.sql'), 'utf8'));
    await db.exec(readFileSync(path.join(root, 'scripts/sql/hype-harbor.sql'), 'utf8'));
    const { row } = makeRoom();
    await db.query(
      'INSERT INTO hype_harbor_rooms (code, rounds, roster, players, tokens) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb)',
      [row.code, row.rounds, JSON.stringify(row.roster), JSON.stringify(row.players), JSON.stringify(row.tokens)],
    );
    const command = 'UPDATE hype_harbor_rooms SET revision = revision + 1 WHERE code = $1 AND revision = $2 RETURNING revision';
    const [first, second] = await Promise.all([db.query(command, [row.code, 0]), db.query(command, [row.code, 0])]);
    assert.equal(first.rows.length + second.rows.length, 1);
    assert.equal((await db.query('SELECT revision FROM hype_harbor_rooms WHERE code = $1', [row.code])).rows[0].revision, 1);
  } finally {
    await db.close();
  }
});
