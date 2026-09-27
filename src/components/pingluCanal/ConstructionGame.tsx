'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Action, activeCompany, allConnected, built, Company, ConstructionGame as Game,
  constructionGrant, createConstruction, EQUIPMENT, EQUIPMENT_IDS, gameSummary,
  MAIN_PROJECTS, MAX_ROUNDS, money, nextRound, previewPlan, PROJECTS, projectById,
  quality, quoteAction, readyCount, REGION_IDS, REGIONS, regionStandings, requiredWork,
  SAVE_VERSION, scoreCompany, SOLO_TARGET, soilTotal, SPECIALTIES, Specialty, specialtyProgress,
  submitPlan, weather, WORKERS,
} from './construction';
import styles from './construction.module.css';

const Diorama = dynamic(() => import('./CanalDiorama'), { ssr: false, loading: () => <div className={styles.mapLoading}>正在展开工程沙盘…</div> });
const SAVE_KEY = 'pinglu-shared-construction-v1';
const COLORS = ['#bd6c45', '#417e92', '#9b8859', '#8c6b99'];
type TextWindow = Window & { render_game_to_text?: () => string };
type Method = 'build' | 'haul' | 'inspect';

function RoundSummary({ game, onNext, onNew }: { game: Game; onNext: () => void; onNew: () => void }) {
  const report = game.reports[game.reports.length - 1];
  const final = game.phase === 'finished';
  const ranked = [...game.companies].sort((a, b) => scoreCompany(game, b).total - scoreCompany(game, a).total);
  const leaders = ranked.filter((c) => scoreCompany(game, c).total === scoreCompany(game, ranked[0]).total);
  return (
<section className={styles.review} aria-label={final ? '联合验收结算' : '本轮工程报告'}>
    <div className={styles.reviewHeading}><div><span className={styles.eyebrow}>{final ? '工程期结束 · 联合验收' : `第 ${game.round} 轮 · 全部计划已公开`}</span><h2>{final ? quality(game) : '这一轮，工程向前走了'}</h2></div><button type="button" className={styles.primary} onClick={final ? onNew : onNext}>{final ? '开始新工程' : `进入第 ${game.round + 1} 轮 →`}</button></div>
    {final ? (
<>
      <p className={styles.winner}>{game.companies.length === 1 ? `${scoreCompany(game, ranked[0]).total} 分 · ${allConnected(game) && scoreCompany(game, ranked[0]).total >= SOLO_TARGET ? '个人挑战达成' : `目标：合龙并达到 ${SOLO_TARGET} 分`}` : `${leaders.map((c) => c.name).join('、')}${leaders.length > 1 ? '并列' : ''}赢得承包商竞赛`}</p>
      <div className={styles.finalScores}>{ranked.map((c) => { const s = scoreCompany(game, c); return <div key={c.id}><h3>{c.name}<b>{s.total}<small>分</small></b></h3><p>工程声望 {s.prestige} + 资金 {s.cash} + 专业 {s.specialty} + 区域 {s.region} + 合龙 {s.acceptance}</p><small>{specialtyProgress(game, c).text}</small></div>; })}</div>
    </>
) : <p className={styles.completionLine}>新完工：{report.completed.map((id) => projectById(id)!.short).join('、') || '无'}<span>新验收：{report.accepted.map((id) => projectById(id)!.short).join('、') || '无'}</span></p>}
    <div className={styles.reportRows}>{report.companies.map((row) => <div key={row.id}><span className={styles.playerDot} style={{ background: COLORS[row.id] }}>{row.id + 1}</span><div><b>{game.companies.find((c) => c.id === row.id)!.name}</b><p>{row.actions.join(' → ')}</p></div><strong>+{money(row.points)} 分<small>建设与验收款 ¥{money(row.grants)}</small></strong></div>)}</div>
    {report.crowded.length > 0 && <details className={styles.crowded}><summary>本轮 {report.crowded.length} 处合建超量：贡献全部保留，建设回报按份额分配</summary>{report.crowded.map((entry) => <p key={entry.project}>{projectById(entry.project)!.name}：剩余 {entry.needed} 工作量，共投入 {entry.offered} 贡献。</p>)}</details>}
    {!final && <p className={styles.forecast}>下轮{weather(game.seed, game.round + 1).name} · 每家公司补 {weather(game.seed, game.round + 1).water} 份试验水，上限 5。</p>}
  </section>
);
}

