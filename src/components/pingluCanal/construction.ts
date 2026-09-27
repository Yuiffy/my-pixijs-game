/** Shared construction simulation. Plans are private; settlement is independent of seat order. */
export const MAX_ROUNDS = 10;
export const WORKERS = 3;
export const SOLO_TARGET = 180;
export const SAVE_VERSION = 1;
export type Region = 'upper' | 'middle' | 'lower';
export type Specialty = 'engineering' | 'ecology' | 'logistics';
export type Equipment = 'excavator' | 'hauler' | 'surveyor';
export type ProjectKind = 'channel' | 'rock' | 'lock' | 'fill' | 'bridge' | 'wildlife' | 'fishway' | 'saving' | 'wetland';
export type Cell = readonly [number, number];
export interface Project {
  id: string; name: string; short: string; region: Region; kind: ProjectKind;
  cells: readonly Cell[]; at: Cell; main: boolean; required: boolean;
  cost: number; reward: number; description: string; dependencies: string[];
}
export const REGIONS: Record<Region, { name: string; color: string }> = {
  upper: { name: '上游山岭区', color: '#bb9561' }, middle: { name: '中部枢纽区', color: '#788f79' }, lower: { name: '下游港湾区', color: '#719eaa' },
};
export const REGION_IDS = Object.keys(REGIONS) as Region[];
export const SPECIALTIES: Record<Specialty, { name: string; description: string }> = {
  engineering: { name: '工程先锋', description: '参与至少 5 个不同工程，累计施工贡献达到 10。' },
  ecology: { name: '生态专家', description: '参与至少 2 项已建成生态工程，完成 2 次验收。' },
  logistics: { name: '土方能手', description: '累计运输 4 份自产土方，参与至少 1 个已建成回填工程。' },
};
export const EQUIPMENT: Record<Equipment, { name: string; cost: number; detail: string }> = {
  excavator: { name: '重型掘进机', cost: 7, detail: '河道、山岭每次施工 +1 工作量，仅多付 ¥1；切山多产土。' },
  hauler: { name: '土方车队', cost: 6, detail: '每次运 2 土方可完成 3 工作量；普通运输完成 2。' },
  surveyor: { name: '测量试验室', cost: 5, detail: '每次验收少用 1 水、少花 ¥1；费用最低为 0。' },
};
export const EQUIPMENT_IDS = Object.keys(EQUIPMENT) as Equipment[];
export const PROJECTS: readonly Project[] = [
  { id: 'A', name: '平塘入江段', short: '入江段', region: 'upper', kind: 'channel', cells: [[0, 4], [1, 4], [2, 4]], at: [1, 4], main: true, required: true, cost: 2, reward: 5, description: '疏浚原有河道，便宜、见效快；连接西江的第一段。', dependencies: [] },
  { id: 'B', name: '青年山切方', short: '山岭切方', region: 'upper', kind: 'rock', cells: [[2, 3], [2, 2], [3, 2]], at: [2, 2.7], main: true, required: true, cost: 3, reward: 7, description: '每份施工贡献产生 2 土方，可转运至沙坪回填。验收前须建好动物通道。', dependencies: ['wildlife'] },
  { id: 'C', name: '灵山裁弯段', short: '裁弯取直', region: 'upper', kind: 'rock', cells: [[4, 2], [5, 2]], at: [4.5, 2], main: true, required: true, cost: 3, reward: 7, description: '切开河湾内侧山体，让主航道沿直线通过；产出的土方属于出资公司。', dependencies: [] },
  { id: 'D', name: '马道船闸枢纽', short: '船闸枢纽', region: 'middle', kind: 'lock', cells: [[5, 3], [5, 4], [6, 4]], at: [5.2, 3.5], main: true, required: true, cost: 4, reward: 9, description: '分级闸室连接高低水位；需鱼道配套。试水耗 3 水，省水系统建成后只耗 1 水。', dependencies: ['fishway'] },
  { id: 'E', name: '沙坪低地回填', short: '低地回填', region: 'middle', kind: 'fill', cells: [[6, 5], [7, 5], [8, 5]], at: [7, 5], main: true, required: true, cost: 4, reward: 7, description: '外购土方施工昂贵；运输 2 份自产土只花 ¥1，提供至少 2 工作量。', dependencies: [] },
  { id: 'F', name: '长江岭连接段', short: '桥下连接段', region: 'middle', kind: 'channel', cells: [[8, 4], [8, 3], [9, 3]], at: [8.2, 3.6], main: true, required: true, cost: 2, reward: 6, description: '连接上下游工地，验收前需建成跨河桥，恢复两岸交通。', dependencies: ['bridge'] },
  { id: 'G', name: '钦江整治段', short: '钦江段', region: 'lower', kind: 'channel', cells: [[9, 2], [10, 2], [10, 3]], at: [9.8, 2.2], main: true, required: true, cost: 2, reward: 5, description: '整治既有河道，可在上游尚未完工时独立施工、验收。', dependencies: [] },
  { id: 'H', name: '北部湾出海口', short: '出海口', region: 'lower', kind: 'channel', cells: [[10, 4], [11, 4]], at: [10.6, 4], main: true, required: true, cost: 2, reward: 5, description: '打通最后的出海通道；只有所有主标段完成验收，整条运河才合龙。', dependencies: [] },
  { id: 'wildlife', name: '动物迁徙通道', short: '动物通道', region: 'upper', kind: 'wildlife', cells: [], at: [2.4, 1.15], main: false, required: true, cost: 2, reward: 6, description: '绿桥跨越切方带，让山地动物继续迁徙；解锁青年山标段验收。', dependencies: [] },
  { id: 'fishway', name: '船闸洄游鱼道', short: '洄游鱼道', region: 'middle', kind: 'fishway', cells: [], at: [6.25, 2.6], main: false, required: true, cost: 2, reward: 6, description: '阶梯式鱼道绕过船闸，恢复洄游连接；解锁船闸验收。', dependencies: [] },
  { id: 'bridge', name: '两岸交通桥', short: '跨河桥', region: 'middle', kind: 'bridge', cells: [], at: [8.2, 3.25], main: false, required: true, cost: 3, reward: 6, description: '跨过航道恢复道路交通；桥下连接段通过验收的必要配套。', dependencies: [] },
  { id: 'saving', name: '三级省水闸池', short: '省水系统', region: 'middle', kind: 'saving', cells: [], at: [6.5, 3.3], main: false, required: false, cost: 3, reward: 7, description: '循环利用闸室用水，船闸试水从 3 水降至 1 水，并提高联合验收等级。', dependencies: [] },
  { id: 'wetland', name: '旧河湾湿地复垦', short: '湿地复垦', region: 'lower', kind: 'wetland', cells: [], at: [9.6, 5.7], main: false, required: false, cost: 3, reward: 7, description: '用多余土方恢复岸线，运输比外购划算；完成后提高联合验收等级。', dependencies: [] },
];
export const MAIN_PROJECTS = PROJECTS.filter((p) => p.main);
export const PROJECT_IDS = PROJECTS.map((p) => p.id);
export const projectById = (id: string): Project | undefined => PROJECTS.find((p) => p.id === id);
export interface SiteState { work: number; accepted: boolean; contributions: Record<number, number>; inspectors: number[] }
export interface Company {
  id: number; name: string; kind: 'human' | 'ai'; specialty: Specialty;
  cash: number; water: number; soil: Record<string, number>; equipment: Equipment[];
  camps: Record<Region, number>; prestige: number; hauled: number; inspections: number;
}
export type Action =
  | { type: 'build'; project: string }
  | { type: 'haul'; project: string; source: string }
  | { type: 'inspect'; project: string }
  | { type: 'equipment'; equipment: Equipment }
  | { type: 'camp'; region: Region }
  | { type: 'fund' }
  | { type: 'water' };
