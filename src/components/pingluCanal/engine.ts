export const COLS = 9;
export const ROWS = 6;
export const MAX_WEEKS = 20;
export const START = 3 * COLS;
export const PORT = 3 * COLS + 8;

export type Terrain = 'field' | 'river' | 'rock' | 'lowland' | 'wetland' | 'factory' | 'start' | 'port';
export type Phase = 'building' | 'operating' | 'finished';
export type Upgrade = 'wildlife' | 'fishway' | 'water-saving';
export type Vessel = 'barge' | 'freighter';
export type Grade = 'S' | 'A' | 'B' | 'C' | '-';

export interface Factory {
  id: 'steel' | 'machinery' | 'grain';
  name: string;
  shortName: string;
  cargo: string;
  origin: string;
  destination: string;
  index: number;
  price: number;
  offset: number;
}

export interface Offer {
  id: string;
  factoryId: Factory['id'] | null;
  cargo: string;
  origin: string;
  destination: string;
  price: number;
}

export interface Delivery {
  week: number;
  cargo: string;
  tons: number;
  revenue: number;
  factoryId: Factory['id'] | null;
}

export interface TilePreview {
  index: number;
  terrain: Terrain;
  cost: number;
  soilChange: number;
  impact: number;
  bend: boolean;
  factoryNames: string[];
  affordable: boolean;
}

export interface CanalGameState {
  seed: number;
  terrain: Terrain[];
  week: number;
  phase: Phase;
  route: number[];
  openedWeek: number | null;
  cash: number;
  soil: number;
  soilMoved: number;
  impact: number;
  water: number;
  upgrades: Upgrade[];
  deliveries: Delivery[];
  lastShipped: Partial<Record<Factory['id'], number>>;
  bondsUsed: boolean;
  restored: number;
  lastMessage: string;
  score: number | null;
  grade: Grade | null;
}

export type GameAction =
  | { type: 'dig'; index: number }
  | { type: 'upgrade'; upgrade: Upgrade }
  | { type: 'transfer-soil' }
  | { type: 'bond' }
  | { type: 'ship'; offerId: string; vessel: Vessel }
  | { type: 'recharge' };

const MAPS: Terrain[][][] = [
  [
    ['field', 'field', 'field', 'field', 'rock', 'field', 'field', 'field', 'field'],
    ['river', 'river', 'factory', 'rock', 'rock', 'field', 'factory', 'field', 'field'],
    ['river', 'field', 'river', 'rock', 'rock', 'wetland', 'wetland', 'field', 'river'],
    ['start', 'river', 'field', 'rock', 'rock', 'lowland', 'river', 'river', 'port'],
    ['field', 'river', 'lowland', 'field', 'rock', 'wetland', 'field', 'field', 'river'],
    ['field', 'field', 'lowland', 'field', 'field', 'factory', 'field', 'field', 'field'],
  ],
  [
    ['field', 'field', 'field', 'field', 'rock', 'field', 'field', 'field', 'field'],
    ['river', 'river', 'factory', 'rock', 'field', 'field', 'factory', 'field', 'field'],
    ['river', 'river', 'river', 'rock', 'rock', 'wetland', 'field', 'river', 'river'],
    ['start', 'field', 'lowland', 'rock', 'rock', 'river', 'wetland', 'river', 'port'],
    ['field', 'river', 'lowland', 'field', 'rock', 'wetland', 'field', 'river', 'river'],
    ['field', 'field', 'lowland', 'field', 'field', 'factory', 'field', 'field', 'field'],
  ],
  [
    ['field', 'field', 'field', 'rock', 'rock', 'field', 'field', 'field', 'field'],
    ['river', 'river', 'factory', 'field', 'rock', 'field', 'factory', 'river', 'field'],
    ['river', 'field', 'river', 'field', 'rock', 'wetland', 'river', 'field', 'river'],
    ['start', 'river', 'lowland', 'rock', 'rock', 'lowland', 'river', 'river', 'port'],
    ['field', 'river', 'field', 'rock', 'field', 'wetland', 'field', 'field', 'river'],
    ['field', 'field', 'lowland', 'field', 'field', 'factory', 'field', 'field', 'field'],
  ],
];

