import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, access } from 'node:fs/promises';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { gameGroups } = await loadTypescriptModule('src/components/gameLibrary/catalog.ts');
const { selectGames, readFilters, writeFilters, DEFAULT_FILTERS } = await loadTypescriptModule('src/components/gameLibrary/discovery.ts');
const { parseLibrary, isGamePath } = await loadTypescriptModule('src/components/gameLibrary/storage.ts');
const empty = { favorites: [], recent: [] };
const all = gameGroups.flatMap(group => group.games);
const results = (filters, data = empty) => selectGames(gameGroups, { ...DEFAULT_FILTERS, ...filters }, data).flatMap(group => group.games);

test('every local game route has exactly one catalog entry, usable artwork and valid dates', async () => {
  const routes = await readdir('src/app/game', { withFileTypes: true });
  const local = all.filter(game => !game.externalStats).map(game => game.href);
  assert.equal(new Set(all.map(game => game.href)).size, all.length);
  for (const route of routes.filter(entry => entry.isDirectory())) {
    await access(`src/app/game/${route.name}/page.tsx`);
    assert.ok(local.includes(`/game/${route.name}`), `missing catalog route: ${route.name}`);
  }
  for (const game of all) {
    assert.ok(isGamePath(game.href));
    assert.match(game.releaseDate, /^\d{4}-\d{2}-\d{2}$/);
    if (game.updateDate) assert.ok(game.updateDate >= game.releaseDate, game.title);
    if (game.image) await access(`public${game.image}`);
  }
});

test('multiword search matches name, description, category and gameplay, ignoring width and case', () => {
  assert.deepEqual(results({ query: '  ｒｅｓｅｔ  ' }).map(game => game.href), ['/game/reset-rush']);
  assert.deepEqual(results({ query: '排球 栞栞' }).map(game => game.href), ['/game/beach-volley']);
  assert.ok(results({ query: '在线多人' }).some(game => game.href === '/game/autochess'));
  assert.equal(results({ query: '不存在的游戏名' }).length, 0);
  assert.equal(results({ query: '   ' }).length, all.length);
});

test('search, category and favorites intersect without changing the underlying catalog', () => {
  const before = JSON.stringify(gameGroups);
  const data = { favorites: ['/game/beach-volley', '/game/reset-rush'], recent: [] };
  assert.deepEqual(results({ shelf: 'favorites', group: 'action', query: '排球' }, data).map(game => game.href), ['/game/beach-volley']);
  assert.equal(results({ shelf: 'favorites', group: 'story' }, data).length, 0);
  results({ sort: 'updated' });
  assert.equal(JSON.stringify(gameGroups), before);
});

test('date ordering is global across categories and recent ordering reflects actual visit times', () => {
  for (const sort of ['updated', 'released']) {
    const games = results({ sort });
    const dates = games.map(game => sort === 'released' ? game.releaseDate : game.updateDate || game.releaseDate);
    assert.deepEqual(dates, [...dates].sort().reverse());
  }
  const data = { favorites: [], recent: [{ href: '/game/button', openedAt: 4 }, { href: '/game/autochess', openedAt: 8 }] };
  assert.deepEqual(results({ shelf: 'recent' }, data).map(game => game.href), ['/game/autochess', '/game/button']);
});

test('deep links roundtrip and preserve unrelated URL state, including literal all/default queries', () => {
  for (const query of ['all', 'default', '岁己 排球']) {
    const filters = { query, group: 'action', shelf: 'favorites', sort: 'updated' };
    const url = writeFilters(new URL('https://example.com/demos?ref=friend#games'), filters);
    assert.deepEqual(readFilters(url.search, gameGroups), filters);
    assert.equal(url.searchParams.get('ref'), 'friend');
    assert.equal(url.hash, '#games');
    assert.equal(writeFilters(url, DEFAULT_FILTERS).search, '?ref=friend');
  }
  assert.deepEqual(readFilters('?category=unknown&shelf=bad&sort=bad', gameGroups), DEFAULT_FILTERS);
  assert.equal(readFilters(`?q=${'a'.repeat(200)}`, gameGroups).query.length, 100);
});

test('broken and hostile local data cannot become links or crash discovery', () => {
  for (const raw of [null, 'invalid json', 'null', '[]', '4', '{"favorites":{}}']) {
    assert.deepEqual(parseLibrary(raw), empty);
  }
  const data = parseLibrary(JSON.stringify({
    favorites: ['/game/button', '/game/button', 'https://example.com', 'javascript:alert(1)', '/game/../admin', null],
    recent: [null, {}, { href: '/game/button', openedAt: 20 }, { href: '/game/button', openedAt: 40 },
      { href: '/game/snack', openedAt: '10' }, { href: '/game/fab', openedAt: -1 }, { href: '/knight', openedAt: 30 }],
  }));
  assert.deepEqual(data.favorites, ['/game/button']);
  assert.deepEqual(data.recent, [{ href: '/game/button', openedAt: 40 }, { href: '/knight', openedAt: 30 }]);
  assert.equal(parseLibrary(JSON.stringify({ recent: Array.from({ length: 30 }, (_, i) => ({ href: `/game/test-${i}`, openedAt: i + 1 })) })).recent.length, 12);
  assert.equal(results({ shelf: 'favorites' }, { favorites: ['/game/removed'], recent: [] }).length, 0);
});