export interface RoundReport {
  round: number; completed: string[]; accepted: string[];
  companies: { id: number; actions: string[]; spent: number; grants: number; points: number }[];
  crowded: { project: string; offered: number; needed: number }[];
}
export interface ConstructionGame {
  version: number; seed: number; round: number; phase: 'planning' | 'review' | 'finished';
  companies: Company[]; sites: Record<string, SiteState>; plans: Record<number, Action[]>;
  reports: RoundReport[];
}
export interface ActionQuote {
  action: Action; title: string; description: string; cost: number; water: number;
  work: number; soil: number; points: number; error: string | null;
}
export interface PlanPreview {
  company: Company; sites: Record<string, SiteState>; quotes: ActionQuote[]; error: string | null;
  builds: { project: string; work: number }[]; inspections: string[];
}
const round2 = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number): string => Number(n.toFixed(2)).toString();
export const soilTotal = (company: Company): number => Object.values(company.soil).reduce((sum, n) => sum + n, 0);
export const copySites = (sites: ConstructionGame['sites']): ConstructionGame['sites'] => Object.fromEntries(Object.entries(sites).map(([id, site]) => [id, { ...site, contributions: { ...site.contributions }, inspectors: [...site.inspectors] }]));
export function weather(seed: number, round: number) {
  const water = [2, 2, 1, 3, 2, 1, 3, 2, 2, 1][(round - 1 + ((seed - 1) % 3)) % 10];
  return { water, name: water === 1 ? '枯水期' : water === 3 ? '丰水期' : '平水期' };
}
export function createConstruction(humans = 1, ais = 2, seed = 1, specialty: Specialty = 'engineering'): ConstructionGame {
  const h = Math.max(1, Math.min(4, Math.floor(humans) || 1));
  const a = Math.max(0, Math.min(4 - h, Math.floor(ais) || 0));
  const specialties: Specialty[] = ['engineering', 'ecology', 'logistics'];
  return {
    version: SAVE_VERSION,
seed: Math.max(1, Math.floor(seed) || 1),
round: 1,
phase: 'planning',
plans: {},
reports: [],
    companies: Array.from({ length: h + a }, (_, id) => ({
      id,
name: id < h ? (h === 1 ? '你的工程局' : `玩家 ${id + 1}`) : ['山海建设', '青岚工程', '江湾建设'][id - h],
      kind: id < h ? 'human' : 'ai',
specialty: id === 0 ? specialty : specialties[(id + seed) % 3],
      cash: 22,
water: 3,
soil: {},
equipment: [],
camps: { upper: 0, middle: 0, lower: 0 },
prestige: 0,
hauled: 0,
inspections: 0,
    })),
    sites: Object.fromEntries(PROJECTS.map((project) => [project.id, { work: 0, accepted: false, contributions: {}, inspectors: [] }])),
  };
}
export function requiredWork(game: ConstructionGame, project: Project): number {
  const n = game.companies.length;
  return project.main ? n + (project.kind === 'lock' || project.kind === 'rock' ? 1 : 0) : Math.max(1, n - (project.kind === 'saving' ? 0 : 1));
}
export function built(game: ConstructionGame, id: string, sites = game.sites): boolean {
  const project = projectById(id);
  return Boolean(project && sites[id].work >= requiredWork(game, project));
}
export function constructionGrant(game: ConstructionGame, project: Project): number { return requiredWork(game, project) * 3 + 3; }
export function activeCompany(game: ConstructionGame): Company | null {
  if (game.phase !== 'planning') return null;
  return game.companies.find((c) => c.kind === 'human' && !game.plans[c.id]) ?? null;
}
export function allConnected(game: ConstructionGame, sites = game.sites): boolean { return MAIN_PROJECTS.every((p) => sites[p.id].accepted); }
export function readyCount(game: ConstructionGame, sites = game.sites): number { return MAIN_PROJECTS.filter((p) => sites[p.id].accepted).length; }
export function quality(game: ConstructionGame): string {
  if (!allConnected(game)) return '未合龙';
  const extras = ['saving', 'wetland'].filter((id) => built(game, id)).length;
  return extras === 2 ? 'S · 绿色精品工程' : extras === 1 ? 'A · 优质工程' : 'B · 合格工程';
}
export function influence(game: ConstructionGame, company: Company, region: Region, sites = game.sites): number {
  return PROJECTS.filter((p) => p.region === region).reduce((sum, p) => sum + (sites[p.id].contributions[company.id] ?? 0) * (sites[p.id].accepted ? 2 : 1), company.camps[region] * 2);
}
export function regionStandings(game: ConstructionGame, sites = game.sites, companies = game.companies) {
  return REGION_IDS.map((region) => {
    const counts = companies.map((company) => ({ id: company.id, value: influence(game, company, region, sites) }));
    const high = Math.max(...counts.map((c) => c.value));
    const leaders = high > 0 ? counts.filter((c) => c.value === high).map((c) => c.id) : [];
    return { region, counts, leaders, points: leaders.length ? Math.floor(8 / leaders.length) : 0 };
  });
}
export function specialtyProgress(game: ConstructionGame, company: Company, sites = game.sites) {
  const involved = PROJECTS.filter((p) => (sites[p.id].contributions[company.id] ?? 0) > 0);
  const work = involved.reduce((sum, p) => sum + sites[p.id].contributions[company.id], 0);
  let fraction = 0;
  let text = '';
  if (company.specialty === 'engineering') {
    fraction = (Math.min(1, involved.length / 5) + Math.min(1, work / 10)) / 2;
    text = `参与 ${involved.length}/5 工程 · 贡献 ${work}/10`;
  } else if (company.specialty === 'ecology') {
    const eco = involved.filter((p) => ['wildlife', 'fishway', 'saving', 'wetland'].includes(p.kind) && built(game, p.id, sites)).length;
    fraction = (Math.min(1, eco / 2) + Math.min(1, company.inspections / 2)) / 2;
    text = `建成生态项目 ${eco}/2 · 验收 ${company.inspections}/2`;
  } else {
    const fill = involved.some((p) => ['fill', 'wetland'].includes(p.kind) && built(game, p.id, sites));
    fraction = (Math.min(1, company.hauled / 4) + Number(fill)) / 2;
    text = `转运 ${company.hauled}/4 土方 · 回填${fill ? '已完成' : '未完成'}`;
  }
  return { fraction, text, complete: fraction >= 1 };
}
export function scoreCompany(game: ConstructionGame, company: Company) {
  const prestige = Math.floor(company.prestige);
  const cash = Math.floor(company.cash / 3);
  const specialty = specialtyProgress(game, company).complete ? 8 : 0;
  const region = regionStandings(game).reduce((sum, r) => sum + (r.leaders.includes(company.id) ? r.points : 0), 0);
  const acceptance = allConnected(game) ? 5 : 0;
  return { prestige, cash, specialty, region, acceptance, total: prestige + cash + specialty + region + acceptance };
}

