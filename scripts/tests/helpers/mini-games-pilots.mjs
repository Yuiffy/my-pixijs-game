import { loadTypescriptModule } from './load-typescript-module.mjs';
const ai = await loadTypescriptModule('src/components/miniGames/agiEngine.ts');
const { industryEvent: awaitIndustryEvent } = await loadTypescriptModule('src/components/miniGames/agiIndustry.ts');
const fab = await loadTypescriptModule('src/components/miniGames/fabEngine.ts');
const snack = await loadTypescriptModule('src/components/miniGames/snackEngine.ts');
function aiPilot(seed, style, ending, trace = [], company) {
  let s = ai.createAi(seed, style, company);
  s.openness = ending === 'shared';
  const targetSafety = ending === 'shared' ? 81 : ending === 'doom' ? 0 : 46;
  for (let guard = 0; guard < 100 && !s.ending; guard++) {
    if (!s.industry.eventResolved) {
      const industry = awaitIndustryEvent(s.industry.eventId);
      const preference = industry.choices.find(c => s.cash + (c.deltas.cash || 0) >= 15 && (c.deltas.reliability || 0) >= 0 && (c.deltas.safety || 0) >= 0) || industry.choices.find(c => s.cash + (c.deltas.cash || 0) >= 0);
      if (preference) { trace.push({type: 'event', id: preference.id}); s = ai.decideAiEvent(s, preference.id); }
    }
    const choices = [];
    if (s.industry.reliability < 70 && s.capability > 50) choices.push('posttrain');
    if (s.capability >= 100 && s.compute >= 5 && s.industry.reliability >= 70 && (ending === 'doom' || s.safety >= targetSafety)
      && (ending !== 'commerce' || s.community >= 35)) choices.push('agi');
    if (s.cash < 45 && (ending !== 'commerce' || s.funding < 2)) choices.push('fund');
    if (s.product && s.capability - s.product >= 15) choices.push('release');
    if (s.capability >= 100 && s.safety < targetSafety) choices.push('safety');
    if (!s.product && s.capability >= 25) choices.push('release');
    if (ending === 'commerce' && s.community < 35) choices.push('market');
    if (s.capability >= 30 && s.efficiency < 4) choices.push('distill');
    if (s.compute < 5) choices.push('compute');
    if (s.capability < 100) choices.push('train');
    if (!s.recursive && s.capability >= 55 && s.capability < 85) choices.push('self');
    if (s.safety < targetSafety) choices.push('safety');
    if (s.product < s.capability) choices.push('release');
    if (ending === 'doom' && s.safety >= 40) choices.push('train');
    choices.push('market');
    const selected = choices.find(a => !ai.aiBlocked(s, a));
    if (selected) { trace.push({ type: 'action', id: selected }); s = ai.actAi(s, selected); } else { trace.push({ type: 'end' }); s = ai.endAiTurn(s); }
  }
  return s;
}
function fabPilot(seed, style, trace = []) {
  let s = fab.createFab(seed, style);
  for (let guard = 0; guard < 24 && !s.ending; guard++) {
    s.pricing = 0.85;
    s.production = s.player.inventory > s.demand / 3 ? 0 : s.cycle === 0 || s.cycle === 3 ? 0.5 : 1;
    s.shipment = 1;
    trace.push({ type: 'orders', production: s.production, pricing: s.pricing, shipment: s.shipment });
    if (s.player.cash > 175 && s.player.tech < 5 && !fab.fabBlocked(s, 'research')) { trace.push({ type: 'action', id: 'research' }); s = fab.actFab(s, 'research'); }
    if (s.player.cash > 300 && s.player.fabs < 3 && s.cycle === 1 && !fab.fabBlocked(s, 'expand')) { trace.push({ type: 'action', id: 'expand' }); s = fab.actFab(s, 'expand'); }
    trace.push({ type: 'end' }); s = fab.endFabTurn(s);
  }
  return s;
}
function playSnack(s) {
  s.phase = 'playing';
  for (let i = 0; i < 12000 && s.phase === 'playing'; i++) {
    if (!s.chewing && s.energy > 93 && s.suspicion < 15) {
      snack.snackInput(s, 'eat', true);
      snack.snackInput(s, 'eat', false);
    }
    const busy = s.chewing > 0;
    const reply = busy && s.energy < 24 && s.suspicion < 65;
    snack.snackInput(s, 'talk', !busy || reply);
    snack.snackInput(s, 'mute', busy && !reply && snack.SNACKS[s.selected].noise > 6 && !snack.snackCover(s).active);
    snack.advanceSnack(s, 1000 / 60);
  }
  return s;
}


export { aiPilot, fabPilot, playSnack };
