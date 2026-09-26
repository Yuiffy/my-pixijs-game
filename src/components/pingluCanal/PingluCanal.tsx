'use client';

import { ArrowLeftOutlined, QuestionCircleOutlined, UndoOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyAction,
  canUpgrade,
  connectedFactories,
  coordinates,
  createGame,
  FACTORIES,
  frontier,
  GameAction,
  MAX_WEEKS,
  offersForWeek,
  PORT,
  publicGameState,
  scoreGame,
  shipmentQuote,
  START,
  TERRAIN_INFO,
  Terrain,
  TilePreview,
  UPGRADE_INFO,
  Upgrade,
  Vessel,
  CanalGameState,
} from './engine';
import styles from './pingluCanal.module.css';
import {
  activeContractor,
  applyCompetitionAction,
  chooseAiAction,
  competitionFrontier,
  competitionOffers,
  COMPETITION_ROUNDS,
  competitionSummary,
  constructionPrestige,
  contractorScore,
  createCompetition,
  DIG_SLOTS,
  openTenderReward,
  TENDERS,
  upgradePrestige,
} from './competition';

type TextWindow = Window & { render_game_to_text?: () => string };
type Session = { game: CanalGameState; history: CanalGameState[] };

const UPGRADES: { id: Upgrade; detail: string; mark: string }[] = [
  { id: 'wildlife', detail: '山地迁徙带', mark: '↟' },
  { id: 'fishway', detail: '船闸鱼类洄游', mark: '≈' },
  { id: 'water-saving', detail: '大型船少用一份水', mark: '▥' },
];

function TerrainArt({ terrain }: { terrain: Terrain }) {
  if (terrain === 'rock') {
    return <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M8 81 37 24 66 81ZM39 81 71 14 96 81Z" fill="#9daba2" stroke="#788b85" strokeWidth="2" /><path d="m37 24-9 20 10-7 8 10ZM71 14 61 37l11-6 9 14Z" fill="#edf0e9" /></svg>;
  }
  if (terrain === 'river' || terrain === 'start' || terrain === 'port') {
    return <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M-8 71c22-17 33 20 56 2s39-18 59 2M-8 88c22-17 33 20 56 2s39-18 59 2" fill="none" stroke="#8ab9b9" strokeWidth="5" /><path d="M-8 53c22-17 33 20 56 2s39-18 59 2" fill="none" stroke="#b6d5d0" strokeWidth="4" /></svg>;
  }
  if (terrain === 'wetland') {
    return <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M0 82c20-12 34 12 53 0s33-7 47 2M4 92c16-7 30 6 48 0s32-5 48 1" fill="none" stroke="#78aaa0" strokeWidth="3" /><path d="M28 76V24m0 18-12-13m12 9 10-16M62 82V32m0 16-10-12m10 4 9-18M83 73V39" fill="none" stroke="#668f6f" strokeWidth="3" strokeLinecap="round" /></svg>;
  }
  if (terrain === 'lowland') {
    return <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M6 55c20 10 32-8 50 0s30 2 44-3M0 71c17 10 34-8 53 1s32 0 47-4M7 88c20 9 37-9 56-1s26-2 38-6" fill="none" stroke="#b8b394" strokeWidth="3" strokeDasharray="8 5" /><path d="M21 27v22m-8-8 8 8 8-8M70 18v25m-8-8 8 8 8-8" fill="none" stroke="#b4805a" strokeWidth="3" /></svg>;
  }
  if (terrain === 'factory') {
    return <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M13 80V43l19-12v12l21-13v13l23-13v50Z" fill="#596f68" /><path d="M76 80V18h11v62M23 59h10m8 0h10m8 0h10M23 69h10m8 0h10m8 0h10" fill="none" stroke="#dfe9df" strokeWidth="5" /></svg>;
  }
  return <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M8 27c24 4 40-2 84 4M7 45c28 6 49-4 87 1M7 66c27 4 54-3 87 2M8 85c23 3 50-4 83 0" fill="none" stroke="#aeca98" strokeWidth="3" /><path d="M22 12v75m29-69v69m29-72v74" fill="none" stroke="#bbcc9c" strokeWidth="2" /></svg>;
}

function routeInTile(route: readonly number[], index: number): string {
  const position = route.indexOf(index);
  if (position === -1) return '';
  const parts: string[] = [];
  const current = coordinates(index);
  const adjacent = [route[position - 1], route[position + 1]];
  adjacent.forEach((neighbor) => {
    if (neighbor === undefined) return;
    const point = coordinates(neighbor);
    parts.push(`M50 50L${50 + (point.x - current.x) * 50} ${50 + (point.y - current.y) * 50}`);
  });
  if (index === START) parts.push('M50 50L0 50');
  if (index === PORT) parts.push('M50 50L100 50');
  return parts.join(' ');
}