export function quoteAction(game: ConstructionGame, company: Company, action: Action, sites = game.sites): ActionQuote {
  const q: ActionQuote = { action, title: '', description: '', cost: 0, water: 0, work: 0, soil: 0, points: 0, error: null };
  if (action.type === 'build' || action.type === 'haul' || action.type === 'inspect') {
    const project = projectById(action.project);
    if (!project) return { ...q, error: '没有这个工地' };
    const site = sites[project.id];
    const done = built(game, project.id, sites);
    if (action.type === 'inspect') {
      q.title = `${project.short} · 验收`;
      q.cost = company.equipment.includes('surveyor') ? 0 : 1;
      const water = project.kind === 'lock' && !built(game, 'saving', sites) ? 3 : 1;
      q.water = Math.min(0, (company.equipment.includes('surveyor') ? 1 : 0) - water);
      q.description = '试水与测量合格后，本段接入公共航道。验收奖励 ¥3、4 分；同轮多人验收则平分。';
      if (!project.main) q.error = '配套设施建成即验收';
      else if (site.accepted) q.error = '已经通过验收';
      else if (!done) q.error = '先完成本段施工';
      else {
        const missing = project.dependencies.filter((id) => !built(game, id, sites));
        if (missing.length) q.error = `先完成${missing.map((id) => projectById(id)!.short).join('、')}`;
      }
      if (!q.error && company.water + q.water < 0) q.error = `需 ${-q.water} 水，可先补水或建设省水系统`;
    } else {
      const remaining = requiredWork(game, project) - site.work;
      if (done) q.error = '本工程已建成，可验收或转往其他工地';
      if (action.type === 'haul') {
        q.title = `运土 → ${project.short}`;
        q.work = Math.max(0, Math.min(remaining, company.equipment.includes('hauler') ? 3 : 2));
        q.cost = 1; q.soil = -2;
        q.description = '从自己的切方库存运出 2 土，替代外购回填；新增贡献同时计入本区承包影响力。';
        if (!['fill', 'wetland'].includes(project.kind)) q.error = '只有低地回填和湿地复垦需要运土';
        else if ((company.soil[action.source] ?? 0) < 2) q.error = '选定堆土场不足 2 土，请先做山体切方';
      } else {
        const boosted = company.equipment.includes('excavator') && ['rock', 'channel'].includes(project.kind);
        q.title = `${project.short} · 施工`;
        q.work = Math.max(0, Math.min(remaining, boosted ? 2 : 1));
        q.cost = Math.max(1, project.cost + (q.work > 1 ? 1 : 0) - company.camps[project.region]);
        q.soil = project.kind === 'rock' ? q.work * 2 : 0;
        q.description = `${project.description} 本工程建成时共有 ¥${constructionGrant(game, project)} 建设款、${project.reward} 分，按全部贡献分配。`;
      }
      q.points = q.work;
    }
  } else if (action.type === 'equipment') {
    const equipment = EQUIPMENT[action.equipment];
    if (!equipment) return { ...q, error: '未知设备' };
    q.title = equipment.name; q.cost = equipment.cost; q.description = equipment.detail;
    if (company.equipment.includes(action.equipment)) q.error = '已经拥有此设备';
  } else if (action.type === 'camp') {
    if (!REGIONS[action.region]) return { ...q, error: '未知区域' };
    q.title = `${REGIONS[action.region].name} · 工区营地`;
    q.cost = 5 + company.camps[action.region] * 2;
    q.description = '本区后续普通施工每次少花 ¥1，影响力 +2；最多两级。';
    if (company.camps[action.region] >= 2) q.error = '本区营地已达两级';
    else if (!PROJECTS.some((p) => p.region === action.region && (sites[p.id].contributions[company.id] ?? 0) > 0)) q.error = '先参与本区域的一项施工';
  } else if (action.type === 'fund') {
    q.title = '承接后勤维护'; q.cost = -4; q.description = '立即得到 ¥4，可用于本轮后续行动。';
  } else if (action.type === 'water') {
    q.title = '补充试验用水'; q.water = Math.min(3, 5 - company.water); q.description = '立即补充 3 水，上限 5，用于标段试水验收。';
    if (q.water === 0) q.error = '试验水已满';
  }
  if (!q.error && company.cash < q.cost) q.error = `还差 ¥${money(q.cost - company.cash)}，可先承接后勤维护`;
  return q;
}
export function previewPlan(game: ConstructionGame, source: Company, actions: Action[]): PlanPreview {
  const company = { ...source, soil: { ...source.soil }, equipment: [...source.equipment], camps: { ...source.camps } };
  const sites = copySites(game.sites);
  const result: PlanPreview = { company, sites, quotes: [], error: null, builds: [], inspections: [] };
  if (actions.length > WORKERS) return { ...result, error: '每轮只有三支工程队' };
  for (const action of actions) {
    const quote = quoteAction(game, company, action, sites);
    if (quote.error) return { ...result, error: quote.error };
    result.quotes.push(quote);
    company.cash = round2(company.cash - quote.cost);
    company.water += quote.water;
    company.prestige += quote.points;
    if (action.type === 'build' || action.type === 'haul') {
      sites[action.project].work += quote.work;
      sites[action.project].contributions[company.id] = (sites[action.project].contributions[company.id] ?? 0) + quote.work;
      result.builds.push({ project: action.project, work: quote.work });
      if (action.type === 'build' && quote.soil > 0) company.soil[action.project] = (company.soil[action.project] ?? 0) + quote.soil;
      if (action.type === 'haul') { company.soil[action.source] -= 2; company.hauled += 2; }
      if (!projectById(action.project)!.main && built(game, action.project, sites)) sites[action.project].accepted = true;
    }
    if (action.type === 'inspect') { sites[action.project].accepted = true; result.inspections.push(action.project); company.inspections += 1; }
    if (action.type === 'equipment') company.equipment.push(action.equipment);
    if (action.type === 'camp') company.camps[action.region] += 1;
  }
  return result;
}
export function resolvePlans(game: ConstructionGame, plans: Record<number, Action[]>): ConstructionGame {
  if (game.phase !== 'planning') return game;
  const results = game.companies.map((company) => previewPlan(game, company, plans[company.id] ?? []));
  if (results.some((result) => result.error || result.quotes.length !== WORKERS)) return game;
  const sites = copySites(game.sites);
  const companies = results.map((r) => r.company);
  const report: RoundReport = { round: game.round, completed: [], accepted: [], companies: [], crowded: [] };
  PROJECTS.forEach((project) => {
    const contributions = results.map((r) => ({ id: r.company.id, work: r.builds.filter((b) => b.project === project.id).reduce((sum, b) => sum + b.work, 0) }));
    const offered = contributions.reduce((sum, c) => sum + c.work, 0);
    const needed = requiredWork(game, project) - sites[project.id].work;
    if (offered > needed && needed > 0) report.crowded.push({ project: project.id, offered, needed });
    contributions.forEach(({ id, work }) => { if (work) sites[project.id].contributions[id] = (sites[project.id].contributions[id] ?? 0) + work; });
    sites[project.id].work = Math.min(requiredWork(game, project), sites[project.id].work + offered);
    if (!built(game, project.id) && built(game, project.id, sites)) {
      report.completed.push(project.id);
      const total = Object.values(sites[project.id].contributions).reduce((sum, n) => sum + n, 0);
      companies.forEach((company) => {
        const share = (sites[project.id].contributions[company.id] ?? 0) / total;
        company.cash = round2(company.cash + constructionGrant(game, project) * share);
        company.prestige = round2(company.prestige + project.reward * share);
      });
      if (!project.main) sites[project.id].accepted = true;
    }
  });
  MAIN_PROJECTS.forEach((project) => {
    const inspectors = results.filter((r) => r.inspections.includes(project.id)).map((r) => r.company.id);
    if (!inspectors.length) return;
    sites[project.id].accepted = true;
    sites[project.id].inspectors = inspectors;
    report.accepted.push(project.id);
    companies.filter((c) => inspectors.includes(c.id)).forEach((company) => {
      company.cash = round2(company.cash + 3 / inspectors.length);
      company.prestige = round2(company.prestige + 4 / inspectors.length);
    });
  });
  report.companies = results.map((result) => {
    const before = game.companies.find((c) => c.id === result.company.id)!;
    const spent = result.quotes.reduce((sum, q) => sum + q.cost, 0);
    return { id: before.id, actions: result.quotes.map((q) => q.title), spent, grants: round2(result.company.cash - before.cash + spent), points: round2(result.company.prestige - before.prestige) };
  });
  const complete = allConnected(game, sites);
  return { ...game, sites, companies, plans: {}, reports: [...game.reports, report], phase: complete || game.round >= MAX_ROUNDS ? 'finished' : 'review' };
}
export function nextRound(game: ConstructionGame): ConstructionGame {
  if (game.phase !== 'review') return game;
  const round = game.round + 1;
  const rain = weather(game.seed, round).water;
  return { ...game, round, phase: 'planning', plans: {}, companies: game.companies.map((c) => ({ ...c, water: Math.min(5, c.water + rain) })) };
}
export function legalActions(game: ConstructionGame, company: Company, sites = game.sites): Action[] {
  const sources = Object.keys(company.soil).filter((id) => company.soil[id] >= 2);
  const actions: Action[] = [
    ...PROJECTS.flatMap((project): Action[] => [
      { type: 'build', project: project.id }, { type: 'inspect', project: project.id },
      ...sources.map((source): Action => ({ type: 'haul', project: project.id, source })),
    ]),
    ...EQUIPMENT_IDS.map((equipment): Action => ({ type: 'equipment', equipment })),
    ...REGION_IDS.map((region): Action => ({ type: 'camp', region })),
    { type: 'fund' }, { type: 'water' },
  ];
  return actions.filter((action) => !quoteAction(game, company, action, sites).error);
}
function aiValue(game: ConstructionGame, original: Company, actions: Action[]): number {
  const result = previewPlan(game, original, actions);
  if (result.error) return -Infinity;
  const { company, sites } = result;
  const remaining = MAX_ROUNDS - game.round;
  let value = company.prestige + company.cash / 3;
  PROJECTS.forEach((project) => {
    const added = (sites[project.id].contributions[company.id] ?? 0) - (game.sites[project.id].contributions[company.id] ?? 0);
    if (added) {
      const total = Object.values(sites[project.id].contributions).reduce((sum, n) => sum + n, 0);
      const completion = built(game, project.id, sites) ? 1 : (game.round < MAX_ROUNDS ? 0.72 : 0);
      const share = (sites[project.id].contributions[company.id] ?? 0) / Math.max(requiredWork(game, project), total);
      value += completion * share * (constructionGrant(game, project) / 3 + project.reward);
      value += added * (project.main ? 0.3 : project.required ? 0.35 : 0.05);
      // Stable preferences create different approaches without seeing sealed plans.
      value += added * (((project.id.charCodeAt(0) + company.id * 5 + game.seed) % 7) / 10);
      if (company.specialty === 'ecology' && ['wildlife', 'fishway', 'saving', 'wetland'].includes(project.kind)) value += added * 0.45;
    }
  });
  value += result.inspections.length * 5;
  value += Math.min(soilTotal(company), 6) * (remaining && (!built(game, 'E', sites) || !built(game, 'wetland', sites)) ? 0.55 : 0);
  value += company.water * (remaining ? 0.15 : 0);
  const objective = specialtyProgress(game, company, sites);
  value += objective.fraction * (remaining ? 5 : 0) + (objective.complete ? (remaining ? 3 : 8) : 0);
  const openRock = PROJECTS.filter((p) => ['channel', 'rock'].includes(p.kind) && !built(game, p.id, sites)).length;
  if (company.equipment.includes('excavator')) value += Math.min(5, openRock) * 1.25;
  if (company.equipment.includes('hauler')) value += (!built(game, 'E', sites) ? 1.5 : 0) + (!built(game, 'wetland', sites) ? 0.7 : 0);
  if (company.equipment.includes('surveyor')) value += (MAIN_PROJECTS.length - readyCount(game, sites)) * 0.35;
  REGION_IDS.forEach((region) => {
    const open = PROJECTS.filter((p) => p.region === region && !built(game, p.id, sites)).length;
    value += company.camps[region] * Math.min(3, open) * 0.4;
  });
  const competitors = game.companies.map((c) => (c.id === company.id ? company : c));
  value += regionStandings(game, sites, competitors).reduce((sum, r) => sum + (r.leaders.includes(company.id) ? r.points * (remaining ? 0.32 : 1) : 0), 0);
  return value;
}
export function chooseAiPlan(game: ConstructionGame, company: Company): Action[] {
  let candidates: { actions: Action[]; value: number }[] = [{ actions: [], value: 0 }];
  for (let step = 0; step < WORKERS; step += 1) {
    candidates = candidates.flatMap(({ actions }) => {
      const result = previewPlan(game, company, actions);
      return legalActions(game, result.company, result.sites).map((action) => {
        const next = [...actions, action];
        return { actions: next, value: aiValue(game, company, next) };
      });
    }).sort((a, b) => b.value - a.value).slice(0, 18);
  }
  return candidates[0]?.actions ?? [{ type: 'fund' }, { type: 'fund' }, { type: 'fund' }];
}
export function submitPlan(game: ConstructionGame, id: number, plan: Action[]): ConstructionGame {
  const company = activeCompany(game);
  if (!company || company.id !== id || plan.length !== WORKERS || previewPlan(game, company, plan).error) return game;
  const plans = { ...game.plans, [id]: plan.map((action) => ({ ...action })) };
  if (game.companies.some((c) => c.kind === 'human' && !plans[c.id])) return { ...game, plans };
  game.companies.filter((c) => c.kind === 'ai').forEach((c) => { plans[c.id] = chooseAiPlan(game, c); });
  return resolvePlans(game, plans);
}
export function gameSummary(game: ConstructionGame, draft: Action[] = []) {
  const current = activeCompany(game);
  const preview = current ? previewPlan(game, current, draft) : null;
  return {
    mode: 'shared-canal-construction',
round: game.round,
phase: game.phase,
activeCompany: current?.id ?? null,
    connected: allConnected(game),
accepted: readyCount(game),
quality: quality(game),
    companies: game.companies.map((c) => ({ ...c, score: scoreCompany(game, c), goal: specialtyProgress(game, c), sealed: Boolean(game.plans[c.id]) })),
    projects: PROJECTS.map((p) => ({ id: p.id, name: p.name, main: p.main, required: p.required, need: requiredWork(game, p), ...game.sites[p.id] })),
    regions: regionStandings(game),
draft,
    preview: preview ? { company: preview.company, sites: preview.sites, error: preview.error, quotes: preview.quotes, legalActions: legalActions(game, preview.company, preview.sites) } : null,
    lastReport: game.reports[game.reports.length - 1] ?? null,
  };
}
