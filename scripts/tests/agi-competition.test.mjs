import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
import { aiCompetitivePilot, aiPilot } from './helpers/mini-games-pilots.mjs';

const ai = await loadTypescriptModule('src/components/miniGames/agiEngine.ts');
const competition = await loadTypescriptModule('src/components/miniGames/agiCompetition.ts');
const content = await loadTypescriptModule('src/components/miniGames/agiIndustry.ts');
const next = s => ai.endAiTurn(ai.decideAiEvent(s, 'defer'));
const fresh = (difficulty = 'standard', company = 'deepseek') => ai.createAi(42, content.aiCompany(company).style, company, difficulty);
const published = (open = true) => {
  let s = ai.decideAiEvent(fresh(), 'defer'); s.capability = 80; s.cash = 180; s.openness = open;
  s = ai.actAi(s, 'release'); s.used = []; s.actions = 3;
  return s;
};

test('difficulty config changes disclosed budgets and tempo, and standard is the default', () => {
  assert.equal(fresh().difficulty, 'standard'); assert.equal(fresh().version, 3);
  const levels = competition.AI_DIFFICULTIES.map(d => fresh(d.id));
  assert.deepEqual(levels.map(s => s.rivals[0].cash), [100, 135, 155]);
  assert.deepEqual(levels.map(s => s.rivals[0].compute), [2, 3, 4]);
  for (const s of levels) assert.equal(s.cash, 120, 'Difficulty does not secretly take starting money from the player');
});

test('rivals buy training, publish, optimize and finance through auditable finite budgets', () => {
  const s = fresh(); const r = s.rivals.find(r => r.company === 'qwen');
  const kinds = new Set();
  for (let turn = 1; turn <= 9; turn++) {
    s.turn = turn;
    const before = structuredClone(r);
    competition.advanceAiRival(s, r, 0.99);
    const feed = s.competition.feed.filter(e => e.actor === r.company && e.turn === turn);
    feed.forEach(e => kinds.add(e.kind));
    assert.ok(r.cash >= 0); assert.ok(r.funding <= 3); assert.ok(r.lastActions.length <= 4);
    assert.ok(r.product <= r.capability);
    if (r.capability > before.capability) assert.ok(feed.some(e => ['train', 'optimize', 'posttrain', 'distill'].includes(e.kind)), 'Every capability increase has a paid research action');
    if (r.product > before.product) assert.ok(feed.some(e => e.kind === 'release'), 'Internal research does not automatically ship');
    assert.equal(r.lastIncome, competition.rivalIncome(r));
  }
  for (const kind of ['train', 'release', 'fund', 'optimize', 'compute']) assert.ok(kinds.has(kind), kind);
  const poor = fresh().rivals[0]; poor.cash = 0; poor.funding = 3; poor.product = 0; poor.video = 0; poor.ecosystem = 0;
  const capability = poor.capability;
  competition.advanceAiRival(fresh(), poor, 0.5);
  assert.equal(poor.capability, capability, 'A broke rival cannot invent free training or a fourth financing round');
  assert.equal(poor.funding, 3); assert.equal(poor.cash, 0);
});

test('rivals explicitly distill the player or a peer using only released capability', () => {
  const s = published(); const r = s.rivals.find(r => r.company === 'anthropic');
  const before = structuredClone(r);
  competition.advanceAiRival(s, r, 0.99);
  const entry = s.competition.feed.find(e => e.actor === r.company && e.kind === 'distill');
  assert.equal(entry.target, s.industry.company); assert.equal(entry.basis, 'licensed');
  assert.equal(entry.amount, Math.round((s.product - before.capability) * 0.6 * 10) / 10);
  assert.ok(r.capability <= s.product); assert.match(entry.text, /支付 17 M/);
  const peer = fresh(); const teacher = peer.rivals.find(r => r.company === 'qwen'); teacher.product = 75; teacher.capability = 99;
  competition.advanceAiRival(peer, peer.rivals[0], 0.99);
  const learned = peer.competition.feed.find(e => e.kind === 'distill');
  assert.equal(learned.target, 'qwen'); assert.match(learned.text, /模型 75/); assert.doesNotMatch(learned.text, /模型 99/);
});