function tileLabel(index: number, terrain: Terrain, route: readonly number[], preview?: TilePreview): string {
  const { x, y } = coordinates(index);
  const factory = FACTORIES.find((item) => item.index === index);
  if (factory) {
    const connected = connectedFactories(route).some((item) => item.id === factory.id);
    return `${factory.name}，${connected ? '已接入航道' : '尚未接入航道'}`;
  }
  if (preview) {
    return `${x + 1} 列 ${y + 1} 行，开挖${TERRAIN_INFO[terrain].name}，耗资 ${preview.cost}${preview.bend ? '，转弯施工' : ''}，土方变化 ${preview.soilChange}，生态影响 ${preview.impact}${preview.factoryNames.length ? `，可接入${preview.factoryNames.join('、')}` : ''}`;
  }
  if (route.includes(index)) return `${TERRAIN_INFO[terrain].name}，已接入航道`;
  return `${x + 1} 列 ${y + 1} 行，${TERRAIN_INFO[terrain].name}`;
}

function Board({
  game,
  available,
  focused,
  onFocusTile,
  onDig,
  owners = {},
}: {
  game: CanalGameState;
  available: TilePreview[];
  focused: number | null;
  onFocusTile: (index: number | null) => void;
  onDig: (index: number) => void;
  owners?: Partial<Record<number, number>>;
}) {
  const previews = new Map(available.map((item) => [item.index, item]));
  const connected = new Set(connectedFactories(game.route).map((factory) => factory.id));
  const routeSet = new Set(game.route);
  const tip = game.route[game.route.length - 1];

  return (
    <div className={styles.boardShell}>
      <div className={styles.boardTop}>
        <div><span className={styles.overline}>平陆运河 / 路线设计</span><h2>西江至北部湾</h2></div>
        <div className={styles.northMark}>N <span>↑</span></div>
      </div>
      <div className={styles.board} aria-label="运河地形棋盘" onMouseLeave={() => onFocusTile(null)}>
        {game.terrain.map((terrain, index) => {
          const preview = previews.get(index);
          const factory = FACTORIES.find((item) => item.index === index);
          const isRoute = routeSet.has(index);
          const path = routeInTile(game.route, index);
          const reachable = preview !== undefined;
          const enabled = preview?.affordable ?? false;
          return (
            <button
              className={styles.tile}
              data-terrain={terrain}
              data-route={isRoute}
              data-tip={tip === index}
              data-frontier={reachable}
              data-affordable={enabled}
              data-focused={focused === index}
              data-connected={factory ? connected.has(factory.id) : undefined}
              key={index}
              type="button"
              disabled={!enabled}
              aria-label={tileLabel(index, terrain, game.route, preview)}
              onClick={() => onDig(index)}
              onMouseEnter={() => onFocusTile(index)}
              onFocus={() => onFocusTile(index)}
            >
              <TerrainArt terrain={terrain} />
              {isRoute && <svg className={styles.routeSvg} viewBox="0 0 100 100" aria-hidden="true"><path className={styles.routeOuter} d={path} /><path className={styles.routeWater} d={path} /><circle cx="50" cy="50" r="8" className={styles.routePool} /></svg>}
              {factory && <span className={styles.factoryName}>{factory.shortName}</span>}
              {index === START && <span className={styles.placeName}>西江</span>}
              {index === PORT && <span className={styles.placeName}>海港</span>}
              {index === tip && <span className={styles.frontMarker} />}
              {owners[index] !== undefined && <span className={styles.ownerBadge} data-owner={owners[index]} title={`承包商 ${owners[index]! + 1} 承建`}>{owners[index]! + 1}</span>}
              {preview && <span className={styles.costMark}>{preview.cost === 0 ? '通航' : `¥${preview.cost}`}</span>}
              {preview && preview.impact > 0 && <span className={styles.impactMark}>!</span>}
              {factory && connected.has(factory.id) && <span className={styles.connectedMark}>✓</span>}
            </button>
          );
        })}
      </div>
      <div className={styles.boardBottom}>
        <span><i className={styles.keyRiver} />原有河道</span>
        <span><i className={styles.keyRock} />山体切方</span>
        <span><i className={styles.keyWetland} />湿地</span>
        <span><i className={styles.keyFactory} />工厂</span>
        <b>{game.route.includes(PORT) ? '已通航' : `施工前沿 · ${game.route.length - 1} 段`}</b>
      </div>
    </div>
  );
}

function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <button className={styles.modalClose} type="button" onClick={onClose} aria-label="关闭规则">×</button>
        <span className={styles.overline}>工程简报</span>
        <h2 id="rules-title">从江河，到海港</h2>
        <p>20 周里，每次开挖、建设或发船都占一周。每个航段从北、中、南三线选一条；早贯通会留下更多货运时间。</p>
        <div className={styles.rulesGrid}>
          <div><b>01 · 选线</b><span>每次向东推进一段，可在相邻线路间转弯。绕河湾开挖便宜；切山更直，还能取得回填土方。转弯过多会降低货运收入。</span></div>
          <div><b>02 · 土方</b><span>山体切方产生土方。低洼地优先用库存土方回填；库存不足要外购，余土可转运修复岸线。</span></div>
          <div><b>03 · 生态与用水</b><span>穿越迁徙带、建船闸、经过湿地会增加生态影响，降低每单收入。动物通道和鱼道可修复；省水闸池让 5000 吨船少用水。</span></div>
          <div><b>04 · 货运</b><span>航道贴近工厂才能接到它的货单。每周运价变化，工厂出货后需要两周备货。大船赚得多，驳船更省水。</span></div>
        </div>
        <button className={styles.primaryAction} type="button" onClick={onClose}>返回工程图</button>
      </section>
    </div>
  );
}

