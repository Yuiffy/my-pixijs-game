export function pilotInputs(snapshot, style = 'patient') {
  const { boss: b, player: p, t, stats, vow, incomingBellMs } = snapshot;
  const gap = b.x - p.x;
  const imminent = b.mode === 'windup' && b.nextImpact !== null;
  const lead = imminent ? b.nextImpact - b.clock : Infinity;
  if (style === 'spam' || style === 'backstab') {
    const target = b.x - b.facing * 110;
    return { left: target < p.x - 10, right: target > p.x + 10, attack: style === 'spam' || (lead > 350 && p.stamina > 18), guard: false,
      dodge: (style === 'spam' || lead < 160) && t - p.dashAt >= 750 && t - p.attackAt > 190 && p.stamina >= p.dodgeCost };
  }
  const heavy = imminent && b.attack.heavy;
  const bellLead = incomingBellMs ?? Infinity;
  if (imminent && b.attack.kind === 'ward') {
    return { left: p.x > b.targetX + 20, right: p.x < b.targetX - 20, attack: false, guard: bellLead < 80, dodge: false };
  }
  const mustSaveTriple = vow === 'combo' && !stats.triple && b.mode === 'stagger' && b.resumeMode === 'windup';
  const exposed = ['recover', 'stagger', 'broken'].includes(b.mode);
  const dash = heavy && lead < 160 && p.stamina >= p.dodgeCost;
  const attack = exposed && !mustSaveTriple && bellLead > 550 && Math.abs(gap) <= 220 && t - p.dashAt > 320
    && (b.counterReady || (b.mode === 'broken' && b.staggerRemaining > 400 && p.stamina > 40));
  return {
    left: dash ? p.facing > 0 : !heavy && Math.abs(gap) > 190 && gap < 0,
    right: dash ? p.facing < 0 : !heavy && Math.abs(gap) > 190 && gap > 0,
    guard: (bellLead < 80 || (imminent && !heavy && b.attack.kind !== 'bell' && lead < 85)) && t - p.attackAt >= 170,
    dodge: dash,
    attack,
  };
}
export function playFight(game, style = 'patient', limit = 180000) {
  const modes = new Set();
  for (let elapsed = 0; elapsed < limit && game.state.phase === 'fight'; elapsed += 10) {
    const snapshot = game.snapshot(); modes.add(snapshot.boss.mode);
    for (const [key, down] of Object.entries(pilotInputs(snapshot, style))) game.input(key, down);
    game.advance(10);
  }
  for (const key of ['left', 'right', 'attack', 'guard', 'dodge']) game.input(key, false);
  return { phase: game.state.phase, stats: { ...game.state.stats }, elapsed: Math.round(game.state.elapsed), modes: [...modes], damage: game.damagePercent };
}
