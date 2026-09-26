import {
  canUpgrade,
  CanalGameState,
  connectedFactories,
  coordinates,
  createGame,
  frontier,
  GameAction,
  offersForWeek,
  PORT,
  shipmentQuote,
  TERRAIN_INFO,
  TilePreview,
  UPGRADE_INFO,
  Upgrade,
  Vessel,
} from './engine';

export const COMPETITION_ROUNDS = 14;
export const DIG_SLOTS = 2;
export const TENDER_REWARD = 8;
export const PRIORITY_PREMIUM = 14;

export type TenderId = 'rock' | 'factory' | 'earthwork' | 'ecology' | 'heavy' | 'early';

export const TENDERS: Record<TenderId, { name: string; condition: string; reward: number }> = {
  rock: { name: '山岭攻坚', condition: '率先开挖山体', reward: TENDER_REWARD },
  factory: { name: '工业支线', condition: '率先接入工厂', reward: TENDER_REWARD },
  earthwork: { name: '土方循环', condition: '率先运土复垦', reward: TENDER_REWARD },
  ecology: { name: '生态连通', condition: '率先建成动物通道或鱼道', reward: TENDER_REWARD },
  heavy: { name: '重货首航', condition: '率先用大船承运工厂货', reward: TENDER_REWARD },
  early: { name: '提前通航', condition: '第 5 轮前贯通海港', reward: 10 },
};

const TENDER_IDS = Object.keys(TENDERS) as TenderId[];

export function constructionPrestige(preview: TilePreview, opened: boolean): number {
  return 1 + Math.floor(preview.cost / 3) + preview.factoryNames.length * 2 + (opened ? 3 : 0);
}

export function upgradePrestige(upgrade: Upgrade): number {
  return upgrade === 'water-saving' ? 3 : 2;
}

export interface Contractor {
  id: number;
  name: string;
  kind: 'human' | 'ai';
  cash: number;
  prestige: number;
  awards: number;
  dividends: number;
  variety: number;
  servedOffers: string[];
  tons: number;
  contracts: number;
  financed: boolean;
}

export type CompetitionAction = GameAction | { type: 'pass' };

export interface CompetitionState {
  project: CanalGameState;
  players: Contractor[];
  round: number;
  order: number[];
  turnIndex: number;
  digsThisRound: number;
  takenOffers: string[];
  priorityOfferId: string | null;
  segmentOwners: Partial<Record<number, number>>;
  upgradeOwners: Partial<Record<Upgrade, number>>;
  tenders: TenderId[];
  tenderClaims: Partial<Record<TenderId, number>>;
  finished: boolean;
  message: string;
  history: string[];
}

function turnOrder(round: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => (round - 1 + index) % count);
}

function priorityOffer(project: CanalGameState, round: number): string | null {
  const offers = offersForWeek(project, 2);
  if (!offers.length) return null;
  const pool = round % 3 === 0 ? offers : offers.filter((offer) => !offer.factoryId);
  return pool[(project.seed + round) % pool.length]?.id ?? null;
}

export function createCompetition(humans = 1, ais = 2, seed = 1): CompetitionState {
  const players: Contractor[] = Array.from({ length: humans + ais }, (_, index) => ({
    id: index,
    name: index < humans ? `承包商 ${index + 1}` : `AI 承包商 ${index - humans + 1}`,
    kind: index < humans ? 'human' : 'ai',
    cash: 18,
    prestige: 0,
    awards: 0,
    dividends: 0,
    variety: 0,
    servedOffers: [],
    tons: 0,
    contracts: 0,
    financed: false,
  }));
  return {
    project: { ...createGame(seed), water: 4 },
    players,
    round: 1,
    order: turnOrder(1, players.length),
    turnIndex: 0,
    digsThisRound: 0,
    takenOffers: [],
    priorityOfferId: null,
    segmentOwners: {},
    upgradeOwners: {},
    tenders: Array.from({ length: 3 }, (_, index) => TENDER_IDS[(seed - 1 + index) % TENDER_IDS.length]),
    tenderClaims: {},
    finished: false,
    message: '共建同一条航道。每轮两次开挖机会，先行动者先选。',
    history: [],
  };
}

export function activeContractor(state: CompetitionState): Contractor {
  return state.players[state.order[state.turnIndex]];
}

export function contractorScore(player: Contractor): number {
  return player.cash + player.prestige * 2 + player.awards + player.dividends + player.variety
    + Math.floor(player.tons / 1000) * 2 - (player.financed ? 10 : 0);
}

function tenderOpen(state: CompetitionState, id: TenderId): boolean {
  return state.tenders.includes(id) && state.tenderClaims[id] === undefined;
}