function SoloCanal({ onCompetition, active }: { onCompetition: () => void; active: boolean }) {
  const [session, setSession] = useState<Session>(() => ({ game: createGame(), history: [] }));
  const [focused, setFocused] = useState<number | null>(null);
  const [vessel, setVessel] = useState<Vessel>('freighter');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [best, setBest] = useState(0);
  const { game } = session;

  const available = useMemo(() => frontier(game), [game]);
  const offers = useMemo(() => offersForWeek(game), [game]);
  const factories = useMemo(() => connectedFactories(game.route), [game.route]);
  const preview = available.find((item) => item.index === focused) ?? available[0] ?? null;
  const tons = game.deliveries.reduce((sum, delivery) => sum + delivery.tons, 0);

  const act = useCallback((action: GameAction) => {
    setSession((current) => {
      const next = applyAction(current.game, action);
      if (next === current.game) return current;
      return { game: next, history: [...current.history, current.game] };
    });
    setFocused(null);
  }, []);

  const dig = useCallback((index: number) => act({ type: 'dig', index }), [act]);
  const undo = useCallback(() => {
    setSession((current) => {
      if (current.history.length === 0) return current;
      return { game: current.history[current.history.length - 1], history: current.history.slice(0, -1) };
    });
    setFocused(null);
  }, []);
  const restart = useCallback(() => {
    setSession((current) => ({ game: createGame(current.game.seed + 1), history: [] }));
    setFocused(null);
    setVessel('freighter');
  }, []);
  const closeRules = useCallback(() => setRulesOpen(false), []);

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem('pinglu-canal-best-v2'));
      if (Number.isFinite(stored) && stored > 0) setBest(stored);
    } catch {
      // Local records are optional.
    }
  }, []);

  useEffect(() => {
    if (game.phase !== 'finished' || game.score === null || game.score <= best) return;
    setBest(game.score);
    try {
      localStorage.setItem('pinglu-canal-best-v2', String(game.score));
    } catch {
      // The current run remains playable without storage.
    }
  }, [best, game.phase, game.score]);

  useEffect(() => {
    if (!active) return undefined;
    const target = window as TextWindow;
    target.render_game_to_text = () => JSON.stringify({ ...publicGameState(game), selectedVessel: vessel, best });
    return () => { delete target.render_game_to_text; };
  }, [active, best, game, vessel]);

  useEffect(() => {
    if (!active) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setRulesOpen(false);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, undo]);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.backLink} href="/demos" aria-label="返回游戏列表"><ArrowLeftOutlined /><span className={styles.backLabel}>游戏列表</span></Link>
        <div className={styles.brand}><span className={styles.brandStamp}>平陆</span><div><span className={styles.overline}>运河设计局</span><h1>通江达海</h1></div></div>
        <div className={styles.topActions}>
          <button type="button" className={styles.modeSwitch} onClick={onCompetition}>承包商竞赛</button>
          <span className={styles.bestMark}>最佳 {best || '—'}</span>
          <button type="button" className={styles.iconButton} onClick={undo} disabled={session.history.length === 0} aria-label="撤销上一周" title="撤销上一周"><UndoOutlined /></button>
          <button type="button" className={styles.iconButton} onClick={() => setRulesOpen(true)} aria-label="查看规则" title="查看规则"><QuestionCircleOutlined /></button>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.statusStrip} aria-label="本局状态">
          <div className={styles.weekStat}><span>第 <b>{Math.min(game.week, MAX_WEEKS)}</b> 周</span><div className={styles.weekTrack}><i style={{ width: `${Math.min(100, ((game.week - 1) / MAX_WEEKS) * 100)}%` }} /></div><small>共 {MAX_WEEKS} 周</small></div>
          <div><span>工程资金</span><strong>¥{game.cash}<small>M</small></strong></div>
          <div><span>土方库存</span><strong>{game.soil}<small>份</small></strong></div>
          <div><span>闸池水量</span><strong>{game.water}<small>/3</small></strong></div>
          <div><span>已运货物</span><strong>{tons / 1000}<small>千吨</small></strong></div>
          <div><span>生态影响</span><strong data-alert={game.impact >= 4}>{game.impact}<small>点</small></strong></div>
        </div>

        <div className={styles.workspace}>
          <section className={styles.mapColumn} aria-label="运河地图">
            <Board game={game} available={available} focused={focused} onFocusTile={setFocused} onDig={dig} />
            <div className={styles.mapIntel}>
              <div><span className={styles.overline}>沿线工厂</span><strong>{factories.length}/3 已接入</strong></div>
              {FACTORIES.map((factory) => {
                const connected = factories.some((item) => item.id === factory.id);
                return <span className={styles.factoryChip} data-active={connected} key={factory.id}><i />{factory.name}</span>;
              })}
            </div>
            <div className={styles.messageBar} aria-live="polite"><span className={styles.messagePulse} />{game.lastMessage}</div>
          </section>

          <aside className={styles.inspector} aria-label="本周调度">
            {game.phase === 'building' && (
              <>
                <div className={styles.inspectorHeading}><span className={styles.overline}>第 {game.week} 周 / 航道施工</span><h2>下一段航道</h2><p>{MAX_WEEKS - game.week + 1} 周可用</p></div>
                {preview && (
<div className={styles.tilePreview}>
                  <span className={styles.previewIndex}>{coordinates(preview.index).x + 1}.{coordinates(preview.index).y + 1}</span>
                  <div><strong>{TERRAIN_INFO[preview.terrain].name}</strong><small>{preview.factoryNames.length ? `接入 ${preview.factoryNames.join('、')}` : preview.terrain === 'lowland' ? '土方回填地段' : preview.terrain === 'rock' ? '切方可供下游回填' : '沿线地形'}</small></div>
                  <b>¥{preview.cost}M</b>
                </div>
)}
                <div className={styles.frontierList}>
                  {available.map((item) => (
                    <button className={styles.frontierOption} data-focused={preview?.index === item.index} key={item.index} type="button" disabled={!item.affordable} onClick={() => dig(item.index)} onMouseEnter={() => setFocused(item.index)}>
                      <span className={styles.directionMark}>{coordinates(item.index).y < coordinates(game.route[game.route.length - 1]).y ? '↗' : coordinates(item.index).y > coordinates(game.route[game.route.length - 1]).y ? '↘' : '→'}</span>
                      <span><b>{TERRAIN_INFO[item.terrain].name}</b><small>{item.bend ? '转弯 · ' : ''}{item.soilChange > 0 ? `产土 +${item.soilChange}` : item.soilChange < 0 ? `运土 ${-item.soilChange}` : '直接开挖'}{item.impact > 0 ? ` · 生态 +${item.impact}` : ''}</small></span>
                      <strong>¥{item.cost}M</strong>
                    </button>
                  ))}
                  {available.length === 0 && <div className={styles.noFrontier}>可行路线已耗尽。可撤销选线或开启新局。</div>}
                </div>
                {preview && (
<div className={styles.projectedEffect}>
                  <span>当前河段结算</span>
                  <b>{preview.soilChange > 0 ? `土方 +${preview.soilChange}` : preview.soilChange < 0 ? `回填 ${-preview.soilChange} 份` : '土方不变'}</b>
                  <b>{preview.impact > 0 ? `生态影响 +${preview.impact}` : '生态影响不变'}</b>
                  {preview.bend && <b>转弯过多会增加航运成本</b>}
                </div>
)}
              </>
            )}

            {game.phase === 'operating' && (
              <>
                <div className={styles.inspectorHeading}><span className={styles.overline}>第 {game.week} 周 / 港口货盘</span><h2>安排本周货轮</h2><p>第 {game.openedWeek} 周通航 · 剩 {MAX_WEEKS - game.week + 1} 周</p></div>
                <div className={styles.vesselTabs} role="group" aria-label="船型">
                  <button type="button" aria-pressed={vessel === 'barge'} onClick={() => setVessel('barge')}><b>2000 吨驳船</b><small>少载 · 省水</small></button>
                  <button type="button" aria-pressed={vessel === 'freighter'} onClick={() => setVessel('freighter')}><b>5000 吨货轮</b><small>满载 · 高收益</small></button>
                </div>
                <div className={styles.marketList}>
                  {offers.map((offer) => {
                    const quote = shipmentQuote(game, offer, vessel);
                    return (
<button className={styles.cargoOffer} type="button" key={offer.id} disabled={game.water < quote.water} onClick={() => act({ type: 'ship', offerId: offer.id, vessel })}>
                      <span className={styles.cargoSource}>{offer.factoryId ? '工厂直装' : '公共货源'}</span>
                      <span className={styles.cargoTitle}><b>{offer.cargo}</b><strong>+¥{quote.revenue}M</strong></span>
                      <span className={styles.cargoRoute}>{offer.origin} <i>→</i> {offer.destination}</span>
                      <span className={styles.cargoMeta}>{quote.tons} 吨 <i>·</i> 用水 {quote.water}{game.water < quote.water ? ' · 水量不足' : ''}</span>
                    </button>
);
                  })}
                </div>
              </>
            )}

            {game.phase !== 'finished' && (
              <div className={styles.engineeringActions}>
                <div className={styles.actionHeading}><span className={styles.overline}>工程调度</span><small>每项占 1 周</small></div>
                <div className={styles.upgradeList}>
                  {UPGRADES.map((upgrade) => {
                    const built = game.upgrades.includes(upgrade.id);
                    const unlocked = game.route.some((index) => coordinates(index).x === (upgrade.id === 'wildlife' ? 3 : 4));
                    const info = UPGRADE_INFO[upgrade.id];
                    return (
<button type="button" className={styles.upgradeAction} data-built={built} key={upgrade.id} disabled={!canUpgrade(game, upgrade.id)} onClick={() => act({ type: 'upgrade', upgrade: upgrade.id })}>
                      <span className={styles.upgradeMark}>{built ? '✓' : upgrade.mark}</span>
                      <span><b>{info.name}</b><small>{built ? '已建成' : unlocked ? upgrade.detail : '待航道经过该地段'}</small></span>
                      <strong>{built ? '完成' : `¥${info.cost}M`}</strong>
                    </button>
);
                  })}
                </div>
                <div className={styles.utilityActions}>
                  <button type="button" disabled={game.soil < 3} onClick={() => act({ type: 'transfer-soil' })}><b>运土复垦</b><small>−3 土 · +¥2M</small></button>
                  {game.phase === 'operating' && <button type="button" disabled={game.water >= 3} onClick={() => act({ type: 'recharge' })}><b>停航蓄水</b><small>+2 水</small></button>}
                  {!game.bondsUsed && <button type="button" onClick={() => act({ type: 'bond' })}><b>追加工程款</b><small>+¥9M · 期末付息</small></button>}
                </div>
              </div>
            )}

            {game.phase === 'finished' && (
              <div className={styles.result}>
                <span className={styles.overline}>工程结算</span>
                <div className={styles.grade}>{game.grade}</div>
                <h2>{game.route.includes(PORT) ? '山海通途已成' : '航道未及通海'}</h2>
                <p>{game.route.includes(PORT) ? `第 ${game.openedWeek} 周通航，共运出 ${tons / 1000} 千吨。` : '20 周施工窗口结束。下一期可以更直接地穿过山岭。'}</p>
                <div className={styles.resultLine}><span>总评</span><b>{game.score ?? scoreGame(game)}</b></div>
                <div className={styles.resultLine}><span>接入工厂</span><b>{factories.length} / 3</b></div>
                <div className={styles.resultLine}><span>生态影响</span><b>{game.impact}</b></div>
                <div className={styles.resultLine}><span>土方利用</span><b>{game.soilMoved} 份</b></div>
                <button className={styles.primaryAction} type="button" onClick={restart}>开始新一期工程 <span>↻</span></button>
              </div>
            )}
          </aside>
        </div>
        <footer className={styles.footer}><span>灵感来源：《平陆运河，非挖不可？》 · 星球研究所 × 平陆运河集团</span><span>地形、订单和资金为游戏化抽象</span></footer>
      </div>
      {rulesOpen && <Rules onClose={closeRules} />}
    </main>
  );
}

