"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AI_EVENTS,
  aiIncome,
  aiUpkeep,
  createAi,
} from "./agiEngine";
import {
  actFab,
  capacity,
  CYCLES,
  FAB_ACTIONS,
  FAB_STYLES,
  fabBlocked,
  fabForecast,
  createFab,
  endFabTurn,
  liquidation,
  FabStyle,
  unitCost,
} from "./fabEngine";
import {
  advanceSnack,
  clearSnackInput,
  createSnack,
  pauseSnack,
  selectSnack,
  snackCover,
  snackInput,
  snackSpeech,
  SNACK_LEVELS,
  SNACK_MUFFLED_CHEW_RATE,
  SNACKS,
  SnackInput,
} from "./snackEngine";
import { money, round, seedValue } from "./core";
import { drawScene, GameState } from "./scene";
import { aiCompany } from "./agiIndustry";
import { AgiCompanyPicker, AgiIndustryScene } from "./AgiIndustryPanel";
import AgiTurnPanel from "./AgiTurnPanel";
import { readGameSave } from "./save";
import { SNACK_SKINS, SNACK_SKIN_STORAGE_KEY, SnackSkin } from "./snackSkins";
import styles from "./miniGames.module.css";

const TITLES = { agi: "智能纪元", fab: "晶圆周期", snack: "主播，别嚼了！" };
const ENGLISH = {
  agi: "THE INTELLIGENCE RACE",
  fab: "THE SILICON CYCLE",
  snack: "MIDNIGHT MUNCH",
};
const DESCRIPTIONS = {
  agi: "从第一座实验室，到人类的下一个时代。",
  fab: "穿越繁荣与寒冬，做最后留在牌桌上的工厂。",
  snack: "零食要吃完，直播也不能冷场。",
};
function fresh(kind: GameState["kind"], seed = 2026): GameState {
  return kind === "agi"
    ? createAi(seed, 'product', 'openai')
    : kind === "fab"
      ? createFab(seed)
      : createSnack(seed);
}
function Meter({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className={`${styles.meter} ${tone ? styles[tone] : ""}`}>
      <div>
        <span>{label}</span>
        <strong>
          {round(value)}
          <small> / 100</small>
        </strong>
      </div>
      <div className={styles.track}>
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Rules({ kind }: { kind: GameState["kind"] }) {
  if (kind === "agi") return (
      <ol>
        <li>
          每季处理一次行业事件，再分配 3 次行动。训练提升能力，后训练提升可靠性；发布模型获得持续收入。
        </li>
        <li>
          能力 30 解锁蒸馏；55 解锁自我提升。扩建算力更快，但会增加维护费。
        </li>
        <li>
          自研能力 100、算力 5、可靠性 70 后，抢在对手之前启动 AGI。安全低于 40
          会失控；开源且安全 75 可实现共同富裕。
        </li>
        <li>
          闭源、社区至少 35、融资不超过 2
          次可走商业霸主路线。其他安全路线进入守望者结局。资金小于 0 则破产。
        </li>
      </ol>
    );
  if (kind === "fab") return (
      <ol>
        <li>
          每季设置产量、报价和出货比例，再结算市场。低报价吸引更多订单，高报价赚取更高单价。
        </li>
        <li>
          降价时可以减产、囤货；仓库每批每季收费 0.08 M。工厂每座维护 6
          M，贷款季息 4%。
        </li>
        <li>
          新厂需要两季建设，下季市场由周期、随机冲击与行业总产能共同决定。每季最多两次资本行动。
        </li>
        <li>
          24 季后比较清算资金：现金 + 库存 × 现货价 × 65% + 工厂 × 55 M −
          债务。现金小于 0 提前出局。
        </li>
      </ol>
    );
  return (
    <ol>
      <li>
        按一下 J 吃一份，松手后自动嚼完；长按不会连吃下一份。
        按住空格说话，提升气氛、降低怀疑。
      </li>
      <li>
        按住 K 静音，吃东西不会发出声音，但冷场消耗会加快。音乐响起时噪声只剩
        12%。
      </li>
      <li>
        嘴里有食物也能按住空格含糊接话，少量恢复气氛；但会嚼得更慢、增加怀疑。
        静音时观众听不到接话。
      </li>
      <li>
        用 1–4 选择零食。气氛降到 0、怀疑达到 100 或超时即失败。
        手机点一下「吃一口」，说话和静音仍需按住。
      </li>
      <li>
        清空本关零食即可通关。更快、怀疑峰值更低、连续吃完更多份可获得高分。P /
        Esc 暂停，F 全屏；切出页面自动暂停。
      </li>
    </ol>
  );
}

export default function MiniGame({ kind }: { kind: GameState["kind"] }) {
  const [game, setGame] = useState<GameState>(() => fresh(kind));
  const state = useRef(game);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLElement>(null);
  const resources = useRef<HTMLElement>(null);
  useEffect(() => {
    if (kind !== "agi" || !resources.current) return undefined;
    const element = resources.current;
    const measure = () => {
      const { height } = element.getBoundingClientRect();
      root.current?.style.setProperty('--agi-resource-height', `${height}px`);
      const slot = root.current?.querySelector('[data-controls-slot]')?.getBoundingClientRect();
      root.current?.style.setProperty('--agi-dock-top', `${Math.max(height, element.getBoundingClientRect().bottom) + 12}px`);
      if (slot) { root.current?.style.setProperty('--agi-dock-left', `${slot.left}px`); root.current?.style.setProperty('--agi-dock-width', `${slot.width}px`); }
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const gameRoot = root.current;
    gameRoot?.addEventListener('scroll', measure, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); gameRoot?.removeEventListener('scroll', measure); };
  }, [kind]);
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [help, setHelp] = useState(false);
  const [reset, setReset] = useState(false);
  const [seed, setSeed] = useState("2026");
  const [storage, setStorage] = useState("本机自动存档");
  const [skin, setSkin] = useState<SnackSkin>("original");
  const skinRef = useRef<SnackSkin>("original");
  const manual = useRef(false);
  const reduced = useRef(false);
  const pointers = useRef(new Map<number, SnackInput>());
  const keys = useRef(new Set<SnackInput>());
  const sync = useCallback(() => setGame(structuredClone(state.current)), []);
  const chooseSkin = (next: SnackSkin) => {
    skinRef.current = next;
    setSkin(next);
    if (canvas.current) drawScene(canvas.current, state.current, 0, next);
    try {
      localStorage.setItem(SNACK_SKIN_STORAGE_KEY, next);
    } catch {
      setStorage("浏览器未允许存档，本局仍可玩");
    }
  };
  const persist = useCallback(() => {
    if (!startedRef.current) return;
    try {
      localStorage.setItem(`mini-${kind}-v1`, JSON.stringify(state.current));
    } catch {
      setStorage("浏览器未允许存档，本局仍可玩");
    }
  }, [kind]);
  const commit = (next: GameState) => {
    state.current = next;
    sync();
    persist();
  };
  const releaseAll = useCallback(() => {
    keys.current.clear();
    pointers.current.clear();
    if (state.current.kind === "snack") clearSnackInput(state.current);
  }, []);
  const fullScreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.current?.requestFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    if (state.current.kind !== kind) {
      state.current = fresh(kind); startedRef.current = false; setStarted(false); sync();
    }
    reduced.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (kind === "snack") {
      try {
        const savedSkin = localStorage.getItem(SNACK_SKIN_STORAGE_KEY);
        skinRef.current = savedSkin === "sui" ? "sui" : "original";
        setSkin(skinRef.current);
      } catch {
        setStorage("浏览器未允许存档，本局仍可玩");
      }
    }
    try {
      const raw = localStorage.getItem(`mini-${kind}-v1`);
      const loaded = readGameSave(raw, kind);
      if (loaded) {
        state.current = loaded;
        startedRef.current = true;
        setStarted(true);
        setSeed(String(loaded.seed));
        sync();
      } else if (raw) setStorage("旧存档无法读取，已准备新局");
    } catch {
      setStorage("浏览器未允许存档，本局仍可玩");
    }
    setReady(true);
    let handle = 0;
    let last = performance.now();
    let painted = 0;
    let saved = 0;
    let previousPhase = state.current.kind === "snack" ? state.current.phase : "";
    const frame = (now: number) => {
      const elapsed = Math.min(100, now - last);
      last = now;
      if (!manual.current && state.current.kind === "snack") advanceSnack(state.current, elapsed);
      if (now - painted > 45) {
        if (canvas.current) drawScene(
            canvas.current,
            state.current,
            reduced.current
              ? 0
              : state.current.kind === "snack"
                ? state.current.time
                : now / 1000,
            skinRef.current,
          );
        if (state.current.kind === "snack" && state.current.phase === "playing") sync();
        else if (state.current.kind === "snack" && state.current.phase !== previousPhase) sync();
        if (state.current.kind === "snack") previousPhase = state.current.phase;
        painted = now;
      }
      if (now - saved > 1000) {
        persist();
        saved = now;
      }
      handle = requestAnimationFrame(frame);
    };
    handle = requestAnimationFrame(frame);
    const pause = () => {
      releaseAll();
      if (state.current.kind === "snack" && state.current.phase === "playing") pauseSnack(state.current);
      sync();
      persist();
    };
    const visibility = () => {
      if (document.hidden) pause();
    };
    const mapping: Record<string, SnackInput> = {
      Space: "talk",
      KeyJ: "eat",
      KeyK: "mute",
    };
    const updateInput = (input: SnackInput) => {
      if (state.current.kind === "snack") snackInput(
          state.current,
          input,
          keys.current.has(input) ||
            Array.from(pointers.current.values()).includes(input),
        );
    };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches("input, select, textarea")) return;
      if (e.code === "KeyF" && !e.repeat) fullScreen();
      if (state.current.kind !== "snack") return;
      if (e.code === "KeyP" || e.code === "Escape") {
        if (!e.repeat) {
          pauseSnack(state.current);
          releaseAll();
          sync();
          persist();
        }
      }
      if (mapping[e.code] && state.current.phase === "playing") {
        e.preventDefault();
        keys.current.add(mapping[e.code]);
        updateInput(mapping[e.code]);
        sync();
      }
      if (/^Digit[1-4]$/.test(e.code)) {
        selectSnack(state.current, Number(e.code.slice(-1)) - 1);
        sync();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (mapping[e.code]) {
        keys.current.delete(mapping[e.code]);
        updateInput(mapping[e.code]);
        sync();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", visibility);
    window.render_game_to_text = () => JSON.stringify({
        ...state.current,
        started: startedRef.current,
        coordinates:
          "Canvas 960x520; origin top-left, x right, y down. Controls are DOM buttons.",
        ...(state.current.kind === "snack"
          ? {
              cover: snackCover(state.current),
              snack: SNACKS[state.current.selected].name,
              skin: skinRef.current,
              speech: snackSpeech(state.current),
            }
          : {}),
      });
    window.advanceTime = (ms: number) => {
      manual.current = true;
      if (state.current.kind === "snack") advanceSnack(state.current, ms);
      if (canvas.current) drawScene(
          canvas.current,
          state.current,
          state.current.kind === "snack" ? state.current.time : 0,
          skinRef.current,
        );
      sync();
      persist();
    };
    return () => {
      cancelAnimationFrame(handle);
      pause();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", visibility);
      delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, [kind, fullScreen, persist, releaseAll, sync]);
  const start = () => {
    window.scrollTo({ top: 0, behavior: "instant" });
    startedRef.current = true;
    setStarted(true);
    state.current.seed = seedValue(seed);
    if (state.current.kind !== "snack") state.current.rng = state.current.seed;
    else state.current.phase = "playing";
    sync();
    persist();
  };
  const newGame = (same: boolean) => {
    window.scrollTo({ top: 0, behavior: "instant" });
    releaseAll();
    const nextSeed = same
      ? state.current.seed
      : Math.floor(Math.random() * 999999) + 1;
    const records = state.current.kind === "snack" ? [...state.current.best] : null;
    const previousCompany = state.current.kind === "agi" ? state.current.industry.company : null;
    state.current = same && previousCompany ? createAi(nextSeed, aiCompany(previousCompany).style, previousCompany) : fresh(kind, nextSeed);
    if (state.current.kind === "snack" && records) state.current.best = records;
    setSeed(String(nextSeed));
    startedRef.current = false;
    setStarted(false);
    setReset(false);
    manual.current = false;
    try {
      localStorage.removeItem(`mini-${kind}-v1`);
    } catch {
      /* Session stays playable. */
    }
    sync();
  };
  const hold = (input: SnackInput) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, input);
      if (state.current.kind === "snack") snackInput(state.current, input, true);
      sync();
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(e.pointerId);
      if (state.current.kind === "snack") snackInput(
          state.current,
          input,
          keys.current.has(input) ||
            Array.from(pointers.current.values()).includes(input),
        );
      sync();
    },
    onLostPointerCapture: (e: React.PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(e.pointerId);
      if (state.current.kind === "snack") snackInput(
          state.current,
          input,
          keys.current.has(input) ||
            Array.from(pointers.current.values()).includes(input),
        );
      sync();
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      pointers.current.delete(e.pointerId);
      if (state.current.kind === "snack") snackInput(
          state.current,
          input,
          keys.current.has(input) ||
            Array.from(pointers.current.values()).includes(input),
        );
      sync();
    },
  });
  const snackGame = game.kind === "snack" ? game : null;
  const ended =
    game.kind === "snack"
      ? ["won", "lost", "ending"].includes(game.phase)
      : !!game.ending;
  const forecast = game.kind === "fab" ? fabForecast(game) : null;
  const startPanel =
    !started || (game.kind === "snack" && game.phase === "ready");
  const skinName = SNACK_SKINS.find((option) => option.id === skin)!.name;
  const speech = snackGame ? snackSpeech(snackGame) : "silent";
  const cover = snackGame ? snackCover(snackGame) : null;
  const musicActive = snackGame?.phase === "playing" && !!cover?.active;
  const musicEnding = musicActive && cover!.next <= 1;
  const biteLeft = snackGame && snackGame.chewing > 0
    ? Math.max(0, SNACKS[snackGame.selected].time - snackGame.chewing) /
      (speech === "muffled" ? SNACK_MUFFLED_CHEW_RATE : 1)
    : 0;

  return (
    <main
      ref={root}
      className={`${styles.root} ${kind === "agi" ? styles.agi : ""} ${kind === "agi" && started ? styles.agiStarted : ""} ${kind === "snack" ? styles.pink : ""} ${kind === "snack" && skin === "sui" ? styles.sui : ""} ${kind === "snack" && started && !startPanel ? styles.live : ""}`}
    >
      <header className={styles.topbar}>
        <Link href="/demos" className={styles.back}>
          ← 实验室
        </Link>
        <nav aria-label="选择游戏">
          {(["agi", "fab", "snack"] as const).map((id) => (
            <Link
              key={id}
              href={`/game/${id}`}
              aria-current={id === kind ? "page" : undefined}
            >
              {TITLES[id]}
            </Link>
          ))}
        </nav>
        <button
          onClick={fullScreen}
          className={styles.iconButton}
          title="全屏 F"
          aria-label="全屏"
        >
          ⛶
        </button>
      </header>
      <div className={styles.workspace}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>{kind === 'agi' ? 'V2.2 · 厂商经营' : ENGLISH[kind]}</span>
            <h1>{TITLES[kind]}</h1>
            <p>{DESCRIPTIONS[kind]}</p>
          </div>
          <div className={styles.tools}>
            <span className={styles.save}>{storage}</span>
            <div>
              <button
                onClick={() => {
                  if (
                    state.current.kind === "snack" &&
                    state.current.phase === "playing"
                  ) {
                    pauseSnack(state.current);
                    releaseAll();
                    sync();
                  }
                  setHelp(!help);
                }}
              >
                玩法说明
              </button>
              {started && (
                <button
                  onClick={() => {
                    if (
                      state.current.kind === "snack" &&
                      state.current.phase === "playing"
                    ) {
                      pauseSnack(state.current);
                      releaseAll();
                      sync();
                    }
                    setReset(true);
                  }}
                >
                  新开一局
                </button>
              )}
            </div>
          </div>
        </div>
        {help && (
          <section className={styles.rules}>
            <h2>怎么玩</h2>
            <Rules kind={kind} />
            <button onClick={() => setHelp(false)}>收起说明</button>
          </section>
        )}
        {reset && (
          <section className={styles.confirm} aria-label="重开确认">
            <p>重新开始会替换本游戏的当前存档。</p>
            <button onClick={() => newGame(true)}>同种子重开</button>
            <button onClick={() => newGame(false)}>随机新局</button>
            <button onClick={() => setReset(false)}>保留当前局</button>
          </section>
        )}
        {game.kind === "agi" && (
          <section ref={resources} className={styles.metrics} aria-label="公司资源">
            <Metric
              label="可用资金"
              value={money(game.cash)}
              detail={`每季运营 ${aiUpkeep(game)} M`}
            />
            <Metric
              label="模型能力"
              value={`${game.capability}`}
              detail={`可靠性 ${game.industry.reliability} / AGI 需 70`}
            />
            <Metric
              label="对齐安全"
              value={`${game.safety}`}
              detail="低于 40 启动将失控"
            />
            <Metric
              label="季度收入"
              value={money(aiIncome(game))}
              detail={`算力 ${game.compute} / 效率 ${game.efficiency}`}
            />
          </section>
        )}
        {game.kind === "fab" && (
          <section className={styles.metrics} aria-label="工厂资源">
            <Metric
              label="可用资金"
              value={money(game.player.cash)}
              detail={`债务 ${money(game.player.debt)}`}
            />
            <Metric
              label="现货价格"
              value={money(game.price)}
              detail={`本季市场需求 ${game.demand} 批`}
            />
            <Metric
              label="库存晶圆"
              value={`${game.player.inventory} 批`}
              detail={`满产 ${capacity(game.player)} 批 / 季`}
            />
            <Metric
              label="上季净收益"
              value={money(game.player.profit)}
              detail={`制程 ${game.player.tech} 级 · ${game.player.fabs} 座厂`}
            />
          </section>
        )}
        {snackGame && (
          <section
            className={`${styles.metrics} ${styles.snackMeters}`}
            aria-label="直播状态"
          >
            <Metric
              label={`第 ${snackGame.level + 1} / 5 关`}
              value={SNACK_LEVELS[snackGame.level].name}
              detail={`剩余 ${Math.max(0, Math.ceil(SNACK_LEVELS[snackGame.level].limit - snackGame.time))} 秒`}
            />
            <Meter
              label="直播气氛"
              value={snackGame.energy}
              tone={snackGame.energy < 30 ? "danger" : ""}
            />
            <Meter
              label="观众怀疑"
              value={snackGame.suspicion}
              tone={snackGame.suspicion > 65 ? "danger" : ""}
            />
            <Metric
              label="零食进度"
              value={`${snackGame.eaten} / ${SNACK_LEVELS[snackGame.level].counts.reduce<number>((a, b) => a + b, 0)}`}
              detail={`本关纪录 ${snackGame.best[snackGame.level]} 分`}
            />
          </section>
        )}
        <div className={styles.board}>
          <section className={styles.mainColumn}>
            <div className={styles.sceneTop}>
              <span>
                {game.kind === "snack"
                  ? `● LIVE · ${skin === "sui" ? skinName : "深夜零食台"}`
                  : `第 ${game.turn} / ${game.kind === "agi" ? 20 : 24} 季度`}
              </span>
              <span>
                {game.kind === "snack"
                  ? game.inputs.mute ? "麦克风已静音" : "麦克风开启"
                  : `种子 ${game.seed}`}
              </span>
            </div>
            {snackGame && cover && (
              <div
                className={styles.musicCue}
                data-testid="snack-music"
                data-active={musicActive}
                data-ending={musicEnding}
              >
                <span className={styles.equalizer} aria-hidden="true">
                  <i /><i /><i /><i />
                </span>
                <div>
                  <strong aria-live="polite">
                    {snackGame.phase !== "playing"
                      ? snackGame.phase === "paused" ? "音乐计时已暂停" : "音乐掩护"
                      : musicEnding ? "音乐快结束了" : musicActive ? "音乐掩护中" : "等待下一段音乐"}
                  </strong>
                  <small>
                    {musicActive ? "咀嚼声降低 88% · 抓紧这一口" : "按住 K 静音，也能掩护偷吃"}
                  </small>
                </div>
                <span className={styles.musicTime}>
                  {musicActive ? "还剩 " : "还有 "}{cover.next.toFixed(1)}s
                </span>
                <span
                  className={styles.musicProgress}
                  aria-hidden="true"
                  style={{ width: `${(100 * cover.next) / (cover.active ? SNACK_LEVELS[snackGame.level].cover : 12 - SNACK_LEVELS[snackGame.level].cover)}%` }}
                />
              </div>
            )}
            <div className={styles.scene}>
              <canvas
                ref={canvas}
                width={960}
                height={520}
                aria-label={
                  kind === "agi"
                    ? "随算力扩建变化的实验室沙盘"
                    : kind === "fab"
                      ? "显示工厂建设和库存的晶圆基地"
                      : `${skinName}在直播间吃零食，嘴巴与麦克风跟随操作变化`
                }
              />
            </div>
            {snackGame?.phase === "paused" && (
              <div className={styles.pause}>
                <div>
                  <strong>直播已暂停</strong>
                  <p>可以换个皮肤，准备好再继续。</p>
                </div>
                <button
                  className={styles.primary}
                  onClick={() => {
                    if (state.current.kind === "snack") {
                      pauseSnack(state.current);
                      releaseAll();
                      sync();
                      persist();
                    }
                  }}
                >
                  继续直播
                </button>
              </div>
            )}
            {snackGame && snackGame.phase !== "playing" && (
              <fieldset className={styles.skinPicker}>
                <legend>主播皮肤</legend>
                <div>
                  {SNACK_SKINS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-label={option.name}
                      aria-pressed={skin === option.id}
                      disabled={!ready}
                      onClick={() => chooseSkin(option.id)}
                    >
                      <span
                        className={styles.skinSwatch}
                        data-skin={option.id}
                        aria-hidden="true"
                      >
                        {skin === option.id ? "✓" : ""}
                      </span>
                      <span>
                        <strong>{option.name}</strong>
                        <small>{option.detail}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {game.kind === "agi" && (
              <details className={styles.agiMarketDetails}><summary>机房简报 · {AI_EVENTS[game.event].title}</summary><div className={styles.event}>
                <span>机房与市场简报</span>
                <h2>{AI_EVENTS[game.event].title}</h2>
                <p>{AI_EVENTS[game.event].text}</p>
                <div className={styles.chips}>
                  <span>社区 {game.community}</span>
                  <span>信誉 {game.reputation}</span>
                  <span>
                    {game.recursive ? "递归研究：运行中" : "递归研究：未开启"}
                  </span>
                  <span>融资 {game.funding} / 3</span>
                </div>
              </div></details>
            )}
            {game.kind === "agi" && started && <div className={styles.agiContext}><AgiIndustryScene game={game} /></div>}
            {game.kind === "fab" && (
              <div className={styles.event}>
                <span>
                  市场周期 / {Math.floor((game.turn - 1) / 12) + 1} 轮
                </span>
                <h2>{CYCLES[game.cycle].name}</h2>
                <p>
                  {CYCLES[game.cycle].text} 本阶段第 {((game.turn - 1) % 3) + 1}{" "}
                  / 3 季。
                </p>
                <svg
                  className={styles.chart}
                  viewBox="0 0 660 74"
                  role="img"
                  aria-label="历史现货价格走势"
                >
                  <line x1="0" y1="65" x2="660" y2="65" stroke="#bfd0c3" />
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    points={game.history
                      .map(
                        (h, i) => `${(i * 660) / Math.max(1, game.history.length - 1)},${65 - h.price * 14}`,
                      )
                      .join(" ")}
                  />
                </svg>
              </div>
            )}
            {snackGame && (
              <div className={styles.chat} aria-live="polite">
                <span>
                  弹幕 / {snackGame.inputs.mute ? "麦克风已静音" : "麦克风开启"}
                </span>
                <p>
                  {snackGame.phase === "playing" &&
                  snackGame.time > snackGame.messageUntil
                    ? snackGame.energy < 30
                      ? "主播？怎么突然不说话了？"
                      : snackGame.suspicion > 60
                        ? "我好像听见了咔嚓声……"
                        : snackCover(snackGame).active
                          ? "这首背景音乐好好听！"
                          : "今天也来听你聊天啦。"
                    : snackGame.message}
                </p>
              </div>
            )}
            {game.kind === "fab" && started && (
<section className={styles.standings}>
              <h2>清算资金排名</h2>
              {[game.player, ...game.rivals].sort((a, b) => liquidation(b, game.price) - liquidation(a, game.price)).map((firm, index) => <div key={firm.name} className={styles.rankRow}><span>{index + 1}. {firm.name}<small>{firm === game.player ? '你' : firm.bankrupt ? '已停机' : `${firm.fabs} 座工厂`}</small></span><strong>{money(liquidation(firm, game.price))}</strong></div>)}
            </section>
)}
          </section>
          <div className={styles.controlSlot} data-controls-slot><aside className={styles.controls}>
            {startPanel ? (
              <div className={styles.intro}>
                <span className={styles.eyebrow}>
                  {kind === "snack" ? "准备开播" : "新公司 / 新可能"}
                </span>
                <h2>
                  {kind === "snack"
                    ? SNACK_LEVELS[snackGame!.level].subtitle
                    : "选择你的起点"}
                </h2>
                {game.kind === "agi" && <AgiCompanyPicker game={game} choose={id => commit(createAi(seedValue(seed), aiCompany(id).style, id))} />}
                {game.kind === "fab" && (
                  <div className={styles.choices}>
                    {FAB_STYLES.map((style) => (
                      <button
                        key={style.id}
                        aria-pressed={game.player.style === style.id}
                        onClick={() => commit(
                            createFab(seedValue(seed), style.id as FabStyle),
                          )}
                      >
                        <strong>{style.name}</strong>
                        <span>{style.perk}</span>
                      </button>
                    ))}
                  </div>
                )}
                {kind === "agi" ? <details className={styles.agiIntroRules}><summary>第一次玩？查看简明规则</summary><Rules kind={kind} /></details> : <Rules kind={kind} />}
                {kind !== "snack" && (
                  <label htmlFor="world-seed" className={styles.seed}>
                    世界种子
                    <input
                      id="world-seed"
                      aria-label="世界种子"
                      type="number"
                      min="1"
                      max="999999"
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                    />
                  </label>
                )}
                <button
                  id="start-game"
                  className={styles.primary}
                  disabled={!ready}
                  onClick={start}
                >
                  {kind === "snack" ? "开始直播" : "成立公司"} →
                </button>
                <small>
                  单人游戏 · 自动保存 ·{" "}
                  {kind === "snack" ? "每关约 1 分钟" : "每局约 10–20 分钟"}
                </small>
              </div>
            ) : ended ? (
              <section className={styles.result} aria-live="polite">
                <span className={styles.eyebrow}>本局结算</span>
                <span className={styles.resultSymbol}>
                  {game.kind === "snack"
                    ? game.phase === "lost"
                      ? "…"
                      : "✦"
                    : game.ending?.won
                      ? "✦"
                      : "◇"}
                </span>
                <h2>
                  {game.kind === "snack"
                    ? game.phase === "lost"
                      ? "偷吃失败"
                      : game.phase === "ending"
                        ? "潜吃大师毕业！"
                        : "这一桌，吃光了"
                    : game.ending?.title}
                </h2>
                <p>
                  {game.kind === "snack" ? game.message : game.ending?.text}
                </p>
                {snackGame && (
                  <>
                    <Metric
                      label="本关得分"
                      value={`${snackGame.score}`}
                      detail={`怀疑峰值 ${Math.round(snackGame.peak)} · 最长连吃 ${snackGame.bestCombo}`}
                    />
                    {snackGame.phase === "ending" && (
                      <p>
                        五关纪录总分 {snackGame.best.reduce((a, b) => a + b, 0)}
                        。下一次，挑战更低的怀疑峰值。
                      </p>
                    )}
                    <button
                      className={styles.primary}
                      onClick={() => {
                        const next = createSnack(
                          snackGame.seed,
                          snackGame.phase === "won"
                            ? snackGame.level + 1
                            : snackGame.phase === "ending"
                              ? 0
                              : snackGame.level,
                          snackGame.best,
                        );
                        commit(next);
                      }}
                    >
                      {snackGame.phase === "won"
                        ? "准备下一关"
                        : snackGame.phase === "ending"
                          ? "再挑战五关"
                          : "重试本关"}
                    </button>
                  </>
                )}
                {game.kind !== "snack" && (
                  <>
                    <button
                      className={styles.primary}
                      onClick={() => newGame(true)}
                    >
                      同种子再战
                    </button>
                    <button onClick={() => newGame(false)}>随机新局</button>
                  </>
                )}
                <Link href="/demos">返回游戏列表 ↗</Link>
              </section>
            ) : (
              <>
                {game.kind === "agi" && <AgiTurnPanel game={game} change={commit} />}
                {game.kind === "fab" && forecast && (
                  <>
                    <div className={styles.controlHeading}>
                      <h2>生产与销售</h2>
                      <span>第 {game.turn} 季</span>
                    </div>
                    {[
                      {
                        field: "production",
                        title: "生产负荷",
                        options: [
                          { value: 0, label: "停产" },
                          { value: 0.5, label: "半产" },
                          { value: 1, label: "满产" },
                        ],
                      },
                      {
                        field: "pricing",
                        title: "销售报价",
                        options: [
                          { value: 0.85, label: "降价 15%" },
                          { value: 1, label: "市价" },
                          { value: 1.2, label: "涨价 20%" },
                        ],
                      },
                      {
                        field: "shipment",
                        title: "可用库存出货",
                        options: [
                          { value: 0, label: "全部囤货" },
                          { value: 0.5, label: "卖一半" },
                          { value: 1, label: "全部出货" },
                        ],
                      },
                    ].map((group) => (
                      <fieldset key={group.field} className={styles.order}>
                        <legend>{group.title}</legend>
                        {group.options.map((option) => (
                          <button
                            key={option.value}
                            aria-pressed={
                              game[
                                group.field as
                                  | "production"
                                  | "pricing"
                                  | "shipment"
                              ] === option.value
                            }
                            onClick={() => commit({ ...game, [group.field]: option.value })}
                          >
                            {option.label}
                          </button>
                        ))}
                      </fieldset>
                    ))}
                    <div className={styles.forecast}>
                      <strong>
                        本季生产 {forecast.produced} 批 · 挂单{" "}
                        {forecast.offered} 批
                      </strong>
                      <p>
                        报价 {money(forecast.quote)} / 批<br />
                        生产、维护与利息 {money(forecast.cost)}
                        <br />
                        单位成本 {unitCost(game.player).toFixed(2)} M · 仓储另计
                      </p>
                      <small>挂单不保证成交，订单由所有厂商竞争。</small>
                    </div>
                    <div className={styles.controlHeading}>
                      <h2>资本决策</h2>
                      <span>{game.actions} 次可用</span>
                    </div>
                    <div className={styles.actions}>
                      {FAB_ACTIONS.map((action) => {
                        const reason = fabBlocked(game, action.id);
                        return (
                          <button
                            key={action.id}
                            data-action={action.id}
                            disabled={!!reason}
                            title={reason || action.hint}
                            onClick={() => commit(actFab(game, action.id))}
                          >
                            <span>
                              <strong>{action.name}</strong>
                              <small>{action.hint}</small>
                            </span>
                            {reason && (
                              <span className={styles.cost}>{reason}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {game.player.building > 0 && (
                      <p className={styles.footnote}>
                        新厂还需 {game.player.building}{" "}
                        次季度结算，投产后可增加产量。
                      </p>
                    )}
                    <button
                      className={styles.primary}
                      onClick={() => commit(endFabTurn(game))}
                    >
                      结算本季市场 →
                    </button>
                  </>
                )}
                {snackGame && (
                  <>
                    <div className={styles.controlHeading}>
                      <h2>今晚的零食</h2>
                      <button
                        onClick={() => {
                          if (state.current.kind === "snack") {
                            pauseSnack(state.current);
                            releaseAll();
                            sync();
                            persist();
                          }
                        }}
                      >
                        {snackGame.phase === "paused" ? "继续" : "暂停"} / P
                      </button>
                    </div>
                    <div className={styles.snackList}>
                      {SNACKS.map((snack, i) => (
                        <button
                          key={snack.name}
                          disabled={
                            !snackGame.remaining[i] ||
                            snackGame.chewing > 0 ||
                            snackGame.phase !== "playing"
                          }
                          aria-pressed={snackGame.selected === i}
                          onClick={() => {
                            if (state.current.kind === "snack") selectSnack(state.current, i);
                            sync();
                          }}
                        >
                          <span className={styles.snackNumber}>{i + 1}</span>
                          <span>
                            <strong>
                              {snack.name}{" "}
                              <small>×{snackGame.remaining[i]}</small>
                            </strong>
                            <small>{snack.text}</small>
                          </span>
                          <span>{snack.time}s</span>
                        </button>
                      ))}
                    </div>
                    <div className={styles.bite}>
                      <span aria-live="polite">
                        {snackGame.chewing > 0
                          ? speech === "muffled" ? "含糊接话中 · 气氛缓慢回升，嚼得更慢" : `自动嚼${SNACKS[snackGame.selected].name} · 可以松手`
                          : snackGame.inputs.eat ? "这份吃完了 · 松开后再按，才会拿下一份" : "准备好了 · 点一下吃一口"}
                      </span>
                      <span className={styles.biteTime}>
                        {biteLeft > 0 ? `还需 ${biteLeft.toFixed(1)}s` : ""}
                      </span>
                      <div className={styles.track}>
                        <span
                          style={{
                            width: `${(snackGame.chewing / SNACKS[snackGame.selected].time) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles.holdControls}>
                      {(
                        [
                          {
                            id: "talk",
                            key: "空格",
                            title: "说话",
                            hint: snackGame.chewing > 0 ? "少量回气氛 · 嚼慢些" : "回气氛 · 降怀疑",
                          },
                          {
                            id: "eat",
                            key: "J",
                            title: "吃一口",
                            hint: snackGame.chewing > 0 ? "正在自动嚼 · 无需按住" : "点一次一份 · 自动嚼完",
                          },
                          {
                            id: "mute",
                            key: "K",
                            title: "静音",
                            hint: "无声 · 冷场更快",
                          },
                        ] as const
                      ).map((control) => (
                        <button
                          key={control.id}
                          {...hold(control.id)}
                          disabled={snackGame.phase !== "playing"}
                          aria-pressed={control.id === "eat" ? snackGame.chewing > 0 : snackGame.inputs[control.id]}
                          aria-label={control.id === "eat" ? "吃一口" : `按住${control.title}`}
                          onKeyDown={control.id === "eat" ? (e) => {
                            if (!["Space", "Enter"].includes(e.code)) return;
                            e.preventDefault();
                            e.stopPropagation();
                            if (!e.repeat && state.current.kind === "snack") {
                              snackInput(state.current, "eat", true);
                              sync();
                            }
                          } : undefined}
                          onKeyUp={control.id === "eat" ? (e) => {
                            if (!["Space", "Enter"].includes(e.code)) return;
                            e.preventDefault();
                            e.stopPropagation();
                            if (state.current.kind === "snack") {
                              snackInput(state.current, "eat", keys.current.has("eat") || Array.from(pointers.current.values()).includes("eat"));
                              sync();
                            }
                          } : undefined}
                          onClick={control.id === "eat" ? (e) => {
                            // Assistive/keyboard activation has no pointer-down event.
                            if (e.detail === 0 && state.current.kind === "snack") {
                              snackInput(state.current, "eat", true);
                              snackInput(state.current, "eat", false);
                              sync();
                            }
                          } : undefined}
                        >
                          <kbd>{control.key}</kbd>
                          <strong>{control.title}</strong>
                          <small>{control.hint}</small>
                        </button>
                      ))}
                    </div>
                    <p className={styles.footnote}>
                      点一下吃一份；说话、静音需按住。嘴里有食物也能接话，但会增加怀疑。
                      1–4 选零食。
                    </p>
                  </>
                )}
              </>
            )}
          </aside></div>
        </div>
        {game.kind !== "snack" && started && (
          <section className={styles.logs}>
            <h2>经营记录</h2>
            {game.logs.slice(0, 6).map((entry, i) => (
              <p key={`${entry.turn}-${i}`}>
                <span>Q{String(entry.turn).padStart(2, "0")}</span>
                {entry.text}
              </p>
            ))}
          </section>
        )}
        <footer className={styles.footer}>
          <span>三种人生 · 三种冒险</span>
          <span>
            {kind === "snack"
              ? `${skinName} · 五关挑战`
              : "虚构公司与简化市场 · 策略模拟"}
          </span>
        </footer>
      </div>
    </main>
  );
}