export function openTenderReward(state: CompetitionState, id: TenderId): number {
  return tenderOpen(state, id) ? TENDERS[id].reward : 0;
}

export function competitionFrontier(state: CompetitionState) {
  if (state.finished || state.digsThisRound >= DIG_SLOTS) return [];
  return frontier({ ...state.project, cash: activeContractor(state).cash });
}

export function competitionOffers(state: CompetitionState) {
  if (state.finished) return [];
  const offers = offersForWeek(state.project, 2);
  return offers
    .filter((offer) => !state.takenOffers.includes(offer.id))
    .map((offer) => ({ ...offer, premium: offer.id === state.priorityOfferId ? PRIORITY_PREMIUM : 0 }))
    .sort((a, b) => b.premium - a.premium);
}

function nextTurn(state: CompetitionState, project: CanalGameState, player: Contractor, message: string, dig = false, offerId?: string, events: TenderId[] = [], dividendAwards: Record<number, number> = {}): CompetitionState {
  const claimed = events.filter((id) => tenderOpen(state, id));
  const awarded = claimed.reduce((sum, id) => sum + TENDERS[id].reward, 0);
  const rewardedPlayer = { ...player, awards: player.awards + awarded };
  const tenderClaims = { ...state.tenderClaims };
  claimed.forEach((id) => { tenderClaims[id] = player.id; });
  const eventMessage = claimed.length ? `${message} · 完成委托：${claimed.map((id) => TENDERS[id].name).join('、')}，+${awarded} 分。` : message;
  const players = state.players.map((item) => {
    const updated = item.id === player.id ? rewardedPlayer : item;
    return { ...updated, dividends: updated.dividends + (dividendAwards[item.id] ?? 0) };
  });
  const history = [eventMessage, ...state.history].slice(0, 8);
  const turnIndex = state.turnIndex + 1;
  const digsThisRound = state.digsThisRound + (dig ? 1 : 0);
  const takenOffers = offerId ? [...state.takenOffers, offerId] : state.takenOffers;
  const priorityOfferId = state.priorityOfferId ?? priorityOffer(project, state.round);
  if (turnIndex < players.length) {
    return { ...state, project, players, turnIndex, digsThisRound, takenOffers, priorityOfferId, tenderClaims, message: eventMessage, history };
  }
  const round = state.round + 1;
  const finished = round > COMPETITION_ROUNDS;
  const nextProject = {
    ...project,
    week: round,
    phase: finished ? 'finished' as const : project.phase,
    water: project.phase === 'operating' && !finished ? Math.min(4, project.water + (players.length === 1 ? 2 : 3)) : project.water,
  };
  return {
    ...state,
    project: nextProject,
    players,
    round,
    order: turnOrder(round, players.length),
    turnIndex: 0,
    digsThisRound: 0,
    takenOffers: [],
    priorityOfferId: finished ? null : priorityOffer(nextProject, round),
    tenderClaims,
    finished,
    message: finished ? `${eventMessage} · 工程期结束，按收益与声望结算。` : `${eventMessage} · 进入第 ${round} 轮。`,
    history,
  };
}