function CompetitiveCanal({ onSolo, active }: { onSolo: () => void; active: boolean }) {
  const [match, setMatch] = useState(() => createCompetition());
  const [humanCount, setHumanCount] = useState(1);
  const [aiCount, setAiCount] = useState(2);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [vessel, setVessel] = useState<Vessel>('freighter');
  const current = match.finished ? null : activeContractor(match);
  const humanTurn = current?.kind === 'human';
  const available = humanTurn ? competitionFrontier(match) : [];
  const offers = competitionOffers(match);
  const rankings = [...match.players].sort((a, b) => contractorScore(b) - contractorScore(a));
  const soloChallenge = match.players.length === 1;
  const soloTarget = 200;
  const { project } = match;

  useEffect(() => {
    if (!active || match.finished || current?.kind !== 'ai' || settingsOpen) return undefined;
    const timer = window.setTimeout(() => {
      setMatch((state) => applyCompetitionAction(state, chooseAiAction(state)));
    }, 480);
    return () => window.clearTimeout(timer);
  }, [active, current?.kind, match, settingsOpen]);

  useEffect(() => {
    if (!active) return undefined;
    const target = window as TextWindow;
    target.render_game_to_text = () => JSON.stringify(competitionSummary(match));
    return () => { delete target.render_game_to_text; };
  }, [active, match]);

  const act = useCallback((action: GameAction | { type: 'pass' }) => {
    setMatch((state) => (activeContractor(state).kind === 'human' ? applyCompetitionAction(state, action) : state));
  }, []);

  const startMatch = () => {
    if (humanCount + aiCount < 1 || humanCount + aiCount > 4) return;
    setMatch((previous) => createCompetition(humanCount, aiCount, previous.project.seed + 1));
    setSettingsOpen(false);
    setVessel('freighter');
  };

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.backLink} href="/demos" aria-label="返回游戏列表"><ArrowLeftOutlined /></Link>
        <div className={styles.brand}><span className={styles.brandStamp}>平陆</span><div><span className={styles.overline}>运河设计局 / 承包商竞赛</span><h1>通江达海</h1></div></div>
        <div className={styles.topActions}>
          <button type="button" className={styles.modeSwitch} onClick={onSolo}>单人规划</button>
          <button type="button" className={styles.modeSwitch} onClick={() => setSettingsOpen(true)}>对局设置</button>
          <button type="button" className={styles.iconButton} onClick={() => setRulesOpen(true)} aria-label="竞赛规则" title="竞赛规则"><QuestionCircleOutlined /></button>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.statusStrip} aria-label="本局状态">
          <div className={styles.weekStat}><span>第 <b>{Math.min(match.round, COMPETITION_ROUNDS)}</b> 轮</span><div className={styles.weekTrack}><i style={{ width: `${Math.min(100, ((match.round - 1) / COMPETITION_ROUNDS) * 100)}%` }} /></div><small>共 {COMPETITION_ROUNDS} 轮</small></div>
          <div><span>当前行动</span><strong className={styles.activeName}>{current?.name ?? '结算'}</strong></div>
          <div><span>开挖名额</span><strong>{Math.max(0, DIG_SLOTS - match.digsThisRound)}<small>/2</small></strong></div>
          <div><span>公有土方</span><strong>{project.soil}<small>份</small></strong></div>
          <div><span>闸池水量</span><strong>{project.water}<small>/4</small></strong></div>
          <div><span>生态影响</span><strong data-alert={project.impact >= 4}>{project.impact}<small>点</small></strong></div>
        </div>

        <div className={styles.workspace}>
          <section className={styles.mapColumn} aria-label="共建运河地图">
            <Board game={project} available={available} focused={null} onFocusTile={() => {}} onDig={(index) => act({ type: 'dig', index })} owners={match.segmentOwners} />
            <div className={styles.scoreboard} aria-label="承包商积分榜">
              {rankings.map((player, index) => (
                <div className={styles.scoreRow} data-active={current?.id === player.id} key={player.id}>
                  <b>{index + 1}</b><span>{player.name}<small>{player.kind === 'ai' ? 'AI' : '本地玩家'}</small></span>
                  <strong>{contractorScore(player)} 分</strong>
                  <small>¥{player.cash}M · 声望 {player.prestige} · 承建 {Object.values(match.segmentOwners).filter((owner) => owner === player.id).length} 段 · 分红 {player.dividends} · 货种 {player.variety} · 委托 {player.awards}</small>
                </div>
              ))}
            </div>
            <section className={styles.tenderBoard} aria-label="本局公开委托">
              <div className={styles.tenderHeading}><span className={styles.overline}>本局公开委托</span><small>首位完成者得分</small></div>
              <div className={styles.tenderList}>
                {match.tenders.map((id) => {
                  const winner = match.players.find((player) => player.id === match.tenderClaims[id]);
                  return (
                    <div className={styles.tenderItem} data-claimed={Boolean(winner)} key={id}>
                      <b>{TENDERS[id].name}</b><span>{TENDERS[id].condition}</span>
                      <strong>{winner ? winner.name : `+${TENDERS[id].reward} 分`}</strong>
                    </div>
                  );
                })}
              </div>
            </section>
            <div className={styles.messageBar} aria-live="polite"><span className={styles.messagePulse} />{match.message}</div>
          </section>

          <aside className={styles.inspector} aria-label="承包商行动">
            {match.finished ? (
              <div className={styles.result}>
                <span className={styles.overline}>第 {COMPETITION_ROUNDS} 轮结算</span>
                <div className={styles.grade}>{soloChallenge ? (contractorScore(rankings[0]) >= soloTarget ? '✓' : '—') : '1'}</div>
                <h2>{soloChallenge ? (contractorScore(rankings[0]) >= soloTarget ? '个人挑战达标' : '个人挑战未达标') : `${rankings[0]?.name}获胜`}</h2>
                {soloChallenge && <p>目标 {soloTarget} 分 · 本局 {contractorScore(rankings[0])} 分</p>}
                <p>{project.route.includes(PORT) ? `第 ${project.openedWeek} 轮通航，共完成 ${project.deliveries.length} 单货运。` : '工程期结束，航道未贯通。仍按各自施工贡献结算。'}</p>
                {rankings.map((player, index) => (
                  <div className={styles.resultLine} key={player.id}>
                    <span>#{index + 1} {player.name}<small>资金 {player.cash} · 声望 {player.prestige * 2} · 分红 {player.dividends} · 货种 {player.variety} · 委托 {player.awards} · 运量 {Math.floor(player.tons / 1000) * 2}{player.financed ? ' · 融资 −10' : ''}</small></span>
                    <b>{contractorScore(player)} 分</b>
                  </div>
                ))}
                <button className={styles.primaryAction} type="button" onClick={startMatch}>再来一局 <span>↻</span></button>
              </div>
            ) : (
              <>
                <div className={styles.inspectorHeading}><span className={styles.overline}>第 {match.round} 轮 / {project.phase === 'building' ? '共建航道' : '货运竞标'}</span><h2>{current?.name}的行动</h2><p>{humanTurn ? '选择一项行动，随后轮到下一位承包商。' : 'AI 正在选择行动…'}</p></div>

                {project.phase === 'building' && (
                  <div className={styles.competitionActions}>
                    <span className={styles.overline}>航道前沿 · 本轮剩 {DIG_SLOTS - match.digsThisRound} 次开挖</span>
                    {available.map((item) => {
                      const bonus = (item.terrain === 'rock' ? openTenderReward(match, 'rock') : 0)
                        + (item.factoryNames.length ? openTenderReward(match, 'factory') : 0)
                        + (item.index === PORT && match.round <= 5 ? openTenderReward(match, 'early') : 0);
                      return (
                        <button className={styles.frontierOption} data-tender={bonus > 0} key={item.index} type="button" disabled={!item.affordable} onClick={() => act({ type: 'dig', index: item.index })}>
                          <span className={styles.directionMark}>{coordinates(item.index).y < coordinates(project.route[project.route.length - 1]).y ? '↗' : coordinates(item.index).y > coordinates(project.route[project.route.length - 1]).y ? '↘' : '→'}</span>
                          <span><b>{TERRAIN_INFO[item.terrain].name}</b><small>{item.bend ? '转弯 · ' : ''}声望 +{constructionPrestige(item, item.index === PORT)}{bonus ? ` · 委托 +${bonus} 分` : ''} · 持有航段参与后续分红{item.factoryNames.length ? ` · 接入${item.factoryNames.join('、')}` : ''}</small></span>
                          <strong>¥{item.cost}M</strong>
                        </button>
                      );
                    })}
                    {match.digsThisRound >= DIG_SLOTS && <p className={styles.turnNotice}>本轮开挖名额已用完，仍可建设或承接维护。</p>}
                    {available.length === 0 && match.digsThisRound < DIG_SLOTS && humanTurn && <p className={styles.turnNotice}>资金不足或前沿无可用格；可融资、转运或承接维护。</p>}
                  </div>
                )}

                {project.phase === 'operating' && (
                  <>
                    <div className={styles.vesselTabs} role="group" aria-label="船型">
                      <button type="button" aria-pressed={vessel === 'barge'} onClick={() => setVessel('barge')}><b>2000 吨驳船</b><small>用水 1</small></button>
                      <button type="button" aria-pressed={vessel === 'freighter'} onClick={() => setVessel('freighter')}><b>5000 吨货轮</b><small>高收益</small></button>
                    </div>
                    <div className={styles.marketList}>
                      {offers.map((offer) => {
                        const quote = shipmentQuote(project, offer, vessel);
                        return (
                          <button className={styles.cargoOffer} data-offer-id={offer.id} data-priority={offer.premium > 0} type="button" key={offer.id} disabled={!humanTurn || project.water < quote.water} onClick={() => act({ type: 'ship', offerId: offer.id, vessel })}>
                          <span className={styles.cargoSource}>{offer.premium ? `本轮急单 +¥${offer.premium}M` : offer.factoryId ? '工厂专单' : '公共货源'} · 先到先得</span>
                          <span className={styles.cargoTitle}><b>{offer.cargo}</b><strong>+¥{quote.revenue + offer.premium}M</strong></span>
                          <span className={styles.cargoRoute}>{offer.origin} → {offer.destination}</span>
                          <span className={styles.cargoMeta}>{quote.tons} 吨 · 用水 {quote.water}{current && !current.servedOffers.includes(offer.id) ? ` · 首运 +${4 + (current.servedOffers.length === 2 ? 8 : 0)} 分` : ''}{offer.factoryId && vessel === 'freighter' && openTenderReward(match, 'heavy') ? ` · 委托 +${openTenderReward(match, 'heavy')} 分` : ''}{project.water < quote.water ? ' · 水量不足' : ''}</span>
                          </button>
                        );
                      })}
                      {offers.length === 0 && <p className={styles.turnNotice}>本轮货单已被其他承包商取走。</p>}
                    </div>
                  </>
                )}

                <div className={styles.engineeringActions}>
                  <div className={styles.actionHeading}><span className={styles.overline}>其他行动</span><small>每次占一个行动</small></div>
                  <div className={styles.upgradeList}>
                    {UPGRADES.map((upgrade) => {
                      const info = UPGRADE_INFO[upgrade.id];
                      const built = project.upgrades.includes(upgrade.id);
                      const owner = match.players.find((player) => player.id === match.upgradeOwners[upgrade.id]);
                      return (
                        <button className={styles.upgradeAction} data-built={built} key={upgrade.id} type="button" disabled={!humanTurn || !canUpgrade({ ...project, cash: current?.cash ?? 0 }, upgrade.id)} onClick={() => act({ type: 'upgrade', upgrade: upgrade.id })}>
                        <span className={styles.upgradeMark}>{built ? '✓' : upgrade.mark}</span><span><b>{info.name}</b><small>{built ? `${owner?.name ?? '公共'}承建 · 全员共享` : `声望 +${upgradePrestige(upgrade.id)}${upgrade.id !== 'water-saving' && openTenderReward(match, 'ecology') ? ` · 委托 +${openTenderReward(match, 'ecology')} 分` : ''} · 后续货运分红 +1`}</small></span><strong>{built ? '完成' : `¥${info.cost}M`}</strong>
                        </button>
                      );
                    })}
                  </div>
                  <div className={styles.utilityActions}>
                    <button type="button" disabled={!humanTurn || project.soil < 3} onClick={() => act({ type: 'transfer-soil' })}><b>运土复垦</b><small>+¥2M · +3 声望{openTenderReward(match, 'earthwork') ? ` · 委托 +${openTenderReward(match, 'earthwork')} 分` : ''}</small></button>
                    <button type="button" disabled={!humanTurn || current?.financed} onClick={() => act({ type: 'bond' })}><b>工程融资</b><small>+¥8M · 期末 −10 分</small></button>
                    {project.phase === 'operating' && <button type="button" disabled={!humanTurn || project.water >= 4} onClick={() => act({ type: 'recharge' })}><b>维护闸池</b><small>+2 水 · +1 声望</small></button>}
                    <button type="button" disabled={!humanTurn} onClick={() => act({ type: 'pass' })}><b>岸线维护</b><small>+¥3M</small></button>
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
        <footer className={styles.footer}><span>灵感来源：《平陆运河，非挖不可？》 · 星球研究所 × 平陆运河集团</span><span>本地轮流行动 · 工程与货运数值均为游戏化抽象</span></footer>
      </div>

      {settingsOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
        <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="competition-settings-title">
          <button className={styles.modalClose} type="button" onClick={() => setSettingsOpen(false)} aria-label="关闭设置">×</button>
          <span className={styles.overline}>承包商竞赛</span><h2 id="competition-settings-title">新对局设置</h2>
          <p>1 位玩家可挑战目标分数；2–4 位承包商可同机轮流或与 AI 对战。重新开局会清空当前进度。</p>
          <label className={styles.setupField} htmlFor="human-count">本地玩家<select id="human-count" value={humanCount} onChange={(event) => setHumanCount(Number(event.target.value))}>{[1, 2, 3, 4].map((number) => <option key={number} value={number}>{number} 位</option>)}</select></label>
          <label className={styles.setupField} htmlFor="ai-count">AI 对手<select id="ai-count" value={aiCount} onChange={(event) => setAiCount(Number(event.target.value))}>{[0, 1, 2, 3].map((number) => <option key={number} value={number}>{number} 位</option>)}</select></label>
          <p className={styles.setupHint}>{humanCount + aiCount > 4 ? '总人数最多 4 位。' : humanCount + aiCount === 1 ? `个人挑战：${COMPETITION_ROUNDS} 轮达到 ${soloTarget} 分。` : `共 ${humanCount + aiCount} 位，每人每轮行动一次；第 ${COMPETITION_ROUNDS} 轮后结算。`}</p>
          <button className={styles.primaryAction} type="button" disabled={humanCount + aiCount > 4} onClick={startMatch}>开始新对局 <span>→</span></button>
        </section>
        </div>
      )}
      {rulesOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRulesOpen(false); }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="competition-rules-title">
            <button className={styles.modalClose} type="button" onClick={() => setRulesOpen(false)} aria-label="关闭规则">×</button>
            <span className={styles.overline}>承包商竞赛 / 规则</span>
            <h2 id="competition-rules-title">共建一条运河</h2>
            <p>14 轮内，每位承包商每轮行动一次。多人对局的起始玩家轮换；单人竞赛以 200 分为目标。</p>
            <div className={styles.rulesGrid}>
              <div><b>开挖</b><span>每轮只有两个开挖名额。每次向东推进一段，在北、中、南线间择路。转弯增加施工费，转弯过多会降低货运收入；承建者按持有航段获得后续货运分红。</span></div>
              <div><b>工程</b><span>动物通道、鱼道和省水闸池由一人出资、全员受益。建设者在后续货运中获得分红。运土复垦可换资金与声望；融资能解燃眉之急，但结算扣 10 分。</span></div>
              <div><b>货运</b><span>通航后，每张货单每轮只能被一人接走。每轮有一张急单，奖金 ¥14M；个人首次承运一种货物得 4 分，第三种再得 8 分。5000 吨船赚得更多、用水也较多；工厂专单出货后隔一轮备货。</span></div>
              <div><b>公开委托</b><span>每局抽出三项，首位完成者获得奖励分；其他玩家仍可执行相同行动。</span></div>
              <div><b>胜负</b><span>14 轮后按资金 + 双倍声望 + 航运分红 + 货种分 + 委托分 + 每千吨货物 2 分 − 融资罚分排名。未通航仍按施工贡献结算。</span></div>
            </div>
            <button className={styles.primaryAction} type="button" onClick={() => setRulesOpen(false)}>返回对局</button>
          </section>
        </div>
      )}
    </main>
  );
}

export default function PingluCanal() {
  const [mode, setMode] = useState<'competition' | 'solo'>('competition');
  return (
    <>
      <div hidden={mode !== 'competition'}><CompetitiveCanal active={mode === 'competition'} onSolo={() => setMode('solo')} /></div>
      <div hidden={mode !== 'solo'}><SoloCanal active={mode === 'solo'} onCompetition={() => setMode('competition')} /></div>
    </>
  );
}
