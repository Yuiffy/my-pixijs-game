"use client";

import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  AudioMutedOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SoundOutlined,
  SyncOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import {
  CSSProperties,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  canShuffleRemaining, createGame, GameState, getCluster, getGrade,
  hasLegalMove, hasStrandedTreasure, shuffleRemaining, strike, Treasure,
} from "./engine";
import styles from "./brickExcavation.module.css";

const BEST_KEY = "brick-excavation-best-v2";
const MARKS = ["●", "◆", "▲", "✦"];
const COLOR_NAMES = ["朱红", "青绿", "琥珀", "紫晶"];
const TREASURE_TINTS = ["#dce7db", "#eadbd2", "#dcd9e8", "#e4e1cf", "#dce5e2"];

type TextWindow = Window & {
  render_game_to_text?: () => string;
};

function renderTreasure(treasure: Treasure, cols: number, rows: number, tint: string) {
  const cells: { col: number; row: number; index: number }[] = [];
  treasure.mask.forEach((line, row) => {
    line.split('').forEach((mark, col) => {
      if (mark === '#') {
        cells.push({ col, row, index: (treasure.y + row) * cols + treasure.x + col });
      }
    });
  });
  const badgeCell = cells[cells.length - 1];
  return (
    <div
      className={styles.treasureArt}
      key={treasure.id}
      style={{
        left: `${(treasure.x / cols) * 100}%`,
        top: `${(treasure.y / rows) * 100}%`,
        width: `${(treasure.width / cols) * 100}%`,
        height: `${(treasure.height / rows) * 100}%`,
      }}
    >
      {cells.map((cell) => (
        <div
          className={styles.treasureCell}
          key={cell.index}
          data-treasure-cell=""
          data-index={cell.index}
          style={{
            left: `${(cell.col / treasure.width) * 100}%`,
            top: `${(cell.row / treasure.height) * 100}%`,
            width: `${100 / treasure.width}%`,
            height: `${100 / treasure.height}%`,
            backgroundColor: tint,
          }}
        />
      ))}
      <div
        className={styles.treasureIllustration}
        data-treasure-illustration=""
        style={{ backgroundImage: `url("${treasure.portrait}")` }}
      />
      {treasure.found && (
        <span
          className={styles.foundBadge}
          style={{
            left: `${(badgeCell.col / treasure.width) * 100}%`,
            top: `${((badgeCell.row + 1) / treasure.height) * 100}%`,
            width: `${100 / treasure.width}%`,
          }}
        >
          +{treasure.points}
        </span>
      )}
    </div>
  );
}

function publicState(game: GameState) {
  return {
    coordinateSystem:
      "origin top-left; x right, y down; board index = y * cols + x",
    seed: game.seed,
    cols: game.cols,
    rows: game.rows,
    colors: game.colors,
    board: game.board,
    treasureTotal: game.treasures.length,
    foundCount: game.treasures.filter((treasure) => treasure.found).length,
    treasures: game.treasures
      .filter((treasure) => treasure.revealed > 0)
      .map((treasure) => ({
        id: treasure.found ? treasure.id : null,
        name: treasure.found ? treasure.name : null,
        revealed: treasure.revealed,
        total: treasure.total,
        found: treasure.found,
        points: treasure.found ? treasure.points : null,
      })),
    score: game.score,
    movesLeft: game.movesLeft,
    maxMoves: game.maxMoves,
    shufflesLeft: game.shufflesLeft,
    maxShuffles: game.maxShuffles,
    hasLegalMove: hasLegalMove(game.board, game.cols),
    canShuffle: canShuffleRemaining(game),
    turns: game.turns,
    status: game.status,
    lastMove: game.lastMove && {
      index: game.lastMove.index,
      cleared: game.lastMove.cleared,
      shifted: game.lastMove.shifted,
      refunded: game.lastMove.refunded,
      hitTargets: game.lastMove.hitTargets,
      discoveredCount: game.lastMove.discoveredIds.length,
      foundIds: game.lastMove.foundIds,
      scoreGained: game.lastMove.scoreGained,
    },
  };
}

