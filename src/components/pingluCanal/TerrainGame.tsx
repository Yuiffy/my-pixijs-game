'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import GameShareButton from '@/app/game/GameShareButton';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  bedLevel, GEOGRAPHY, LOCKS, lockCells, START, waterLevel, aiTerrainAction, applyTerrainAction, createTerrain, currentPlayer, finishTerrain, lineSelection,
  MAP_H, MAP_W, MAX_CELLS, pileSize, PILE_CAPACITY, PLAYER_COLORS, quoteTerrain, reclamationLevel, restoreTerrain,
  scoreTerrain, surveyTerrain, TerrainAction, TerrainGame as Game, tileId, tileName, Tool, turnOrder, xy,
} from './terrainEngine';
import styles from './terrain.module.css';
import { regionName, WATER_STEPS } from './geography';

const Scene = dynamic(() => import('./TerrainScene'), { ssr: false, loading: () => <div className={styles.loading}>正在测绘山岭与河谷…</div> });
const SAVE_KEY = 'pinglu-geography-v3';
const km = (metres: number) => `${(metres / 1000).toFixed(1)} km`;
const TOOLS: { id: Tool; icon: string; name: string; detail: string }[] = [
  { id: 'blast', icon: '✹', name: '爆破', detail: '本河段水面以上削低 3 层' },
  { id: 'dig', icon: '↧', name: '开挖', detail: '逐格削低 1 层，拓岸切坡' },
  { id: 'dredge', icon: '≋', name: '疏浚', detail: '本河段水面下疏浚 2 层，保留 3 层水深' },
  { id: 'haul', icon: '⇢', name: '运土', detail: '运土填平天然洼地，田面高度因地而异' },
];
type DebugWindow = Window & { render_game_to_text?: () => string };