function CompanyGoal({ game, company }: { game: Game; company: Company }) {
  const goal = specialtyProgress(game, company);
  return <div className={styles.goal}><span className={styles.eyebrow}>公司专业目标 · +8 分</span><h3>{SPECIALTIES[company.specialty].name}</h3><p>{SPECIALTIES[company.specialty].description}</p><div className={styles.goalTrack}><i style={{ width: `${goal.fraction * 100}%` }} /></div><small>{goal.text}{goal.complete ? ' · 已达成 ✓' : ''}</small></div>;
}

export default function ConstructionGame() {
  const [game, setGame] = useState<Game>(() => createConstruction());
  const [draft, setDraft] = useState<Action[]>([]);
  const [selectedId, setSelectedId] = useState('B');
  const [method, setMethod] = useState<Method>('build');
  const [source, setSource] = useState('B');
  const [utility, setUtility] = useState<Action | null>(null);
  const [tab, setTab] = useState<'site' | 'company'>('site');
  const [cameraReset, setCameraReset] = useState(0);
  const [rules, setRules] = useState(false);
  const [setup, setSetup] = useState(false);
  const [humans, setHumans] = useState(1);
  const [ais, setAis] = useState(2);
  const [specialty, setSpecialty] = useState<Specialty>('engineering');
  const [handoff, setHandoff] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [inspectedCompany, setInspectedCompany] = useState<number | null>(null);
  const submitLock = useRef(false);
  const modalRef = useRef<HTMLElement>(null);
  const current = activeCompany(game);
  const preview = useMemo(() => (current ? previewPlan(game, current, draft) : null), [game, current, draft]);
  const company = preview?.company ?? game.companies[0];
  const sites = preview?.sites ?? game.sites;
  const selected = projectById(selectedId)!;
  const site = sites[selectedId];
  const sources = Object.keys(company.soil).filter((id) => company.soil[id] >= 2);
  const effectiveSource = sources.includes(source) ? source : sources[0] ?? 'B';
  const action: Action = tab === 'company' && utility ? utility : method === 'haul' ? { type: 'haul', project: selectedId, source: effectiveSource } : { type: method, project: selectedId };
  const quote = current ? quoteAction(game, company, action, sites) : null;
  const full = draft.length === WORKERS;
  const shownCompany = game.companies.find((c) => c.id === inspectedCompany) ?? current ?? game.companies[0];

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { game: Game; draft: Action[] };
        if (saved.game?.version === SAVE_VERSION && saved.game.round >= 1 && saved.game.round <= MAX_ROUNDS
          && Array.isArray(saved.game.companies) && saved.game.companies.length >= 1 && saved.game.companies.length <= 4
          && PROJECTS.every((p) => saved.game.sites[p.id] && Number.isFinite(saved.game.sites[p.id].work)) && Array.isArray(saved.draft)) {
          const player = activeCompany(saved.game);
          if (!player || !previewPlan(saved.game, player, saved.draft).error) {
            setGame(saved.game); setDraft(saved.draft);
            const h = saved.game.companies.filter((c) => c.kind === 'human').length;
            setHumans(h); setAis(saved.game.companies.length - h); setSpecialty(saved.game.companies[0].specialty);
            setHandoff(h > 1 && saved.game.phase === 'planning');
          }
        }
      }
    } catch { setSaveNotice('旧存档无法读取，已开启新工程。'); }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem(SAVE_KEY, JSON.stringify({ game, draft })); } catch { setSaveNotice('本机暂时不能保存进度，仍可继续对局。'); }
  }, [game, draft, loaded]);
  useEffect(() => {
    const target = window as TextWindow;
    target.render_game_to_text = () => JSON.stringify(handoff ? { phase: 'handoff', round: game.round, nextCompany: current?.id } : gameSummary(game, draft));
    return () => { delete target.render_game_to_text; };
  }, [game, draft, handoff, current?.id]);
  useEffect(() => {
    if (!rules && !setup) return undefined;
    const lastFocus = document.activeElement as HTMLElement | null;
    const controls = modalRef.current?.querySelectorAll<HTMLElement>('button, select, input');
    controls?.[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setRules(false); setSetup(false); }
      if (event.key === 'Tab' && controls?.length) {
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); lastFocus?.focus(); };
  }, [rules, setup]);

  const selectProject = (id: string) => {
    setSelectedId(id); setTab('site'); setUtility(null);
    setMethod(built(game, id, sites) && projectById(id)!.main ? 'inspect' : 'build');
  };
  const selectUtility = (next: Action) => { setTab('company'); setUtility(next); };
  const add = () => {
    if (!current || !quote || quote.error || full || busy) return;
    const next = [...draft, action];
    if (previewPlan(game, current, next).error) return;
    setDraft(next);
    if (action.type === 'build' || action.type === 'haul') {
      const after = previewPlan(game, current, next);
      if (built(game, selectedId, after.sites) && selected.main) setMethod('inspect');
    }
  };
  const submit = () => {
    if (!current || !full || submitLock.current) return;
    submitLock.current = true; setBusy(true);
    window.setTimeout(() => {
      const next = submitPlan(game, current.id, draft);
      setGame(next); setDraft([]); setBusy(false); submitLock.current = false;
      setHandoff(next.phase === 'planning'); setInspectedCompany(null);
      if (next.phase !== 'planning') window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 30);
  };
  const advance = () => {
    setGame(nextRound(game)); setDraft([]); setUtility(null); setTab('site'); setMethod('build'); setInspectedCompany(null);
    setHandoff(game.companies.filter((c) => c.kind === 'human').length > 1);
  };
  const restart = () => {
    if (humans + ais > 4 || busy) return;
    setGame(createConstruction(humans, ais, game.seed + 1, specialty)); setDraft([]); setSelectedId('B'); setMethod('build'); setTab('site'); setUtility(null);
    setSetup(false); setHandoff(humans > 1); setCameraReset((n) => n + 1); setInspectedCompany(null);
  };

  return (
<main className={styles.page}>
    <header className={styles.header}><Link href="/demos" className={styles.back} aria-label="返回游戏列表">←</Link><div className={styles.brand}><span>平陆</span><div><small>一条运河 · 共同承建</small><h1>合龙</h1></div></div><p>工程不是一个人的事。</p><nav><button type="button" onClick={() => setRules(true)}>工程简报</button><button type="button" disabled={busy} onClick={() => setSetup(true)}>新对局</button></nav></header>
    {handoff ? <section className={styles.handoff}><span className={styles.eyebrow}>计划已封存 · 请交接设备</span><h2>轮到{current?.name}规划</h2><p>各家从相同的轮初局面安排三步。上一家公司的计划将在所有人提交后一起公开。</p><button type="button" className={styles.primary} onClick={() => setHandoff(false)}>我是{current?.name}，查看工地</button></section> : (
<div className={styles.content}>
      <div className={styles.overview}><div className={styles.round}><span>第</span><b>{String(game.round).padStart(2, '0')}</b><span>/ {MAX_ROUNDS} 轮</span></div><div className={styles.overviewMessage}><strong>{game.phase === 'finished' ? quality(game) : '多处开工，终归一条通途'}</strong><span>{game.phase === 'planning' ? '每人安排 3 个行动，再一起结算 · 提交顺序不影响回报' : '本轮计划已落地，可以查看工程与公司收支'}</span></div><div className={styles.acceptance}><b>{readyCount(game)}<small>/8 标段验收</small></b><span>{weather(game.seed, game.round).name} · 下轮补水 {game.round < MAX_ROUNDS ? weather(game.seed, game.round + 1).water : '—'}</span></div></div>
      {game.phase !== 'planning' && <RoundSummary game={game} onNext={advance} onNew={() => setSetup(true)} />}
      <div className={styles.workspace}>
        <section className={styles.mapColumn} aria-label="共享工程沙盘">
          <div className={styles.mapToolbar}><span><i />平陆运河 · 立体工程沙盘</span><button type="button" onClick={() => setCameraReset((n) => n + 1)}>复位视角 ↺</button></div>
          <div className={styles.mapFrame} data-testid="canal-diorama"><Diorama game={game} sites={sites} selected={selectedId} onSelect={selectProject} reset={cameraReset} interactive={!rules && !setup && !busy} /><div className={styles.mapHint}>点击工地 · 拖动旋转 · 滚轮缩放</div><div className={styles.mapLegend}><span><i style={{ background: '#d7c5a2' }} />待施工</span><span><i style={{ background: '#a0b7aa' }} />已完工</span><span><i style={{ background: '#61a8aa' }} />已验收</span>{draft.length > 0 && <b>沙盘包含你的待执行计划</b>}</div></div>
          <div className={styles.channelStrip} aria-label="全线验收连接图"><span>西江</span>{MAIN_PROJECTS.map((p) => <button type="button" key={p.id} data-accepted={sites[p.id].accepted} data-built={built(game, p.id, sites)} aria-pressed={selectedId === p.id} onClick={() => selectProject(p.id)}>{p.id}<small>{sites[p.id].accepted ? '验收' : built(game, p.id, sites) ? '待验' : `${sites[p.id].work}/${requiredWork(game, p)}`}</small></button>)}<span>北部湾</span></div>
          <details className={styles.siteDirectory}><summary>工地清单 <span>可在任意未完工标段开工</span></summary><div className={styles.projectGrid}>{PROJECTS.map((p) => <button type="button" data-project={p.id} key={p.id} aria-pressed={selectedId === p.id} onClick={() => selectProject(p.id)}><span className={styles.projectCode} data-main={p.main}>{p.main ? p.id : p.kind === 'wildlife' ? '↟' : p.kind === 'fishway' ? '≈' : p.kind === 'bridge' ? '⌒' : p.kind === 'saving' ? '▥' : '♧'}</span><div><b>{p.short}</b><small>{sites[p.id].accepted ? '已验收 ✓' : `${sites[p.id].work}/${requiredWork(game, p)} 工作量`}{!p.required ? ' · 提升品质' : ''}</small></div><i style={{ width: `${Math.min(100, (sites[p.id].work / requiredWork(game, p)) * 100)}%` }} /></button>)}</div></details>
        </section>

        <aside className={styles.planner} aria-label="工程队行动计划">
          <div className={styles.plannerHeading}><div><span className={styles.eyebrow}>{current ? `${current.name} · 本轮三步` : '工程总览'}</span><h2>{current ? '调度你的工程队' : '共同建成的运河'}</h2></div><span className={styles.workerCount}>{draft.length}<small>/3</small></span></div>
          <div className={styles.resources}><div><small>{draft.length ? '计划后资金' : '可用资金'}</small><b>¥{money(company.cash)}</b></div><div><small>自有土方</small><b>{soilTotal(company)}<em>份</em></b></div><div><small>试验用水</small><b>{company.water}<em>/5</em></b></div></div>
          {current ? (
<>
            {game.round === 1 && draft.length === 0 && <p className={styles.startHint}>先选一个工地。试试「山体切方 → 运土回填」，前一步产出的土可以在本轮接着用。</p>}
            <ol className={styles.plan}>{[0, 1, 2].map((i) => <li key={i} data-filled={Boolean(draft[i])}><span>{i + 1}</span>{preview?.quotes[i] ? <><div><b>{preview.quotes[i].title}</b><small>{preview.quotes[i].cost > 0 ? '−' : '+'}¥{Math.abs(preview.quotes[i].cost)}{preview.quotes[i].work ? ` · 贡献 +${preview.quotes[i].work}` : ''}{preview.quotes[i].soil ? ` · 土 ${preview.quotes[i].soil > 0 ? '+' : ''}${preview.quotes[i].soil}` : ''}</small></div><button type="button" disabled={busy} onClick={() => setDraft(draft.slice(0, i))} aria-label={`撤回第 ${i + 1} 步及后续行动`}>↶</button></> : <p>待派遣</p>}</li>)}</ol>
            {full ? <div className={styles.ready}><h3>三支工程队已就位</h3><p>建设款在共同结算后入账。合建保留全部贡献，同一工地的回报按份额分配。</p><button type="button" className={styles.primary} disabled={busy} onClick={submit}>{busy ? '正在展开各家计划…' : '封存计划，一起开工 →'}</button><button type="button" className={styles.textButton} disabled={busy} onClick={() => setDraft([])}>清空计划，重新安排</button></div> : (
<>
              <div className={styles.tabs} role="group" aria-label="行动类别"><button type="button" aria-pressed={tab === 'site'} onClick={() => setTab('site')}>工地施工</button><button type="button" aria-pressed={tab === 'company'} onClick={() => { setTab('company'); setUtility({ type: 'fund' }); }}>公司与调度</button></div>
              {tab === 'site' ? (
<div className={styles.sitePanel}><label className={styles.projectSelect} htmlFor="project-select">当前工地<select id="project-select" value={selectedId} onChange={(event) => selectProject(event.target.value)}>{PROJECTS.map((p) => <option key={p.id} value={p.id}>{p.main ? `${p.id} · ` : ""}{p.name}{sites[p.id].accepted ? " · 已验收" : ""}</option>)}</select></label><div className={styles.siteHeading}><span className={styles.projectCode}>{selected.main ? selected.id : '配套'}</span><div><span className={styles.eyebrow}>{REGIONS[selected.region].name}</span><h3>{selected.name}</h3></div></div><p className={styles.siteDescription}>{selected.description}</p><div className={styles.siteStats}><span>工程 <b>{site.work}/{requiredWork(game, selected)}</b></span><span>建设款池 <b>¥{constructionGrant(game, selected)}</b></span><span>建成奖励 <b>{selected.reward} 分</b></span></div>
                <div className={styles.methodChoice} role="group" aria-label="施工方式"><button type="button" aria-pressed={method === 'build'} onClick={() => setMethod('build')}>普通施工</button>{['fill', 'wetland'].includes(selected.kind) && <button type="button" aria-pressed={method === 'haul'} onClick={() => setMethod('haul')}>运土回填</button>}{selected.main && <button type="button" aria-pressed={method === 'inspect'} onClick={() => setMethod('inspect')}>试水验收</button>}</div>
                {method === 'haul' && <label className={styles.sourceLabel} htmlFor="soil-source">从哪个堆土场运出？<select id="soil-source" value={effectiveSource} onChange={(event) => setSource(event.target.value)}>{sources.length ? sources.map((id) => <option key={id} value={id}>{projectById(id)?.short} · {company.soil[id]} 土</option>) : <option value="B">尚无足够自产土方</option>}</select></label>}
                {Object.keys(site.contributions).length > 0 && <div className={styles.shares}>本段贡献：{Object.entries(site.contributions).map(([id, amount]) => <span key={id} style={{ color: COLORS[Number(id)] }}>{game.companies.find((c) => c.id === Number(id))!.name} {amount}</span>)}</div>}
              </div>
) : (
<div className={styles.companyActions}>
                {EQUIPMENT_IDS.map((id) => <button type="button" data-equipment={id} aria-pressed={utility?.type === 'equipment' && utility.equipment === id} key={id} onClick={() => selectUtility({ type: 'equipment', equipment: id })}><div><b>{EQUIPMENT[id].name}</b><small>{EQUIPMENT[id].detail}</small></div><strong>{company.equipment.includes(id) ? '✓' : `¥${EQUIPMENT[id].cost}`}</strong></button>)}
                <div className={styles.campActions}>{REGION_IDS.map((region) => <button type="button" key={region} aria-pressed={utility?.type === 'camp' && utility.region === region} onClick={() => selectUtility({ type: 'camp', region })}><b>{REGIONS[region].name}营地</b><small>{company.camps[region]}/2 级 · 施工省 ¥1</small></button>)}</div>
                <div className={styles.utilityActions}><button type="button" aria-pressed={utility?.type === 'fund'} onClick={() => selectUtility({ type: 'fund' })}><b>后勤维护</b><small>立即 +¥4</small></button><button type="button" aria-pressed={utility?.type === 'water'} onClick={() => selectUtility({ type: 'water' })}><b>补充试验水</b><small>立即 +3 水</small></button></div>
              </div>
)}
              {quote && <div className={styles.actionQuote} data-testid="action-quote"><span className={styles.eyebrow}>行动预览 · 使用 1 支工程队</span><h3>{quote.title}</h3>{action.type !== "build" && <p>{quote.description}</p>}<div className={styles.effects}><span>{quote.cost > 0 ? `支付 ¥${quote.cost}` : quote.cost < 0 ? `立即 +¥${-quote.cost}` : '无需资金'}</span>{quote.work > 0 && <span>工作量 +{quote.work}</span>}{quote.points > 0 && <span>声望 +{quote.points}</span>}{quote.soil !== 0 && <span>土方 {quote.soil > 0 ? '+' : ''}{quote.soil}</span>}{quote.water !== 0 && <span>{quote.water < 0 ? '用水' : '补水'} {Math.abs(quote.water)}</span>}</div><button type="button" className={styles.primary} data-testid="add-action" disabled={Boolean(quote.error) || busy} onClick={add}>{quote.error ?? '加入计划 →'}</button></div>}
            </>
)}
          </>
) : <div className={styles.ready}><p>{game.phase === 'finished' ? '工程竞赛已结算。可以旋转沙盘，查看大家建成的船闸、桥梁与河道。' : '每条彩旗代表该工地的主要承建公司。准备好后进入下一轮，继续安排工地。'}</p><button type="button" className={styles.primary} onClick={game.phase === 'finished' ? () => setSetup(true) : advance}>{game.phase === 'finished' ? '设置新对局' : `进入第 ${game.round + 1} 轮 →`}</button></div>}
        </aside>
      </div>

      <section className={styles.companies} aria-label="承包商公司"><div className={styles.sectionTitle}><h2>共同的工程，各自的算盘</h2><span>点击公司查看专业目标与设备</span></div><div className={styles.companyRow}>{game.companies.map((c) => <button type="button" className={styles.companyCard} key={c.id} data-active={current?.id === c.id} aria-pressed={shownCompany.id === c.id} onClick={() => setInspectedCompany(c.id)}><span className={styles.playerDot} style={{ background: COLORS[c.id] }}>{c.id + 1}</span><div><b>{c.name}</b><small>{c.kind === 'ai' ? 'AI · ' : ''}{SPECIALTIES[c.specialty].name}{game.plans[c.id] ? ' · 已封存' : ''}</small></div><strong>{Math.floor(c.prestige)}<small>工程声望</small></strong><p>资金 ¥{money(c.cash)} · 土方 {soilTotal(c)} · 试验水 {c.water}</p></button>)}</div><details className={styles.companyDetails}><summary>{shownCompany.name} · 专业目标与设备</summary><CompanyGoal game={game} company={shownCompany} /><p className={styles.equipmentList}>已购设备：{shownCompany.equipment.map((id) => EQUIPMENT[id].name).join('、') || '基础施工队'}</p></details></section>

      <section className={styles.regions} aria-label="区域承包优势"><div className={styles.sectionTitle}><h2>三片工区，争一份承包优势</h2><span>终局每区 8 分 · 并列平分取整</span></div><div className={styles.regionRow}>{regionStandings(game).map((region) => <div className={styles.regionCard} key={region.region}><h3>{REGIONS[region.region].name}</h3>{region.counts.map((entry) => <div className={styles.influence} key={entry.id}><span>{game.companies.find((c) => c.id === entry.id)!.name}</span><div><i style={{ width: `${Math.max(2, (entry.value / Math.max(1, ...region.counts.map((n) => n.value))) * 100)}%`, background: COLORS[entry.id] }} /></div><b>{entry.value}</b></div>)}<p>{region.leaders.length ? `${region.leaders.map((id) => game.companies.find((c) => c.id === id)!.name).join('、')}暂领 ${region.points} 分` : '尚无承包贡献'}</p></div>)}</div><p className={styles.regionNote}>施工贡献每份算 1 影响力，该工程验收后算 2；工区营地每级 +2。区域结果取决于最终布局。</p></section>
      <footer className={styles.footer}><span>{saveNotice || '自动保存于本机 · 同机多人 / AI / 单人挑战'}</span><span>工程与地理为游戏化抽象 · 灵感来自平陆运河</span></footer>
    </div>
)}
    {(rules || setup) && (
<div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setRules(false); setSetup(false); } }}><section ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="construction-dialog-title"><button type="button" className={styles.close} aria-label="关闭" onClick={() => { setRules(false); setSetup(false); }}>×</button>
      {setup ? <><span className={styles.eyebrow}>一条运河，多家公司</span><h2 id="construction-dialog-title">开始新一期工程</h2><p>最多 10 轮，每轮每人 3 个行动；全线验收后提前结算。工程量随人数调整。</p><div className={styles.setupCounts}><label htmlFor="human-count">同机玩家<select id="human-count" value={humans} onChange={(event) => setHumans(Number(event.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} 位</option>)}</select></label><label htmlFor="ai-count">AI 对手<select id="ai-count" value={ais} onChange={(event) => setAis(Number(event.target.value))}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n} 位</option>)}</select></label></div><h3>你的公司专业目标</h3><p className={styles.muted}>起始资源相同，达成专业目标额外 +8 分。其他公司的目标在公司栏公开。</p><div className={styles.specialtyChoices}>{(Object.keys(SPECIALTIES) as Specialty[]).map((id) => <button type="button" aria-pressed={specialty === id} key={id} onClick={() => setSpecialty(id)}><b>{SPECIALTIES[id].name}</b><span>{SPECIALTIES[id].description}</span></button>)}</div><p>{humans + ais > 4 ? '总人数最多 4 位，请减少真人或 AI。' : humans + ais === 1 ? `个人挑战：全线合龙且达到 ${SOLO_TARGET} 分。` : `${humans + ais} 家公司共同施工，终局比总分。`}</p><p className={styles.muted}>新局会替换本机当前存档。</p><button type="button" className={styles.primary} disabled={humans + ais > 4 || busy} onClick={restart}>展开新沙盘 →</button></> : (
<><span className={styles.eyebrow}>开工前读这一页就够了</span><h2 id="construction-dialog-title">多处开工，最终合龙</h2><div className={styles.rules}>
        <div><b>① 先排三步，再一起开工</b><p>任意未完工工地都能进场。点击沙盘或清单选择工地，把行动放进计划；前一步取得的土和维护资金能在下一步使用。提交前可撤回。AI 看不到你的计划。</p></div>
        <div><b>② 合建按贡献分钱</b><p>每份工作量立即得 1 声望，工程建成再按全部贡献分配建设款和奖励。多人同轮超量投入仍保留全部贡献，只会摊薄固定回报。建设款在共同结算后到账。</p></div>
        <div><b>③ 切山 → 运土 → 回填</b><p>青年山与灵山切方产生自产土方。运 2 土到低地或湿地，仅付 ¥1 就能完成 2 工作量；土方车队可完成 3。各家公司有自己的堆土库存。</p></div>
        <div><b>④ 完工，还要通过验收</b><p>主航段建成后需试水验收。青年山需要动物通道，船闸需要鱼道，桥下连接段需要跨河桥。普通验收耗 1 水，船闸耗 3；省水系统把船闸试水降到 1 水。每次验收提供 ¥3 与 4 分，同轮多家公司验收则平分。</p></div>
        <div><b>⑤ 设备和营地改变效率</b><p>掘进机提高山岭、河道工作量，测量试验室减少验收成本。工区营地减少本区域施工支出，同时增加区域影响力。每轮开场按天气补水，最多存 5 水。</p></div>
        <div><b>⑥ 全线验收，就提前结算</b><p>最多 10 轮；8 个主航段都验收后提前结束。总分 = 工程声望取整 + 每 ¥3 余款得 1 分 + 专业目标 8 分 + 区域控制分 + 合龙 5 分。每区领先者得 8 分，并列平分取整。省水和湿地两项都建成，联合验收为 S 级。</p></div>
      </div><button type="button" className={styles.primary} onClick={() => setRules(false)}>回到工地，开始调度</button></>
)}
    </section></div>
)}
  </main>
);
}
