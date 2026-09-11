import { loadTypescriptModule } from './tests/helpers/load-typescript-module.mjs';
const fab = await loadTypescriptModule('src/components/miniGames/fabEngine.ts');
for (const price of [0.85, 1, 1.2]) {
  const results = [];
  for (const style of fab.FAB_STYLES) for (const seed of [1, 42, 2026]) {
    let s = fab.createFab(seed, style.id);
    while (!s.ending) {
      s.pricing = price;
      s.production = s.player.inventory > s.demand / 3 ? 0 : s.cycle === 0 || s.cycle === 3 ? 0.5 : 1;
      s.shipment = 1;
      if (s.player.cash > 175 && s.player.tech < 5 && !fab.fabBlocked(s, 'research')) s = fab.actFab(s, 'research');
      if (s.player.cash > 300 && s.player.fabs < 3 && s.cycle === 1 && !fab.fabBlocked(s, 'expand')) s = fab.actFab(s, 'expand');
      s = fab.endFabTurn(s);
    }
    results.push({ style: style.id, seed, ending: s.ending.title, cash: s.player.cash, winner: s.ending.won });
  }
  console.log(JSON.stringify({ price, results }));
}