test('rivals can pay for both training and distillation in one quarter, just like the player', () => {
  const s = published(); const r = s.rivals.find(r => r.company === 'anthropic');
  Object.assign(r, { capability: 20, product: 20, compute: 5, reliability: 80, safety: 70, cash: 200 });
  competition.advanceAiRival(s, r, 0.99);
  const actions = s.competition.feed.filter(e => e.actor === r.company && e.kind !== 'settlement');
  assert.equal(actions.filter(e => e.kind === 'distill').length, 1);
  assert.equal(actions.filter(e => e.kind === 'train').length, 1);
  assert.equal(actions.length, 3);
  assert.equal(r.cash, Math.round((200 - 17 - 25 - 8 + r.lastIncome - r.lastCosts) * 10) / 10);
});

test('rivals select the highest real transferable gain, including defense and license costs', () => {
  const s = fresh(); const r = s.rivals.find(r => r.company === 'anthropic');
  Object.assign(r, { capability: 20, product: 20, compute: 5, reliability: 80, safety: 70, cash: 200 });
  Object.assign(s.rivals.find(r => r.company === 'qwen'), { product: 100, capability: 100, defense: 5 });
  Object.assign(s.rivals.find(r => r.company === 'meta'), { product: 51, capability: 51, defense: 0 });
  competition.advanceAiRival(s, r, 0.99);
  const learned = s.competition.feed.find(e => e.actor === r.company && e.kind === 'distill');
  assert.equal(learned.target, 'qwen'); assert.equal(learned.amount, 20);
});

test('rivals finish viable AGI sprints before fundraising, model releases or public criticism', () => {
  const s = published(); s.turn = 4; s.industry.reliability = 50;
  const r = s.rivals.find(r => r.company === 'anthropic');
  Object.assign(r, { capability: 97, compute: 5, reliability: 80, safety: 50, cash: 30, product: 60 });
  competition.advanceAiRival(s, r, 0);
  assert.equal(s.ending?.won, false); assert.match(r.lastActions[0], /预训练/);
  assert.match(r.lastActions[1], /启动 AGI/); assert.equal(r.funding, 0);
  const ready = fresh(); const winner = ready.rivals[0];
  Object.assign(winner, { capability: 100, compute: 5, reliability: 70, safety: 40, cash: 0 });
  competition.advanceAiRival(ready, winner, 0);
  assert.match(winner.lastActions[0], /启动 AGI/); assert.equal(winner.funding, 0);
});

test('relaxed rivals retain a single core research window for slower exploratory games', () => {
  const s = published(); s.difficulty = 'relaxed'; const r = s.rivals[0];
  Object.assign(r, { capability: 20, product: 20, compute: 5, reliability: 80, safety: 70, cash: 200 });
  competition.advanceAiRival(s, r, 0.99);
  const research = s.competition.feed.filter(e => e.actor === r.company && ['train', 'distill'].includes(e.kind));
  assert.equal(research.length, 1);
});

test('universal defense costs an action, upkeep and community, and changes rival sampling', () => {
  const open = published(); const protectedOpen = ai.actAi(open, 'protect');
  assert.equal(protectedOpen.cash, open.cash - 18); assert.equal(protectedOpen.actions, open.actions - 1);
  assert.equal(protectedOpen.community, open.community - 3); assert.equal(ai.aiUpkeep(protectedOpen), ai.aiUpkeep(open) + 2);
  competition.advanceAiRival(open, open.rivals[0], 0.99);
  competition.advanceAiRival(protectedOpen, protectedOpen.rivals[0], 0.99);
  const gain = s => s.competition.feed.find(e => e.kind === 'distill' && e.actor === s.rivals[0].company)?.amount || 0;
  assert.ok(gain(open) > gain(protectedOpen)); assert.ok(gain(protectedOpen) > 0, 'Open weights cannot be retroactively revoked');
  const closed = ai.actAi(published(false), 'protect');
  competition.advanceAiRival(closed, closed.rivals[0], 0.99);
  assert.ok(!closed.competition.feed.some(e => e.kind === 'distill' && e.target === closed.industry.company));
  assert.equal(ai.actAi(protectedOpen, 'protect'), protectedOpen);
});

