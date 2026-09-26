'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeftOutlined, FullscreenExitOutlined, FullscreenOutlined,
  QuestionCircleOutlined, ReloadOutlined, RobotOutlined, TeamOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import Image from 'next/image';
import FlickBoard from './FlickBoard';
import type { CleanupStatus } from './FlickCleanup';
import {
  chooseAiShot, createFlickGame, type FlickGame, type FlickKind, type FlickSnapshot,
} from './engine';
import styles from './flickChess.module.css';

type Mode = 'ai' | 'local';
type Aim = { pieceId: string; power: number } | null;
const INITIAL_CLEANUP: CleanupStatus = { phase: 'idle', pieceId: null, collected: 0, pending: 0 };

const sideName = (side: 'red' | 'blue') => (side === 'red' ? '绯方' : '青方');
const kindName: Record<FlickKind, string> = {
  rook: '车',
horse: '马',
elephant: '象',
advisor: '士',
  general: '将',
cannon: '炮',
pawn: '兵',
};

export default function FlickChess() {
  const gameRef = useRef<FlickGame | null>(null);
  const [snapshot, setSnapshot] = useState<FlickSnapshot | null>(null);
  const [mode, setMode] = useState<Mode>('ai');
  const [aim, setAim] = useState<Aim>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleanup, setCleanup] = useState<CleanupStatus>(INITIAL_CLEANUP);
  const [round, setRound] = useState(0);
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let lastTime = 0;
    let lastPhase = '';
    let lastShotCount = -1;
    const animate = (time: number) => {
      const game = gameRef.current;
      if (!game || disposed) return;
      const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
      lastTime = time;
      game.step(delta);
      const next = game.snapshot();
      if (next.phase === 'moving' || next.phase !== lastPhase || next.shotCount !== lastShotCount) {
        if (frame % 2 === 0 || next.phase !== lastPhase) setSnapshot(next);
      }
      lastPhase = next.phase;
      lastShotCount = next.shotCount;
      frame += 1;
      requestAnimationFrame(animate);
    };
    createFlickGame().then(game => {
      if (disposed) {
        game.destroy();
        return;
      }
      gameRef.current = game;
      setSnapshot(game.snapshot());
      requestAnimationFrame(animate);
    }).catch(() => {
      if (!disposed) setError('物理场景加载失败，请刷新后重试。');
    });
    return () => {
      disposed = true;
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return undefined;
    const diagnosticWindow = window as typeof window & {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
    };
    diagnosticWindow.render_game_to_text = () => JSON.stringify({
      coordinates: 'board center is (0,0); +x right, +z toward red side; y is height',
      mode,
      cleanup,
      ...game.snapshot(),
    });
    diagnosticWindow.advanceTime = (ms: number) => {
      const steps = Math.max(1, Math.min(1800, Math.ceil(ms / (1000 / 60))));
      for (let index = 0; index < steps; index += 1) game.step(1 / 60);
      setSnapshot(game.snapshot());
    };
    return () => {
      delete diagnosticWindow.render_game_to_text;
      delete diagnosticWindow.advanceTime;
    };
  }, [snapshot?.phase, mode, cleanup]);

  useEffect(() => {
    if (mode !== 'ai' || snapshot?.phase !== 'aiming' || snapshot.turn !== 'blue') return undefined;
    const timer = window.setTimeout(() => {
      const game = gameRef.current;
      if (!game) return;
      const current = game.snapshot();
      if (current.phase !== 'aiming' || current.turn !== 'blue') return;
      const shot = chooseAiShot(current);
      if (shot && game.launch(shot.pieceId, shot.angle, shot.power)) {
        setSnapshot(game.snapshot());
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [mode, snapshot?.phase, snapshot?.shotCount, snapshot?.turn]);

  useEffect(() => {
    const onFullScreen = () => setFullScreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullScreen);
    return () => document.removeEventListener('fullscreenchange', onFullScreen);
  }, []);

  useEffect(() => {
    if (!helpOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelpOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  const shoot = useCallback((pieceId: string, angle: number, power: number) => {
    const game = gameRef.current;
    if (!game || (mode === 'ai' && game.snapshot().turn === 'blue')) return;
    if (game.launch(pieceId, angle, power)) {
      setAim(null);
      setSnapshot(game.snapshot());
    }
  }, [mode]);

  const newGame = useCallback((nextMode: Mode = mode) => {
    gameRef.current?.reset();
    setMode(nextMode);
    setAim(null);
    setCleanup(INITIAL_CLEANUP);
    setRound(value => value + 1);
    if (gameRef.current) setSnapshot(gameRef.current.snapshot());
  }, [mode]);

  const toggleFullScreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      pageRef.current?.requestFullscreen();
    }
  };

  const turn = snapshot?.turn ?? 'red';
  const selectedPiece = aim && snapshot?.pieces.find(piece => piece.id === aim.pieceId);
  const isAiThinking = mode === 'ai' && turn === 'blue' && snapshot?.phase === 'aiming';
  const winner = snapshot?.winner;

  return (
    <main ref={pageRef} className={styles.page}>
      <div className={styles.boardHost}>
        {snapshot && (
<FlickBoard
key={round}
snapshot={snapshot}
onShot={shoot}
onAimChange={setAim}
onCleanupStatus={setCleanup}
          disabled={helpOpen || Boolean(winner) || isAiThinking} />
)}
      </div>

      <header className={styles.topbar}>
        <Link href="/demos" className={styles.iconButton} title="返回实验室" aria-label="返回实验室">
          <ArrowLeftOutlined aria-hidden />
        </Link>
        <div className={styles.brand}><span className={styles.brandMark}>VR</span><span>维阿弹棋</span></div>
        <div className={styles.topActions}>
          <div className={styles.modeControl} role="group" aria-label="对战模式">
            <button
type="button"
className={mode === 'ai' ? styles.modeActive : ''}
              onClick={() => { if (mode !== 'ai') newGame('ai'); }}
title="对战 AI">
              <RobotOutlined aria-hidden /><span className={styles.modeLabel}>对战 AI</span>
            </button>
            <button
type="button"
className={mode === 'local' ? styles.modeActive : ''}
              onClick={() => { if (mode !== 'local') newGame('local'); }}
title="本地双人">
              <TeamOutlined aria-hidden /><span className={styles.modeLabel}>本地双人</span>
            </button>
          </div>
          <button
type="button"
className={styles.iconButton}
onClick={() => newGame()}
            title="重新开局"
aria-label="重新开局"><ReloadOutlined aria-hidden /></button>
          <button
type="button"
className={styles.iconButton}
onClick={toggleFullScreen}
            title={fullScreen ? '退出全屏' : '全屏'}
aria-label={fullScreen ? '退出全屏' : '全屏'}>
            {fullScreen ? <FullscreenExitOutlined aria-hidden /> : <FullscreenOutlined aria-hidden />}
          </button>
          <button
type="button"
className={styles.iconButton}
onClick={() => setHelpOpen(true)}
            title="规则"
aria-label="规则"><QuestionCircleOutlined aria-hidden /></button>
        </div>
      </header>

      <div className={styles.scoreboard} aria-live="polite">
        <div className={`${styles.sideScore} ${styles.redScore} ${turn === 'red' ? styles.activeScore : ''}`}>
          <span className={styles.sideDot} /><span>绯方</span>
          <strong>{snapshot?.remaining.red ?? 16}</strong>
        </div>
        <div className={styles.turnPill}>
          <span className={styles.turnLabel}>{snapshot?.phase === 'moving' ? '碰撞中' : isAiThinking ? 'AI 瞄准中' : winner ? '对局结束' : `${sideName(turn)}回合`}</span>
          <span className={styles.turnDetail}>{snapshot ? `第 ${snapshot.shotCount + 1} 弹` : '准备中'}</span>
        </div>
        <div className={`${styles.sideScore} ${styles.blueScore} ${turn === 'blue' ? styles.activeScore : ''}`}>
          <span className={styles.sideDot} /><span>{mode === 'ai' ? 'AI / 青方' : '青方'}</span>
          <strong>{snapshot?.remaining.blue ?? 16}</strong>
        </div>
      </div>

      {snapshot?.phase === 'aiming' && !isAiThinking && !winner && !aim && (
        <div className={styles.actionPrompt}>选择{sideName(turn)}棋子</div>
      )}

      {selectedPiece && (
        <div className={styles.aimHud} aria-live="polite">
          <Image src={selectedPiece.portrait} alt="" width={48} height={48} />
          <div className={styles.aimCopy}>
            <strong>{selectedPiece.characterName}</strong>
            <span>{kindName[selectedPiece.kind]}</span>
          </div>
          <div className={styles.powerTrack} aria-label={`力度 ${Math.round(aim.power * 100)}%`}>
            <span style={{ width: `${Math.round(aim.power * 100)}%` }} />
          </div>
          <b>{Math.round(aim.power * 100)}%</b>
        </div>
      )}

      {snapshot && winner && (
        <div className={styles.resultBackdrop}>
          <div className={styles.resultPanel}>
            <span className={styles.resultKicker}>MATCH COMPLETE</span>
            <h1>{winner === 'draw' ? '平局' : `${sideName(winner)}胜利`}</h1>
            <p>共弹射 {snapshot.shotCount} 次</p>
            <button type="button" onClick={() => newGame()}>再来一局</button>
          </div>
        </div>
      )}

      {helpOpen && (
        <div
className={styles.helpBackdrop}
role="presentation"
onMouseDown={event => {
          if (event.target === event.currentTarget) setHelpOpen(false);
        }}>
          <section className={styles.helpPanel} role="dialog" aria-modal="true" aria-labelledby="flick-help-title">
            <div className={styles.helpHeader}>
              <h2 id="flick-help-title">弹棋规则</h2>
              <button type="button" onClick={() => setHelpOpen(false)} aria-label="关闭规则">×</button>
            </div>
            <ol>
              <li>双方按象棋阵位各摆 16 枚棋子，绯方先手。</li>
              <li>选一枚己方棋子，向后拖动瞄准和蓄力，松手弹射。</li>
              <li>棋子滑动、碰撞并可能跌出棋盘；己方棋子也会被撞出。</li>
              <li>全部停稳后换手，先把对手棋子全部弹出者获胜。</li>
            </ol>
            <p>棋子质量与大小随棋种变化。切换对战模式会开启新局。</p>
          </section>
        </div>
      )}

      {error && <div className={styles.error} role="alert">{error}</div>}
    </main>
  );
}
