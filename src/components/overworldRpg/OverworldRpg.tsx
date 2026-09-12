'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CHARACTERS, ENTITIES, REGIONS, TILE, WORLD_HEIGHT, WORLD_WIDTH, tileAt } from './content';
import { chooseDialogue, continueResult, createGame, findPath, interact, loadGame, maxHp, nearestEntity, objective, saveGame, startGame, stepGame, toggleMember, usePotion } from './engine';
import type { Point, RpgState } from './types';
import styles from './rpg.module.css';

const SAVE_KEY = 'overworld-rpg-save-v1';
type Panel = 'party' | 'map' | 'journal' | 'settings' | null;
interface RpgControl {
  state: () => RpgState; moveTo: (point: Point) => void; interact: (id?: string) => void;
  choose: (id: string) => void; continue: () => void;
}
type RpgWindow = Window & { overworldRpg?: RpgControl };
const tileColors = { grass: '#6c8863', forest: '#526e54', path: '#c8b38a', town: '#c3b594', water: '#548d98', bridge: '#bca075', mountain: '#727972', ruins: '#99978a' };
const mapTiles = Array.from({ length: 56 * 38 }, (_, i) => ({ x: i % 56, y: Math.floor(i / 56) }));

function Portrait({ id, size = 56 }: { id: string; size?: number }) {
  const def = CHARACTERS[id];
  return def ? <Image src={def.portrait} width={size} height={size} alt={def.name} unoptimized className={styles.portrait} /> : null;
}