export const FACTORIES: Factory[] = [
  { id: 'steel', name: '南宁钢厂', shortName: '钢厂', cargo: '钢卷', origin: '南宁钢厂', destination: '钦州港', index: 1 * COLS + 2, price: 25, offset: 0 },
  { id: 'machinery', name: '装备制造厂', shortName: '装备厂', cargo: '工程机械', origin: '装备制造厂', destination: '北部湾港', index: 1 * COLS + 6, price: 27, offset: 2 },
  { id: 'grain', name: '粮食加工厂', shortName: '粮厂', cargo: '粮食', origin: '粮食加工厂', destination: '北部湾港', index: 5 * COLS + 5, price: 23, offset: 4 },
];

export const UPGRADE_INFO: Record<Upgrade, { name: string; cost: number; effect: string }> = {
  wildlife: { name: '动物通道', cost: 3, effect: '消除迁徙带影响 2' },
  fishway: { name: '鱼道', cost: 4, effect: '消除船闸阻隔影响 2' },
  'water-saving': { name: '省水闸池', cost: 6, effect: '5000 吨船每航次少用 1 水' },
};

export const TERRAIN_INFO: Record<Terrain, { name: string; cost: number }> = {
  field: { name: '平地', cost: 2 },
  river: { name: '原有河道', cost: 1 },
  rock: { name: '山体', cost: 4 },
  lowland: { name: '低洼地', cost: 2 },
  wetland: { name: '湿地', cost: 3 },
  factory: { name: '工厂', cost: 0 },
  start: { name: '西江', cost: 0 },
  port: { name: '北部湾港', cost: 0 },
};

export function coordinates(index: number) {
  return { x: index % COLS, y: Math.floor(index / COLS) };
}