test('publication captures license policy and later closed releases retain previous open knowledge', () => {
  let s = published(true);
  s.openness = false;
  assert.equal(s.competition.publishedOpen, true);
  s.capability = 95; s = ai.actAi(s, 'release');
  assert.equal(s.competition.publishedOpen, false); assert.equal(s.competition.openCapability, 80);
  s.industry.defense = 5;
  competition.advanceAiRival(s, s.rivals[0], 0.99);
  const entry = s.competition.feed.find(e => e.kind === 'distill' && e.target === s.industry.company);
  assert.ok(entry); assert.match(entry.text, /历史开放版.*模型 80/);
  assert.ok(s.rivals[0].capability <= 80);
});

test('paid closed-model licensing transfers money to the teacher in both directions', () => {
  const player = published(false); const before = player.cash;
  competition.advanceAiRival(player, player.rivals[0], 0.99);
  assert.equal(player.cash, before + 6);
  let s = fresh(); const r = s.rivals.find(r => r.company === 'openai'); r.product = 80;
  s = ai.setAiDistillTarget(s, r.company); const cash = r.cash;
  const after = ai.actAi(s, 'distill');
  assert.equal(after.cash, s.cash - 23); assert.equal(after.rivals.find(r => r.company === 'openai').cash, cash + 6);
});

test('well-founded public criticism changes target finances and forces a remedial decision', () => {
  let s = fresh(); const r = s.rivals.find(r => r.company === 'openai');
  r.product = 50; r.capability = 55; r.reliability = 61; r.safety = 45;
  s = ai.setAiCompetitionTarget(s, r.company); const before = structuredClone(s);
  assert.equal(ai.aiCriticismPreview(s).supported, true);
  s = ai.actAi(s, 'criticize');
  const target = s.rivals.find(r => r.company === 'openai');
  assert.equal(s.cash, before.cash - 10); assert.equal(s.actions, before.actions - 1);
  assert.equal(target.cash, r.cash - 8); assert.equal(target.reputation, r.reputation - 12);
  assert.ok(competition.rivalIncome(target) < competition.rivalIncome(r));
  competition.advanceAiRival(s, target, 0.99);
  assert.ok(target.lastActions[0].includes('后训练'), 'An observed reliability issue below 65 gets remediated even when normal training threshold is 57');
});

test('unsupported accusations backfire and lawful open distillation is not fabricated misconduct', () => {
  let s = fresh(); const r = s.rivals.find(r => r.company === 'qwen'); r.product = 60; r.capability = 70; r.reliability = 80; r.safety = 60;
  s.community = 30; s.reputation = 35; s = ai.setAiCompetitionTarget(s, 'qwen');
  assert.equal(ai.aiCriticismPreview(s).supported, false); assert.match(ai.aiCriticismPreview(s).basis, /开放许可.*不构成违规/);
  const after = ai.actAi(s, 'criticize');
  assert.equal(after.reputation, 25); assert.equal(after.community, 24);
  assert.equal(after.rivals.find(r => r.company === 'qwen').cash, r.cash);
  assert.equal(ai.setAiCompetitionTarget(s, s.industry.company), s);
});

