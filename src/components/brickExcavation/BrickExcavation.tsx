'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  AudioMutedOutlined,
  CheckOutlined,
  CloseOutlined,
  LockOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SoundOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import {
  LEVELS,
  createGame,
  getCluster,
  getGrade,
  strike,
} from './engine';
import type { GameState } from './engine';
import styles from './brickExcavation.module.css';

const STORAGE_KEY = 'brick-excavation-records-v1';
const MARKS = ['●', '◆', '▲', '✦'];
const COLOR_NAMES = ['朱红', '青绿', '琥珀', '紫晶'];
const GRADE_ORDER = ['S', 'A', 'B', 'C'];

interface RecordEntry {
  grade: string;
  turns: number;
}

type Records = Record<string, RecordEntry>;
type GameDebugWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};

function loadRecords(): Records {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, entry]) => {
        if (!entry || typeof entry !== 'object') return false;
        const value = entry as RecordEntry;
        return GRADE_ORDER.includes(value.grade) && Number.isInteger(value.turns);
      }),
    );
  } catch {
    return {};
  }
}

function getUnlockedIndex(records: Records) {
  let unlocked = 0;
  while (unlocked < LEVELS.length - 1 && records[LEVELS[unlocked].id]) unlocked += 1;
  return unlocked;
}

function surrounding(board: GameState['board'], cols: number, group: number[]) {
  const removed = new Set(group);
  const adjacent = new Set<number>();
  group.forEach((index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]].forEach(([r, c]) => {
      if (r < 0 || c < 0 || r >= board.length / cols || c >= cols) return;
      const next = r * cols + c;
      if (!removed.has(next) && board[next] !== null) adjacent.add(next);
    });
  });
  return adjacent;
}