export default function OverworldRpg() {
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const stateRef = useRef(createGame());
  const [, render] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<RpgState | null>(null);
  const [storageMessage, setStorageMessage] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const panelRef = useRef<Panel>(null);
  const keys = useRef(new Set<string>());
  const route = useRef<Point[]>([]);
  const pendingEntity = useRef<string | null>(null);
  const pulse = () => render(v => v + 1);
  const state = stateRef.current;
  const persist = () => {
    if (stateRef.current.mode === 'title') return;
    try { localStorage.setItem(SAVE_KEY, saveGame(stateRef.current)); } catch { setStorageMessage('本机存档不可用，本次仍可继续游玩。'); }
  };
  const mutate = (fn: (s: RpgState) => void) => {
    fn(stateRef.current);
    if (!['explore', 'battle'].includes(stateRef.current.mode)) keys.current.clear();
    persist(); pulse();
  };
  const openPanel = (next: Panel) => {
    panelRef.current = next; setPanel(next); keys.current.clear(); route.current = []; pendingEntity.current = null;
  };
  const goTo = (point: Point) => {
    const { current } = stateRef;
    if (panelRef.current || current.paused) return;
    route.current = current.mode === 'battle' ? [point] : findPath(current.player, point);
    pendingEntity.current = null;
  };
  const interactWith = (id?: string) => {
    const { current } = stateRef;
    if (panelRef.current || current.paused || current.mode !== 'explore') return;
    const entity = ENTITIES.find(e => e.id === id);
    if (entity && Math.hypot(entity.x - current.player.x, entity.y - current.player.y) > 95) {
      route.current = findPath(current.player, entity); pendingEntity.current = id || null;
    } else { route.current = []; pendingEntity.current = null; mutate(s => interact(s, id)); }
  };
  const fullScreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.current?.requestFullscreen().catch(() => {});
  };
  useEffect(() => {
    let disposed = false;
    let game: import('phaser').Game | undefined;
    let renderedScene: import('./scene').default | undefined;
    let frame = 0;
    let last = performance.now();
    let lastRender = last;
    let lastSave = last;
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const parsed = loadGame(raw); setSaved(parsed); if (!parsed) setStorageMessage('旧存档无法读取，可以重新踏入虚境。'); } } catch { setStorageMessage('本机存档不可用，本次仍可继续游玩。'); }
    const tick = (ms: number) => {
      const { current } = stateRef;
      if (panelRef.current || current.paused) return;
      const held = keys.current;
      const x = Number(held.has('d') || held.has('arrowright')) - Number(held.has('a') || held.has('arrowleft'));
      const y = Number(held.has('s') || held.has('arrowdown')) - Number(held.has('w') || held.has('arrowup'));
      if (x || y) { route.current = []; pendingEntity.current = null; }
      const target = route.current[0];
      const origin = current.mode === 'battle' ? current.battle?.units.find(u => u.characterId === 'biscuit_sui' && u.side === 'ally') : current.player;
      if (target && origin && Math.hypot(target.x - origin.x, target.y - origin.y) < 9) route.current.shift();
      const portraitBattle = current.mode === 'battle' && !!host.current && host.current.clientWidth < 600 && host.current.clientHeight > host.current.clientWidth;
      stepGame(current, ms, { x: portraitBattle ? y : x, y: portraitBattle ? -x : y, target: route.current[0], skill: held.has(' ') });
      if (pendingEntity.current && current.mode === 'explore') {
        const entity = ENTITIES.find(e => e.id === pendingEntity.current);
        if (entity && Math.hypot(entity.x - current.player.x, entity.y - current.player.y) <= 90) {
          route.current = []; pendingEntity.current = null; interact(current, entity.id);
        }
      }
      if (current.mode !== 'explore' && current.mode !== 'battle') { route.current = []; keys.current.clear(); }
    };
    const animate = (now: number) => {
      tick(Math.min(50, now - last)); last = now;
      if (now - lastRender > 100) { pulse(); lastRender = now; }
      if (now - lastSave > 2000) { persist(); lastSave = now; }
      frame = requestAnimationFrame(animate);
    };
    Promise.all([import('phaser'), import('./scene')]).then(([phaser, scene]) => {
      if (disposed || !host.current) return;
      const Phaser = phaser.default;
      const RpgScene = scene.default;
      renderedScene = new RpgScene({ getState: () => stateRef.current, moveTarget: goTo, interact: interactWith });
      game = new Phaser.Game({
        type: Phaser.AUTO,
parent: host.current,
backgroundColor: '#6c8863',
        scale: { mode: Phaser.Scale.RESIZE, width: host.current.clientWidth, height: host.current.clientHeight },
        render: { antialias: true, roundPixels: true },
        scene: [renderedScene],
        audio: { noAudio: true },
      });
      game.events.once('ready', () => { if (!disposed) setReady(true); });
      frame = requestAnimationFrame(animate);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : '场景加载失败，请刷新重试。'));
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'f') { fullScreen(); return; }
      if (key === 'escape') { if (panelRef.current) openPanel(null); else if (stateRef.current.mode === 'explore' || stateRef.current.mode === 'battle') mutate(s => { s.paused = !s.paused; }); return; }
      if (panelRef.current || stateRef.current.paused || !['explore', 'battle'].includes(stateRef.current.mode)) return;
      if ((key === ' ' || key === 'enter') && (event.target as HTMLElement).closest('button, a')) return;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(key)) event.preventDefault();
      if (event.repeat) return;
      if (key === 'm' || key === 'j' || key === 'tab') {
        if (!['explore', 'battle'].includes(stateRef.current.mode)) return;
        const next = key === 'm' ? 'map' : key === 'j' ? 'journal' : 'party'; openPanel(panelRef.current === next ? null : next); return;
      }
      if (key === '1') mutate(usePotion);
      if ((key === 'e' || key === ' ') && stateRef.current.mode === 'explore') interactWith();
      keys.current.add(key);
    };
    const keyUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => {
      keys.current.clear(); route.current = []; pendingEntity.current = null;
      if (stateRef.current.mode === 'battle' || stateRef.current.mode === 'explore') { stateRef.current.paused = true; persist(); pulse(); }
    };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', persist);
    const debugWindow = window as RpgWindow;
    debugWindow.overworldRpg = { state: () => JSON.parse(JSON.stringify(stateRef.current)) as RpgState, moveTo: goTo, interact: interactWith, choose: id => mutate(s => chooseDialogue(s, id)), continue: () => mutate(continueResult) };
    window.render_game_to_text = () => JSON.stringify({ ...stateRef.current, renderedBattle: renderedScene?.battleViewSnapshot() ?? [], coordinates: 'World pixels, origin top-left, +x right, +y down. Battle 960×600.', panel: panelRef.current, objective: objective(stateRef.current), nearby: nearestEntity(stateRef.current), route: route.current, entities: ENTITIES, world: { width: WORLD_WIDTH, height: WORLD_HEIGHT, tile: TILE }, canvas: { width: game?.canvas.width, height: game?.canvas.height } });
    window.advanceTime = ms => { for (let elapsed = 0; elapsed < Math.min(ms, 120000); elapsed += 20) tick(Math.min(20, ms - elapsed)); pulse(); };
    return () => {
      disposed = true; cancelAnimationFrame(frame); game?.destroy(true);
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', persist);
      delete debugWindow.overworldRpg; delete window.render_game_to_text; delete window.advanceTime;
    };
    // The simulation bridge uses refs so React renders never recreate Phaser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (panel) root.current?.querySelector<HTMLButtonElement>('[role="dialog"] button:not([disabled])')?.focus();
    else if (state.mode === 'dialogue') root.current?.querySelector<HTMLButtonElement>('[data-choice]:not([disabled])')?.focus();
    else if (state.mode === 'result' || state.paused) root.current?.querySelector<HTMLButtonElement>(`.${styles.result} button`)?.focus();
    else if (state.mode === 'explore' || state.mode === 'battle') (document.activeElement as HTMLElement | null)?.blur();
  }, [state.mode, state.paused, panel]);

  const begin = (resume: boolean) => {
    stateRef.current = resume && saved ? saved : createGame();
    if (!resume) startGame(stateRef.current);
    stateRef.current.paused = false; openPanel(null); persist(); pulse();
  };
  const nearby = state.mode === 'explore' ? nearestEntity(state) : undefined;
  const region = [...REGIONS].sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y))[0];
  const playMode = state.mode !== 'title' && state.mode !== 'ending';
  const touchHold = (key: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); keys.current.add(key); },
    onPointerUp: () => keys.current.delete(key),
