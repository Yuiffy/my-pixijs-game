"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  action,
  broadcast,
  createGame,
  emptyInput,
  ending,
  freshSave,
  Game,
  LEVELS,
  nearest,
  parseSave,
  record,
  Save,
  signal,
  SPOTS,
  Spot,
  stars,
  step,
  TASK_NAMES,
  togglePause,
  travel,
} from "./engine";
import { draw, hitSpot } from "./scene";
import styles from "./hush.module.css";

const STORAGE = "hush-live-v1";
type GameWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};

export default function HushLive() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const shell = useRef<HTMLElement>(null);
  const game = useRef<Game>(createGame());
  const saved = useRef<Save>(freshSave());
  const input = useRef(emptyInput());
  const manual = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const soundEnabled = useRef(false);
  const lastSound = useRef("");
  const [view, setView] = useState({ ...game.current });
  const [save, setSave] = useState(freshSave());
  const [ready, setReady] = useState(false);
  const [storageNote, setStorageNote] = useState("");
  const [shareText, setShareText] = useState("");
  const [sound, setSound] = useState(false);
  const seed = useRef(1);

  const persist = useCallback((next: Save) => {
    saved.current = next;
    setSave(next);
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
    } catch {
      setStorageNote(
        "浏览器未允许保存；本次仍可完整游玩，关闭页面后进度会丢失。",
      );
    }
  }, []);
  const refresh = useCallback(() => {
    const s = game.current;
    if (canvas.current) {
      const ctx = canvas.current.getContext("2d");
      if (ctx) draw(ctx, s, saved.current.partner, saved.current.player);
    }
    setView({ ...s, done: [...s.done] });
  }, []);
  const tick = useCallback(
    (seconds: number) => {
      const s = game.current;
      const before = s.phase;
      step(s, seconds, input.current);
      if (before === "playing" && s.phase === "result") {
        input.current = emptyInput();
        persist(record(saved.current, s));
      }
      const soundKey =
        s.phase === "playing"
          ? `${s.done.length}-${Math.floor(s.elapsed / 2)}-${broadcast(s).music}`
          : s.phase;
      if (
        soundEnabled.current &&
        audio.current &&
        soundKey !== lastSound.current &&
        s.phase === "playing"
      ) {
        const ac = audio.current;
        const oscillator = ac.createOscillator();
        const gain = ac.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value =
          s.muted > 0
            ? 660
            : broadcast(s).music
              ? [261.6, 329.6, 392, 523.2][Math.floor(s.elapsed / 2) % 4]
              : 196;
        gain.gain.setValueAtTime(0.025, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
        oscillator.connect(gain);
        gain.connect(ac.destination);
        oscillator.start();
        oscillator.stop(ac.currentTime + 0.3);
        lastSound.current = soundKey;
      }
      refresh();
    },
    [persist, refresh],
  );

  useEffect(() => {
    try {
      saved.current = parseSave(localStorage.getItem(STORAGE));
    } catch {
      setStorageNote("浏览器未允许保存；本次仍可完整游玩。");
    }
    const parameter = new URLSearchParams(window.location.search).get("seed");
    seed.current =
      parameter && /^\d{1,10}$/.test(parameter)
        ? Number(parameter) % 4294967296 || 1
        : Date.now() % 4294967296;
    game.current = createGame(
      parameter && saved.current.unlocked >= 5
        ? 5
        : Math.min(4, saved.current.unlocked),
      seed.current,
      saved.current.unlocked,
    );
    setSave(saved.current);
    setReady(true);
    refresh();
    const target = window as GameWindow;
    target.render_game_to_text = () => JSON.stringify({
        ...game.current,
        coordinateSystem:
          "960x580, origin top-left; x right, y down. Wall x506..534, doorway y375..448.",
        spots: SPOTS,
        nearest: nearest(game.current),
        action: action(game.current),
        broadcast: broadcast(game.current),
        progression: saved.current,
      });
    target.advanceTime = (ms) => {
      manual.current = true;
      if (Number.isFinite(ms) && ms >= 0 && ms <= 300000) tick(ms / 1000);
    };
    let frame = 0;
    let last = performance.now();
    let hud = 0;
    const loop = (now: number) => {
      if (!manual.current && now - hud >= 40) {
        tick((now - last) / 1000);
        last = now;
        hud = now;
      }
      if (manual.current) last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const clear = () => {
      input.current = emptyInput();
      if (game.current.phase === "playing") togglePause(game.current);
      last = performance.now();
      refresh();
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)
      ) return;
      const k = event.key.toLowerCase();
      if (
        ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k) &&
        !(event.target instanceof HTMLButtonElement)
      ) event.preventDefault();
      if (event.repeat && ["q", "m", "p", "escape", "f"].includes(k)) return;
      if (k === "p" || k === "escape") {
        togglePause(game.current);
        input.current = emptyInput();
      }
      if (k === "q" && game.current.phase === "playing") game.current.quiet = !game.current.quiet;
      if (k === "m") signal(game.current);
      if (k === "f") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else shell.current?.requestFullscreen().catch(() => {});
      }
      if (k === "e") input.current.act = true;
      if (["arrowleft", "a"].includes(k)) input.current.x = -1;
      if (["arrowright", "d"].includes(k)) input.current.x = 1;
      if (["arrowup", "w"].includes(k)) input.current.y = -1;
      if (["arrowdown", "s"].includes(k)) input.current.y = 1;
      if (k === "shift") input.current.sprint = true;
      refresh();
    };
    const keyUp = (event: KeyboardEvent) => {
      const k = event.key.toLowerCase();
      if (k === "e") {
        input.current.act = false;
        game.current.requireRelease = false;
      }
      if (["arrowleft", "a", "arrowright", "d"].includes(k)) input.current.x = 0;
      if (["arrowup", "w", "arrowdown", "s"].includes(k)) input.current.y = 0;
      if (k === "shift") input.current.sprint = false;
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
      delete target.render_game_to_text;
      delete target.advanceTime;
      audio.current?.close().catch(() => {});
    };
  }, [refresh, tick]);

  const select = (level: number) => {
    game.current = createGame(level, seed.current, saved.current.unlocked);
    input.current = emptyInput();
    setShareText("");
    refresh();
  };
  const start = () => {
    game.current.phase = "playing";
    input.current = emptyInput();
    refresh();
  };
  const go = (spot: Spot) => {
    travel(game.current, spot);
    refresh();
  };
  const pause = () => {
    togglePause(game.current);
    input.current = emptyInput();
    refresh();
  };
  const b = broadcast(view);
  const a = action(view);
  const isPlaying = view.phase === "playing";
  const share = async () => {
    const url = `${window.location.origin}/game/hush-live${view.level === 5 ? `?seed=${view.seed}` : ""}`;
    const text = `《嘘，TA还在播》${view.level === 5 ? `加班夜 #${view.seed}` : `第${view.level + 1}晚`} · ${ending(view)}\n${view.totalScore}分 / ${stars(view)}星 / 甜蜜${view.love} / 最高怀疑${Math.round(view.peak)}%\n${url}`;
    setShareText(text);
    try {
      await navigator.clipboard.writeText(text);
      setStorageNote("挑战文案已复制，可以发给朋友啦。");
    } catch {
      setStorageNote("可以从下方文本框选择并复制挑战文案。");
    }
  };

  return (
    <main
      className={`${styles.root} ${view.phase !== "ready" ? styles.inGame : ""}`}
      ref={shell}
    >
      <div className={styles.wrap}>
        <nav className={styles.nav}>
          <Link href="/demos">← 小游戏实验室</Link>
          <span>A LITTLE LOVE, OFF THE RECORD.</span>
          <button
            type="button"
            onClick={() => {
              const enabled = !sound;
              setSound(enabled);
              soundEnabled.current = enabled;
              if (enabled) {
                audio.current ??= new AudioContext();
                audio.current.resume().catch(() => {});
              }
            }}
          >
            声音 {sound ? "开" : "关"}
          </button>
        </nav>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>CO-OP LOVE / SOLO STEALTH</p>
            <h1>
              嘘，TA还在播<span>。</span>
            </h1>
            <p>全世界在听TA说话。只有你，听得见那句悄悄话。</p>
          </div>
          <div className={styles.live}>
            <i /> {view.won ? 'OFF AIR' : 'ON AIR'}<small>恋爱不必全网可见</small>
          </div>
        </header>
        <div className={styles.layout}>
          <section className={styles.stage} aria-label="同居小公寓">
            <div className={styles.stageBar}>
              <span>
                {view.level === 5
                  ? `加班夜 #${view.seed}`
                  : `NIGHT 0${view.level + 1} / ${LEVELS[view.level].title}`}
              </span>
              <span>
                {view.phase === "ready"
                  ? "今晚，也请多关照。"
                  : `剩余 ${Math.max(0, Math.ceil(view.limit - view.elapsed))}s`}
              </span>
            </div>
            {view.phase !== "ready" && view.phase !== "result" && (
              <div className={styles.mobileStatus}>
                <span>
                  怀疑 <strong>{Math.round(view.suspicion)}%</strong>
                </span>
                <span>♡ {view.love}</span>
                <span>
                  任务 {view.done.length}/{view.tasks.length}
                </span>
                <button onClick={pause}>
                  {view.phase === "paused" ? "继续" : "暂停"}
                </button>
              </div>
            )}
            <canvas
              ref={canvas}
              width={960}
              height={580}
              aria-label="点击房间地点走过去，或使用下方地点按钮"
              onPointerDown={(event) => {
                if (!isPlaying) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const spot = hitSpot(
                  ((event.clientX - rect.left) / rect.width) * 960,
                  ((event.clientY - rect.top) / rect.height) * 580,
                );
                if (spot) go(spot);
              }}
            />
            <div
              className={`${styles.broadcast} ${b.music || view.muted > 0 ? styles.covered : ""}`}
            >
              <strong>
                {view.phase === "result"
                  ? view.won
                    ? "下播了 · 今晚的声音只留给你"
                    : "直播间的小秘密，差点藏不住"
                  : view.muted > 0
                    ? `闭麦掩护 · ${view.muted.toFixed(1)}秒`
                    : b.music
                      ? `♫ 唱歌掩护 · 还剩 ${Math.ceil(b.remaining)}秒`
                      : b.sensitive
                        ? "耳语互动 · 麦克风特别敏感"
                        : `正常聊天 · ${Math.ceil(b.remaining)}秒后唱歌`}
              </strong>
              <span>
                {view.phase === "result"
                  ? "明晚，也一起回家。"
                  : view.muted > 0
                    ? "现在可以靠近一点。"
                    : b.music
                      ? "这是做响亮事情的好机会。"
                      : "放轻脚步，也放轻喜欢。"}
              </span>
            </div>
            <div className={styles.dialogue} aria-live="polite">
              {view.message}
            </div>
            {isPlaying && (
              <section className={styles.controls} aria-label="游戏操作">
                <div className={styles.places}>
                  {(Object.keys(SPOTS) as Spot[]).map((spot) => (
                    <button
                      key={spot}
                      data-spot={spot}
                      aria-pressed={view.target === spot}
                      onClick={() => go(spot)}
                    >
                      {SPOTS[spot].name}
                    </button>
                  ))}
                </div>
                <div className={styles.actions}>
                  <button
                    aria-pressed={view.quiet}
                    onClick={() => {
                      game.current.quiet = !game.current.quiet;
                      refresh();
                    }}
                  >
                    {view.quiet ? "♧ 轻步中" : "快走 / 放开语音"} · Q
                  </button>
                  <button
                    disabled={nearest(view) !== "partner" || view.cooldown > 0}
                    onClick={() => {
                      signal(game.current);
                      refresh();
                    }}
                  >
                    {view.cooldown > 0
                      ? `暗号冷却 ${Math.ceil(view.cooldown)}s`
                      : "眼神暗号 · 闭麦7s"}{" "}
                    · M
                  </button>
                  <button
                    data-act="hold"
                    className={styles.hold}
                    disabled={!a.key}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      input.current.act = true;
                    }}
                    onPointerUp={() => {
                      input.current.act = false;
                      game.current.requireRelease = false;
                    }}
                    onPointerCancel={() => {
                      input.current.act = false;
                      game.current.requireRelease = false;
                    }}
                    onLostPointerCapture={() => {
                      input.current.act = false;
                      game.current.requireRelease = false;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        input.current.act = true;
                      }
                    }}
                    onKeyUp={() => {
                      input.current.act = false;
                      game.current.requireRelease = false;
                    }}
                    onBlur={() => {
                      input.current.act = false;
                    }}
                  >
                    <span style={{ width: `${view.actionProgress * 100}%` }} />
                    <b>按住 · {a.label}</b>
                  </button>
                </div>
              </section>
            )}
          </section>
          <aside className={styles.sidebar}>
            {view.phase === "ready" ? (
              <>
                <p className={styles.eyebrow}>今晚的秘密计划</p>
                <h2>
                  {view.level === 5 ? "再陪你一晚" : LEVELS[view.level].title}
                </h2>
                <p className={styles.description}>
                  {view.level === 5
                    ? "随机直播节奏与时间预算。相同种子，相同挑战。完成后分享你的秘密夜晚。"
                    : LEVELS[view.level].subtitle}
                </p>
                <div className={styles.identities}>
                  <label htmlFor="hush-player">
                    你是
                    <select
                      id="hush-player"
                      aria-label="玩家身份"
                      value={save.player}
                      onChange={(e) => {
                        persist({
                          ...save,
                          player: e.target.value as Save["player"],
                        });
                        refresh();
                      }}
                    >
                      <option>男友</option>
                      <option>女友</option>
                    </select>
                  </label>
                  <label htmlFor="hush-partner">
                    恋人是
                    <select
                      id="hush-partner"
                      aria-label="恋人称呼"
                      value={save.partner}
                      onChange={(e) => {
                        persist({
                          ...save,
                          partner: e.target.value as Save["partner"],
                        });
                        refresh();
                      }}
                    >
                      <option value="她">她 · 小夏</option>
                      <option value="他">他 · 小夏</option>
                    </select>
                  </label>
                </div>
                <ol className={styles.tasks}>
                  {view.tasks.map((t) => (
                    <li key={t}>
                      <span>○</span>
                      {TASK_NAMES[t]}
                    </li>
                  ))}
                  <li>
                    <span>⌂</span>回沙发收工
                  </li>
                </ol>
                <button
                  id="hush-start"
                  className={styles.primary}
                  disabled={!ready}
                  onClick={start}
                >
                  轻轻推开门 <span>→</span>
                </button>
                <p className={styles.hint}>
                  点击地点移动，靠近后按住 E 做事。
                  <br />Q 轻步 · M 闭麦暗号 · P 暂停 · F 全屏
                  <br />
                  WASD / 方向键移动，Shift 奔跑。
                  <br />
                  手机用下方地点与长按按钮。
                </p>
              </>
            ) : view.phase === "result" ? (
              <>
                <p className={styles.eyebrow}>
                  {view.won ? "OFF AIR / 属于我们的时间" : "今晚的小插曲"}
                </p>
                <h2>{ending(view)}</h2>
                <div className={styles.score}>
                  {view.totalScore}
                  <small> 分</small>
                </div>
                <p className={styles.star}>
                  {"★".repeat(stars(view))}
                  {"☆".repeat(3 - stars(view))}
                </p>
                <p className={styles.description}>
                  {view.won
                    ? `下播后，${save.partner}把头靠在你的肩上：“辛苦啦，我的${save.player}。”`
                    : view.reason === "timeout"
                      ? "直播结束了，事情还没做完。少绕一点路，下次一定赶得上。"
                      : "弹幕瞬间刷满问号。TA红着脸说：“是……家里那只猫。”试试等音乐，或先闭麦。"}
                </p>
                <p>
                  甜蜜 {view.love} · 最高怀疑 {Math.round(view.peak)}%
                </p>
                <p className={styles.hint}>三星：最高怀疑低于25%，甜蜜至少25。<br />多一个抱抱，可能就是更好的结局。</p>
                {view.won && view.level === 1 && (
                  <p className={styles.reward}>解锁棉拖鞋：轻步更安静。</p>
                )}
                {view.won && view.level === 3 && (
                  <p className={styles.reward}>
                    解锁隔音门条：关门后隔音更好。
                  </p>
                )}
                {view.won && view.level === 4 && (
                  <p className={styles.reward}>
                    解锁随机加班夜：新的秘密，新的纪录。
                  </p>
                )}
                <button
                  className={styles.primary}
                  onClick={() => {
                    if (view.won) {
                      if (view.level === 5) seed.current = (seed.current + 7919) % 4294967296;
                      select(Math.min(5, view.level + 1));
                    } else {
                      select(view.level);
                      start();
                    }
                  }}
                >
                  {view.won
                    ? view.level >= 4
                      ? "再开一个加班夜 →"
                      : "下一个夜晚 →"
                    : "再试一次 →"}
                </button>
                <div className={styles.resultButtons}>
                  <button onClick={() => select(view.level)}>重玩本晚</button>
                  <button
                    onClick={() => {
                      share().catch(() => {});
                    }}
                  >
                    复制成绩分享
                  </button>
                </div>
                {shareText && (
                  <textarea
                    aria-label="成绩分享文案"
                    readOnly
                    value={shareText}
                    onFocus={(e) => e.target.select()}
                  />
                )}
              </>
            ) : (
              <>
                <p className={styles.eyebrow}>保守秘密，也别冷落TA</p>
                <div className={styles.meterTitle}>
                  <span>观众怀疑</span>
                  <strong>
                    {Math.round(view.suspicion)}
                    <small> / 100</small>
                  </strong>
                </div>
                <div className={styles.meter}>
                  <i style={{ width: `${view.suspicion}%` }} />
                </div>
                <div className={styles.stats}>
                  <span>♡ 甜蜜 {view.love}</span>
                  <span>传入麦克风 {view.noise.toFixed(1)}</span>
                </div>
                <ol className={styles.tasks}>
                  {view.tasks.map((t) => (
                    <li
                      key={t}
                      className={view.done.includes(t) ? styles.done : ""}
                    >
                      <span>{view.done.includes(t) ? "✓" : "○"}</span>
                      {TASK_NAMES[t]}
                    </li>
                  ))}
                  <li>
                    <span>⌂</span>做好后回沙发收工
                  </li>
                </ol>
                <div className={styles.chat}>
                  <span>直播弹幕</span>
                  <p>{view.chat}</p>
                </div>
                {view.phase === "paused" ? (
                  <div className={styles.pause}>
                    <h2>先歇一会儿。</h2>
                    <p>时间和声音都停在这里。</p>
                    <button className={styles.primary} onClick={pause}>
                      继续今晚 →
                    </button>
                    <button onClick={() => select(view.level)}>
                      放弃本晚，返回准备
                    </button>
                  </div>
                ) : (
                  <button className={styles.pauseButton} onClick={pause}>
                    Ⅱ 暂停 / P
                  </button>
                )}
              </>
            )}
          </aside>
        </div>

        {view.phase === "ready" && (
          <section className={styles.chapters} aria-label="夜晚选择">
            {[...LEVELS.map((l) => l.title), "随机加班夜"].map((title, i) => (
              <button
                key={title}
                disabled={i > save.unlocked}
                aria-pressed={view.level === i}
                onClick={() => select(i)}
              >
                <small>
                  {i > save.unlocked
                    ? "尚未解锁"
                    : i === 5
                      ? "ENDLESS"
                      : `NIGHT 0${i + 1}`}
                </small>
                <strong>{title}</strong>
                <span>
                  {i < 5
                    ? save.best[i]
                      ? `${"★".repeat(save.stars[i])} ${save.best[i]}分`
                      : "等待一个晚安"
                    : save.endlessBest
                      ? `最佳 ${save.endlessBest}分`
                      : "每晚都有新秘密"}
                </span>
              </button>
            ))}
          </section>
        )}
        <footer className={styles.footer}>
          <span>
            {save.unlocked >= 2 ? "✓ 棉拖鞋" : "第二晚解锁棉拖鞋"} ·{" "}
            {save.unlocked >= 4 ? "✓ 隔音门条" : "第四晚解锁隔音门条"} ·
            进度自动保存在本机
          </span>
          <span>原创成年角色 / 一屋，两人，无数句悄悄话。</span>
        </footer>
        {storageNote && (
          <p className={styles.storage} role="status">
            {storageNote}
          </p>
        )}
      </div>
    </main>
  );
}
