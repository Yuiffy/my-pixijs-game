"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import Image from "next/image";
import HarborBoard from "./HarborBoard";
import {
  type Action,
  type ActionKind,
  type GameState,
  type PlayerConfig,
  type StreamerId,
  EVENTS,
  PLAYER_COLORS,
  PROJECTS,
  ROSTERS,
  STREAMERS,
  TARGET,
  SAVE_VERSION,
  CLIP_SPOT,
  CLIP_PAYOUT,
  WORK_PAYOUT,
  clipForecast,
  clipBoardingOptions,
  chooseAiClip,
  resolveClip,
  RECOGNITION_SPACES,
  actionCost,
  actionProblem,
  chooseAiAction,
  continueGame,
  createGame,
  gameText,
  launch,
  leaders,
  prepareAi,
  restoreGame,
  roll,
  setRoster,
  setWarmup,
  streamerById,
  successChance,
  takeAction,
  wealth,
  recognitionChance,
} from "./engine";
import styles from "./harbor.module.css";
import type { RoomCommand, RoomView } from "@/lib/hypeHarbor/room";

const SAVE_KEY = "hype-harbor-v1";
const ROOM_KEY = "hype-harbor-room";
const DEFAULT_PLAYERS: PlayerConfig[] = [
  { name: "你", ai: false },
  { name: "阿策", ai: true },
  { name: "小满", ai: true },
  { name: "朋友", ai: false },
];
const ACTION_LABELS: Record<ActionKind, string> = {
  support: "上船应援",
  recognition: "认知民",
  clip: "切片佬",
  share: "买长期股",
  boost: "投流",
  smear: "黑料",
  insure: "补买保险",
  work: "接个小单",
};
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value}`;

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a, input, select, [tabindex="0"]',
        ) || [],
      );
    (focusable()[0] || dialog)?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onClose) {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className={styles.modalBackdrop}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        tabIndex={-1}
      >
        {onClose && (
          <button className={styles.close} onClick={onClose} aria-label="关闭">
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export default function HypeHarbor() {
  const [mode, setMode] = useState<"local" | "online">("local");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [roomToken, setRoomToken] = useState("");
  const [onlineName, setOnlineName] = useState("");
  const [onlineError, setOnlineError] = useState("");
  const [onlineBusy, setOnlineBusy] = useState(false);
  const roomRef = useRef<RoomView | null>(null);
  roomRef.current = room;
  const [rawState, setState] = useState<GameState | null>(null);
  const localState = useMemo(
    () => (rawState && rawState.version !== SAVE_VERSION
        ? restoreGame(JSON.stringify(rawState))
        : rawState),
    [rawState],
  );
  const state = mode === "online" ? room?.state || null : localState;
  const [saved, setSaved] = useState<GameState | null>(null);
  const [storageMessage, setStorageMessage] = useState("");
  const [configs, setConfigs] = useState(DEFAULT_PLAYERS);
  const [playerCount, setPlayerCount] = useState(3);
  const [rounds, setRounds] = useState(3);
  const [rosterIndex, setRosterIndex] = useState(0);
  const [selected, setSelected] = useState(0);
  const [kind, setKind] = useState<ActionKind>("support");
  const [recognitionIndex, setRecognitionIndex] = useState(0);
  const [insured, setInsured] = useState(false);
  const [modal, setModal] = useState<"help" | "restart" | null>(null);
  const [acknowledged, setAcknowledged] = useState("");
  const [aiElapsed, setAiElapsed] = useState(0);
  const pageRef = useRef<HTMLElement>(null);
  const boardRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const latestRef = useRef({ state, modal, acknowledged });
  latestRef.current = { state, modal, acknowledged };
  const closeModal = useCallback(() => setModal(null), []);
  const current = state?.players[state.turn];
  const humanCount = state?.players.filter((p) => !p.ai).length || 1;
  const turnKey = state
    ? `${state.round}:${state.beat}:${state.turn}:${state.placed}:${state.phase === "spotlight" ? `clip${state.clipQueue[0]}` : ""}`
    : "";
  const needHandoff = Boolean(
    state &&
    mode === "local" &&
    humanCount > 1 &&
    current &&
    !current.ai &&
    ["preparing", "placing", "spotlight"].includes(state.phase) &&
    acknowledged !== turnKey,
  );
  const canPlay = Boolean(
    state?.phase === "placing" &&
    !current?.ai &&
    !needHandoff &&
    !modal &&
    !onlineBusy &&
    (mode === "local" || room?.seat === state.turn),
  );

  const updateRoom = useCallback((next: RoomView) => {
    setRoom((previous) => (previous &&
      previous.code === next.code &&
      previous.revision > next.revision
        ? previous
        : next),);
  }, []);
  const roomRequest = useCallback(
    async (payload: Record<string, unknown>) => {
      const response = await fetch("/api/hype-harbor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (data.room) updateRoom(data.room as RoomView);
      if (!response.ok) throw new Error(data.error || "房间请求失败");
      return data as { room: RoomView; token?: string };
    },
    [updateRoom],
  );
  const sendCommand = useCallback(
    async (command: RoomCommand) => {
      const latest = roomRef.current;
      if (!latest || onlineBusy) return;
      setOnlineBusy(true);
      setOnlineError("");
      try {
        await roomRequest({
          operation: "command",
          code: latest.code,
          token: roomToken,
          revision: latest.revision,
          command,
        });
      } catch (error) {
        setOnlineError(error instanceof Error ? error.message : "房间请求失败");
      } finally {
        setOnlineBusy(false);
      }
    },
    [onlineBusy, roomRequest, roomToken],
  );
  const transition = (
    command: RoomCommand,
    local: (previous: GameState) => GameState,
  ) => {
    if (mode === "online") sendCommand(command);
    else setState((previous) => (previous ? local(previous) : previous));
  };

  useEffect(() => {
    const code =
      new URLSearchParams(window.location.search).get("room")?.toUpperCase() ||
      "";
    const stored = sessionStorage.getItem(ROOM_KEY);
    if (code) {
      setMode("online");
      setRoomCode(code);
      setJoining(true);
    }
    if (stored) {
      try {
        const session = JSON.parse(stored) as { code: string; token: string };
        if (!code || code === session.code) {
          setMode("online");
          setRoomCode(session.code);
          setRoomToken(session.token);
        }
      } catch {
        sessionStorage.removeItem(ROOM_KEY);
      }
    }
  }, []);
  useEffect(() => {
    if (mode !== "online" || !roomCode || !roomToken) return undefined;
    let active = true;
    const poll = async () => {
      try {
        await roomRequest({
          operation: "status",
          code: roomCode,
          token: roomToken,
        });
        if (active) setOnlineError("");
      } catch (error) {
        if (active) setOnlineError(error instanceof Error ? error.message : "同步失败");
      }
    };
    poll();
    const timer = window.setInterval(() => {
      if (!onlineBusy) poll();
    }, 1800);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [mode, roomCode, roomToken, roomRequest, onlineBusy]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const loaded = restoreGame(raw);
        if (loaded) setSaved(loaded);
        else setStorageMessage("上次存档无法读取，可以正常开始新局。");
      }
    } catch {
      setStorageMessage("浏览器未开放存储，本局可正常游玩。");
    }
  }, []);

  useEffect(() => {
    if (rawState && rawState.version !== SAVE_VERSION && localState) setState(localState);
  }, [rawState, localState]);

  useEffect(() => {
    if (mode !== "local" || !state) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      setSaved(state);
    } catch {
      setStorageMessage("自动保存不可用；关闭页面前请完成本局。");
    }
  }, [state, mode]);

  const runAi = useCallback(() => {
    if (mode === "online" || latestRef.current.modal) return;
    setState((previous) => {
      if (!previous || !previous.players[previous.turn].ai) return previous;
      if (previous.phase === "preparing") return prepareAi(previous);
      if (previous.phase === "placing") return takeAction(previous, chooseAiAction(previous).action);
      if (previous.phase === "spotlight") return resolveClip(previous, chooseAiClip(previous));
      return previous;
    });
  }, [mode]);

  useEffect(() => {
    if (
      mode === "online" ||
      !state ||
      !current?.ai ||
      modal ||
      !["placing", "preparing", "spotlight"].includes(state.phase)
    ) return undefined;
    const timer = window.setTimeout(runAi, 1000);
    return () => window.clearTimeout(timer);
  }, [state, current?.ai, modal, runAi, mode]);

  useEffect(() => {
    setKind("support");
    setInsured(false);
    setAiElapsed(0);
  }, [turnKey]);

  useEffect(() => {
    const diagnosticWindow = window as Window & {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
    };
    diagnosticWindow.render_game_to_text = () => JSON.stringify({
        ...JSON.parse(gameText(state)),
        selected,
        action: kind,
        selectedRecognition: recognitionIndex,
        handoff: needHandoff,
        modal,
        storageMessage,
        online:
          mode === "online"
            ? {
                code: roomCode,
                seat: room?.seat,
                revision: room?.revision,
                players: room?.players,
                error: onlineError,
              }
            : null,
      });
    diagnosticWindow.advanceTime = (ms: number) => {
      if (!Number.isFinite(ms) || ms < 0 || modal) return;
      setAiElapsed((value) => value + ms);
    };
    return () => {
      delete diagnosticWindow.render_game_to_text;
      delete diagnosticWindow.advanceTime;
    };
  }, [
    state,
    selected,
    kind,
    recognitionIndex,
    needHandoff,
    modal,
    storageMessage,
    mode,
    roomCode,
    room,
    onlineError,
  ]);
  useEffect(() => {
    if (aiElapsed >= 1000) {
      setAiElapsed(0);
      runAi();
    }
  }, [aiElapsed, runAi]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "f" ||
        /INPUT|SELECT|TEXTAREA/.test((event.target as HTMLElement).tagName)
      ) return;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else pageRef.current?.requestFullscreen?.().catch(() => {});
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  const start = () => {
    const roster = configs
      .slice(0, playerCount)
      .map((p, i) => ({ ...p, ai: i === 0 ? false : p.ai }));
    setSelected(0);
    setAcknowledged("");
    setState(
      createGame(roster, rounds, Date.now(), ROSTERS[rosterIndex].members),
    );
  };
  const createOnline = async () => {
    setOnlineBusy(true);
    setOnlineError("");
    try {
      const players = configs.slice(0, playerCount).map((player, i) => ({
        name: player.name.trim() || `玩家 ${i + 1}`,
        ai: i === 0 ? false : player.ai,
      }));
      const result = await roomRequest({
        operation: "create",
        players,
        rounds,
        rosterIndex,
      });
      const token = result.token || "";
      sessionStorage.setItem(
        ROOM_KEY,
        JSON.stringify({ code: result.room.code, token }),
      );
      setRoomCode(result.room.code);
      setRoomToken(token);
      setJoining(false);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?room=${result.room.code}`,
      );
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : "创建房间失败");
    } finally {
      setOnlineBusy(false);
    }
  };
  const joinOnline = async () => {
    setOnlineBusy(true);
    setOnlineError("");
    try {
      const code = roomCode.trim().toUpperCase();
      const result = await roomRequest({
        operation: "join",
        code,
        name: onlineName.trim(),
      });
      const token = result.token || "";
      sessionStorage.setItem(ROOM_KEY, JSON.stringify({ code, token }));
      setRoomCode(code);
      setRoomToken(token);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?room=${code}`,
      );
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : "加入房间失败");
    } finally {
      setOnlineBusy(false);
    }
  };
  const leaveOnline = () => {
    sessionStorage.removeItem(ROOM_KEY);
    window.history.replaceState(null, "", window.location.pathname);
    setRoom(null);
    setRoomCode("");
    setRoomToken("");
    setOnlineError("");
    setJoining(false);
    setMode("local");
  };
  const chooseBoat = (index: number) => {
    setSelected(index);
    if (kind === "recognition") setKind("support");
  };

  const act = (action: Action) => {
    if (!canPlay) return;
    transition({ kind: "action", action }, (previous) => (previous.revision === state?.revision
        ? takeAction(previous, action)
        : previous),);
  };
  const boat = state?.boats[selected];
  const streamer = streamerById(boat?.streamer || "sui");
  const action: Action = {
    kind,
    boat: selected,
    insured,
    recognition: recognitionIndex,
  };
  const cost = state ? actionCost(state, action) : 0;
  const problem = state ? actionProblem(state, action) : null;
  const chance = state ? Math.round(successChance(state, selected) * 100) : 0;
  const result = state?.results.at(-1);

  function renderMenu() {
    if (mode === "online" && room && !room.state) {
      const ready = room.players.every((player) => player.joined);
      return (
        <div className={styles.setup}>
          <span className={styles.eyebrow}>在线对战 · 等待入座</span>
          <h1>
            同一张桌，
            <br />
            各自在家。
          </h1>
          <div className={styles.roomCode}>
            <span>房间号</span>
            <strong>{room.code}</strong>
            <button
              onClick={() => navigator.clipboard.writeText(
                  `${window.location.origin}/game/hype-harbor?room=${room.code}`,
                )}
            >
              复制邀请链接
            </button>
          </div>
          <div className={styles.roomSeats}>
            {room.players.map((player, i) => (
              <div key={i}>
                <span
                  className={styles.playerDot}
                  style={{ background: PLAYER_COLORS[i] }}
                >
                  {i + 1}
                </span>
                <b>{player.name}</b>
                <small>
                  {player.ai ? "AI" : player.joined ? "已入座" : "等待加入"}
                </small>
              </div>
            ))}
          </div>
          {room.seat === 0 ? (
            <button
              className={styles.primary}
              disabled={!ready || onlineBusy}
              onClick={() => sendCommand({ kind: "start" })}
              data-testid="online-start"
            >
              {ready ? "开始对战" : "等待朋友入座"} →
            </button>
          ) : (
            <p className={styles.roomWaiting}>等待房主开始…</p>
          )}
          <button className={styles.resume} onClick={leaveOnline}>
            返回单机模式
          </button>
        </div>
      );
    }
    if (mode === "online" && !roomToken && joining) return (
        <div className={styles.setup}>
          <span className={styles.eyebrow}>在线对战</span>
          <h1>加入这张桌。</h1>
          <label htmlFor="online-room-code" className={styles.roomField}>
            房间号
            <input
              id="online-room-code"
              aria-label="房间号"
              maxLength={8}
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              placeholder="8 位房间号"
            />
          </label>
          <label htmlFor="online-player-name" className={styles.roomField}>
            你的名字
            <input
              id="online-player-name"
              aria-label="你的名字"
              maxLength={12}
              value={onlineName}
              onChange={(event) => setOnlineName(event.target.value)}
              placeholder="怎么称呼你"
            />
          </label>
          <button
            className={styles.primary}
            disabled={onlineBusy || roomCode.length !== 8 || !onlineName.trim()}
            onClick={() => joinOnline()}
            data-testid="online-join"
          >
            加入房间 →
          </button>
          <button
            className={styles.resume}
            onClick={() => {
              setRoomCode("");
              setJoining(false);
            }}
          >
            创建新房间
          </button>
        </div>
      );
    if (mode === "online" && roomToken && !room) return (
        <div className={styles.setup}>
          <span className={styles.eyebrow}>在线对战</span>
          <h2>正在连接房间…</h2>
          <button className={styles.resume} onClick={leaveOnline}>
            返回单机模式
          </button>
        </div>
      );
    return (
      <div className={styles.setup}>
        <div className={styles.segment} aria-label="对战方式">
          <button
            aria-pressed={mode === "local"}
            onClick={() => setMode("local")}
          >
            同机 / AI
          </button>
          <button
            aria-pressed={mode === "online"}
            onClick={() => {
              setMode("online");
              setConfigs((previous) => previous.map((player, i) => {
                  if (i === 0 && player.name === "你") return { ...player, name: "房主" };
                  if (i === 1) return { ...player, ai: false };
                  return player;
                }),);
            }}
            data-testid="online-mode"
          >
            在线对战
          </button>
        </div>
        <span className={styles.eyebrow}>今晚的应援，由你做主</span>
        <h1>
          看好的，
          <br />
          就上船。
        </h1>
        <p className={styles.intro}>
          一起推主播企划达标。
          <br />
          应援、认知、蹲一手切片，
          <br />
          赚最多应援币的人赢。
        </p>
        <div className={styles.setupDivider} />
        <div className={styles.rosterSetting}>
          <label htmlFor="harbor-roster">
            本局主播组合 <small>四选三，每场一人休息</small>
            <select
              id="harbor-roster"
              value={rosterIndex}
              onChange={(e) => setRosterIndex(Number(e.target.value))}
            >
              {ROSTERS.map((r, i) => (
                <option key={r.name} value={i}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            {ROSTERS[rosterIndex].members
              .map((id) => streamerById(id).name)
              .join(" · ")}
          </p>
        </div>
        <div className={styles.settingRow}>
          <span>围桌人数</span>
          <div className={styles.segment}>
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                aria-pressed={playerCount === n}
                onClick={() => setPlayerCount(n)}
              >
                {n} 人
              </button>
            ))}
          </div>
        </div>
        <div className={styles.configPlayers}>
          {configs.slice(0, playerCount).map((p, index) => (
            <div key={index} className={styles.configPlayer}>
              <span
                className={styles.playerDot}
                style={{ background: PLAYER_COLORS[index] }}
              >
                {index + 1}
              </span>
              <input
                aria-label={`玩家 ${index + 1} 名称`}
                maxLength={12}
                value={p.name}
                onChange={(e) => setConfigs((previous) => previous.map((x, i) => (i === index ? { ...x, name: e.target.value } : x),),)}
              />
              {index === 0 ? (
                <span className={styles.fixedHuman}>真人</span>
              ) : (
                <select
                  aria-label={`玩家 ${index + 1} 类型`}
                  value={p.ai ? "ai" : "human"}
                  onChange={(e) => setConfigs((previous) => previous.map((x, i) => (i === index ? { ...x, ai: e.target.value === "ai" } : x),),)}
                >
                  <option value="ai">AI 对手</option>
                  <option value="human">本地真人</option>
                </select>
              )}
            </div>
          ))}
        </div>
        <div className={styles.settingRow}>
          <span>活动场数</span>
          <div className={styles.segment}>
            {[3, 5].map((n) => (
              <button
                key={n}
                aria-pressed={rounds === n}
                onClick={() => setRounds(n)}
              >
                {n} 场{n === 3 ? " · 轻松局" : " · 标准局"}
              </button>
            ))}
          </div>
        </div>
        <button
          className={styles.primary}
          onClick={mode === "online" ? () => createOnline() : start}
          disabled={onlineBusy}
          data-testid={mode === "online" ? "online-create" : "start"}
        >
          {mode === "online" ? "创建在线房间" : "开一桌"} <span>↗</span>
        </button>
        {mode === "online" && (
          <button className={styles.resume} onClick={() => setJoining(true)}>
            输入房间号加入
          </button>
        )}
        {mode === "local" && saved && saved.phase !== "finished" && (
          <button
            className={styles.resume}
            onClick={() => {
              setState(saved);
              setAcknowledged("");
            }}
            data-testid="resume"
          >
            继续上次 · 第 {saved.round}/{saved.rounds} 场 →
          </button>
        )}
        <p className={styles.tiny}>
          不用先读规则，第一场边玩边学。
          <br />
          {mode === "online"
            ? "创建后把邀请链接发给朋友。"
            : playerCount > 1 &&
                configs.slice(0, playerCount).filter((p) => !p.ai).length > 1
              ? "本地多人在同一设备轮流操作。"
              : "AI 会买股，也会和你抢名场面。"}
        </p>
      </div>
    );
  }

  function renderPreparation() {
    if (!state || !current) return null;
    const remaining = 3 - state.boats.reduce((sum, b) => sum + b.warmup, 0);
    return (
      <div className={styles.preparation}>
        <span className={styles.eyebrow}>主理人 · {current.name}</span>
        <h2>四位主播，三张船票。</h2>
        <p>
          选三位出航，一位休息；再分配 3 格预热。
          <br />
          你持有谁的股，想让谁多一份机会？
        </p>
        {state.boats.map((b, index) => (
          <div key={PROJECTS[index].name} className={styles.rosterRow}>
            <span
              className={styles.projectIcon}
              style={{ color: PROJECTS[index].color }}
            >
              {PROJECTS[index].icon}
            </span>
            <label htmlFor={`harbor-project-${index}`}>
              <small>{PROJECTS[index].name}</small>
              <select
                id={`harbor-project-${index}`}
                value={b.streamer}
                aria-label={`${PROJECTS[index].name}主播`}
                disabled={
                  current.ai ||
                  needHandoff ||
                  onlineBusy ||
                  (mode === "online" && room?.seat !== state.turn)
                }
                onChange={(e) => transition(
                    {
                      kind: "roster",
                      boat: index,
                      streamer: e.target.value as StreamerId,
                    },
                    (previous) => setRoster(previous, index, e.target.value as StreamerId),
                  )}
              >
                {state.roster.map(streamerById).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.stepper}>
              <button
                aria-label={`${PROJECTS[index].name}减少预热`}
                disabled={
                  current.ai ||
                  needHandoff ||
                  onlineBusy ||
                  (mode === "online" && room?.seat !== state.turn) ||
                  b.warmup === 0
                }
                onClick={() => transition(
                    { kind: "warmup", boat: index, amount: b.warmup - 1 },
                    (previous) => setWarmup(previous, index, b.warmup - 1),
                  )}
              >
                −
              </button>
              <b>{b.warmup}</b>
              <button
                aria-label={`${PROJECTS[index].name}增加预热`}
                disabled={
                  current.ai ||
                  needHandoff ||
                  onlineBusy ||
                  (mode === "online" && room?.seat !== state.turn) ||
                  remaining === 0
                }
                onClick={() => transition(
                    { kind: "warmup", boat: index, amount: b.warmup + 1 },
                    (previous) => setWarmup(previous, index, b.warmup + 1),
                  )}
              >
                +
              </button>
            </div>
          </div>
        ))}
        <div className={styles.restingNote}>
          ☕ 本场休息：
          <b>
            {state.roster
              .filter((id) => !state.boats.some((b) => b.streamer === id))
              .map((id) => streamerById(id).name)
              .join("")}
          </b>
          <span>股份保留，股价不变</span>
        </div>
        <p className={styles.preheat}>
          ✦ 还有 {remaining} 格预热
          {remaining ? " · 未分配的自动补齐" : " · 安排好了"}
        </p>
        <button
          className={styles.primary}
          disabled={
            current.ai ||
            needHandoff ||
            onlineBusy ||
            (mode === "online" && room?.seat !== state.turn)
          }
          onClick={() => transition({ kind: "launch" }, launch)}
          data-testid="launch"
        >
          {current.ai ? `${current.name}正在安排…` : "就这样，出航！"}{" "}
          <span>→</span>
        </button>
        <div className={styles.tip}>
          <b>第一次玩？</b>
          直接出航就好。每次选一个行动，三次掷骰后结算；最后比「现金 + 股份」。
        </div>
      </div>
    );
  }

  function renderAction() {
    if (!state || !boat || !current) return null;
    const ownedSeat = boat.seats.find((s) => s.player === current.id);
    const recognition = kind === "recognition";
    const clipping = kind === "clip";
    const traffic = kind === "boost" || kind === "smear";
    const trafficPosition =
      boat.position >= TARGET
        ? TARGET
        : Math.max(
            0,
            Math.min(TARGET, boat.position + (kind === "smear" ? -2 : 2)),
          );
    const forecast = clipForecast(state);
    const payout = recognition
      ? RECOGNITION_SPACES[recognitionIndex].payout
      : 12;
    const failure =
      kind === "support" && insured
        ? cost - 2
        : kind === "insure"
          ? ownedSeat?.cost || 0
          : 0;
    const detail = {
      support: "盼她出圈，就一起应援。越早上船越便宜，每船限 3 席。",
      recognition:
        "想被她记住，又怕她太火。押本场有几位主播未达标，猜中就有回报。",
      clip: "提前蹲名场面。第 2 次恰停 13 格可免费蹭船；留到第 3 次，抢爆梗切片的分成。",
      share: "买 1 股，跨活动持有。最后按股价计入总资产。",
      boost: "助推让这艘船前进 2 格，提高达标机会。你和船上的其他人都会受益。",
      smear:
        "黑料让这艘船后退 2 格，降低达标机会。最远退到 0 格，已达标的船不能拖回。",
      insure: "给你已经买下的应援席加保。保费不退。",
      work: "",
    }[kind];
    return (
      <div className={styles.inspector}>
        <div className={styles.turnHeading}>
          <span
            className={styles.playerDot}
            style={{ background: PLAYER_COLORS[current.id] }}
          >
            {current.id + 1}
          </span>
          <div>
            <span className={styles.eyebrow}>
              {current.ai
                ? "AI 正在考虑"
                : mode === "online" && room?.seat !== state.turn
                  ? "等待对方安排"
                  : "轮到你安排"}
            </span>
            <h2>{current.name}</h2>
          </div>
          <div className={styles.cash}>
            <strong>{current.cash}</strong>
            <small>可用币</small>
          </div>
        </div>
        {current.ai && (
          <div className={styles.thinking}>
            ••• {chooseAiAction(state).reason}
          </div>
        )}
        <div className={styles.actionTabs} aria-label="选择行动">
          {(
            ["support", "recognition", "clip", "share", "boost"] as ActionKind[]
          ).map((a, i) => (
            <button
              key={a}
              onClick={() => setKind(a)}
              aria-pressed={kind === a || (a === "boost" && kind === "smear")}
              data-testid={`action-${a}`}
            >
              <span>{["⚑", "♡", "✂", "▥", "↗"][i]}</span>
              {ACTION_LABELS[a]}
            </button>
          ))}
        </div>
        <div className={styles.selectedBoat}>
          {recognition || clipping ? (
            <span className={styles.roleIcon} aria-hidden="true">
              {recognition ? "♡" : "✂"}
            </span>
          ) : (
            <Image
              src={streamer.portrait}
              alt=""
              width={52}
              height={52}
              unoptimized
            />
          )}
          <div>
            <strong>
              {recognition
                ? "认知民 · 想被你记住"
                : clipping
                  ? "切片佬 · 蹲名场面"
                  : streamer.name}
            </strong>
            <small>
              {recognition
                ? "结算时未到 15 格即未达标"
                : clipping
                  ? "两位抢机会 · 先来先选"
                  : `${PROJECTS[selected].name} · 还差 ${Math.max(0, TARGET - boat.position)} 格`}
            </small>
          </div>
          {!clipping && (
            <div className={styles.odds}>
              <b>
                {recognition
                  ? Math.round(recognitionChance(state, recognitionIndex) * 100)
                  : chance}
                %
              </b>
              <small>{recognition ? "猜中机会" : "达标机会"}</small>
            </div>
          )}
        </div>
        <div className={styles.actionDetail}>
          {traffic && (
            <div
              className={`${styles.roleChoices} ${styles.trafficChoices}`}
              aria-label="选择投流方式"
            >
              <button
                onClick={() => setKind("boost")}
                aria-pressed={kind === "boost"}
                data-testid="traffic-boost"
              >
                <b>助推</b>
                <small>2 币 · 前进 2 格</small>
              </button>
              <button
                onClick={() => setKind("smear")}
                aria-pressed={kind === "smear"}
                data-testid="traffic-smear"
              >
                <b>黑料</b>
                <small>2 币 · 后退 2 格</small>
              </button>
            </div>
          )}
          <p>{detail}</p>
          {recognition && (
            <div className={styles.roleChoices} aria-label="选择认知席">
              {RECOGNITION_SPACES.map((space, i) => {
                const owner = state.recognition[i];
                return (
                  <button
                    key={space.threshold}
                    onClick={() => setRecognitionIndex(i)}
                    aria-pressed={recognitionIndex === i}
                    data-testid={`recognition-choice-${i}`}
                  >
                    <b>
                      {space.threshold === 3
                        ? "3 位主播都"
                        : `至少 ${space.threshold} 位主播`}
                      <br />
                      未达标
                    </b>
                    <small>
                      {owner
                        ? `${state.players[owner.player].name}已占`
                        : `花 ${actionCost(state, { kind: "recognition", boat: 0, recognition: i })} · 收 ${space.payout}`}
                    </small>
                  </button>
                );
              })}
            </div>
          )}
          {kind === "support" && (
            <label htmlFor="harbor-insurance" className={styles.insurance}>
              <input
                id="harbor-insurance"
                type="checkbox"
                checked={insured}
                onChange={(e) => setInsured(e.target.checked)}
              />
              带上保本险 <b>+2 币</b>
              <small>未达标退应援本金</small>
            </label>
          )}
          {clipping ? (
            <div className={styles.clipGuide}>
              <div>
                <b>第 2 次 · 停 13</b>
                <span>先到者先选空席，免费上船后达标收 12 币。</span>
                <small>
                  当前可蹭船机会 {Math.round(forecast.boarding * 100)}%
                </small>
              </div>
              <div>
                <b>第 3 次 · 停 13</b>
                <span>
                  每艘产生 {CLIP_PAYOUT} 币切片池，留守者平分；没人停就收 0。
                </span>
                <small>
                  当前爆梗机会 {Math.round(forecast.jackpot * 100)}%
                </small>
              </div>
              <div className={styles.clipOwners}>
                {state.clippers.map((slot, i) => (
                  <span key={i}>
                    {i === 0 ? "①" : "②"}{" "}
                    {slot ? state.players[slot.player].name : "空位"}
                  </span>
                ))}
              </div>
            </div>
          ) : kind === "share" ? (
            <div className={styles.outcomes}>
              <div>
                <small>达标后股价</small>
                <strong>
                  {state.prices[boat.streamer] + 3}
                  <em> / 股</em>
                </strong>
              </div>
              <div>
                <small>未达标后股价</small>
                <strong>
                  {Math.max(3, state.prices[boat.streamer] - 1)}
                  <em> / 股</em>
                </strong>
              </div>
            </div>
          ) : traffic ? (
            <div className={styles.boostPreview}>
              <b>{boat.position}</b>
              <span>→</span>
              <b>{trafficPosition}</b>
              <small>
                达标机会 {chance}% →{" "}
                {Math.round(
                  successChance(
                    state,
                    selected,
                    trafficPosition - boat.position,
                  ) * 100,
                )}
                %
              </small>
            </div>
          ) : (
            <div className={styles.outcomes}>
              <div>
                <small>{recognition ? "条件满足 · 收到" : "达标 · 收到"}</small>
                <strong>
                  {payout}
                  <em> 币</em>
                </strong>
              </div>
              <div>
                <small>
                  {recognition ? "条件不满足 · 收到" : "未达标 · 收到"}
                </small>
                <strong>
                  {failure}
                  <em> 币</em>
                </strong>
              </div>
            </div>
          )}
          <button
            className={styles.primary}
            disabled={!canPlay || Boolean(problem)}
            onClick={() => act(action)}
            data-testid="confirm-action"
          >
            {problem ||
              `花 ${cost} 币 · ${clipping ? "提前蹲切片" : recognition ? "确认认知席" : kind === "boost" ? "助推" : ACTION_LABELS[kind]}`}
            {!problem && <span>→</span>}
          </button>
          {kind === "support" && !problem && (
            <small className={styles.netProfit}>
              达标净赚 {12 - cost} 币
              {insured
                ? " · 未达标只损失 2 币保费"
                : ` · 未达标损失 ${cost} 币`}
            </small>
          )}
          {recognition && !problem && (
            <small className={styles.netProfit}>
              猜中净赚 {payout - cost} 币 · 猜错损失 {cost} 币
            </small>
          )}
          {clipping && (
            <small className={styles.netProfit}>
              蹭船后退出切片位 · 每人每场限蹲一次
            </small>
          )}
          {traffic && (
            <small className={styles.netProfit}>
              助推／黑料各耗一次行动 · 移到 13 格不触发切片
            </small>
          )}
        </div>
        <div className={styles.alternatives}>
          {!recognition &&
            !clipping &&
            ownedSeat &&
            !ownedSeat.insured &&
            ownedSeat.cost > 0 && (
              <button
                disabled={!canPlay}
                onClick={() => setKind("insure")}
                aria-pressed={kind === "insure"}
              >
                给已有席位补保险 · 2 币
              </button>
            )}
          <button
            disabled={!canPlay}
            onClick={() => act({ kind: "work", boat: 0 })}
            data-testid="work"
          >
            暂不投资，接个小单 <b>+{WORK_PAYOUT} 币</b>
          </button>
        </div>
        <small className={styles.probabilityNote}>
          概率按剩余骰子计算，不含后续投流与他人抢位。
        </small>
      </div>
    );
  }

  function renderSpotlight() {
    if (!state || !current) return null;
    const options = clipBoardingOptions(state);
    const disabled =
      current.ai ||
      needHandoff ||
      Boolean(modal) ||
      onlineBusy ||
      (mode === "online" && room?.seat !== state.turn);
    const decide = (index: number | null) => {
      if (!disabled) transition({ kind: "clip", boat: index }, (previous) => resolveClip(previous, index),);
    };
    return (
      <div className={styles.spotlight}>
        <span className={styles.eyebrow}>第 2 次开播 · 名场面来了</span>
        <div className={styles.spotlightIcon}>✂</div>
        <h2>{current.name}，上船还是再等等？</h2>
        <p>
          恰好停在 13
          格！你的切片蹭到了热度，可以免费占一个空席；也可以留守，赌最后一次爆梗。
        </p>
        <small>按切片位先后选。这次机会不消耗下轮行动。</small>
        <div className={styles.boardingOptions}>
          {options.map((index) => (
            <button
              className={styles.primary}
              key={index}
              disabled={disabled}
              onClick={() => decide(index)}
              data-testid={`clip-board-${index}`}
            >
              蹭上{streamerById(state.boats[index].streamer).name}的船{" "}
              <span>→</span>
            </button>
          ))}
        </div>
        <p className={styles.tip}>
          免费席达标收 12 币；未达标收 0。上船就退出切片位。
        </p>
        <button
          className={styles.resume}
          disabled={disabled}
          onClick={() => decide(null)}
          data-testid="clip-hold"
        >
          继续蹲最后一剪
        </button>
      </div>
    );
  }

  function renderSailing() {
    if (!state) return null;
    const revealed = state.phase === "reveal";
    return (
      <div className={styles.sailing}>
        <span className={styles.eyebrow}>第 {state.beat} / 3 次推进</span>
        <div
          className={`${styles.bigDie} ${revealed ? styles.dieRevealed : ""}`}
        >
          {revealed
            ? state.boats
                .map((b) => (b.die ? ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][b.die - 1] : "✓"),)
                .join(" ")
            : "⚂"}
        </div>
        <h2>{revealed ? "风向，有答案了。" : "都安排好了，开播！"}</h2>
        <p>
          {revealed
            ? state.beat === 3
              ? "三次推进结束，看看谁赚到了。"
              : "看清新局势，再做一次选择。"
            : "每艘船各掷一枚六面骰。\n走到 15 格，这场企划就达标。"}
        </p>
        {revealed &&
          state.beat >= 2 &&
          state.boats.some((b) => b.position === CLIP_SPOT) && (
            <p className={styles.clipAlert}>
              ✂ 停在 13 格！
              {state.beat === 2
                ? "名场面出现，切片佬可抢空席。"
                : "爆梗出现，留守切片佬收分成。"}
            </p>
          )}
        {revealed && (
          <div className={styles.rollResults}>
            {state.boats.map((b, i) => (
              <div key={b.streamer}>
                <span>{streamerById(b.streamer).name}</span>
                <strong>
                  {b.die ? ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][b.die - 1] : "✓"}
                </strong>
                <b>{b.movement ? `前进 ${b.movement}` : "已达标"}</b>
                <small>
                  {EVENTS[state.event].wind[i] !== 0 && b.die
                    ? `风向 ${signed(EVENTS[state.event].wind[i])}`
                    : " "}
                </small>
              </div>
            ))}
          </div>
        )}
        <button
          className={styles.primary}
          data-testid={revealed ? "continue" : "roll"}
          disabled={onlineBusy}
          onClick={() => transition(
              { kind: revealed ? "continue" : "roll" },
              revealed ? continueGame : roll,
            )}
        >
          {revealed
            ? state.beat === 3
              ? "看看本场账单"
              : "继续安排"
            : "掷骰，推进！"}{" "}
          <span>→</span>
        </button>
        {!revealed && (
          <small className={styles.tiny}>决定已锁定，现在一起等好运。</small>
        )}
      </div>
    );
  }

  function renderSettlement() {
    if (!state || !result) return null;
    return (
      <div className={styles.settlement}>
        <span className={styles.eyebrow}>第 {state.round} 场 · 已自动结算</span>
        <h2>{result.boats.filter((b) => b.success).length} 艘达标，来分账！</h2>
        <div className={styles.resultBoats}>
          {result.boats.map((b) => (
            <div key={b.streamer}>
              <strong>{streamerById(b.streamer).name}</strong>
              <span className={b.success ? styles.success : styles.miss}>
                {b.success ? "达标 ✓" : "未达标"}
              </span>
              <small>
                股价 {b.priceBefore} → <b>{b.priceAfter}</b>
              </small>
            </div>
          ))}
        </div>
        <div className={styles.roundBalances}>
          {state.players.map((p) => (
            <details key={p.id}>
              <summary>
                <span>
                  <i style={{ background: PLAYER_COLORS[p.id] }} />
                  {p.name}
                </span>
                <b
                  className={
                    result.wealthDelta[p.id] >= 0 ? styles.success : styles.miss
                  }
                >
                  {signed(result.wealthDelta[p.id])}
                  <small> 总资产</small>
                </b>
              </summary>
              <p>
                现金净变化 {signed(result.cashDelta[p.id])}；含本场投入与到账。
              </p>
              {result.payments
                .filter((x) => x.player === p.id)
                .map((payment, i) => (
                  <p key={i}>
                    {payment.label}
                    <b>+{payment.amount}</b>
                  </p>
                ))}
              <p>
                股份市值变化
                <b>
                  {signed(result.wealthDelta[p.id] - result.cashDelta[p.id])}
                </b>
              </p>
            </details>
          ))}
        </div>
        <button
          className={styles.primary}
          data-testid="next-round"
          disabled={onlineBusy}
          onClick={() => transition({ kind: "continue" }, continueGame)}
        >
          {state.round === state.rounds ? "查看最终排名" : "下一场活动"}{" "}
          <span>→</span>
        </button>
        <p className={styles.tiny}>
          应援席、认知席与切片位收回，股份继续保留。
        </p>
      </div>
    );
  }

  function renderFinished() {
    if (!state) return null;
    const ranking = leaders(state);
    const winners = ranking.filter(
      (p) => wealth(state, p) === wealth(state, ranking[0]),
    );
    return (
      <div className={styles.finished}>
        <span className={styles.eyebrow}>本季应援事务所 · 收官</span>
        <div className={styles.trophy}>⚑</div>
        <h2>
          {winners.map((p) => p.name).join("、")}
          <br />
          {winners.length > 1 ? "并列获胜！" : "眼光真好！"}
        </h2>
        <p>现金与股份都算数。</p>
        <ol className={styles.ranking}>
          {ranking.map((p, i) => (
            <li key={p.id}>
              <span>{i + 1}</span>
              <div>
                <b>
                  {p.name}
                  {p.ai ? " · AI" : ""}
                </b>
                <small>
                  现金 {p.cash} + 股份 {wealth(state, p) - p.cash}
                </small>
              </div>
              <strong>{wealth(state, p)}</strong>
            </li>
          ))}
        </ol>
        {mode === "local" && (
          <button
            className={styles.primary}
            data-testid="play-again"
            onClick={() => {
              setState(
                createGame(
                  state.players.map((p) => ({ name: p.name, ai: p.ai })),
                  state.rounds,
                  Date.now(),
                  state.roster,
                ),
              );
              setAcknowledged("");
            }}
          >
            原班人马，再来一局 <span>↗</span>
          </button>
        )}
        <button
          className={styles.resume}
          onClick={mode === "online" ? leaveOnline : () => setState(null)}
        >
          {mode === "online" ? "离开房间" : "换个阵容"}
        </button>
      </div>
    );
  }

  let panel: ReactNode = renderMenu();
  if (state?.phase === "preparing") panel = renderPreparation();
  if (state?.phase === "placing") panel = renderAction();
  if (state?.phase === "spotlight") panel = renderSpotlight();
  if (state?.phase === "sailing" || state?.phase === "reveal") panel = renderSailing();
  if (state?.phase === "settlement") panel = renderSettlement();
  if (state?.phase === "finished") panel = renderFinished();

  return (
    <main className={styles.root} ref={pageRef}>
      <header className={styles.header}>
        <Link href="/demos" className={styles.back} aria-label="返回实验室">
          ← <span>实验室</span>
        </Link>
        <div className={styles.brand}>
          <b>
            上船<span>！</span>
          </b>
          <div>
            应援事务所<small>HYPE HARBOR</small>
          </div>
        </div>
        <nav>
          <button onClick={() => setModal("help")}>
            怎么玩 <span>?</span>
          </button>
          {state && mode === "local" && (
            <button onClick={() => setModal("restart")} aria-label="重新开局">
              ↻
            </button>
          )}
        </nav>
      </header>
      <div className={styles.shell}>
        {mode === "online" && room && (
          <div className={styles.onlineBanner}>
            <span>
              在线房间 <b>{room.code}</b> · 你是 {room.players[room.seat]?.name}
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(
                  `${window.location.origin}/game/hype-harbor?room=${room.code}`,
                )}
            >
              复制邀请链接
            </button>
          </div>
        )}
        {mode === "online" && onlineError && (
          <p className={styles.onlineError} role="alert">
            {onlineError}
          </p>
        )}
        <div className={styles.tableHeading}>
          <div>
            <span className={styles.eyebrow}>
              {state
                ? `活动 ${String(state.round).padStart(2, "0")} / ${String(state.rounds).padStart(2, "0")}`
                : "A LITTLE FAITH. A LITTLE FORTUNE."}
            </span>
            <h2>{state ? EVENTS[state.event].title : "今晚，谁会出圈？"}</h2>
          </div>
          {state ? (
            <div className={styles.beatSteps}>
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  data-active={n === state.beat}
                  data-done={n < state.beat}
                >
                  <b>{n < state.beat ? "✓" : n}</b>
                  <small>安排 → 推进</small>
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.tableTagline}>
              一桌朋友，三艘船。
              <br />
              把你的眼光，变成好运。
            </p>
          )}
        </div>
        <div className={styles.gameLayout}>
          <section
            ref={boardRef}
            className={styles.playfield}
            aria-label="企划港湾棋盘"
          >
            <div className={styles.boardTop}>
              <span>↗ {state ? "到 15 格即达标" : "主播上船 · 应援开局"}</span>
              <span>
                {state
                  ? `剩余 ${["reveal", "spotlight"].includes(state.phase) ? 3 - state.beat : ["settlement", "finished"].includes(state.phase) ? 0 : 4 - state.beat} 次掷骰`
                  : "2–4 人 · AI / 本地多人"}
              </span>
            </div>
            <HarborBoard
              state={state}
              selected={selected}
              onSelect={chooseBoat}
              previewRoster={ROSTERS[rosterIndex].members}
            />
            <div className={styles.boardCaption}>
              <span>
                <i /> 彩色圆点是应援席{" "}
                <span className={styles.captionExtra}>· 金点表示已投保</span>
              </span>
              <span>
                ✂ 13 格{" "}
                <span className={styles.captionExtra}>· 名场面触发点</span>
              </span>
            </div>
            {state && (
              <div className={styles.roleStatus} aria-label="全场角色席位">
                <div>
                  <b>♡ 认知民 · 未达标</b>
                  <span>
                    {RECOGNITION_SPACES.map((space, i) => {
                      const slot = state.recognition[i];
                      return `${space.threshold < 3 ? "≥" : ""}${space.threshold}人：${slot ? state.players[slot.player].name : "空席"}`;
                    }).join(" · ")}
                  </span>
                </div>
                <div>
                  <b>✂ 切片佬</b>
                  <span>
                    {state.clippers
                      .map(
                        (slot, i) => `${i + 1}号：${slot ? state.players[slot.player].name : "空位"}`,
                      )
                      .join(" · ")}
                  </span>
                </div>
              </div>
            )}
            <div className={styles.marketStrip} aria-label="四位主播行情">
              {(state?.roster || ROSTERS[rosterIndex].members).map((id, i) => {
                const s = streamerById(id);
                const activeBoat = state
                  ? state.boats.findIndex((b) => b.streamer === id)
                  : i < 3
                    ? i
                    : -1;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      if (activeBoat >= 0) chooseBoat(activeBoat);
                    }}
                    disabled={activeBoat < 0}
                    className={activeBoat < 0 ? styles.restingMarket : ""}
                  >
                    <Image
                      src={s.portrait}
                      alt=""
                      width={36}
                      height={36}
                      unoptimized
                    />
                    <span>
                      <b>{s.name}</b>
                      <small>{activeBoat < 0 ? "本场休息" : "本场出航"}</small>
                    </span>
                    <strong>
                      {state?.prices[id] || 6}
                      <small> / 股</small>
                    </strong>
                  </button>
                );
              })}
            </div>
            {state ? (
              <>
                <div className={styles.eventNote}>
                  <b>本场风向</b>
                  <span>{EVENTS[state.event].description}</span>
                </div>
                {state.round === 1 &&
                  state.phase === "placing" &&
                  !state.players[0].boughtThisRound &&
                  state.beat === 1 && (
                    <div className={styles.learningHint}>
                      小提示：点选一艘船，在右侧
                      <span className={styles.mobileHint}>／下方</span>
                      「上船应援」。先看两种结果，再决定投入。
                    </div>
                  )}
                <div className={styles.activity} aria-live="polite">
                  <span>港湾动态</span>
                  <p>{state.log[0]}</p>
                </div>
                <details className={styles.log}>
                  <summary>查看最近动态</summary>
                  {state.log.slice(1).map((entry, i) => (
                    <p key={i}>{entry}</p>
                  ))}
                </details>
              </>
            ) : (
              <div className={styles.menuLegend}>
                <div>
                  <b>01</b>
                  <span>
                    选船，做个决定<small>盼出圈就应援 · 盼互动就认知</small>
                  </span>
                </div>
                <div>
                  <b>02</b>
                  <span>
                    掷骰，一起推进<small>每次开播后都能再安排</small>
                  </span>
                </div>
                <div>
                  <b>03</b>
                  <span>
                    到站，赚回应援币<small>保留股份 · 总资产决胜</small>
                  </span>
                </div>
              </div>
            )}
          </section>
          <aside ref={panelRef} className={styles.panel} aria-label="当前操作">
            {panel}
          </aside>
        </div>
        {state && (
          <section className={styles.playerStrip} aria-label="玩家资产">
            {state.players.map((p) => (
              <div
                key={p.id}
                className={styles.playerAccount}
                data-current={
                  p.id === state.turn &&
                  ["placing", "preparing"].includes(state.phase)
                }
                style={
                  { "--player-color": PLAYER_COLORS[p.id] } as CSSProperties
                }
              >
                <div className={styles.accountTitle}>
                  <span
                    className={styles.playerDot}
                    style={{ background: PLAYER_COLORS[p.id] }}
                  >
                    {p.id + 1}
                  </span>
                  <strong>{p.name}</strong>
                  <small>{p.ai ? "AI" : "真人"}</small>
                  <b>
                    {wealth(state, p)}
                    <small> 总资产</small>
                  </b>
                </div>
                <div className={styles.holdings}>
                  <span>
                    现金 <b>{p.cash}</b>
                  </span>
                  {STREAMERS.filter((s) => p.shares[s.id]).map((s) => (
                    <span
                      key={s.id}
                      title={`当前每股 ${state.prices[s.id]} 币`}
                    >
                      {s.name} <b>×{p.shares[s.id]}</b>
                    </span>
                  ))}
                  {!Object.values(p.shares).some(Boolean) && (
                    <small>暂无持股</small>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}
        <footer className={styles.footer}>
          <span>灵感来自桌游 MANILA · 同人企划</span>
          <span>
            {storageMessage ||
              (mode === "online"
                ? "在线房间自动同步"
                : state
                  ? "✓ 每步自动保存 · F 全屏"
                  : "所有币值与企划表现均为虚构游戏设定")}
          </span>
        </footer>
      </div>
      {!modal && !needHandoff && state?.phase !== "finished" && (
        <nav className={styles.mobileNav} aria-label="游戏快捷导航">
          <span>
            {state
              ? state.phase === "placing"
                ? `轮到${current?.name} · ${current?.cash} 币`
                : `第 ${state.round} 场 · ${state.beat}/3 次推进`
              : "四位主播，三条船"}
          </span>
          <button
            onClick={() => boardRef.current?.scrollIntoView({ block: "start" })}
            data-testid="jump-board"
          >
            棋盘 ↑
          </button>
          <button
            onClick={() => panelRef.current?.scrollIntoView({ block: "start" })}
            data-testid="jump-action"
          >
            {state ? "操作 ↓" : "开一桌 ↓"}
          </button>
        </nav>
      )}
      {modal === "help" && (
        <Dialog title="怎么玩" onClose={closeModal}>
          <span className={styles.eyebrow}>一分钟就明白</span>
          <h2>
            选一艘船，
            <br />
            表达你的判断。
          </h2>
          <div className={styles.helpRules}>
            <p>
              <b>⚑ 看好就上船</b>花币占席，船走到 15 格就收 12 币。怕失手可多花
              2 币买保本险。
            </p>
            <p>
              <b>♡ 认知民，想被你记住</b>押本场至少 1 位、至少 2 位，或 3
              位主播都未达标，猜中分别收 5／6／8 币，否则收
              0。三次掷骰结束时，船未到 15
              格就算该主播未达标。每个认知席限一人。
            </p>
            <p>
              <b>✂ 切片佬，蹲一个名场面</b>花 2 币占切片位，全场限两位。第 2
              次掷骰后停在 13 格，可按先来后到免费上空席，或继续等。第 3 次停在
              13 格，每艘产生 8
              币切片池，留守者平分；没有名场面就没收入。投流直接移到 13
              格不触发。
            </p>
            <p>
              <b>▥ 长期看好就买股</b>每场最多买一股。达标股价 +3，未达标
              −1（最低 3）。股份一直保留。
            </p>
            <p>
              <b>↗ 想改变结果就投流</b>花 2 币选助推（前进 2 格）或黑料（后退 2
              格，最低 0 格）。已达标的船不能拖回，移到 13
              格不触发切片。每次耗一个行动，接小单可稳定赚 1 币。
            </p>
          </div>
          <p className={styles.helpBottom}>
            每场「每人行动一次 → 掷骰」重复 3 次。全部活动结束，比现金 +
            股份市值。已达标的船不能再入场。
          </p>
          <button className={styles.primary} onClick={closeModal}>
            明白了，回到桌上 →
          </button>
        </Dialog>
      )}
      {modal === "restart" && (
        <Dialog title="重新开局" onClose={closeModal}>
          <span className={styles.eyebrow}>暂离这张桌</span>
          <h2>回到开局设置？</h2>
          <p>
            当前对局已保存，仍可点「继续上次」回来。开始新局后才会替换存档。
          </p>
          <button
            className={styles.primary}
            onClick={() => {
              setState(null);
              setModal(null);
            }}
          >
            回到设置
          </button>
          <button className={styles.resume} onClick={closeModal}>
            继续这一局
          </button>
        </Dialog>
      )}
      {needHandoff && !modal && current && (
        <Dialog title={`轮到${current.name}`}>
          <div
            className={styles.handoffNumber}
            style={{ background: PLAYER_COLORS[current.id] }}
          >
            {current.id + 1}
          </div>
          <span className={styles.eyebrow}>把设备交给下一位</span>
          <h2>轮到{current.name}了</h2>
          <p>
            {state?.phase === "preparing"
              ? "这场你是主理人，选择主播并分配预热。"
              : state?.phase === "spotlight"
                ? "名场面来了，选择免费上船或继续蹲切片。"
                : "先看看新局势，再选一个行动。"}
            <br />
            所有投资公开，可以一起商量。
          </p>
          <button
            className={styles.primary}
            data-testid="handoff"
            onClick={() => setAcknowledged(turnKey)}
          >
            我是{current.name}，开始安排 →
          </button>
        </Dialog>
      )}
    </main>
  );
}