export function applyCompetitionAction(state: CompetitionState, action: CompetitionAction): CompetitionState {
  if (state.finished) return state;
  const player = activeContractor(state);
  const { project } = state;
  const prefix = `${player.name}：`;

  if (action.type === 'dig') {
    const preview = competitionFrontier(state).find((item) => item.index === action.index && item.affordable);
    if (!preview) return state;
    const route = [...project.route, action.index];
    const opened = action.index === PORT;
    const usedSoil = preview.terrain === 'lowland' && preview.soilChange < 0;
    const nextProject = {
      ...project,
      route,
      phase: opened ? 'operating' as const : 'building' as const,
      openedWeek: opened ? state.round : null,
      soil: project.soil + preview.soilChange,
      soilMoved: project.soilMoved + (usedSoil ? 2 : 0),
      impact: project.impact + preview.impact,
    };
    const nextPlayer = {
      ...player,
      cash: player.cash - preview.cost,
      prestige: player.prestige + constructionPrestige(preview, opened),
    };
    const events: TenderId[] = [];
    if (preview.terrain === 'rock') events.push('rock');
    if (preview.factoryNames.length) events.push('factory');
    if (opened && state.round <= 5) events.push('early');
    return nextTurn({ ...state, segmentOwners: { ...state.segmentOwners, [action.index]: player.id } }, nextProject, nextPlayer, `${prefix}承建${TERRAIN_INFO[preview.terrain].name}航段${opened ? '，航道贯通！' : `，获得 ${constructionPrestige(preview, opened)} 声望。`}`, true, undefined, events);
  }

  if (action.type === 'upgrade') {
    if (!canUpgrade({ ...project, cash: player.cash }, action.upgrade)) return state;
    const info = UPGRADE_INFO[action.upgrade];
    return nextTurn({ ...state, upgradeOwners: { ...state.upgradeOwners, [action.upgrade]: player.id } }, {
      ...project,
      upgrades: [...project.upgrades, action.upgrade],
      impact: Math.max(0, project.impact - (action.upgrade === 'water-saving' ? 0 : 2)),
    }, { ...player, cash: player.cash - info.cost, prestige: player.prestige + upgradePrestige(action.upgrade) }, `${prefix}建成${info.name}，所有承包商共享设施。`, false, undefined, action.upgrade === 'water-saving' ? [] : ['ecology']);
  }

  if (action.type === 'transfer-soil') {
    if (project.soil < 3) return state;
    return nextTurn(state, {
      ...project,
      soil: project.soil - 3,
      soilMoved: project.soilMoved + 3,
      impact: Math.max(0, project.impact - 1),
      restored: project.restored + 1,
    }, { ...player, cash: player.cash + 2, prestige: player.prestige + 3 }, `${prefix}转运 3 份土方复垦，获得资金与生态声望。`, false, undefined, ['earthwork']);
  }

  if (action.type === 'bond') {
    if (player.financed) return state;
    return nextTurn(state, project, { ...player, cash: player.cash + 8, financed: true }, `${prefix}融资 ¥8M，结算时扣 10 分。`);
  }

  if (action.type === 'recharge') {
    if (project.phase !== 'operating' || project.water >= 4) return state;
    return nextTurn(state, { ...project, water: Math.min(4, project.water + 2) }, { ...player, prestige: player.prestige + 1 }, `${prefix}维护闸池并补水。`);
  }

  if (action.type === 'pass') {
    return nextTurn(state, project, { ...player, cash: player.cash + 3 }, `${prefix}承接岸线维护，获得 ¥3M。`);
  }

  const offer = competitionOffers(state).find((item) => item.id === action.offerId);
  if (!offer) return state;
  const quote = shipmentQuote(project, offer, action.vessel);
  if (project.water < quote.water) return state;
  const dividendAwards: Record<number, number> = {};
  const ownedSegments: Record<number, number> = {};
  Object.values(state.segmentOwners).forEach((owner) => {
    if (owner !== undefined) ownedSegments[owner] = (ownedSegments[owner] ?? 0) + 1;
  });
  Object.entries(ownedSegments).forEach(([owner, count]) => {
    dividendAwards[Number(owner)] = Math.ceil(count / 2);
  });
  Object.entries(state.upgradeOwners).forEach(([upgrade, owner]) => {
    if (owner === undefined || (upgrade === 'water-saving' && action.vessel !== 'freighter')) return;
    dividendAwards[owner] = (dividendAwards[owner] ?? 0) + 1;
  });
  const firstOfKind = !player.servedOffers.includes(offer.id);
  const varietyGain = firstOfKind ? 4 + (player.servedOffers.length === 2 ? 8 : 0) : 0;
  return nextTurn(state, {
    ...project,
    water: project.water - quote.water,
    deliveries: [...project.deliveries, { week: state.round, cargo: offer.cargo, tons: quote.tons, revenue: quote.revenue, factoryId: offer.factoryId }],
    lastShipped: offer.factoryId ? { ...project.lastShipped, [offer.factoryId]: state.round } : project.lastShipped,
  }, {
    ...player,
    cash: player.cash + quote.revenue + offer.premium,
    variety: player.variety + varietyGain,
    servedOffers: firstOfKind ? [...player.servedOffers, offer.id] : player.servedOffers,
    tons: player.tons + quote.tons,
    contracts: player.contracts + 1,
  }, `${prefix}抢得${offer.cargo}货单，收入 ¥${quote.revenue + offer.premium}M${varietyGain ? `，货种奖励 +${varietyGain} 分` : ''}；承建者取得航运分红。`, false, offer.id, offer.factoryId && action.vessel === 'freighter' ? ['heavy'] : [], dividendAwards);
}