function manhattan(a: number, b: number): number {
  const from = coordinates(a);
  const to = coordinates(b);
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

export function connectedFactories(route: readonly number[]): Factory[] {
  return FACTORIES.filter((factory) => route.some((index) => manhattan(index, factory.index) === 1));
}

export function createGame(seed = 1): CanalGameState {
  return {
    seed,
    terrain: MAPS[(seed - 1) % MAPS.length].flat(),
    week: 1,
    phase: 'building',
    route: [START],
    openedWeek: null,
    cash: 28,
    soil: 0,
    soilMoved: 0,
    impact: 0,
    water: 3,
    upgrades: [],
    deliveries: [],
    lastShipped: {},
    bondsUsed: false,
    restored: 0,
    lastMessage: '从西江端选择相邻格，逐段把航道接到海港。',
    score: null,
    grade: null,
  };
}

function previewTile(state: CanalGameState, index: number): TilePreview {
  const terrain = state.terrain[index];
  const { x, y } = coordinates(index);
  const bend = y !== coordinates(state.route[state.route.length - 1]).y;
  const firstMigrationCrossing = x === 3 && !state.route.some((cell) => coordinates(cell).x === 3);
  const firstLockCrossing = x === 4 && !state.route.some((cell) => coordinates(cell).x === 4);
  const needsImportedFill = terrain === 'lowland' && state.soil < 2;
  const cost = TERRAIN_INFO[terrain].cost + (firstLockCrossing ? 3 : 0) + (needsImportedFill ? 4 : 0) + (bend ? 1 : 0);
  const soilChange = terrain === 'rock' ? 2 : terrain === 'field' ? 1 : terrain === 'lowland' && !needsImportedFill ? -2 : 0;
  const impact = (firstMigrationCrossing ? 2 : 0) + (firstLockCrossing ? 2 : 0) + (terrain === 'wetland' ? 2 : 0);
  const before = new Set(connectedFactories(state.route).map((factory) => factory.id));
  const factoryNames = connectedFactories([...state.route, index])
    .filter((factory) => !before.has(factory.id))
    .map((factory) => factory.name);
  return { index, terrain, cost, soilChange, impact, bend, factoryNames, affordable: state.cash >= cost };
}

export function frontier(state: CanalGameState): TilePreview[] {
  if (state.phase !== 'building') return [];
  const tip = state.route[state.route.length - 1];
  const { x, y } = coordinates(tip);
  if (x >= COLS - 1) return [];
  const nextColumn = x + 1;
  const rows = nextColumn === COLS - 1 ? [3] : [2, 3, 4];
  return rows
    .filter((row) => Math.abs(row - y) <= 1)
    .map((row) => row * COLS + nextColumn)
    .filter((index) => state.terrain[index] !== 'factory')
    .map((index) => previewTile(state, index));
}

export function canUpgrade(state: CanalGameState, upgrade: Upgrade): boolean {
  if (state.phase === 'finished' || state.upgrades.includes(upgrade) || state.cash < UPGRADE_INFO[upgrade].cost) return false;
  const crossed = state.route.some((index) => coordinates(index).x === (upgrade === 'wildlife' ? 3 : 4));
  return crossed;
}

const MARKET_SWING = [0, 2, -1, 3, 1, -2];

export function offersForWeek(state: CanalGameState, factoryCooldown = 3): Offer[] {
  if (state.phase !== 'operating') return [];
  const cycle = (state.week + state.seed) % MARKET_SWING.length;
  const common: Offer[] = [
    { id: 'river', factoryId: null, cargo: '西江杂货', origin: '南宁码头', destination: '北部湾港', price: 9 + MARKET_SWING[cycle] },
    { id: 'imports', factoryId: null, cargo: '港口原料', origin: '钦州港', destination: '南宁码头', price: 8 + MARKET_SWING[(cycle + 3) % MARKET_SWING.length] },
  ];
  const industry = connectedFactories(state.route)
    .filter((factory) => state.lastShipped[factory.id] === undefined || state.week - (state.lastShipped[factory.id] ?? 0) >= factoryCooldown)
    .map((factory) => ({
      id: factory.id,
      factoryId: factory.id,
      cargo: factory.cargo,
      origin: factory.origin,
      destination: factory.destination,
      price: factory.price + MARKET_SWING[(cycle + factory.offset) % MARKET_SWING.length],
    }));
  return [...industry, ...common];
}

export function shipmentQuote(state: CanalGameState, offer: Offer, vessel: Vessel) {
  const tons = vessel === 'freighter' ? 5000 : 2000;
  const water = vessel === 'freighter' ? (state.upgrades.includes('water-saving') ? 1 : 2) : 1;
  const bends = state.route.slice(1).filter((index, position) => coordinates(index).y !== coordinates(state.route[position]).y).length;
  const distance = Math.floor(bends / 2);
  const ecologicalCost = Math.floor(state.impact / 2);
  const base = vessel === 'freighter' ? offer.price : Math.ceil(offer.price * 0.52);
  const revenue = Math.max(1, base - distance - ecologicalCost);
  return { tons, water, revenue, distance, ecologicalCost };
}

export function scoreGame(state: CanalGameState): number {
  if (!state.route.includes(PORT)) return 0;
  const tons = state.deliveries.reduce((total, delivery) => total + delivery.tons, 0);
  const ecologicalScore = Math.max(0, 10 - state.impact) * 3;
  const factoryScore = connectedFactories(state.route).length * 5;
  return Math.max(0, state.cash + Math.floor(tons / 1000) * 2 + ecologicalScore
    + factoryScore + state.soilMoved + state.restored * 3 - state.soil * 2 - (state.bondsUsed ? 4 : 0));
}

function gradeFor(score: number, opened: boolean): Grade {
  if (!opened) return '-';
  if (score >= 155) return 'S';
  if (score >= 120) return 'A';
  if (score >= 85) return 'B';
  return 'C';
}

function endWeek(state: CanalGameState, message: string, naturalInflow = true): CanalGameState {
  const next = {
    ...state,
    week: state.week + 1,
    water: state.phase === 'operating' && naturalInflow ? Math.min(3, state.water + 1) : state.water,
    lastMessage: message,
  };
  if (next.week <= MAX_WEEKS) return next;
  const score = scoreGame(next);
  return { ...next, phase: 'finished', score, grade: gradeFor(score, next.route.includes(PORT)) };
}

export function applyAction(state: CanalGameState, action: GameAction): CanalGameState {
  if (state.phase === 'finished') return state;

  if (action.type === 'dig') {
    const preview = frontier(state).find((item) => item.index === action.index && item.affordable);
    if (!preview) return state;
    const route = [...state.route, action.index];
    const opened = action.index === PORT;
    const usedLocalSoil = preview.terrain === 'lowland' && preview.soilChange === -2;
    return endWeek({
      ...state,
      route,
      phase: opened ? 'operating' : 'building',
      openedWeek: opened ? state.week : null,
      cash: state.cash - preview.cost,
      soil: state.soil + preview.soilChange,
      soilMoved: state.soilMoved + (usedLocalSoil ? 2 : 0),
      impact: state.impact + preview.impact,
    }, opened
      ? `第 ${state.week} 周贯通北部湾！工厂与海港之间的订单开始到港。`
      : `开挖${TERRAIN_INFO[preview.terrain].name}，耗资 ${preview.cost}，${preview.factoryNames.length ? `接入${preview.factoryNames.join('、')}` : '施工前沿继续推进'}。`);
  }

  if (action.type === 'upgrade') {
    if (!canUpgrade(state, action.upgrade)) return state;
    const info = UPGRADE_INFO[action.upgrade];
    return endWeek({
      ...state,
      cash: state.cash - info.cost,
      impact: Math.max(0, state.impact - (action.upgrade === 'water-saving' ? 0 : 2)),
      upgrades: [...state.upgrades, action.upgrade],
    }, `${info.name}建成。 ${info.effect}。`);
  }

  if (action.type === 'transfer-soil') {
    if (state.soil < 3) return state;
    return endWeek({
      ...state,
      soil: state.soil - 3,
      soilMoved: state.soilMoved + 3,
      cash: state.cash + 2,
      impact: Math.max(0, state.impact - 1),
      restored: state.restored + 1,
    }, '将 3 份开挖土方转运回填低洼地，减少弃土并恢复岸线。');
  }

  if (action.type === 'bond') {
    if (state.bondsUsed) return state;
    return endWeek({ ...state, cash: state.cash + 9, bondsUsed: true }, '协调追加工程款 9，期末需偿付融资成本。');
  }

  if (action.type === 'recharge') {
    if (state.phase !== 'operating' || state.water >= 3) return state;
    return endWeek({ ...state, water: Math.min(3, state.water + 2) }, '船闸停航补水，闸池水量回升。', false);
  }

  if (state.phase !== 'operating') return state;
  const offer = offersForWeek(state).find((item) => item.id === action.offerId);
  if (!offer) return state;
  const quote = shipmentQuote(state, offer, action.vessel);
  if (state.water < quote.water) return state;
  const delivery: Delivery = {
    week: state.week,
    cargo: offer.cargo,
    tons: quote.tons,
    revenue: quote.revenue,
    factoryId: offer.factoryId,
  };
  return endWeek({
    ...state,
    cash: state.cash + quote.revenue,
    water: state.water - quote.water,
    deliveries: [...state.deliveries, delivery],
    lastShipped: offer.factoryId ? { ...state.lastShipped, [offer.factoryId]: state.week } : state.lastShipped,
  }, `第 ${state.week} 周：${quote.tons} 吨${offer.cargo}抵港，收入 ${quote.revenue}。`);
}

export function publicGameState(state: CanalGameState) {
  return {
    coordinateSystem: 'origin top-left; index = y * 9 + x',
    terrain: state.terrain,
    phase: state.phase,
    week: state.week,
    route: state.route,
    frontier: frontier(state),
    connectedFactories: connectedFactories(state.route).map(({ id, name }) => ({ id, name })),
    cash: state.cash,
    bondsUsed: state.bondsUsed,
    soil: state.soil,
    soilMoved: state.soilMoved,
    impact: state.impact,
    water: state.water,
    upgrades: state.upgrades,
    offers: offersForWeek(state),
    deliveredTons: state.deliveries.reduce((sum, delivery) => sum + delivery.tons, 0),
    score: state.score,
    grade: state.grade,
    lastMessage: state.lastMessage,
  };
}