export default function BrickExcavation() {
  const [game, setGame] = useState<GameState>(() => createGame(0));
  const [history, setHistory] = useState<GameState[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [muted, setMuted] = useState(true);
  const [best, setBest] = useState<number | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLButtonElement>(null);
  const rulesRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      const value = Number(localStorage.getItem(BEST_KEY));
      if (Number.isFinite(value) && value > 0) setBest(value);
    } catch {
      // The game remains playable when local storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (game.status === "playing") return;
    if (best !== null && best >= game.score) return;
    setBest(game.score);
    try {
      localStorage.setItem(BEST_KEY, String(game.score));
    } catch {
      // A storage failure only affects the local record.
    }
  }, [best, game.score, game.status]);

  useEffect(() => {
    const target = window as TextWindow;
    target.render_game_to_text = () => JSON.stringify(publicState(game));
    return () => {
      delete target.render_game_to_text;
    };
  }, [game]);

  useEffect(() => {
    if (rulesOpen) rulesRef.current?.focus();
  }, [rulesOpen]);

  useEffect(() => {
    if (!rulesOpen) return undefined;
    function onRulesKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setRulesOpen(false);
        requestAnimationFrame(() => helpRef.current?.focus());
      } else if (event.key === "Tab") {
        event.preventDefault();
        rulesRef.current?.querySelector("button")?.focus();
      }
    }
    window.addEventListener("keydown", onRulesKeyDown);
    return () => window.removeEventListener("keydown", onRulesKeyDown);
  }, [rulesOpen]);

  useEffect(
    () => () => {
      audioRef.current?.close().catch(() => undefined);
    },
    [],
  );

  const foundCount = game.treasures.filter((treasure) => treasure.found).length;
  const legalMoveAvailable = hasLegalMove(game.board, game.cols);
  const strandedTreasure = hasStrandedTreasure(game);
  const seenTreasures = game.treasures.filter(
    (treasure) => treasure.revealed > 0,
  );
  const latestFound = game.treasures.filter((treasure) => {
    return game.lastMove?.foundIds.includes(treasure.id);
  });

  const clusterSizes = useMemo(() => {
    const sizes = Array<number>(game.board.length).fill(0);
    game.board.forEach((color, index) => {
      if (color === null || sizes[index] > 0) return;
      const cells = getCluster(game.board, index, game.cols);
      cells.forEach((cell) => { sizes[cell] = cells.length; });
    });
    return sizes;
  }, [game.board, game.cols]);

  const preview = useMemo(() => {
    const group = new Set<number>();
    const edge = new Set<number>();
    if (hovered === null || game.status !== "playing" || clusterSizes[hovered] < 2) {
      return { group, edge };
    }
    getCluster(game.board, hovered, game.cols).forEach((index) => {
      group.add(index);
    });
    group.forEach((index) => {
      const x = index % game.cols;
      const y = Math.floor(index / game.cols);
      const neighbors = [
        y > 0 ? index - game.cols : -1,
        y < game.rows - 1 ? index + game.cols : -1,
        x > 0 ? index - 1 : -1,
        x < game.cols - 1 ? index + 1 : -1,
      ];
      neighbors.forEach((neighbor) => {
        if (
          neighbor >= 0 &&
          game.board[neighbor] !== null &&
          !group.has(neighbor)
        ) edge.add(neighbor);
      });
    });
    return { group, edge };
  }, [clusterSizes, game, hovered]);

  function sound(frequency: number, duration = 0.07) {
    if (muted) return;
    try {
      const audio = audioRef.current || new AudioContext();
      audioRef.current = audio;
      audio.resume().catch(() => undefined);
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * 0.65,
        audio.currentTime + duration,
      );
      gain.gain.setValueAtTime(0.12, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.currentTime + duration,
      );
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    } catch {
      // Audio is optional.
    }
  }

  function hit(index: number) {
    const next = strike(game, index);
    if (next === game) return;
    setHistory((previous) => [...previous, game]);
    setGame(next);
    setHovered(null);
    sound(
      next.lastMove?.foundIds.length
        ? 760
        : 230 + (next.lastMove?.cleared.length || 1) * 35,
      next.lastMove?.foundIds.length ? 0.22 : 0.07,
    );
  }

  function undo() {
    if (history.length === 0) return;
    setGame(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setHovered(null);
  }

  function shuffle() {
    const next = shuffleRemaining(game);
    if (next === game) return;
    setHistory((previous) => [...previous, game]);
    setGame(next);
    setHovered(null);
    sound(540, 0.16);
  }

  function restart() {
    setGame(createGame(game.seed));
    setHistory([]);
    setHovered(null);
  }

  function newMap() {
    setGame(createGame(game.seed + 1));
    setHistory([]);
    setHovered(null);
  }

  function closeRules() {
    setRulesOpen(false);
    requestAnimationFrame(() => helpRef.current?.focus());
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = {
      ArrowUp: -game.cols,
      ArrowDown: game.cols,
      ArrowLeft: -1,
      ArrowRight: 1,
    }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    let candidate = index + delta;
    while (candidate >= 0 && candidate < game.board.length) {
      if (delta === 1 && candidate % game.cols === 0) break;
      if (delta === -1 && candidate % game.cols === game.cols - 1) break;
      if (clusterSizes[candidate] >= 2) {
        boardRef.current
          ?.querySelector<HTMLButtonElement>(
            `button[data-index="${candidate}"]`,
          )
          ?.focus();
        break;
      }
      candidate += delta;
    }
  }

  function renderCell(color: number | null, index: number) {
    if (color === null) {
      return <div className={styles.openCell} key={index} aria-hidden="true" />;
    }
    let previewKind: string | undefined;
    if (preview.group.has(index)) previewKind = 'group';
    else if (preview.edge.has(index)) previewKind = 'edge';
    const row = Math.floor(index / game.cols) + 1;
    const col = (index % game.cols) + 1;
    const dead = clusterSizes[index] < 2;
    const nextColor = previewKind === 'edge' ? (color + 1) % game.colors : undefined;
    return (
      <button
        type="button"
        className={styles.tile}
        key={index}
        data-index={index}
        data-color={color}
        data-dead={dead}
        data-preview={previewKind}
        data-preview-color={nextColor}
        aria-label={`第 ${row} 行第 ${col} 列，${COLOR_NAMES[color]}砖${dead ? '，孤砖，不能敲' : ''}`}
        title={dead ? '单格砖不能敲' : nextColor !== undefined ? `敲击后变为${COLOR_NAMES[nextColor]}` : undefined}
        disabled={game.status !== 'playing' || dead}
        onClick={() => hit(index)}
        onMouseEnter={() => { if (!dead) setHovered(index); }}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => { if (!dead) setHovered(index); }}
        onBlur={() => setHovered(null)}
        onKeyDown={(event) => moveFocus(event, index)}
      >
        <span className={styles.colorMark} aria-hidden="true">{MARKS[color]}</span>
        {nextColor !== undefined && (
          <span className={styles.nextColor} data-color={nextColor} aria-hidden="true">
            {MARKS[nextColor]}
          </span>
        )}
      </button>
    );
  }

  let moveMessage = "矿层尚未勘探";
  if (game.lastMove) {
    if (latestFound.length > 0) {
      moveMessage = `${latestFound.map((treasure) => treasure.name).join("、")}出土！+${game.lastMove.scoreGained} 分`;
    } else if (game.lastMove.discoveredIds.length > 0) {
      moveMessage = `发现 ${game.lastMove.discoveredIds.length} 处线索 · +${game.lastMove.scoreGained} 分`;
    } else {
      moveMessage = `敲落 ${game.lastMove.cleared.length} 块 · +${game.lastMove.scoreGained} 分`;
    }
  } else if (game.shufflesLeft < game.maxShuffles) {
    moveMessage = "剩余砖块已重新洗牌";
  }
  if (game.status === "playing" && !legalMoveAvailable) {
    moveMessage = "没有可敲连片，洗牌后继续";
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link
          className={styles.backLink}
          href="/demos"
          aria-label="返回游戏列表"
          title="返回游戏列表"
        >
          <ArrowLeftOutlined />
        </Link>
        <div className={styles.brand}>
          <span className={styles.brandIndex}>VIAR / 04</span>
          <h1>维阿发掘局</h1>
        </div>
        <div className={styles.topActions}>
          <button
            className={styles.iconButton}
            type="button"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "开启音效" : "关闭音效"}
            title={muted ? "开启音效" : "关闭音效"}
          >
            {muted ? <AudioMutedOutlined /> : <SoundOutlined />}
          </button>
          <button
            ref={helpRef}
            className={styles.iconButton}
            type="button"
            onClick={() => setRulesOpen(true)}
            aria-label="玩法规则"
            aria-expanded={rulesOpen}
            aria-controls="brick-rules"
            title="玩法规则"
          >
            <QuestionCircleOutlined />
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <section className={styles.boardColumn} aria-label="发掘棋盘">
          <div className={styles.boardHeading}>
            <span>
              矿层 <b>{String(game.seed + 1).padStart(3, "0")}</b>
            </span>
            <span className={styles.mobileStats}>
              收获{" "}
              <b>
                {foundCount}/{game.treasures.length}
              </b>{" "}
              · 落锤 <b>{game.movesLeft}</b>
            </span>
            <span className={styles.desktopBoardLabel}>
              彩砖区 / {game.cols} × {game.rows}
            </span>
          </div>
          <div className={styles.boardFrame} data-status={game.status}>
            <div className={styles.boardBase} aria-hidden="true">
              {game.treasures.map((treasure, index) => (
                treasure.revealed > 0
                  ? renderTreasure(treasure, game.cols, game.rows, TREASURE_TINTS[index % TREASURE_TINTS.length])
                  : null
              ))}
            </div>
            <div
              ref={boardRef}
              className={styles.tileGrid}
              role="group"
              aria-label="彩色砖块矩阵"
              style={
                { "--cols": game.cols, "--rows": game.rows } as CSSProperties
              }
            >
              {game.board.map(renderCell)}
            </div>
          </div>
          <div className={styles.boardFooter}>
            <span>
              {game.status === "playing" && !legalMoveAvailable
                ? `颜色死局 · 可洗牌 ${game.shufflesLeft} 次`
                : hovered !== null && preview.group.size > 0
                ? `连色 ${preview.group.size} 格`
                : "孤砖不可敲"}
            </span>
            <span>
              {preview.edge.size > 0
                ? '外圈角标为下一色'
                : game.lastMove?.refunded ? '本次落锤返还' : '六格以上返还落锤'}
            </span>
          </div>
          <div className={styles.colorGuide} aria-label="颜色变化顺序">
            <span className={styles.colorGuideTitle}>变色顺序</span>
            <div className={styles.colorGuideSteps}>
              {[0, 1, 2, 3, 0].map((color, index) => (
                <span className={styles.colorGuideStep} key={`${color}-${index}`}>
                  {index > 0 && <ArrowRightOutlined aria-hidden="true" />}
                  <span className={styles.colorGuideSwatch} data-color={color}>{COLOR_NAMES[color]}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        <aside className={styles.sidebar} aria-label="发掘记录">
          <div className={styles.stageHead}>
            <span className={styles.eyebrow}>
              EXCAVATION / {String(game.seed + 1).padStart(3, "0")}
            </span>
            <h2>
              {game.status === "playing"
                ? "寻找埋藏的身影"
                : game.status === "won"
                  ? "全部出土"
                  : "勘探结束"}
            </h2>
            <p>
              {game.status === "playing"
                ? "一张矿层，藏着数位维阿主播。"
                : `本局找到 ${foundCount} 位主播。`}
            </p>
          </div>

          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>得分</span>
              <strong>{game.score}</strong>
            </div>
            <div className={styles.metric}>
              <span>落锤</span>
              <strong data-low={game.movesLeft <= 4}>
                {game.movesLeft}
                <small> / {game.maxMoves}</small>
              </strong>
            </div>
            <div className={styles.metric}>
              <span>收获</span>
              <strong>
                {foundCount}
                <small> / {game.treasures.length}</small>
              </strong>
            </div>
          </div>

          <div className={styles.moveResult} aria-live="polite">
            <span>
              {game.lastMove
                ? `第 ${game.turns} 次敲击`
                : game.shufflesLeft < game.maxShuffles
                  ? `第 ${game.maxShuffles - game.shufflesLeft} 次洗牌`
                  : "当前矿层"}
            </span>
            <strong>{moveMessage}</strong>
            {game.lastMove?.refunded && (
              <small>连片敲落 6 格以上，返还 1 次落锤</small>
            )}
          </div>

          <section className={styles.collection} aria-label="本局收获">
            <div className={styles.collectionTitle}>
              <span>本局收获</span>
              <span>
                {foundCount} / {game.treasures.length}
              </span>
            </div>
            {seenTreasures.length === 0 ? (
              <p className={styles.emptyCollection}>尚未发现藏品</p>
            ) : (
              <div className={styles.collectionList}>
                {seenTreasures.map((treasure) => (
                  <div
                    className={styles.collectionItem}
                    key={treasure.id}
                    data-found={treasure.found}
                  >
                    <div
                      className={styles.collectionImage}
                      style={
                        treasure.found
                          ? {
                              backgroundImage: `url("${treasure.portrait}")`,
                            }
                          : undefined
                      }
                      aria-hidden="true"
                    >
                      {!treasure.found && "?"}
                    </div>
                    <div className={styles.collectionInfo}>
                      <strong>
                        {treasure.found ? treasure.name : "未确认的身影"}
                      </strong>
                      <span>
                        {treasure.found
                          ? "已出土"
                          : `已显露 ${treasure.revealed} / ${treasure.total} 格`}
                      </span>
                    </div>
                    <b className={styles.collectionPoints}>
                      {treasure.found ? `+${treasure.points}` : "···"}
                    </b>
                  </div>
                ))}
              </div>
            )}
          </section>

          {game.status !== "playing" && (
            <div className={styles.result} aria-live="polite">
              <span className={styles.resultGrade}>
                {game.status === "won" ? getGrade(game) : foundCount}
              </span>
              <div>
                <strong>
                  {game.status === "won"
                    ? "全部出土"
                    : game.movesLeft === 0
                      ? "落锤用尽"
                      : strandedTreasure
                        ? "宝物砖已孤立"
                        : "无可敲连片"}
                </strong>
                <p>
                  {game.score} 分 · {foundCount} / {game.treasures.length}{" "}
                  件藏品
                </p>
              </div>
            </div>
          )}

          <div className={styles.commands}>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={newMap}
            >
              <span>新地图</span>
              <ReloadOutlined />
            </button>
            <div className={styles.secondaryButtons}>
              <button
                type="button"
                onClick={shuffle}
                disabled={!canShuffleRemaining(game)}
                aria-label={`洗牌，剩余 ${game.shufflesLeft} 次`}
                title="重随机剩余砖块的颜色"
                data-shuffle=""
              >
                <SyncOutlined /> 洗牌 {game.shufflesLeft}/{game.maxShuffles}
              </button>
              <button
                type="button"
                onClick={undo}
                disabled={history.length === 0}
                aria-label="撤销"
              >
                <UndoOutlined /> 撤销
              </button>
              <button type="button" onClick={restart} aria-label="重开">
                <ReloadOutlined /> 重开
              </button>
            </div>
          </div>
          <div className={styles.personalBest}>
            本机最佳 <strong>{best ?? "—"}</strong>
          </div>
        </aside>
      </div>

      {rulesOpen && (
        <div className={styles.rulesScrim}>
          <button
            type="button"
            className={styles.rulesBackdrop}
            aria-label="关闭规则"
            onClick={closeRules}
          />
          <div
            ref={rulesRef}
            id="brick-rules"
            className={styles.rules}
            role="dialog"
            aria-modal="true"
            aria-label="发掘规则"
            tabIndex={-1}
          >
            <div className={styles.rulesTitle}>
              <strong>发掘规则</strong>
              <button type="button" onClick={closeRules} aria-label="关闭规则">
                ×
              </button>
            </div>
            <ol>
              <li>至少两块四向相连的同色砖才能敲；单独一格是死棋。</li>
              <li>周围的砖按朱红、青绿、琥珀、紫晶的顺序循环变色。</li>
              <li>
                清开砖层寻找藏品；完整挖出一件，立即得分，继续寻找其他藏品。
              </li>
              <li>每次敲击消耗一锤；一次敲落至少六块，返还这一锤。</li>
              <li>每局可洗牌 {game.maxShuffles} 次，只随机剩余砖的颜色，不补砖或落锤；四周已挖空的孤砖无法靠洗牌补救。</li>
            </ol>
            <p>鼠标、触屏可直接敲击；键盘方向键移动焦点，Enter 或空格敲击。</p>
          </div>
        </div>
      )}
    </main>
  );
}