export default function TerrainGame() {
  const [game, setGame] = useState<Game>(() => createTerrain());
  const [loaded, setLoaded] = useState(false);
  const [tool, setTool] = useState<Tool>('blast');
  const [selected, setSelected] = useState<number[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [line, setLine] = useState(false);
  const [wide, setWide] = useState(false);
  const [source, setSource] = useState<number | undefined>();
  const [navigate, setNavigate] = useState(true);
  const [showSurvey, setShowSurvey] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [atlas, setAtlas] = useState(false);
  const [showOwners, setShowOwners] = useState(false);
  const [topDown, setTopDown] = useState(false);
  const [reset, setReset] = useState(0);
  const [rules, setRules] = useState(false);
  const [setup, setSetup] = useState(false);
  const [ledger, setLedger] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [humans, setHumans] = useState(1);
  const [ais, setAis] = useState(0);
  const [sandbox, setSandbox] = useState(false);
  const [history, setHistory] = useState<Game[]>([]);
  const [notice, setNotice] = useState('');
  const [row, setRow] = useState(START[1]);
  const [column, setColumn] = useState(START[0]);
  const modalRef = useRef<HTMLElement>(null);
  const player = currentPlayer(game);
  const survey = useMemo(() => surveyTerrain(game), [game]);
  const scores = useMemo(() => scoreTerrain(game, survey.route), [game, survey.route]);
  const estimated = useMemo(() => scoreTerrain(game, survey.proposal), [game, survey.proposal]);
  const sources = Object.keys(player.piles).map(Number).filter(id => pileSize(player, id) > 0);
  const effectiveSource = source !== undefined && sources.includes(source) ? source : sources[0];
  const selection = anchor !== null && hovered !== null && line ? lineSelection(anchor, hovered, wide) : selected;
  const action: TerrainAction = { tool, cells: selection, source: effectiveSource };
  const quote = useMemo(() => quoteTerrain(game, { tool, cells: selection, source: effectiveSource }), [game, tool, selection, effectiveSource]);
  const plotId = hovered ?? selected[0];
  const plot = plotId === undefined ? null : game.plots[plotId];
  const modal = rules || setup || ledger || handoff || atlas;
  const humanCount = game.players.filter(p => !p.ai).length;
  const last = game.events[game.events.length - 1];
  const crews = turnOrder(game).slice(game.turn).filter(id => id === player.id).length;
  const selectedOwners = game.players.map(p => ({ name: p.name, units: selection.reduce((sum, id) => sum + Object.values(game.plots[id]?.cuts ?? {}).filter(owner => owner === p.id).length, 0) })).filter(p => p.units);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) {
        const saved = restoreTerrain(raw);
        if (saved) { setGame(saved.moves === 0 ? createTerrain(saved.players.filter(p => !p.ai).length, saved.players.filter(p => p.ai).length, saved.seed, saved.sandbox) : saved); setHumans(saved.players.filter(p => !p.ai).length); setAis(saved.players.filter(p => p.ai).length); setSandbox(saved.sandbox); } else setNotice('旧工程存档无法读取，已展开新地形。');
      }
      if (!raw && window.localStorage.getItem('pinglu-terrain-v2')) setNotice('已开启真实地理版的独立存档；旧版沙盘存档仍保留在本机。');
    } catch { setNotice('本机无法读取存档，仍可开始新工程。'); }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch { setNotice('本机无法保存，当前工程仍可继续。'); }
  }, [game, loaded]);
  useEffect(() => { if (humanCount > 1 && !player.ai && !game.finished) setHandoff(true); }, [player.id, humanCount, game.finished, player.ai]);
  useEffect(() => {
    if (!loaded || game.finished || !player.ai || modal) return undefined;
    const timer = window.setTimeout(() => {
      const next = applyTerrainAction(game, aiTerrainAction(game)); setGame(next); setSelected([]); setAnchor(null);
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [game, player.ai, loaded, modal]);
  useEffect(() => {
    const target = window as DebugWindow;
    target.render_game_to_text = () => JSON.stringify({
      mode: 'pinglu-dem-geography',
round: game.round,
active: player.id,
finished: game.finished,
finishRound: game.finishRound,
      size: [MAP_W, MAP_H],
waterLevels: WATER_STEPS,
locks: game.locks,
mapRevision: GEOGRAPHY.revision,
required: { widthCells: 3, depthLayers: 3, radiusCells: 3, locks: 3 },
      adopted: survey.route ? { length: Math.round(survey.route.length), cells: survey.route.cells } : null,
      proposal: { length: Math.round(survey.proposal.length), remaining: survey.proposal.remaining, blocked: survey.proposal.blocked },
      players: game.players.map(p => ({ id: p.id, name: p.name, cash: p.cash, soil: pileSize(p), ai: p.ai })),
scores,
      selected,
quote,
last,
plots: game.plots.map((p, id) => ({ id, height: p.height, waterLevel: waterLevel(id), targetBed: bedLevel(id), wet: survey.wet[id], farm: p.farm, fillTarget: reclamationLevel(p) })),
    });
    return () => { delete target.render_game_to_text; };
  }, [game, player.id, survey, scores, selected, quote, last]);
  useEffect(() => {
    if (!modal) return undefined;
    const before = document.activeElement as HTMLElement | null;
    modalRef.current?.querySelector<HTMLElement>('button, select, input')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !handoff) { setRules(false); setSetup(false); setLedger(false); setAtlas(false); }
      if (event.key === 'Tab') {
        const controls = modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select, input');
        if (!controls?.length) return;
        const first = controls[0]; const final = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); final.focus(); } else if (!event.shiftKey && document.activeElement === final) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); before?.focus(); };
  }, [modal, handoff]);

  const choose = (id: number) => {
    if (game.finished || player.ai || modal) return;
    const [x, z] = xy(id); setColumn(x); setRow(z);
    if (line && anchor === null) { setAnchor(id); setSelected(lineSelection(id, id, wide)); } else if (line && anchor !== null) { setSelected(lineSelection(anchor, id, wide)); setAnchor(null); } else setSelected(lineSelection(id, id, wide));
  };
  const execute = (nextAction: TerrainAction) => {
    if (player.ai || modal || game.finished) return;
    const result = quoteTerrain(game, nextAction);
    if (result.error) { setNotice(result.error); return; }
    const next = applyTerrainAction(game, nextAction);
    if (next === game) return;
    if (game.players.length === 1) setHistory(previous => [...previous.slice(-11), game]);
    setGame(next); setAnchor(null); setNotice('');
    if (currentPlayer(next).id !== player.id) setSelected([]);
    else if (nextAction.tool !== 'haul' && result.cells.every(id => next.plots[id].height <= bedLevel(id))) setSelected([]);
    else if (nextAction.tool === 'haul') setSelected([]);
  };
  const undo = () => { const previous = history[history.length - 1]; if (previous) { setGame(previous); setHistory(h => h.slice(0, -1)); setAnchor(null); setSelected([]); } };
  const locate = () => {
    const { blocked } = survey.proposal;
    if (!blocked.length) return;
    const first = blocked.find(id => game.plots[id].height <= waterLevel(id)) ?? blocked[0];
    const high = game.plots[first].height > waterLevel(first); const [x, z] = xy(first);
    const cells = blocked.filter(id => (game.plots[id].height > waterLevel(id)) === high).sort((a, b) => Math.hypot(xy(a)[0] - x, xy(a)[1] - z) - Math.hypot(xy(b)[0] - x, xy(b)[1] - z)).slice(0, MAX_CELLS);
    setTool(high ? 'blast' : 'dredge'); setSelected(cells); setAnchor(null); setShowSurvey(true); setFocus(first);
  };
  const restart = () => {
    setGame(createTerrain(humans, ais, game.seed + 1, sandbox)); setSetup(false); setHistory([]); setSelected([]); setAnchor(null); setNotice(''); setFocus(null); setReset(n => n + 1);
  };
  const workOnLock = (index: number) => {
    const cells = lockCells(index); const blocked = cells.filter(id => game.plots[id].height > bedLevel(id));
    if (!blocked.length) { execute({ tool: 'lock', cells: [], source: index }); return; }
    setFocus(LOCKS[index].at[1] * MAP_W + LOCKS[index].at[0]);
    setSelected(cells); setAnchor(null); setShowSurvey(true);
    setTool(blocked.some(id => game.plots[id].height > waterLevel(id)) ? 'blast' : 'dredge');
  };
  const ranked = [...scores].sort((a, b) => b.total - a.total || a.spent - b.spent);

  return (
<main className={styles.game}>
    <header className={styles.header}>
      <Link href="/demos" aria-label="返回游戏列表">←</Link>
      <div className={styles.brand}><b>平陆<span>造山移海</span></b><small>EARTHWORKS / 工程沙盘</small></div>
      <div className={styles.phase}><i />{game.sandbox ? '自由工程' : `第 ${game.round} / ${game.finishRound ?? game.limit} 轮`}{game.finishRound && !game.finished && <em>最后改线期</em>}</div>
      <span className={styles.shareSlot}><GameShareButton gamePath="/game/pinglu-canal" /></span>
      <nav><button onClick={() => setAtlas(true)}>真实地理</button><button onClick={() => setLedger(true)}>工程账本</button><button onClick={() => setRules(true)}>玩法</button><button onClick={() => setSetup(true)}>新地图</button></nav>
    </header>
    <div className={styles.workspace}>
      <section className={styles.map} aria-label="可改造的三维地形">
        <Scene game={game} wet={survey.wet} selected={selection} hovered={hovered} quote={quote} route={survey.route} proposal={survey.proposal} showSurvey={showSurvey} showOwners={showOwners} focus={focus} showReference={showReference} showReclamation={tool === 'haul'} reset={reset} topDown={topDown} disabled={modal} navigate={navigate} onSelect={choose} onHover={setHovered} />
        <div className={styles.objective}><span>{survey.route ? '✓ 已找到合格航线' : '郁江 · 平塘江口 → 北部湾'}</span><b>{survey.route ? `${km(survey.route.length)} · 可试航` : '跨越分水岭，打通江海'}</b><small>134.2 km 工程原型 · 两大水系 · 三级枢纽</small></div>
        <div className={styles.viewControls}><button aria-pressed={topDown} onClick={() => setTopDown(v => !v)}>{topDown ? '◈ 立体' : '▦ 正北俯视'}</button><button aria-pressed={navigate} onClick={() => setNavigate(v => !v)}>{navigate ? '↔ 镜头可拖动' : '⌖ 镜头锁定'}</button><button onClick={() => { setFocus(null); setReset(n => n + 1); }}>全图</button></div>
        <div className={styles.coordinates}>{plot && plotId !== undefined ? <><b>{tileName(plotId)}</b><span>{regionName(plotId)} · 地形 {plot.height} 层</span><span>{survey.wet[plotId] ? `水深 ${waterLevel(plotId) - plot.height} 层` : plot.farm ? (plot.height >= reclamationLevel(plot) ? '已复垦农田' : `天然洼地 · 田面 ${reclamationLevel(plot)} 层`) : plot.rock ? '山岩' : '陆地 / 河床'}</span></> : <span>点地块选择 · 拖动转镜头 · 滚轮缩放 · 右键平移</span>}</div>
        {!game.moves && <div className={styles.firstHint}><b>先找到分水岭。</b><span>北面的沙坪河与南面的旧州江并未相通。<br />凿通山岭，再整治下游河道。</span><button onClick={() => setFocus(GEOGRAPHY.landmarks[2].grid[1] * MAP_W + GEOGRAPHY.landmarks[2].grid[0])}>飞到分水岭 ↗</button></div>}
        <div className={styles.mapBottom}><label htmlFor="terrain-survey"><input id="terrain-survey" type="checkbox" checked={showSurvey} onChange={e => setShowSurvey(e.target.checked)} />{survey.route ? '采用航线' : '航线待施工'}<i className={survey.route ? styles.routeKey : styles.workKey} /></label><label htmlFor="terrain-owners"><input id="terrain-owners" type="checkbox" checked={showOwners} onChange={e => setShowOwners(e.target.checked)} />施工归属</label><span className={styles.selectionKey}><i />{tool === 'haul' ? '青：选中 · 绿：可填洼地' : '青色十字：已选'} · 地理压缩</span></div>
        {last && <div key={last.id} className={styles.workToast} role="status"><i style={{ background: PLAYER_COLORS[last.player] }} />{last.message}{last.cost > 0 ? ` · ¥${last.cost}` : last.cost < 0 ? ` · +¥${-last.cost}` : ''}</div>}
      </section>
      <aside className={styles.panel}>
        {game.finished ? (
<section className={styles.end}>
          <small>联合验收 / FINAL SURVEY</small><h1>{survey.route ? '通江，达海。' : '航道尚未贯通'}</h1>
          <p>{survey.route ? `采用 ${km(survey.route.length)} 航线。仅这条航道实际占用的施工及其土方复垦获得计分。` : '期限已到，没有满足宽度、深度和弯道条件的航线，本局工程未交付。'}</p>
          {ranked.map((s, i) => <div className={styles.result} key={s.id}><span style={{ color: PLAYER_COLORS[s.id] }}>{i + 1}. {game.players[s.id].name}</span><b>{s.total}<small>分</small></b><p>采用 {s.useful} 方 · 复垦 {s.reclaimed} 方<br />未采用 {s.wasted} 方 · 总支出 ¥{s.spent}</p></div>)}
          <button className={styles.primary} onClick={() => setSetup(true)}>再造一条河 →</button><button onClick={() => setLedger(true)}>查看逐格计分</button>
        </section>
) : (
<>
          <div className={styles.player}><i style={{ background: PLAYER_COLORS[player.id] }} /><div><small>{player.ai ? 'AI 正在施工' : '当前承包商'}</small><h2>{player.name}</h2></div><b>{crews}<small>队待派</small></b></div>
          <div className={styles.resources}><div><small>工程资金</small><b>¥{game.sandbox ? '∞' : player.cash}</b></div><div><small>待运土方</small><b>{pileSize(player)}<em>/{game.sandbox ? '∞' : PILE_CAPACITY}</em></b></div></div>
          <label className={styles.reachPicker} htmlFor="terrain-reach">地段导航<select id="terrain-reach" value={focus ?? ''} onChange={e => setFocus(Number(e.target.value))}><option value="" disabled>选择地段，拉近查看</option>{GEOGRAPHY.landmarks.map(p => <option key={p.name} value={p.grid[1] * MAP_W + p.grid[0]}>{p.name}</option>)}</select></label>
          <div className={styles.tools}>{TOOLS.map(t => <button key={t.id} title={t.detail} aria-pressed={tool === t.id} onClick={() => { setTool(t.id); setAnchor(null); }}><span>{t.icon}</span>{t.name}</button>)}</div>
          <p className={styles.toolDescription}>{TOOLS.find(t => t.id === tool)!.detail}</p>
          {tool === 'haul' && <label htmlFor="terrain-soil" className={styles.source}>从你的堆土场装车<select id="terrain-soil" aria-label="土方来源" value={effectiveSource ?? ''} onChange={e => setSource(Number(e.target.value))}><option value="" disabled>选择有土的工地</option>{sources.map(id => <option key={id} value={id}>{tileName(id)} · {pileSize(player, id)} 方</option>)}</select><small>再选择地图上绿色提示的天然洼地。车沿陆路行驶，路程越远费用越高。</small></label>}
          <div className={styles.brush}><button aria-pressed={!line} onClick={() => { setLine(false); setAnchor(null); }}>单点</button><button aria-pressed={line} onClick={() => { setLine(true); setAnchor(null); }}>两点拉线</button><button aria-pressed={wide} onClick={() => setWide(v => !v)}>{wide ? '3 格宽' : '1 格宽'}</button></div>
          <div className={styles.selection}><div><strong>{anchor !== null ? '再点一下线段终点' : selection.length ? `已选 ${selection.length} 格` : '选一个地方，开始改变它'}</strong>{selection.length > 0 && <button aria-label="清空选择" onClick={() => { setSelected([]); setAnchor(null); }}>×</button>}</div><small>{selection.length > 0 ? `${tileName(selection[0])}${selection.length > 1 ? ` → ${tileName(selection[selection.length - 1])}` : ''} · 单队最多 ${MAX_CELLS} 格` : '可以从任何地方开工，不必跟随建议线。'}</small>{selectedOwners.length > 0 && <small>已有投入：{selectedOwners.map(p => `${p.name} ${p.units} 方`).join(' · ')}</small>}</div>
          <div className={styles.quote}>
            {quote.error ? <p>{quote.error}</p> : <><div><span>{tool === 'haul' ? '填入土方' : '挖出土方'}<b>{quote.units} 方</b></span><span>本次费用<b>¥{quote.cost}</b></span></div><small>{quote.cells.length} 格将改变标高 · 消耗 1 支工程队<br />首格 {game.plots[quote.cells[0]]?.height} 层 → {quote.depths[quote.cells[0]]} 层</small></>}
            <button className={styles.primary} disabled={!!quote.error || player.ai || anchor !== null} onClick={() => execute(action)}>{player.ai ? '对手正在调度工程队…' : tool === 'haul' ? '发车，运土回填 →' : '开始施工 →'}</button>
          </div>
          <div className={styles.secondary}><button disabled={player.ai || !pileSize(player)} onClick={() => execute({ tool: 'dispose', cells: [] })}>外运弃土 <small>64 方 / ¥8</small></button><button disabled={player.ai} onClick={() => execute({ tool: 'fund', cells: [] })}>申请拨款 <small>+¥55 / 1 队</small></button></div>
          <details className={styles.locks} open><summary>三级枢纽 · {game.locks.filter(owner => owner !== null).length} / 3 建成</summary>{LOCKS.map(l => {
            const missing = lockCells(l.index).filter(id => game.plots[id].height > bedLevel(id)).length;
            return <div key={l.name}><span>{l.name}<small>示意水级 {WATER_STEPS[l.index]} → {WATER_STEPS[l.index + 1]}</small></span><button disabled={player.ai || game.locks[l.index] !== null} onClick={() => workOnLock(l.index)}>{game.locks[l.index] !== null ? '已建成' : missing ? `定位基坑 · ${missing} 格` : '建船闸 · ¥30'}</button></div>;
          })}</details>
          <div className={styles.survey}><div><small>航线测绘</small><b>{survey.route ? '航槽与三级船闸通过' : `建议航线待施工 ${survey.proposal.blocked.length} 格`}</b></div><p>{survey.route ? `当前最短合格航程 ${km(survey.route.length)}。${game.players.length > 1 ? '最后改线期结束后，按最短合格路线计分。' : '继续取直和复垦，或现在验收交付。'}` : `尚差 ${survey.proposal.remaining} 方开挖。橙红斜纹仅标出建议航线内需开挖、拓宽或疏浚的地块，含转弯扫过范围。天然洼地本身没有缺陷。`}</p>{survey.route && game.players.length === 1 ? <button onClick={() => setGame(finishTerrain(game))}>试航通过 · 验收交付 →</button> : <button disabled={player.ai || !!survey.route} onClick={locate}>定位航线施工缺口 ↗</button>}</div>
          {game.finishRound && <p className={styles.deadline}>已出现合格航道。第 {game.finishRound} 轮结束时采用最短路线；新捷径可能让旧支线失去得分。</p>}
          <details className={styles.more}><summary>坐标选择与其他操作</summary><div className={styles.coordinateInput}><label htmlFor="terrain-row">行<select id="terrain-row" value={row} onChange={e => setRow(Number(e.target.value))}>{Array.from({ length: MAP_H }, (_, i) => <option key={i} value={i}>{`R${i + 1}`}</option>)}</select></label><label htmlFor="terrain-column">列<input id="terrain-column" type="number" min={1} max={MAP_W} value={column + 1} onChange={e => setColumn(Math.max(0, Math.min(MAP_W - 1, Number(e.target.value) - 1)))} /></label><button onClick={() => choose(tileId(column, row))}>选中</button></div><button disabled={game.players.length !== 1 || !history.length} onClick={undo}>撤销上次施工（单人）</button><button disabled={player.ai} onClick={() => execute({ tool: 'pass', cells: [] })}>本队等待</button></details>
        </>
)}
        {notice && <p className={styles.notice} role="status">{notice}</p>}
      </aside>
    </div>
    <footer className={styles.footer}><span>DEM 高程 · © OpenStreetMap · 地理压缩沙盘</span><span>{game.sandbox ? '自由模式不设工期与预算限制' : '每轮 3 队 / 人 · 顺序逐轮反转 · 每轮拨款 ¥24'}</span><button onClick={() => setLedger(true)}>采用贡献 {scores.find(s => s.id === player.id)?.useful ?? 0} 方 · 账本 ↗</button></footer>
    {modal && (
<div className={styles.backdrop}><section ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" aria-label={atlas ? '真实地理资料' : handoff ? '施工交接' : setup ? '新工程' : rules ? '游戏规则' : '工程账本'}>
      {!handoff && <button className={styles.close} aria-label="关闭面板" onClick={() => { setRules(false); setSetup(false); setLedger(false); }}>×</button>}
      {handoff ? <><small>交接工程指挥台</small><h2>轮到{player.name}</h2><p>地形与投入全部公开。轮到你，决定是延续现有航道，还是修一条会被采用的捷径。</p><button className={styles.primary} onClick={() => setHandoff(false)}>接手施工 →</button></> : setup ? (
<>
        <small>新地图 / NEW EARTHWORKS</small><h2>从平塘江口到北部湾</h2><p>真实地理版使用固定的高程与河网，每局重置施工进度。单人可撤销，多人共同建设；旧版存档另行保留。</p>
        <label htmlFor="terrain-humans" className={styles.setupField}>真人承包商<select id="terrain-humans" value={humans} onChange={e => { const n = Number(e.target.value); setHumans(n); setAis(a => Math.min(a, 4 - n)); }}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} 人{n > 1 ? ' · 同机交接' : ''}</option>)}</select></label>
        <label htmlFor="terrain-ais" className={styles.setupField}>AI 对手<select id="terrain-ais" value={ais} onChange={e => setAis(Number(e.target.value))}>{Array.from({ length: 5 - humans }, (_, n) => <option key={n} value={n}>{n} 家</option>)}</select></label>
        {humans === 1 && ais === 0 && <label htmlFor="terrain-sandbox" className={styles.check}><input id="terrain-sandbox" type="checkbox" checked={sandbox} onChange={e => setSandbox(e.target.checked)} />自由工程：不限资金、堆土与轮数</label>}
        <button className={styles.primary} onClick={restart}>重置工程，进场 →</button>
      </>
) : atlas ? (
<>
        <small>地理依据 / PINGLU CANAL</small><h2>跨过分水岭，连接两个水系。</h2>
        <p>平陆运河全长 134.2 km。北端从郁江、西津库区的平塘江口进入沙坪河，穿过分水岭，接入旧州江；经陆屋进入钦江，南下钦州，通向北部湾。原本没有一条贯穿全程的天然河流。</p>
        <p>沙盘使用公开 DEM 高程与 OSM 河线，按经纬度重采样为 48×72 格。分水岭需要新挖，内河段需要拓宽、疏浚与局部取直，入海段是低平海湾。马道、企石、青年枢纽按地理位置依次排列。</p>
        <label className={styles.check} htmlFor="terrain-reference"><input id="terrain-reference" type="checkbox" checked={showReference} onChange={e => setShowReference(e.target.checked)} />显示紫色的实际运河参考走向（OSM，非预挖航道）</label>
        <p className={styles.fine}>这是基本地理复刻，不是工程测量模型。DEM 不提供精确水下河床，因此天然河宽与水深做了概化；船闸、航槽宽度放大，4 个水位是依据总落差 65 m 设置的游戏示意值，并非真实运行水位。终点放在茅尾海内，非实际终点桩号。自然洼地是否复垦由你决定。</p>
        <ul className={styles.sources}><li><a href="https://www.gov.cn/lianbo/202606/content_7071050.htm" target="_blank" rel="noreferrer">新华社 / 中国政府网：路线、65 m 落差、三级枢纽</a></li><li><a href="https://news.youth.cn/hotnews_41880/202609/t20260920_16878725.htm" target="_blank" rel="noreferrer">中国青年网：平塘江口、沙坪河与分水岭</a></li><li><a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">高程：Mapzen / AWS Terrain Tiles（USGS、NOAA）</a></li><li><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">河网与枢纽：© OpenStreetMap contributors · ODbL</a></li><li><a href="/games/pinglu-canal/geography-data.json" download>下载本地图的高程、河线与来源数据（ODbL）</a></li></ul>
      </>
) : rules ? (
<>
        <small>玩法 / HOW TO BUILD</small><h2>山可以移，航线由你决定。</h2>
        <ol className={styles.rules}><li><b>挖的是地形。</b>全图 48×72 格，按真实高程和经纬度采样。水平格距约 1.6 km，高程约 5 m 一层；航槽与船闸为可操作性放大。爆破下挖三层，普通开挖一层，疏浚两层。每个河段挖到本河段水面以下 3 层。选单格，或点两次画线；3 格宽适合开航槽。</li><li><b>水会寻找连通的低处。</b>各河段从原有河流向低处进水。沙坪河与旧州江之间保留天然分水岭；三级船闸连接四个水位。天然洼地不需要修复；切换运土后绿色标出可复垦低地，填至当地田面高度后形成农田；不允许回填已挖航槽来堵对手。</li><li><b>土来自具体工地。</b>挖出的土暂存在当地，运输需选来源和填方地，费用随陆路距离增加。满仓可外运弃土。土方按施工批次计量，不换算为真实体积。</li><li><b>船身必须整个走得过。</b>沙盘验收要求净宽 3 格、水深 3 层、转弯半径 3 格，且三座船闸全部建成。沿直线、斜线和光滑弯道计算船身扫过的地块；直角拐弯要额外拓宽。橙红测绘建议只是参考，可以全部重挖。</li><li><b>只为最终采用的工程付分。</b>系统采用航程最短的合格路线：其中每单位有效开挖得 3 分；运到已整平农田且来自采用航线的土，额外每单位得 2 分。弃用支线、未整平农田、外运弃土均不得分。最终采用的船闸由建设者各得 40 分。相同分数时总支出较少者领先。</li><li><b>留给对手一次改线机会。</b>每人每轮 3 队，以往返顺序轮流施工，次轮反转。首次贯通后还有两轮，新的短线可能使旧投资落空。单人可直接交付，或继续施工；自由模式不限工期。</li></ol>
        <p className={styles.fine}>这是地形工程桌游原型：采用四级示意水位与离散曲线模板。总落差原型为 65 m，分级水位不是实际运行水位；航槽宽度、闸室、地形高差做了可玩性夸张，不是施工测量模型。</p>
      </>
) : (
<>
        <small>工程账本 / CONTRIBUTION</small><h2>{survey.route ? '这条航线，采用了谁的工程？' : '尚未产生可交付航线'}</h2><p>{survey.route ? `按当前最短合格航线 ${km(survey.route.length)} 计算，改线后还会变化。` : '正式得分暂为 0。下表同时列出按橙红测绘建议完工后的预计采用量，最终路线可以不同。'}</p>
        <div className={styles.ledger}>{game.players.map(p => { const s = scores[p.id]; return <article key={p.id}><h3 style={{ color: PLAYER_COLORS[p.id] }}>{p.name}<b>{s.total} 分</b></h3><p>已采用开挖 {s.useful} 方 · 有效复垦 {s.reclaimed} 方 · 船闸 {s.locks} 座<br />未采用 {s.wasted} 方 · 支出 ¥{p.spent} · 堆土 {pileSize(p)} 方</p>{!survey.route && <small>建议线预计采用：{estimated[p.id].useful} 方（非已得分）</small>}</article>; })}</div>
        <details className={styles.more}><summary>查看最近施工记录</summary>{[...game.events].reverse().map(e => <p key={e.id}>{e.message} · {e.cells.length ? e.cells.map(tileName).slice(0, 3).join('、') : ''}{e.cost >= 0 ? ` · ¥${e.cost}` : ` · +¥${-e.cost}`}</p>)}</details>
      </>
)}
    </section></div>
)}
  </main>
);
}