onPointerCancel: () => keys.current.delete(key),
onLostPointerCapture: () => keys.current.delete(key),
  });
  return (
    <div ref={root} className={styles.root} data-rpg-mode={state.mode} data-rpg-manual={state.manual}>
      <div className={styles.canvas} ref={host} />
      {!ready && <div className={styles.loading}>{error || '正在铺开山河…'}</div>}
      {state.mode === 'title' && (
<div className={styles.titleScreen}>
        <Link href="/demos" className={styles.back}>← 返回游戏集</Link>
        <div className={styles.titleCopy}>
          <p className={styles.eyebrow}>主播群侠传 · 第一卷</p>
          <h1>虚境<span>归途</span></h1>
          <p className={styles.subtitle}>昨夜还在看直播。<br />醒来，你成了一块饼干。</p>
          <p className={styles.intro}>循着熟悉的声音，去山河间寻找伙伴。<br />等到归乡的门打开，别忘了好好告别。</p>
          <div className={styles.titleActions}>
            {saved && <button className={styles.primary} onClick={() => begin(true)}>继续旅程 <small>第 {saved.level} 级 · 碎片 {saved.shards}/3</small></button>}
            <button className={saved ? styles.secondary : styles.primary} onClick={() => begin(false)}>{saved ? '另起一段旅程' : '踏入虚境'} <span>↗</span></button>
          </div>
          <p className={styles.controls}>WASD 行走 · E 交谈 · 点击地面寻路<br />M 地图 · Tab 队伍 · 自动战斗 / 手动主角</p>
          {storageMessage && <p className={styles.notice}>{storageMessage}</p>}
        </div>
        <div className={styles.titleFoot}><span>山河很远，好在有人同行。</span><span>v0.1 · 归乡之路</span></div>
      </div>
)}

      {playMode && (
<>
        <header className={styles.hud}>
          <div className={styles.location}><span>{state.mode === 'battle' ? '遭遇战' : '虚境归途'}</span><strong>{state.mode === 'battle' ? ENTITIES.find(e => e.id === state.battle?.encounterId)?.name : region?.name}</strong></div>
          <div className={styles.resources}><span>归乡碎片 <b>{state.shards}<small> / 3</small></b></span><span>旅资 <b>{state.gold}</b></span><span>行者 <b>Lv.{state.level}</b></span></div>
          <button className={styles.iconButton} onClick={() => openPanel('settings')} aria-label="设置与操作">☰</button>
        </header>
        <div className={styles.quest}><span>归乡之路</span><p>{objective(state)}</p></div>
        {state.message && state.mode === 'explore' && <div className={styles.toast} role="status">{state.message}</div>}
        <div className={styles.partyStrip}>{state.active.map(id => {
          const unit = state.battle?.units.find(u => u.side === 'ally' && u.characterId === id);
          const hp = state.mode === 'battle' && unit ? unit.hp : state.party.find(m => m.id === id)?.hp || 0;
          const maximum = state.mode === 'battle' && unit ? unit.maxHp : maxHp(state, id);
          return <button key={id} className={styles.partyMini} onClick={() => openPanel('party')} aria-label={`查看${CHARACTERS[id].name}`}><Portrait id={id} /><span>{CHARACTERS[id].name}</span><i><b style={{ width: `${Math.max(0, (hp / maximum) * 100)}%` }} /></i></button>;
        })}</div>
        {(state.mode === 'explore' || state.mode === 'battle') && (
<>
          <div className={styles.actionBar}>
            <button onClick={() => openPanel('map')}>地图 <kbd>M</kbd></button>
            <button onClick={() => openPanel('party')}>队伍 <kbd>Tab</kbd></button>
            <button onClick={() => openPanel('journal')}>旅记 <kbd>J</kbd></button>
            <button onClick={() => mutate(usePotion)} disabled={state.potions <= 0}>药包 ×{state.potions} <kbd>1</kbd></button>
          </div>
          <div className={styles.contextAction}>
            {state.mode === 'explore' && nearby && <button className={styles.primary} onClick={() => interactWith(nearby.id)}><kbd>E</kbd> {nearby.kind === 'encounter' ? '查看' : '交互'} · {nearby.name}</button>}
            {state.mode === 'battle' && <><button className={styles.secondary} onClick={() => mutate(s => { s.manual = !s.manual; route.current = []; })}>{state.manual ? '手动主角 · 点击切为自动' : '自动战斗 · 点击接管主角'}</button>{state.manual && <button className={styles.primary} {...touchHold(' ')}>应援技能 <kbd>Space</kbd></button>}</>}
          </div>
          <div className={styles.touchPad} aria-label="方向控制"><button {...touchHold('w')} aria-label="向上">↑</button><button {...touchHold('a')} aria-label="向左">←</button><button {...touchHold('s')} aria-label="向下">↓</button><button {...touchHold('d')} aria-label="向右">→</button></div>
        </>
)}
      </>
)}

      {state.mode === 'dialogue' && state.dialogue && (
<div className={styles.dialogueWrap}>
        <section className={styles.dialogue} aria-label="对话">
          {ENTITIES.find(e => e.id === state.dialogue?.entityId)?.characterId && <Portrait id={ENTITIES.find(e => e.id === state.dialogue?.entityId)?.characterId || ''} size={112} />}
          <div className={styles.dialogueCopy}><p className={styles.eyebrow}>{state.dialogue.speaker}</p><p className={styles.dialogueText}>{state.dialogue.text}</p><div className={styles.choices}>{state.dialogue.choices.map(choice => <button key={choice.id} data-choice={choice.id} disabled={choice.disabled} onClick={() => mutate(s => chooseDialogue(s, choice.id))}>{choice.label} <span>→</span></button>)}</div></div>
        </section>
      </div>
)}
      {state.mode === 'result' && state.result && (
<div className={styles.modalBackdrop}><section className={styles.result}>
        <p className={styles.eyebrow}>{state.result.won ? '山河又近一步' : '江湖路长，再来便是'}</p><h2>{state.result.title}</h2><p>{state.result.text}</p>
        {state.result.won && <div className={styles.reward}><span>旅资 +{state.result.gold}</span><span>阅历 +{state.result.xp}</span>{state.result.shard && <strong>归乡碎片 +1</strong>}</div>}
        <button className={styles.primary} onClick={() => mutate(continueResult)}>继续旅程 <span>→</span></button>
      </section></div>
)}
      {state.mode === 'ending' && (
<div className={styles.ending}>
        <p className={styles.eyebrow}>第一卷 · 归乡</p><h1>下次直播见。</h1><p>屏幕重新亮起。熟悉的声音从耳机里传来。<br />窗外天刚亮，你的手边多了一小块饼干。</p><div className={styles.endingParty}>{state.party.map(member => <Portrait key={member.id} id={member.id} size={80} />)}</div><p className={styles.endingNames}>与你同行：{state.party.filter(m => m.id !== 'biscuit_sui').map(m => CHARACTERS[m.id].name).join('、')}</p><p>Lv.{state.level} · {ENTITIES.filter(e => e.kind === 'encounter' && state.completed.includes(e.id)).length} 场胜利 · {Math.floor(state.playTime / 60)} 分钟旅程</p><Link className={styles.primary} href="/demos">把故事留在这里 ↗</Link><button className={styles.secondary} onClick={() => begin(false)}>再走一次江湖</button>
      </div>
)}
      {state.paused && playMode && !panel && <div className={styles.modalBackdrop}><section className={styles.result}><p className={styles.eyebrow}>歇一歇脚</p><h2>旅程已暂停</h2><p>山河与战斗都会等你回来。</p><button className={styles.primary} onClick={() => mutate(s => { s.paused = false; })}>继续旅程</button></section></div>}

      {panel && (
<div className={styles.panelBackdrop}><section className={`${styles.panel} ${panel === 'map' ? styles.mapPanel : ''}`} role="dialog" aria-modal="true" aria-label={{ party: '同行伙伴', map: '山河舆图', journal: '行旅手记', settings: '行囊与设置' }[panel]}>
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>虚境归途</p><h2>{{ party: '同行伙伴', map: '山河舆图', journal: '行旅手记', settings: '行囊与设置' }[panel]}</h2></div><button className={styles.iconButton} onClick={() => openPanel(null)} aria-label="关闭面板">×</button></div>
        {panel === 'party' && (
<><p className={styles.panelNote}>最多四人并肩作战。饼干岁不可离队；伙伴可以自由轮换。近战率先迎敌，远程在后方支援。</p><div className={styles.roster}>{state.party.map(member => {
          const def = CHARACTERS[member.id]; const active = state.active.includes(member.id);
          const fighter = state.mode === 'battle' ? state.battle?.units.find(u => u.side === 'ally' && u.characterId === member.id) : undefined;
          return <article key={member.id} className={styles.member}><Portrait id={member.id} size={92} /><div><h3>{def.name}<small>{def.role}</small></h3><p>{def.skill} · {def.skillDescription}</p><span>气血 {Math.ceil(fighter?.hp ?? member.hp)} / {fighter?.maxHp ?? maxHp(state, member.id)}</span></div><button disabled={member.id === 'biscuit_sui' || state.mode === 'battle' || (!active && state.active.length >= 4)} onClick={() => mutate(s => toggleMember(s, member.id))}>{active ? '已出战' : '加入出战'}</button></article>;
        })}</div><p className={styles.panelNote}>兵器强化 {state.weapon} 阶 · 阅历 {state.xp} · 在驿站休整、购药或强化全队。</p></>
)}
        {panel === 'map' && <><p className={styles.panelNote}>黄点是你所在的位置。两座桥连接东西两岸；驿站之间可在交谈后乘船往返。</p><svg className={styles.worldMap} viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`} role="img" aria-label="虚境世界地图"><title>虚境世界地图</title>{mapTiles.map(p => <rect key={`${p.x},${p.y}`} x={p.x * TILE} y={p.y * TILE} width={TILE + 1} height={TILE + 1} fill={tileColors[tileAt(p.x, p.y)]} />)}{REGIONS.map(r => <text key={r.id} x={r.x} y={r.y - 80} textAnchor="middle" fill="#faf1cf" fontSize="50" stroke="#304538" strokeWidth="7" paintOrder="stroke">{r.name}</text>)}{ENTITIES.filter(e => e.kind === 'camp' || e.shard || e.kind === 'portal' || e.kind === 'npc').map(e => <g key={e.id}><circle cx={e.x} cy={e.y} r={e.shard ? 19 : 13} fill={state.completed.includes(e.id) ? '#8ce0ae' : e.kind === 'camp' ? '#fff0c3' : e.kind === 'npc' ? '#b9dae1' : '#ca715c'} /><title>{e.name}</title></g>)}<circle cx={state.player.x} cy={state.player.y} r="25" fill="#ffdb68" stroke="#423b25" strokeWidth="9" /></svg><div className={styles.mapLegend}><span>● 驿站</span><span>● 伙伴</span><span>◆ 碎片首领</span><span>● 归乡之门</span></div><div className={styles.destinations}>{REGIONS.map(r => <button key={r.id} disabled={state.mode !== 'explore'} onClick={() => { openPanel(null); goTo(r); }}>前往{r.name} ↗</button>)}</div></>}
        {panel === 'journal' && <><p className={styles.story}>原本只是一个普通的管人粉丝，再次睁眼，却成了虚境里一块会走路的饼干。远方传来了熟悉的声音。找到她们，也许就能找到回家的路。</p><div className={styles.journalQuest}><span>当前线索</span><h3>{objective(state)}</h3></div><h3>散落山河的三枚碎片</h3><div className={styles.questList}>{ENTITIES.filter(e => e.shard).map(e => <div key={e.id}><b>{state.completed.includes(e.id) ? '✓' : '◇'}</b><span><strong>{e.name}</strong><p>{e.description}</p></span></div>)}</div><h3>听说这里还有人等你</h3>{ENTITIES.filter(e => e.kind === 'npc' && !state.party.some(m => m.id === e.characterId)).map(e => <p key={e.id} className={styles.lead}>{e.name} · {e.description}</p>)}<p className={styles.panelNote}>强敌不会主动袭击。先交谈、补给与调整队伍，再决定是否应战。</p></>}
        {panel === 'settings' && <><div className={styles.settingsList}><p><b>行走</b><span>WASD / 方向键 / 点击地面 / 触屏方向键</span></p><p><b>交互</b><span>E / 空格 / 点击人物</span></p><p><b>战斗</b><span>默认全队自动；手动时移动主角，空格施放应援技能</span></p><p><b>行囊</b><span>M 地图 · Tab 队伍 · J 旅记 · 1 药包</span></p><p><b>暂停</b><span>Esc 暂停或关闭面板 · F 全屏</span></p></div><p className={styles.panelNote}>自动存于本机。战斗中刷新会回到交战前；失败后在驿站恢复，可以再次挑战。</p>{storageMessage && <p className={styles.notice}>{storageMessage}</p>}<div className={styles.choices}><button onClick={fullScreen}>切换全屏 ↗</button><button onClick={() => { persist(); setSaved(loadGame(saveGame(state))); stateRef.current = createGame(); openPanel(null); pulse(); }}>保存并返回标题 →</button></div><p className={styles.version}>v0.1 · 归乡之路<br />俯视开放探索 / 五人结伴 / 三地碎片 / 自动战斗</p></>}
      </section></div>
)}
    </div>
  );
}
