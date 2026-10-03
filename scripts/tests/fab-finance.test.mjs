import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const fab = await loadTypescriptModule('src/components/miniGames/fabEngine.ts');
const { fabOperatingAccount, readFabQuarterReport } = await loadTypescriptModule('src/components/miniGames/fabFinance.ts');
const { readGameSave } = await loadTypescriptModule('src/components/miniGames/save.ts');
const cents = n => Math.round(n * 100);

test('quarter ledger explains default first-quarter loss and reconciles cash and inventory', () => {
  const s = fab.createFab(); const next = fab.endFabTurn(s); const r = next.lastQuarter;
  assert.equal(r.sold, 22); assert.equal(r.net, -14);
  assert.equal(r.startingInventory + r.produced - r.sold, r.endingInventory);
  assert.equal(cents(r.revenue - r.productionCost - r.maintenance - r.storage - r.interest + r.rounding), cents(r.net));
  assert.equal(next.player.cash, r.cashAfter); assert.equal(r.cashBefore, 220);
  assert.equal(next.player.inventory, r.endingInventory); assert.ok(r.totalOffered >= r.totalSold);
  assert.deepEqual(s, fab.createFab());
});

test('public forecast bounds contain actual outcomes for all order combinations, styles and cycles', () => {
  for (const style of fab.FAB_STYLES) for (let cycle = 0; cycle < 4; cycle++) {
    for (const production of [0, 0.5, 1]) for (const shipment of [0, 0.5, 1]) for (const pricing of [0.85, 1, 1.2]) {
      const s = {...fab.createFab(2026, style.id), production, shipment, pricing, cycle, turn: cycle * 3 + 1,
        price: fab.CYCLES[cycle].price, demand: fab.CYCLES[cycle].demand};
      const before = structuredClone(s); const f = fab.fabForecast(s); assert.deepEqual(s, before);
      const n = fab.endFabTurn(s); const r = n.lastQuarter;
      assert.ok(r.sold <= f.maxSold); assert.ok(r.net >= f.worst.net && r.net <= f.best.net);
      assert.ok(r.cashAfter >= f.worst.cashAfter && r.cashAfter <= f.best.cashAfter);
      assert.equal(f.worst.storage, Math.round((s.player.inventory + f.produced) * 8) / 100);
      const at = sold => fabOperatingAccount(s.player, f.produced, fab.unitCost(s.player), f.quote, sold).net;
      assert.ok(at(f.breakEven) >= 0); if (f.breakEven > 0) assert.ok(at(f.breakEven - 1) < 0);
      const changedRivals = {...s, rivals:s.rivals.map(rival=>({...rival,cash:999,inventory:500,tech:5}))};
      assert.deepEqual(fab.fabForecast(changedRivals), f, 'Forecast cannot peek at competitor orders');
    }
  }
});

test('no shipments still incur warehousing, maintenance, production and loan interest', () => {
  let s = fab.actFab(fab.createFab(), 'loan'); s = {...s, shipment:0, production:0};
  const f = fab.fabForecast(s); assert.equal(f.maxSold,0); assert.ok(f.breakEven>0);
  const n = fab.endFabTurn(s); const r = n.lastQuarter;
  assert.equal(r.revenue,0); assert.equal(r.productionCost,0); assert.equal(r.maintenance,12);
  assert.equal(r.storage,4.4); assert.equal(r.interest,3.2); assert.equal(r.net,-19.6);
  assert.equal(r.cashBefore,300); assert.equal(r.cashAfter,280.4);
});

test('capital cash changes are separate; new factory capacity starts the following quarter', () => {
  let s = fab.actFab(fab.createFab(), 'expand'); s = fab.actFab(s, 'research');
  const f = fab.fabForecast(s); assert.equal(f.produced,28);
  s = fab.endFabTurn(s); assert.equal(s.lastQuarter.cashBefore,68); assert.equal(s.lastQuarter.maintenance,12);
  s = fab.endFabTurn({...s,production:0,shipment:1});
  assert.equal(s.player.fabs,3); assert.equal(s.lastQuarter.maintenance,12);
  assert.equal(fab.fabForecast({...s,production:1}).produced,84);
});

test('legacy saves without a ledger continue; malformed ledgers are discarded without losing the game', () => {
  const s = fab.endFabTurn(fab.createFab()); const legacy = structuredClone(s); delete legacy.lastQuarter;
  assert.deepEqual(readGameSave(JSON.stringify(legacy),'fab'), legacy);
  assert.deepEqual(readGameSave(JSON.stringify(s),'fab'), s);
  for (const patch of [{turn:20},{revenue:999},{sold:-1},{rounding:3},{cashAfter:999},{storage:Infinity},{totalSold:999},{quote:'bad'}]) {
    const invalid = {...s,lastQuarter:{...s.lastQuarter,...patch}};
    assert.deepEqual(readGameSave(JSON.stringify(invalid),'fab'), legacy);
  }
  assert.equal(readFabQuarterReport({},2,false),undefined);
  assert.ok(fab.endFabTurn(legacy).lastQuarter);
});

test('final and bankruptcy quarter reports persist, reconcile and do not advance on repeated settlement', () => {
  const bankrupt = fab.endFabTurn({...fab.createFab(),shipment:0,player:{...fab.createFab().player,cash:1}});
  assert.equal(bankrupt.ending.title,'停机清算'); assert.ok(bankrupt.lastQuarter.cashAfter<0);
  assert.deepEqual(readGameSave(JSON.stringify(bankrupt),'fab'),bankrupt);
  const final = fab.endFabTurn({...fab.createFab(),turn:24});
  assert.ok(final.ending); assert.equal(final.lastQuarter.turn,24);
  assert.deepEqual(readGameSave(JSON.stringify(final),'fab'),final);
  assert.equal(fab.endFabTurn(final),final);
});
