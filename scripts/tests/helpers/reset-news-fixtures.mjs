// Fixtures exercise the real morning/night pipeline, with a controlled next draw.
export function newsFixture(E, seed = 20261003) {
  let g = E.createGame(seed, 42);
  g = E.act(g, { type: 'upgrade', account: g.players[0].accounts[0].id, tier: 200 });
  g = E.act(g, { type: 'studio', ...g.studio, threads: 0 });
  g.day = 7;
  g.platform.nextRelease = 100;
  g.platform.proDeadline = 7;
  for (const p of g.players) {
    p.energy = 12;
    p.energyLedger = { day: 7, hosting: 0, claims: 0, other: 0, restored: 0, previous: 0 };
    for (const a of p.accounts) { a.nextReset = 100; a.paidUntil = 100; }
  }
  const job = g.players[0].projects[0];
  job.need = 1000;
  job.challenge = 0;
  job.understood = true;
  return g;
}

export function announce(E, before, headline) {
  for (let rng = 1; rng <= 1000; rng++) {
    const g = structuredClone(before);
    g.phase = 'plan';
    g.minute = 480;
    g.event = { ...E.EVENTS.find(e => e.id === 'quiet') };
    g.events = ['industry-news'];
    g.rng = rng;
    const after = E.nextDay(E.endDay(g));
    if (after.event.id === headline) return after;
  }
  throw new Error(`No eligible draw for ${headline}`);
}

export function night(E, before, gift = false) {
  const g = structuredClone(before);
  g.minute = 480;
  g.event = { ...E.EVENTS.find(e => e.id === (gift ? 'promise' : 'quiet')) };
  if (gift) g.resetDeck = ['normal'];
  return E.endDay(g);
}
