import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { DEFAULT_FILTERS, filterMonths, parseFilters, serializeFilters, visibleEntries } = await loadTypescriptModule('src/components/gifts/catalog.ts');
const catalog = JSON.parse(await readFile(new URL('../../src/data/gifts/sui.json', import.meta.url), 'utf8'));
const { months } = catalog;

test('calendar is contiguous, portable, and every published claim and picture has a source', async () => {
  const keys = months.map(m => m.month);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(keys, [...keys].sort().reverse());
  for (let index = 1; index < keys.length; index += 1) {
    const [year, month] = keys[index - 1].split('-').map(Number);
    const previous = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
    assert.equal(keys[index], previous, 'missing months must remain explicit');
  }
  assert.doesNotMatch(JSON.stringify(catalog), /[DE]:\\|yuiffy|<script/i);
  for (const month of months) {
    const ids = month.sources.map(source => source.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const entry of month.entries) {
      assert.ok(entry.items.length > 0);
      assert.ok(entry.sources.length > 0);
      assert.ok(entry.sources.every(id => ids.includes(id)));
      if (entry.status === 'recorded') {
        assert.ok(month.sources.some(source => entry.sources.includes(source.id) && source.kind === 'subtitle'), `${month.month} cannot promote a viewer/web clue`);
      }
    }
    for (const source of month.sources) {
      assert.ok(source.excerpt.length > 0);
      if (source.file) assert.ok(!/[\\/]/.test(source.file), 'publish filename, not private path');
      if (source.url) assert.equal(new URL(source.url).protocol, 'https:');
    }
    for (const image of month.images) {
      assert.ok(ids.includes(image.source));
      assert.match(image.src, /^\/images\/sui-gifts\/[\w-]+\.webp$/);
      assert.ok(image.width > 100 && image.height > 100);
      assert.ok((await stat(new URL(`../../public${image.src}`, import.meta.url))).size > 1000);
      const source = month.sources.find(item => item.id === image.source);
      if (image.kind === 'official') {
        assert.equal(source.kind, 'official-dynamic');
        assert.match(source.url, /^https:\/\/www\.bilibili\.com\/opus\/\d+$/);
        assert.equal(new URL(image.originalUrl).protocol, 'https:');
        assert.match(new URL(image.originalUrl).hostname, /(^|\.)hdslb\.com$/);
        assert.equal(image.time, undefined, 'official images must not inherit livestream offsets');
      } else {
        assert.equal(source.kind, 'subtitle');
        assert.ok(image.time);
      }
    }
  }
});

test('milestone gifts cannot become unconditional gifts', () => {
  const september = months.find(month => month.month === '2026-09');
  for (const [item, threshold] of [['画框立牌', '150'], ['应援棒', '200'], ['演出纪念 T 恤', '25']]) {
    const entry = september.entries.find(row => row.items.includes(item));
    assert.match(entry.condition, new RegExp(threshold));
    assert.ok(!september.entries.some(row => !row.condition && row.items.includes(item)));
  }
  assert.ok(months.find(month => month.month === '2025-10').entries.every(entry => entry.status === 'lead'));
  const retrospective = months.find(month => month.month === '2025-09');
  assert.ok(retrospective.sources.some(source => source.date.startsWith('2026-01')));
});

test('year, month, tier and keywords combine without leaking another tier into matches', () => {
  assert.deepEqual(filterMonths(months, { ...DEFAULT_FILTERS, q: '2026 手写信', tier: 'governor' }).map(m => m.month), ['2026-09']);
  assert.equal(filterMonths(months, { ...DEFAULT_FILTERS, q: '手写信', year: '2026', tier: 'captain' }).length, 0);
  const result = filterMonths(months, { ...DEFAULT_FILTERS, year: '2024', month: '09', tier: 'admiral', q: '卫衣' });
  assert.deepEqual(result.map(m => m.month), ['2024-09']);
  assert.ok(visibleEntries(result[0], { ...DEFAULT_FILTERS, tier: 'admiral' }).every(entry => entry.tier === 'admiral'));
  assert.equal(filterMonths(months, { ...DEFAULT_FILTERS, year: '2025', month: '10', evidence: 'recorded' }).length, 0);
});

test('empty months are opt-in and are never described as no gifts', () => {
  assert.equal(filterMonths(months, { ...DEFAULT_FILTERS, year: '2022' }).length, 0);
  const missing = filterMonths(months, { ...DEFAULT_FILTERS, year: '2022', missing: true });
  assert.equal(missing.length, 4);
  assert.ok(missing.every(month => month.entries.length === 0 && month.note.includes('不表示')));
});

test('shareable queries round-trip and invalid parameters have safe defaults', () => {
  const filters = { ...DEFAULT_FILTERS, q: '手作 巧克力', year: '2025', month: '05', tier: 'admiral', evidence: 'recorded', missing: true };
  assert.deepEqual(parseFilters(new URLSearchParams(serializeFilters(filters))), filters);
  assert.deepEqual(parseFilters(new URLSearchParams('year=NaN&month=13&tier=__proto__&evidence=confirmed')), DEFAULT_FILTERS);
});