export function chooseAiAction(state: CompetitionState): CompetitionAction {
  const player = activeContractor(state);
  const available = competitionFrontier(state).filter((tile) => tile.affordable);
  const remainingRounds = COMPETITION_ROUNDS - state.round;
  const expectedShipments = remainingRounds * (state.players.length >= 3 ? 1.7 : 1.1);
  const upgrades = (['water-saving', 'fishway', 'wildlife'] as const)
    .filter((upgrade) => canUpgrade({ ...state.project, cash: player.cash }, upgrade))
    .map((upgrade) => ({
      upgrade,
      value: upgradePrestige(upgrade) * 2 - UPGRADE_INFO[upgrade].cost
        + expectedShipments + (upgrade === 'water-saving' ? remainingRounds * (state.players.length >= 3 ? 2.5 : 1) : 0)
        + (upgrade !== 'water-saving' && tenderOpen(state, 'ecology') ? TENDERS.ecology.reward : 0),
    }))
    .sort((a, b) => b.value - a.value);
  const bestUpgrade = upgrades[0];
  if (state.project.soil >= 3 && tenderOpen(state, 'earthwork')) return { type: 'transfer-soil' };
  if (state.project.phase === 'building' && available.length) {
    const ranked = [...available].sort((a, b) => {
      const rank = (tile: typeof a) => {
        const { y } = coordinates(tile.index);
        return tile.cost - constructionPrestige(tile, tile.index === PORT) * 1.7 + tile.impact * 1.6
          + (tile.bend ? 1.5 : 0) - tile.soilChange * 0.7
          - tile.factoryNames.length * (tenderOpen(state, 'factory') ? 9 : 6)
          - (tile.terrain === 'rock' && tenderOpen(state, 'rock') ? 8 : 0)
          + Math.abs(3 - y) * 0.3 + ((state.project.seed + player.id + tile.index) % 3) * 0.2;
      };
      return rank(a) - rank(b);
    });
    if (bestUpgrade && bestUpgrade.value > 19 && ranked[0].cost >= 4) return { type: 'upgrade', upgrade: bestUpgrade.upgrade };
    return { type: 'dig', index: ranked[0].index };
  }
  if (state.project.phase === 'operating') {
    const shipments = competitionOffers(state).flatMap((offer) => (['freighter', 'barge'] as Vessel[])
      .map((vessel) => ({ offer, vessel, quote: shipmentQuote(state.project, offer, vessel) })))
      .filter((item) => item.quote.water <= state.project.water)
      .sort((a, b) => {
        const value = (item: typeof a) => item.quote.revenue + item.offer.premium + item.quote.tons / 500
          + (player.servedOffers.includes(item.offer.id) ? 0 : 4 + (player.servedOffers.length === 2 ? 8 : 0))
          + (item.offer.factoryId && item.vessel === 'freighter' && tenderOpen(state, 'heavy') ? TENDERS.heavy.reward : 0);
        return value(b) - value(a);
      });
    if (bestUpgrade && bestUpgrade.value > (shipments[0]?.quote.revenue ?? 0) + (shipments[0]?.offer.premium ?? 0) + (shipments[0]?.quote.tons ?? 0) / 500 + 3) {
      return { type: 'upgrade', upgrade: bestUpgrade.upgrade };
    }
    if (shipments.length) return { type: 'ship', offerId: shipments[0].offer.id, vessel: shipments[0].vessel };
  }
  if (state.project.soil >= 3) return { type: 'transfer-soil' };
  if (state.project.phase === 'building' && state.digsThisRound < DIG_SLOTS && !player.financed
    && frontier({ ...state.project, cash: Number.POSITIVE_INFINITY }).some((tile) => tile.cost > player.cash)) return { type: 'bond' };
  if (bestUpgrade) return { type: 'upgrade', upgrade: bestUpgrade.upgrade };
  if (state.project.phase === 'operating' && state.project.water < 4) return { type: 'recharge' };
  return { type: 'pass' };
}

export function competitionSummary(state: CompetitionState) {
  return {
    round: state.round,
    phase: state.project.phase,
    finished: state.finished,
    activePlayer: state.finished ? null : activeContractor(state).name,
    digsRemaining: DIG_SLOTS - state.digsThisRound,
    frontier: state.finished ? [] : competitionFrontier(state),
    route: state.project.route,
    connectedFactories: connectedFactories(state.project.route).map((factory) => factory.name),
    soil: state.project.soil,
    impact: state.project.impact,
    water: state.project.water,
    upgrades: state.project.upgrades,
    segmentOwners: state.segmentOwners,
    upgradeOwners: state.upgradeOwners,
    offers: competitionOffers(state),
    priorityOfferId: state.priorityOfferId,
    tenders: state.tenders.map((id) => ({ id, ...TENDERS[id], claimedBy: state.tenderClaims[id] ?? null })),
    players: state.players.map((player) => ({ ...player, score: contractorScore(player) })),
    message: state.message,
  };
}
