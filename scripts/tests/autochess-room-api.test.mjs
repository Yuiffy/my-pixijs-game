import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server.js';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const load = (file, aliases) => {
  const filename = path.resolve(file); const module = new Module(filename);
  module.filename = filename; module.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = module.require.bind(module); module.require = id => aliases[id] || native(id);
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return module.exports;
};
test('real API handlers with PostgreSQL: credentials, privacy, CAS, deadline and retry', async () => {
  const db = new PGlite(); const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'test-memory-only';
  try {
    const room = await loadTypescriptModule('src/components/autoChessGame/multiplayer/room.ts');
    const match = await loadTypescriptModule('src/components/autoChessGame/multiplayer/match.ts');
    const pool = { getPool: () => db };
    const store = load('src/lib/autochessRooms.ts', { './db': pool });
    const route = load('src/app/api/autochess/route.ts', { '@/lib/db': pool, '@/lib/autochessRooms': store,
      '@/components/autoChessGame/multiplayer/room': room, '@/components/autoChessGame/multiplayer/match': match });
    const post = async (body, origin = 'http://localhost:3891') => {
      const response = await route.POST(new NextRequest('http://localhost:3891/api/autochess', {
        method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
      return { status: response.status, body: await response.json() };
    };
    const settings = { mode: 'versus', seats: 3, aiCount: 1, prepSeconds: 90, isPublic: true };
    assert.equal((await post({ operation: 'create', name: 'Host', config: settings }, 'http://evil.invalid')).status, 403);
    const host = await post({ operation: 'create', name: 'Host', config: settings });
    assert.equal(host.status, 200); assert.match(host.body.token, /^[\w-]{43}$/);
    const code = host.body.room.code;
    const persisted = await store.findRoom(code);
    assert.notEqual(persisted.tokens[0], host.body.token);
    assert.equal(host.body.room.tokens, undefined);
    const listing = await (await route.GET()).json(); assert.equal(listing.rooms.length, 1);
    const joins = await Promise.all([post({ operation: 'join', code, name: 'Guest' }), post({ operation: 'join', code, name: 'Late' })]);
    assert.equal(joins.filter(r => r.status === 200).length, 1);
    const guest = joins.find(r => r.status === 200);
    const hostAuth = { code, token: host.body.token }; const guestAuth = { code, token: guest.body.token };
    assert.equal((await post({ operation: 'status', code, token: store.newToken() })).status, 403);
    let status = await post({ operation: 'status', ...hostAuth });
    const cmd = async (auth, command, revision = status.body.room.revision) => post({ operation: 'command', ...auth, revision, playerRevision: status.body.room.match?.players[auth.token === hostAuth.token ? 0 : 1].revision, command });
    assert.equal((await cmd(guestAuth, { kind: 'start' })).status, 409);
    status = await cmd(hostAuth, { kind: 'start' }); assert.equal(status.body.room.match.phase, 'preparation');
    assert.equal((await (await route.GET()).json()).rooms.length, 0);
    assert.equal(status.body.room.match.players[1].snapshot, undefined);
    assert.equal(status.body.room.match.players[1].shop, undefined);
    const revision = status.body.room.revision;
    const commands = await Promise.all([cmd(hostAuth, { kind: 'action', round: 1, action: { kind: 'buy', index: 0 } }, revision), cmd(guestAuth, { kind: 'ready', round: 1, ready: true }, revision)]);
    assert.equal(commands.filter(r => r.status === 200).length, 2);
    assert.equal(commands.filter(r => r.status === 409).length, 0);
    status = await post({ operation: 'status', ...hostAuth });
    const personalVersion = status.body.room.match.players[0].revision;
    const doubleBuy = await Promise.all([0, 1].map(() => post({ operation: 'command', ...hostAuth,
      revision: status.body.room.revision, playerRevision: personalVersion,
      command: { kind: 'action', round: 1, action: { kind: 'buy', index: 1 } } })));
    assert.equal(doubleBuy.filter(r => r.status === 200).length, 1, 'duplicate personal version commits once');
    assert.equal(doubleBuy.filter(r => r.status === 409).length, 1);
    status = await post({ operation: 'status', ...hostAuth });
    const unchanged = await post({ operation: 'status', ...hostAuth, revision: status.body.room.revision });
    assert.equal(unchanged.body.unchanged, true);assert.ok(Number.isFinite(unchanged.body.serverNow));
    const before = await store.findRoom(code); before.match.deadline = Date.now() - 100;
    await store.saveRoom(before, before);
    const concurrent = await Promise.all([post({ operation: 'status', ...hostAuth }), post({ operation: 'status', ...guestAuth })]);
    concurrent.forEach(r => { assert.equal(r.status, 200); assert.equal(r.body.room.match.phase, 'review'); });
    assert.deepEqual(concurrent[0].body.room.match.players, concurrent[1].body.room.match.players);
    const after = await store.findRoom(code); assert.equal(after.revision, before.revision + 2, 'deadline round committed once');
    assert.equal((await cmd(hostAuth, { kind: 'ready', round: 1, ready: true }, after.revision)).status, 409);
    assert.equal((await post({ operation: 'leave', ...hostAuth })).status, 409);
    // Token holders can recover from another page in the same browser; stale revisions cannot purchase twice.
    status = await post({ operation: 'status', ...guestAuth }); assert.equal(status.body.room.seat, 1);
    assert.equal((await cmd(hostAuth, { kind: 'action', round: 1, action: { kind: 'buy', index: 0 } }, revision)).status, 409);
    const active = await store.findRoom(code);
    assert.ok(active.match.timeline.startsAt < active.match.timeline.endsAt);
    const locked = await post({operation:'command',...hostAuth,revision:active.revision,playerRevision:active.match.players[0].revision,command:{kind:'continue',round:1}});
    assert.equal(locked.status,409,'manual continue cannot skip a running battle');
    const shift=Date.now()-active.match.timeline.endsAt-10;
    for(const key of ['startsAt','defenseEndsAt','rescueStartsAt','combatEndsAt','endsAt']) active.match.timeline[key]+=shift;
    active.match.deadline=active.match.timeline.endsAt;await store.saveRoom(active,active);
    const automatic=await Promise.all([post({operation:'status',...hostAuth}),post({operation:'status',...guestAuth})]);
    automatic.forEach(r=>{assert.equal(r.status,200);assert.equal(r.body.room.match.round,2);assert.equal(r.body.room.match.phase,'preparation');});
    assert.deepEqual(automatic[0].body.room.match.players,automatic[1].body.room.match.players);
    const lobby = await post({ operation: 'create', name: 'Closeable', config: settings });
    const extra = await post({ operation: 'join', name: 'Leaveable', code: lobby.body.room.code });
    assert.equal((await post({ operation: 'leave', code: lobby.body.room.code, token: extra.body.token })).status, 200);
    assert.equal((await post({ operation: 'leave', code: lobby.body.room.code, token: lobby.body.token })).status, 200);
    assert.equal((await post({ operation: 'status', code: lobby.body.room.code, token: lobby.body.token })).body.expired, true);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    await db.close();
  }
});