export default function BrickExcavation() {
  const [game, setGame] = useState<GameState>(() => createGame(0));
  const [history, setHistory] = useState<GameState[]>([]);
  const [records, setRecords] = useState<Records>({});
  const [ready, setReady] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const [effectTurn, setEffectTurn] = useState(0);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const rulesRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const keyboardMoveRef = useRef(false);
  const level = LEVELS[game.levelIndex];
  const progress = Math.round(((game.targetTotal - game.remainingTargets) / game.targetTotal) * 100);
  const grade = getGrade(game);
  const unlockedIndex = getUnlockedIndex(records);
  const activeRecord = records[level.id];

  const preview = useMemo(() => {
    if (hovered === null || game.status !== 'playing' || game.board[hovered] === null) {
      return { group: new Set<number>(), edge: new Set<number>() };
    }
    const group = getCluster(game.board, hovered, game.cols);
    return { group: new Set(group), edge: surrounding(game.board, game.cols, group) };
  }, [game.board, game.cols, game.status, hovered]);
  const previewTargets = Array.from(preview.group).filter((index) => game.targetMask[index]).length;

  useEffect(() => {
    setRecords(loadRecords());
    setReady(true);
    return () => {
      if (audioRef.current) audioRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (!ready || game.status !== 'won' || !grade) return;
    const previous = records[level.id];
    const improved = !previous
      || GRADE_ORDER.indexOf(grade) < GRADE_ORDER.indexOf(previous.grade)
      || (grade === previous.grade && game.turns < previous.turns);
    if (!improved) return;
    const updated = { ...records, [level.id]: { grade, turns: game.turns } };
    setRecords(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      setNotice('本机纪录暂时无法保存。');
    }
  }, [game.status, game.turns, grade, level.id, ready, records]);

  useEffect(() => {
    const debugWindow = window as GameDebugWindow;
    debugWindow.render_game_to_text = () => JSON.stringify({
      coordinates: 'row and column start at 0 in the top-left; rows increase downward',
      level: level.id,
      status: game.status,
      rows: game.rows,
      cols: game.cols,
      board: game.board,
      targetMask: game.targetMask,
      movesLeft: game.movesLeft,
      turns: game.turns,
      remainingTargets: game.remainingTargets,
      targetTotal: game.targetTotal,
      preview: hovered === null ? null : Array.from(preview.group),
    });
    debugWindow.advanceTime = () => {};
    return () => {
      delete debugWindow.render_game_to_text;
      delete debugWindow.advanceTime;
    };
  }, [game, hovered, level.id, preview.group]);

  useEffect(() => {
    if (keyboardMoveRef.current) {
      tileRefs.current[focusedIndex]?.focus();
      keyboardMoveRef.current = false;
    }
  }, [focusedIndex, game.board]);

  useEffect(() => {
    if (helpOpen) rulesRef.current?.focus();
  }, [helpOpen]);

  useEffect(() => {
    if (!helpOpen) return undefined;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setHelpOpen(false);
      helpButtonRef.current?.focus();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [helpOpen]);

  const playTone = useCallback((kind: 'hit' | 'win' | 'undo', size = 1) => {
    if (!soundOn) return;
    const context = audioRef.current || new AudioContext();
    audioRef.current = context;
    if (context.state === 'suspended') context.resume();
    const tones = kind === 'win' ? [520, 660, 880] : [kind === 'undo' ? 330 : 180 + Math.min(size, 12) * 22];
    tones.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + index * 0.085;
      oscillator.type = kind === 'hit' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.065, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.17);
    });
  }, [soundOn]);

  const startLevel = useCallback((index: number) => {
    if (index < 0 || index >= LEVELS.length) return;
    setGame(createGame(index));
    setHistory([]);
    setHovered(null);
    setFocusedIndex(0);
    keyboardMoveRef.current = true;
    setNotice('');
    setHelpOpen(false);
  }, []);

  const hitTile = (index: number) => {
    if (game.status !== 'playing' || game.board[index] === null) return;
    const next = strike(game, index);
    if (next === game) return;
    setHistory((previous) => [...previous, game]);
    setGame(next);
    setHovered(null);
    setEffectTurn((current) => current + 1);
    const nextFocus = next.board.findIndex((color) => color !== null);
    setFocusedIndex(Math.max(0, nextFocus));
    playTone(next.status === 'won' ? 'win' : 'hit', next.lastMove?.cleared.length || 1);
    if (next.status === 'won') setNotice(`发掘完成：${level.name}`);
    else if (next.status === 'lost') setNotice('工具已用尽，可以撤销或重开。');
    else if (next.lastMove?.refunded) setNotice('共振！这一次落锤返还了 1 步。');
    else setNotice(`敲落 ${next.lastMove?.cleared.length || 0} 块砖。`);
  };

  const undo = () => {
    if (!history.length || game.status === 'won') return;
    const previous = history[history.length - 1];
    setGame(previous);
    setHistory(history.slice(0, -1));
    setHovered(null);
    setFocusedIndex(0);
    setNotice('已撤销上一步。');
    playTone('undo');
  };

  const onTileKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') keyboardMoveRef.current = true;
    const directions: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    let row = Math.floor(index / game.cols) + direction[0];
    let col = (index % game.cols) + direction[1];
    while (row >= 0 && row < game.rows && col >= 0 && col < game.cols) {
      const next = row * game.cols + col;
      if (game.board[next] !== null) {
        setFocusedIndex(next);
        tileRefs.current[next]?.focus();
        return;
      }
      row += direction[0];
      col += direction[1];
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/demos#quick" className={styles.backLink} aria-label="返回游戏列表" title="返回游戏列表">
          <ArrowLeftOutlined aria-hidden />
        </Link>
        <div className={styles.brand}>
          <span className={styles.brandIndex}>VR / 03</span>
          <h1>维阿发掘局</h1>
        </div>
        <div className={styles.topActions}>
          <button ref={helpButtonRef} type="button" className={styles.iconButton} onClick={() => setHelpOpen((open) => !open)} aria-label="玩法规则" aria-controls="brick-rules" aria-expanded={helpOpen} title="玩法规则">
            <QuestionCircleOutlined aria-hidden />
          </button>
          <button type="button" className={styles.iconButton} onClick={() => setSoundOn((on) => !on)} aria-label={soundOn ? '关闭音效' : '开启音效'} title={soundOn ? '关闭音效' : '开启音效'}>
            {soundOn ? <SoundOutlined aria-hidden /> : <AudioMutedOutlined aria-hidden />}
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <section className={styles.boardColumn} aria-label="发掘棋盘">
          <div className={styles.boardHeading}>
            <span>发掘现场 <b>{String(game.levelIndex + 1).padStart(2, '0')}</b></span>
            <span>{game.rows} × {game.cols} / {game.colors} 色</span>
          </div>
          <div className={styles.boardFrame} data-status={game.status}>
            <div className={styles.boardBase} aria-hidden>
              <div className={styles.portrait} style={{ backgroundImage: `url("${level.portrait}")` }} />
              <span className={styles.imageSerial}>VIRTUAL REAL · ARCHIVE {String(game.levelIndex + 1).padStart(2, '0')}</span>
            </div>
            <div className={styles.tileGrid} style={{ '--cols': game.cols } as CSSProperties} role="group" aria-label="彩色砖块矩阵">
              {game.board.map((color, index) => {
                const row = Math.floor(index / game.cols);
                const col = index % game.cols;
                if (color === null) return <span key={index} className={styles.openCell} aria-hidden />;
                return (
                  <button
                    key={index}
                    ref={(element) => { tileRefs.current[index] = element; }}
                    type="button"
                    className={styles.tile}
                    data-color={color}
                    data-preview={preview.group.has(index) ? 'group' : preview.edge.has(index) ? 'edge' : undefined}
                    data-shifted={game.lastMove?.shifted.includes(index) ? effectTurn : undefined}
                    tabIndex={focusedIndex === index ? 0 : -1}
                    disabled={game.status !== 'playing'}
                    aria-label={`第 ${row + 1} 行第 ${col + 1} 列，${COLOR_NAMES[color]}砖${game.targetMask[index] ? '，有目标印记' : ''}`}
                    onPointerEnter={() => setHovered(index)}
                    onPointerLeave={() => setHovered(null)}
                    onFocus={() => { setFocusedIndex(index); setHovered(index); }}
                    onBlur={() => setHovered(null)}
                    onKeyDown={(event) => onTileKeyDown(event, index)}
                    onClick={() => hitTile(index)}
                  >
                    <span className={styles.colorMark} aria-hidden>{MARKS[color]}</span>
                    {game.targetMask[index] && <span className={styles.targetMark} aria-hidden>◇</span>}
                  </button>
                );
              })}
            </div>
            {game.status === 'won' && <div className={styles.foundSeal} aria-hidden>FOUND · {grade}</div>}
          </div>
          <div className={styles.boardFooter}>
            <span><i className={styles.legendDiamond}>◇</i> 目标格</span>
            <span>同色相连，一击敲落</span>
          </div>
        </section>

        <aside className={styles.sidebar} aria-label="发掘状态">
          <div className={styles.stageHead}>
            <span className={styles.eyebrow}>ARCHIVE / {String(game.levelIndex + 1).padStart(2, '0')}</span>
            <h2>{game.status === 'won' ? level.name : '身份待确认'}</h2>
            <p>{game.status === 'won' ? '角色档案已解锁。' : game.status === 'lost' ? '还差一点。撤销一步，换个颜色试试。' : '彩色砖层下，藏着一位维阿主播。'}</p>
          </div>

          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>剩余落锤</span>
              <strong data-low={game.movesLeft <= 3}>{game.movesLeft}<small> / {game.maxMoves}</small></strong>
            </div>
            <div className={styles.metric}>
              <span>显露进度</span>
              <strong>{progress}<small>%</small></strong>
            </div>
          </div>
          <div className={styles.progressTrack} role="progressbar" aria-label="目标显露进度" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className={styles.countLine}>
            <span>已显露 {game.targetTotal - game.remainingTargets} / {game.targetTotal} 格</span>
            <span>落锤 {game.turns} 次</span>
          </div>

          <div className={styles.moveResult}>
            <span>{preview.group.size ? '下一锤预览' : '最近一锤'}</span>
            <strong>{preview.group.size
              ? `${preview.group.size} 块砖 · ${previewTargets} 个目标格`
              : game.lastMove ? `${game.lastMove.cleared.length} 块砖 · ${game.lastMove.hitTargets} 个目标格` : '—'}</strong>
            <small>{preview.group.size
              ? `${preview.edge.size} 块邻砖将变色${preview.group.size >= 6 ? ' · 共振返还 1 步' : ''}`
              : game.lastMove?.refunded ? '大连片共振，返还 1 步' : '一次清除至少 6 块可返还 1 步'}</small>
          </div>

          {game.status === 'won' && (
            <div className={styles.result} aria-live="polite">
              <span className={styles.resultGrade}>{grade}</span>
              <div><strong>发掘成功</strong><p>{level.name}已收入档案。</p></div>
            </div>
          )}
          {game.status === 'lost' && <p className={styles.lossText}>落锤已用尽，撤销或重开本局。</p>}

          <div className={styles.commands}>
            {game.status === 'won' && game.levelIndex < LEVELS.length - 1 ? (
              <button type="button" className={styles.primaryButton} onClick={() => startLevel(game.levelIndex + 1)}>
                下一份档案 <ArrowRightOutlined aria-hidden />
              </button>
            ) : game.status === 'lost' ? (
              <button type="button" className={styles.primaryButton} onClick={() => startLevel(game.levelIndex)}>
                重试本局 <ReloadOutlined aria-hidden />
              </button>
            ) : game.status === 'won' ? (
              <button type="button" className={styles.primaryButton} onClick={() => startLevel(0)}>
                再探一次 <ReloadOutlined aria-hidden />
              </button>
            ) : null}
            <div className={styles.secondaryButtons}>
              <button type="button" onClick={undo} disabled={!history.length || game.status === 'won'} title="撤销上一步"><UndoOutlined aria-hidden /> 撤销</button>
              <button type="button" onClick={() => startLevel(game.levelIndex)} title="重开本局"><ReloadOutlined aria-hidden /> 重开</button>
            </div>
          </div>

          {helpOpen && (
            <div
              id="brick-rules"
              ref={rulesRef}
              className={styles.rules}
              tabIndex={-1}
            >
              <div className={styles.rulesTitle}><strong>发掘规则</strong><button type="button" onClick={() => { setHelpOpen(false); helpButtonRef.current?.focus(); }} aria-label="关闭规则"><CloseOutlined aria-hidden /></button></div>
              <ol>
                <li>敲一块砖，四向相连的同色砖一起落下。</li>
                <li>清除区域周围的砖，每块沿色阶前进一步；不会连续引爆。</li>
                <li>清空带 ◇ 印记的格子，找到砖层下的主播。</li>
              </ol>
              <p>大连片可返还落锤；方向键可在砖块间移动。</p>
            </div>
          )}

          <div className={styles.archiveList}>
            <div className={styles.archiveTitle}><span>人物档案</span><span>{Object.keys(records).length} / {LEVELS.length}</span></div>
            {LEVELS.map((entry, index) => {
              const unlocked = index <= unlockedIndex;
              const record = records[entry.id];
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={styles.archiveItem}
                  data-active={index === game.levelIndex}
                  disabled={!unlocked}
                  onClick={() => startLevel(index)}
                  aria-label={`档案 ${index + 1}，${record ? entry.name : '未鉴定'}${unlocked ? '' : '，未解锁'}`}
                >
                  <span className={styles.archiveNumber}>{String(index + 1).padStart(2, '0')}</span>
                  <span className={styles.archiveName}>{record ? entry.name : unlocked ? '待发掘' : '尚未解锁'}</span>
                  <span className={styles.archiveEnd}>{record ? record.grade : unlocked ? <ArrowRightOutlined aria-hidden /> : <LockOutlined aria-hidden />}</span>
                </button>
              );
            })}
          </div>
          {activeRecord && <div className={styles.personalBest}><CheckOutlined aria-hidden /> 最佳纪录 {activeRecord.grade} · {activeRecord.turns} 锤</div>}
        </aside>
      </div>
      <span className={styles.srOnly} role="status" aria-live="polite">{notice}</span>
    </main>
  );
}