test('rival criticism has observable grounds, one challenge per quarter, and an optional single response', () => {
  let s = published(false); s.turn = 3; s.industry.reliability = 50; s.safety = 32; s.community = 60; s.reputation = 40;
  for (const r of s.rivals) competition.advanceAiRival(s, r, 0);
  const entries = s.competition.feed.filter(e => e.kind === 'criticize' && e.target === s.industry.company);
  assert.equal(entries.length, 1); assert.match(entries[0].basis, /可靠性仅 50/);
  assert.equal(s.community, 55); assert.equal(s.reputation, 32); assert.equal(entries[0].response, 'pending');
  const before = structuredClone(s);
  s = ai.respondAiChallenge(s, entries[0].id, 'fix');
  assert.equal(s.cash, before.cash - 24); assert.equal(s.actions, before.actions - 1);
  assert.equal(s.industry.reliability, 60); assert.equal(s.safety, 38);
  assert.equal(ai.setAiOperating(s, { service: 'consumer' }).industry.service, before.industry.service, 'Remediation spends an action and locks the quarter allocation');
  assert.equal(s.revenue, ai.aiIncome(s), 'Remediation updates the displayed product-income forecast immediately');
  assert.equal(ai.respondAiChallenge(s, entries[0].id, 'fix'), s);
  const exhausted = { ...before, actions: 0 };
  assert.match(ai.aiChallengeBlocked(exhausted, entries[0].id, 'fix'), /行动已用完/);
  assert.equal(ai.respondAiChallenge(exhausted, entries[0].id, 'fix'), exhausted);
  const awaitingEvent = { ...before, industry: { ...before.industry, eventResolved: false } };
  assert.match(ai.aiChallengeBlocked(awaitingEvent, entries[0].id, 'fix'), /先处理/);
  assert.equal(ai.respondAiChallenge(awaitingEvent, entries[0].id, 'fix'), awaitingEvent);
  const audited = ai.respondAiChallenge(exhausted, entries[0].id, 'audit');
  assert.equal(audited.actions, 0); assert.equal(audited.cash, exhausted.cash - 12);
  const broke = { ...before, cash: 0 };
  assert.match(ai.aiChallengeBlocked(broke, entries[0].id, 'fix'), /资金不足/);
  assert.equal(ai.respondAiChallenge(broke, entries[0].id, 'fix'), broke);
  assert.equal(ai.respondAiChallenge(broke, entries[0].id, 'ignore').competition.feed.find(e => e.id === entries[0].id).response, 'ignore');
  assert.equal(ai.respondAiChallenge(s, 'missing', 'fix'), s);
  const nextSeason = { ...before, turn: 4 }; const expired = next(nextSeason);
  assert.equal(expired.competition.feed.find(e => e.id === entries[0].id).response, 'expired', 'Responses cannot be stockpiled for free actions many quarters later');
});

test('three difficulty levels are deterministic, routine play is contested and advanced routes remain winnable', () => {
  const counts = {};
  for (const difficulty of ['relaxed', 'standard', 'hard']) {
    let wins = 0;
    for (const company of content.AI_COMPANIES) for (let seed = 1; seed <= 20; seed++) {
      const s = aiPilot(seed, company.style, 'safe', [], company.id, difficulty);
      assert.ok(s.ending, `${difficulty}/${company.id}/${seed} must terminate`);
      wins += !!s.ending.won;
    }
    counts[difficulty] = wins;
  }
  assert.ok(counts.relaxed > counts.standard + 25, JSON.stringify(counts));
  assert.ok(counts.standard > counts.hard, JSON.stringify(counts));
  assert.ok(counts.standard > 0 && counts.standard < counts.relaxed * 0.75, JSON.stringify(counts));
  const advanced = {};
  for (const difficulty of ['standard', 'hard']) {
    advanced[difficulty] = 0;
    for (const company of content.AI_STARTER_COMPANIES) {
      let wins = 0;
      for (let seed = 1; seed <= 50; seed++) {
        const s = aiCompetitivePilot(seed, company, difficulty);
        assert.ok(s.ending); wins += !!s.ending.won;
        if (seed === 5) assert.deepEqual(aiCompetitivePilot(seed, company, difficulty), s);
      }
      assert.ok(wins > 0 && wins < 50, `${difficulty}/${company} needs both wins and losses: ${wins}/50`);
      advanced[difficulty] += wins;
    }
  }
  assert.ok(advanced.standard >= 80 && advanced.standard < 180, JSON.stringify(advanced));
  assert.ok(advanced.hard >= 20 && advanced.hard < advanced.standard, JSON.stringify(advanced));
});
