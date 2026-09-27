"use client";

/* eslint-disable @next/next/no-img-element */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { type UnitId } from "../core/gameData";
import { resolveUnitPortrait } from "../core/characterStyle";
import {
  MODE_NAMES,
  validConfig,
  type MatchConfig,
  type MatchMode,
} from "./match";
import {
  applyCommand,
  createRoom,
  tickRoom,
  viewRoom,
  type Command,
  type Room,
  type RoomView,
  type RoomSummary,
} from "./room";
import styles from "./multiplayer.module.css";

const Game = dynamic(() => import("../PhaserGame"), { ssr: false });
const LOCAL_KEY = "rift-multiplayer-local-v1";
const SESSIONS_KEY = "rift-multiplayer-seats-v1";
type Session = { code: string; token: string };
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const portrait = (id: UnitId) => resolveUnitPortrait(id, "minimal").portrait;

export default function AutoChessLobby() {
  const [mode, setMode] = useState<MatchMode>("coop");
  const [online, setOnline] = useState(false);
  const [name, setName] = useState("指挥官");
  const [config, setConfig] = useState<MatchConfig>({
    mode: "coop",
    seats: 2,
    aiCount: 1,
    prepSeconds: 90,
    isPublic: true,
  });
  const [room, setRoom] = useState<RoomView | null>(null);
  const roomRef = useRef<RoomView | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const localRef = useRef<Room | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [hasLocal, setHasLocal] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(true);
  const [, setNow] = useState(Date.now());
  const adopt = useCallback((next: RoomView) => {
    const prev = roomRef.current;
    if (prev?.code === next.code && prev.revision > next.revision) return;
    const changedRound = prev?.match?.round !== next.match?.round;
    const changedPhase = prev?.match?.phase !== next.match?.phase;
    roomRef.current = next;
    setNow(Date.now());
    setRoom(next);
    if (!next.match) setConfig(next.config);
    if (changedRound || changedPhase) {
      requestAnimationFrame(() => shellRef.current?.scrollTo({ top: 0 }));

    }
  }, []);
  const storeLocal = useCallback(
    (next: Room) => {
      localRef.current = next;
      setConnected(true);
      adopt(viewRoom(next, 0));
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
        setHasLocal(true);
      } catch {
        setNotice("本机存储空间不足，请保持此页面打开");
      }
    },
    [adopt],
  );
  const remember = useCallback((s: Session) => {
    sessionRef.current = s;
    setSessions((prev) => {
      const next = [s, ...prev.filter((p) => p.code !== s.code)].slice(0, 8);
      try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
      } catch {
        /* session still works in memory */
      }
      return next;
    });
  }, []);
  const forget = useCallback((roomCode: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.code !== roomCode);
      try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
      } catch {
        /* unavailable storage */
      }
      return next;
    });
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invitation = params.get("room");
    if (invitation) {
      setCode(invitation.toUpperCase());
      setOnline(true);
    }
    try {
      const saved = JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]");
      if (Array.isArray(saved)) setSessions(
          saved.filter(
            (s) => typeof s.code === "string" && typeof s.token === "string",
          ),
        );
      setHasLocal(Boolean(localStorage.getItem(LOCAL_KEY)));
      setName(localStorage.getItem("rift-multiplayer-name") || "指挥官");
    } catch {
      /* keep fresh lobby */
    }
  }, []);
  const api = useCallback(async (body: object) => {
    const requestedAt = Date.now();
    const response = await fetch("/api/autochess", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(28000),
    });
    const data = await response.json();
    const transit = Math.min(250, (Date.now() - requestedAt) / 2);
    if (data.room?.serverNow) data.room.serverNow += transit;
    if (data.serverNow) data.serverNow += transit;
    return { ...data, ok: response.ok } as {
      ok: boolean;
      room?: RoomView;
      token?: string;
      error?: string;
      expired?: boolean;
      unchanged?: boolean;
      serverNow?: number;
    };
  }, []);
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
      if (localRef.current && roomRef.current && !busyRef.current) {
        const next = tickRoom(localRef.current);
        if (next !== localRef.current) storeLocal({ ...next, revision: next.revision + 1 });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [storeLocal]);
  useEffect(() => {
    if (!online || room) return undefined;
    let stopped = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/autochess", {
          signal: AbortSignal.timeout(12000),
        });
        const data = await response.json();
        if (!stopped) {
          setRooms(data.rooms || []);
          setError(response.ok ? "" : data.error);
        }
      } catch {
        if (!stopped) setError("暂时无法连接房间服务，可点击本地人机先玩");
      }
    };
    refresh();
    const interval = setInterval(refresh, 8000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [online, room]);
  useEffect(() => {
    if (!room || localRef.current || !sessionRef.current) return undefined;
    let stopped = false;
    let polling = false;
    const poll = async () => {
      if (busyRef.current || polling) return;
      polling = true;
      const currentGeneration = generation.current;
      try {
        const result = await api({
          operation: "status",
          ...sessionRef.current,
          revision: roomRef.current?.revision,
        });
        if (stopped || currentGeneration !== generation.current) return;
        setConnected(result.ok);
        if (result.ok) setError("");
        if (result.room) adopt(result.room);
        else if (result.serverNow && roomRef.current) adopt({ ...roomRef.current, serverNow: result.serverNow });
        if (result.expired) {
          forget(room.code);
          sessionRef.current = null;
          roomRef.current = null;
          setRoom(null);
          setError(result.error || "房间已过期");
        } else if (!result.ok) setError(result.error || "连接中断，正在重试");
      } catch {
        if (!stopped) setConnected(false);
      } finally {
        polling = false;
      }
    };
    const interval = setInterval(poll, 1800);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [room?.code, api, adopt, forget]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (operation: () => Promise<void> | void) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch {
      setError("操作未完成，请重试；原席位与对局仍然保留");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const command = (c: Command) => run(async () => {
      if (localRef.current) {
        const next = applyCommand(localRef.current, 0, c, seed());
        if (next) storeLocal({ ...next, revision: next.revision + 1 });
        else setError("当前不能这样操作，请检查金币、人口与准备状态");
        return;
      }
      const { current } = roomRef;
      const result = await api({
        operation: "command",
        ...sessionRef.current,
        revision: current?.revision,
        playerRevision: current?.match?.players[current.seat].revision,
        command: c,
      });
      if (result.room) adopt(result.room);
      if (!result.ok) setError(result.error || "操作失败");
      setConnected(result.ok || Boolean(result.room));
    });
  const enter = (operation: "create" | "join", joinCode = code) => run(async () => {
      if (!name.trim()) {
        setError("请填写你的名字");
        return;
      }
      try {
        localStorage.setItem("rift-multiplayer-name", name.trim());
      } catch {
        /* optional preference */
      }
      if (!online) {
        const settings = { ...config, mode, aiCount: config.seats - 1 };
        const local = createRoom("LOCAL", "local-seat", name.trim(), settings);
        const started = applyCommand(local, 0, { kind: "start" }, seed());
        sessionRef.current = null;
        if (started) storeLocal(started);
        return;
      }
      const result = await api({
        operation,
        code: joinCode.toUpperCase(),
        name: name.trim(),
        config: { ...config, mode },
      });
      if (result.room && result.token) {
        localRef.current = null;
        remember({ code: result.room.code, token: result.token });
        adopt(result.room);
        setConnected(true);
      } else setError(result.error || "无法进入房间");
    });
  const resume = (s: Session) => run(async () => {
      const result = await api({ operation: "status", ...s });
      if (result.room) {
        localRef.current = null;
        remember(s);
        setOnline(true);
        adopt(result.room);
        setConnected(true);
      } else {
        setError(result.error || "无法恢复房间");
        if (result.expired) forget(s.code);
      }
    });
  const returnLobby = () => {
    generation.current++;
    if (room?.match?.phase === "finished" && sessionRef.current) forget(room.code);
    roomRef.current = null;
    localRef.current = null;
    sessionRef.current = null;
    setRoom(null);
    setError("");
  };
  const resumeLocal = () => run(() => {
      try {
        const saved: Room = JSON.parse(
          localStorage.getItem(LOCAL_KEY) || "null",
        );
        if (
          !saved ||
          saved.code !== "LOCAL" ||
          !validConfig(saved.config) ||
          saved.match?.version !== 1 ||
          saved.match.players.length !== saved.config.seats
        ) throw new Error("bad save");
        // Preparation resumes with time to plan; running battles keep their common clock.
        if (saved.match.phase === "preparation") saved.match.deadline = Date.now() + saved.config.prepSeconds * 1000;
        viewRoom(saved, 0);
        sessionRef.current = null;
        setOnline(false);
        storeLocal(tickRoom(saved));
      } catch {
        setError("本地存档无法读取，请开始新局");
      }
    });
  const match = room?.match;
  useEffect(() => {
    if (match) return undefined;
    window.render_game_to_text = () => JSON.stringify({ surface: "autochess-multiplayer", mode, phase: room ? "room" : "lobby", code: room?.code, seat: room?.seat, revision: room?.revision, connected });
    return () => {
      delete window.render_game_to_text;
    };
  }, [match, mode, room, connected]);

  if (room?.match) return <Game multiplayer={{ room, busy, connected, message: error || notice, send: command, leave: returnLobby }} />;
  return (
    <div className={styles.shell} ref={shellRef}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>VIRTUAL REAL · AUTO CHESS</span>
          <h1>裂隙阵线</h1>
        </div>
        <div className={styles.headerRight}>
          <span>
            {room
              ? `${localRef.current ? "本地人机" : `房间 ${room.code}`} · ${MODE_NAMES[room.config.mode]}`
              : "多人模式 beta · 选择你的战线"}
          </span>
          {room && (
            <button disabled={busy} onClick={returnLobby}>
              返回大厅
            </button>
          )}
          {!room && <a href="/demos">游戏大厅 ↗</a>}
        </div>
      </header>
      {(error || notice || !connected) && (
        <div className={styles.notice} role="status">
          {error || notice || "连接中断，正在恢复；已确认的操作不会丢失"}
        </div>
      )}
      {!room && (
        <>
          <section className={styles.modes} aria-label="游戏模式">
            <a className={styles.classic} href="/game/autochess">
              <span>01 / SOLO</span>
              <h2>传统本地挑战</h2>
              <p>独自远征 · 原版天赋与无限挑战</p>
              <strong>继续你的远征 ↗</strong>
            </a>
            {(["coop", "versus"] as const).map((m, i) => (
              <button
                key={m}
                className={mode === m ? styles.activeMode : ""}
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setConfig((c) => ({
                    ...c,
                    mode: m,
                    seats: Math.min(m === "coop" ? 4 : 8, Math.max(2, c.seats)),
                    aiCount: Math.min(c.aiCount, 3),
                  }));
                }}
              >
                <span>
                  0{i + 2} /{" "}
                  {m === "coop" ? "DEFEND TOGETHER" : "LAST ONE STANDING"}
                </span>
                <h2>{MODE_NAMES[m]}</h2>
                <p>
                  {m === "coop"
                    ? "1–4 人 · 守住自己的线，也守住队友"
                    : "2–8 人 · 提前侦察，争夺最后的席位"}
                </p>
                <div className={styles.modeArt}>
                  {(m === "coop"
                    ? ["biscuit_sui", "nori", "sui_blue"]
                    : ["sui_cat", "shiori", "sui_bird"]
                  ).map((id) => (
                    <img key={id} src={portrait(id as UnitId)} alt="" />
                  ))}
                </div>
              </button>
            ))}
          </section>
          <section className={styles.lobby}>
            <div className={styles.setup}>
              <div className={styles.tabs}>
                <button
                  aria-pressed={!online}
                  onClick={() => {
                    setOnline(false);
                    setError("");
                  }}
                >
                  本地人机
                </button>
                <button
                  aria-pressed={online}
                  onClick={() => {
                    setOnline(true);
                    setConfig((c) => ({ ...c, aiCount: 0 }));
                  }}
                >
                  在线联机
                </button>
              </div>
              <h2>
                {MODE_NAMES[mode]}{" "}
                <small>{online ? "创建房间" : "开始新局"}</small>
              </h2>
              <label htmlFor="player-name">
                你的名字
                <input
                  id="player-name"
                  maxLength={12}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className={styles.fields}>
                <label htmlFor="seats-count">
                  总人数
                  <select
                    aria-label="总人数"
                    id="seats-count"
                    value={config.seats}
                    onChange={(e) => {
                      const seats = Number(e.target.value);
                      setConfig((c) => ({
                        ...c,
                        seats,
                        aiCount: Math.min(c.aiCount, seats - 1),
                      }));
                    }}
                  >
                    {Array.from(
                      { length: mode === "coop" ? 4 : 7 },
                      (_, i) => i + (mode === "coop" ? 1 : 2),
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n} 人
                      </option>
                    ))}
                  </select>
                </label>
                {online && (
                  <label htmlFor="ai-count">
                    电脑人数
                    <select
                      aria-label="电脑人数"
                      id="ai-count"
                      value={config.aiCount}
                      onChange={(e) => setConfig((c) => ({
                          ...c,
                          aiCount: Number(e.target.value),
                        }))}
                    >
                      {Array.from({ length: config.seats }, (_, i) => (
                        <option key={i} value={i}>
                          {i} 名 AI
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label htmlFor="prep-time">
                  备战时长
                  <select
                    aria-label="备战时长"
                    id="prep-time"
                    value={config.prepSeconds}
                    onChange={(e) => setConfig((c) => ({
                        ...c,
                        prepSeconds: Number(e.target.value),
                      }))}
                  >
                    {[60, 90, 120].map((n) => (
                      <option key={n} value={n}>
                        {n} 秒
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {online ? (
                <label htmlFor="public-room" className={styles.check}>
                  <input
                    id="public-room"
                    type="checkbox"
                    checked={config.isPublic}
                    onChange={(e) => setConfig((c) => ({ ...c, isPublic: e.target.checked }))}
                  />
                  公开房间，允许从大厅加入
                </label>
              ) : (
                <p>你与 {config.seats - 1} 名电脑同场。对局自动保存在本机。</p>
              )}
              <button
                className={styles.primary}
                disabled={busy}
                onClick={() => enter("create")}
              >
                {busy ? "正在进入…" : online ? "创建在线房间" : "开始本地对局"}
              </button>
              {!online && hasLocal && (
                <button onClick={resumeLocal} disabled={busy}>
                  恢复上次本地对局
                </button>
              )}
            </div>
            <div className={styles.side}>
              <h2>{online ? "加入战线" : "作战须知"}</h2>
              {sessions.map((s) => (
                <button className={styles.saved} disabled={busy} key={s.code} onClick={() => resume(s)}>
                  恢复房间 {s.code} →
                </button>
              ))}
              {online && (
                <>
                  <div className={styles.join}>
                    <input
                      aria-label="房间号"
                      placeholder="8 位房间号"
                      maxLength={8}
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                    />
                    <button
                      disabled={busy || code.length !== 8}
                      onClick={() => enter("join")}
                    >
                      加入
                    </button>
                  </div>
                  <div className={styles.roomList}>
                    <h3>公开房间</h3>
                    {rooms.length === 0 && (
                      <p>暂时没有等待中的房间，你可以创建一个。</p>
                    )}
                    {rooms.map((r) => (
                      <button
                        disabled={busy}
                        key={r.code}
                        onClick={() => enter("join", r.code)}
                      >
                        <strong>{r.host}</strong>
                        <span>
                          {MODE_NAMES[r.mode]} · {r.joined + r.aiCount}/
                          {r.seats} 人
                        </span>
                        <small>{r.code} →</small>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p>
                {mode === "coop"
                  ? "各自抵挡 16 波敌人。有人漏怪时，守住战线的队友携剩余生命救援一次。清空漏怪则不扣血；未清空只扣漏怪者的血，协助者不会受罚。"
                  : "每轮提前公布对手与其上一轮阵容。双方仅结算同一场战斗，败者按敌方存活星级扣血。奇数人时，一人迎战存活对手的幻象，幻象本体不受影响。"}
              </p>
              <p>
                所有人准备好就开战；倒计时结束自动开战。空阵也会参战。淘汰后可继续观战。
              </p>
              <p>
                新模式统一以 10
                金币和一星海苔开局，沿用招募、升星、升本、站位与羁绊。每轮收入 7
                金币 + 利息，胜利额外
                +1；传统远征的开局天赋与局中天赋保留在本地挑战中。
              </p>
            </div>
          </section>
        </>
      )}
      {room && !match && (
        <section className={styles.waiting}>
          <div className={styles.roomTitle}>
            <span className={styles.eyebrow}>WAITING FOR YOUR TEAM</span>
            <h2>{MODE_NAMES[room.config.mode]}</h2>
            <strong>{room.code}</strong>
            <p>邀请朋友加入，或由房主补充电脑席位。</p>
            <button
              onClick={() => run(async () => {
                  await navigator.clipboard.writeText(
                    `${window.location.origin}/game/autochess?room=${room.code}`,
                  );
                  setNotice("邀请链接已复制");
                })}
            >
              复制邀请链接
            </button>
          </div>
          <div className={styles.seats}>
            {room.seats.map((s, i) => (
              <div key={i} className={s.joined ? styles.joined : ""}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{s.name}</strong>
                <small>
                  {s.ai
                    ? "电脑指挥官"
                    : !s.joined
                      ? "等待加入"
                      : i === 0
                        ? "房主"
                        : "已入座"}
                </small>
              </div>
            ))}
          </div>
          <div className={styles.fields}>
            <label htmlFor="room-name">
              我的名字
              <input
                id="room-name"
                maxLength={12}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              disabled={busy}
              onClick={() => command({ kind: "rename", name })}
            >
              更新名字
            </button>
          </div>
          {room.seat === 0 && (
            <div className={styles.fields}>
              <label htmlFor="room-mode">
                模式
                <select
                  aria-label="模式"
                  id="room-mode"
                  value={config.mode}
                  onChange={(e) => {
                    const m = e.target.value as MatchMode;
                    setConfig((c) => ({
                      ...c,
                      mode: m,
                      seats: Math.min(
                        m === "coop" ? 4 : 8,
                        Math.max(m === "coop" ? 1 : 2, c.seats),
                      ),
                      aiCount: Math.min(c.aiCount, m === "coop" ? 3 : 7),
                    }));
                  }}
                >
                  {Object.entries(MODE_NAMES).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="seats-count">
                总人数
                <select
                  aria-label="总人数"
                  id="seats-count"
                  value={config.seats}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setConfig((c) => ({
                      ...c,
                      seats: n,
                      aiCount: Math.min(c.aiCount, n - 1),
                    }));
                  }}
                >
                  {Array.from(
                    { length: config.mode === "coop" ? 4 : 7 },
                    (_, i) => i + (config.mode === "coop" ? 1 : 2),
                  ).map((n) => (
                    <option key={n} value={n}>
                      {n} 人
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="ai-count">
                电脑人数
                <select
                  aria-label="电脑人数"
                  id="ai-count"
                  value={config.aiCount}
                  onChange={(e) => setConfig((c) => ({
                      ...c,
                      aiCount: Number(e.target.value),
                    }))}
                >
                  {Array.from({ length: config.seats }, (_, i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="prep-time">
                备战时长
                <select
                  aria-label="备战时长"
                  id="prep-time"
                  value={config.prepSeconds}
                  onChange={(e) => setConfig((c) => ({
                      ...c,
                      prepSeconds: Number(e.target.value),
                    }))}
                >
                  {[60, 90, 120].map((n) => (
                    <option key={n} value={n}>
                      {n} 秒
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="public-room" className={styles.check}>
                <input
                  id="public-room"
                  type="checkbox"
                  checked={config.isPublic}
                  onChange={(e) => setConfig((c) => ({ ...c, isPublic: e.target.checked }))}
                />
                公开
              </label>
              <button
                disabled={busy}
                onClick={() => command({ kind: "configure", config })}
              >
                应用房间设置
              </button>
            </div>
          )}
          <div className={styles.actions}>
            {room.seat === 0 ? (
              <button
                className={styles.primary}
                disabled={busy || room.seats.some((s) => !s.joined)}
                onClick={() => command({ kind: "start" })}
              >
                全员到齐，开始对局
              </button>
            ) : (
              <p>等待房主开始对局</p>
            )}
            <button
              disabled={busy}
              onClick={() => run(async () => {
                  const result = await api({
                    operation: "leave",
                    ...sessionRef.current,
                  });
                  if (result.ok) {
                    forget(room.code);
                    returnLobby();
                  } else setError(result.error || "离房失败");
                })}
            >
              {room.seat === 0 ? "关闭房间" : "退出房间"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
