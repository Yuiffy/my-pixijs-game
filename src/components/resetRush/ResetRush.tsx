"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { GlobalOutlined } from "@ant-design/icons";
import { I18nextProvider, useTranslation } from "react-i18next";
import Link from "next/link";
import GameShareButton from "@/app/game/GameShareButton";
import {
  act,
  actionError,
  advanceMinutes,
  DAY_MINUTES,
  DAILY_ENERGY,
  laneStatus,
  developmentBlocker,
  fmt,
  timeLabel,
  V3_SAVE_KEY,
  V4_SAVE_KEY,
  quotaPercent,
  quotaObservation,
  modelEdition,
  proClosed,
  canKeepPro,
  V2_SAVE_KEY,
  activeAccount,
  CATEGORIES,
  createGame,
  endDay,
  MODELS,
  EFFORTS,
  DIFFICULTIES,
  DEFAULT_DEVELOPMENT,
  developmentStats,
  projectDevelopment,
  projectCollaboration,
  projectQuality,
  qualityForecast,
  attentionCost,
  energyBreakdown,
  claimEnergyPreview,
  riskAssessment,
  modelExperience,
  collaborationSpeed,
  LEGACY_SAVE_KEY,
  nextDay,
  PLANS,
  RESET_SUPPLY,
  TEMPLATES,
  restoreGame,
  SAVE_KEY,
  score,
  textState,
  type Action,
  type AccountPolicy,
  type Category,
  type Game,
  type Model,
  type Effort,
  type Project,
  type Tier,
  type Studio,
  type Development,
} from "./engine";
import s from "./resetRush.module.css";
import { resetLanguageNames } from "./messages";
import { browserLocale, createResetI18n, LOCALE_KEY, ResetLocaleContext, Translated, translateResetText, type ResetLocale } from "./i18n";

const STRATEGIES = ["独立开发者", "开源效率流", "极限冲刺流", "多号银行流"];
const ACCOUNT_POLICIES: { id: AccountPolicy; name: string; detail: string }[] = [
  { id: "soon-reset", name: "快重置优先", detail: "先花快自然补满的账号" },
  { id: "most-quota", name: "更多额度优先", detail: "结合套餐倍率与余额选大号，持续拉平剩余量" },
  { id: "preferred", name: "指定账号优先", detail: "这个号用完再换下一个" },
  { id: "drain", name: "快耗尽优先", detail: "先清掉小额余额" },
  { id: "late-expiry", name: "晚到期优先", detail: "先花订阅期限更长的账号" },
  { id: "balanced", name: "按比例均衡", detail: "按套餐剩余比例分散 AI 对话" },
];
type ModalKind = "rules" | "shop" | "restart" | "portfolio" | "finish" | null;

function Art({ kind }: { kind: Category }) {
  return (
    <svg viewBox="0 0 240 116" fill="none" aria-hidden="true" className={s.art}>
      <path
        d="M12 93H228M28 20V99M64 20V99M100 20V99M136 20V99M172 20V99M208 20V99"
        stroke="currentColor"
        opacity=".1"
      />
      {kind === "game" && (
        <>
          <path
            d="m71 37-15 37c-5 17 8 23 19 13l16-14h58l16 14c11 10 24 4 19-13l-15-37c-4-9-13-12-22-9l-12 5h-30l-12-5c-9-3-18 0-22 9Z"
            fill="currentColor"
            fillOpacity=".12"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M84 42v24M72 54h24" stroke="currentColor" strokeWidth="7" />
          <circle cx="154" cy="49" r="5" fill="currentColor" />
          <circle cx="169" cy="61" r="5" fill="currentColor" />
          <path
            d="M120 27V15h22M31 45h12M37 39v12M192 21h12M198 15v12"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="m112 61 8-5 8 5-8 5-8-5Z" fill="currentColor" />
        </>
      )}
      {kind === "open" && (
        <>
          <path
            d="m120 16 49 26v47l-49 25-49-25V42l49-26Z"
            fill="currentColor"
            fillOpacity=".09"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="m71 42 49 25 49-25M120 67v47M95 29l49 26v18"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="m48 42-15 13 15 13m144-26 15 13-15 13"
            stroke="currentColor"
            strokeWidth="3"
          />
          <circle cx="120" cy="67" r="6" fill="currentColor" />
          <circle cx="33" cy="91" r="3" fill="currentColor" />
          <path d="M184 93h28" stroke="currentColor" strokeWidth="2" />
        </>
      )}
      {kind === "personal" && (
        <>
          <rect
            x="61"
            y="17"
            width="120"
            height="78"
            rx="5"
            fill="currentColor"
            fillOpacity=".08"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M61 35h120M76 46l12 10-12 10m20 0h23M105 96v9m32-9v9m-45 0h60"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx="72" cy="26" r="2" fill="currentColor" />
          <circle cx="80" cy="26" r="2" fill="currentColor" />
          <path
            d="m152 53 4 9 10 1-8 7 2 10-8-5-9 5 2-10-7-7 10-1 4-9Z"
            fill="currentColor"
            fillOpacity=".3"
          />
          <path
            d="m29 74 9-17 9 17M197 47h18M206 38v18"
            stroke="currentColor"
            strokeWidth="2"
          />
        </>
      )}
      {kind === "company" && (
        <>
          <path
            d="M57 97V40h38v57m0 0V18h49v79m0 0V52h40v45M43 97h156"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M68 51h15M68 62h15M68 73h15M108 30h23M108 42h23M108 54h23M108 66h23M158 64h14M158 76h14"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            d="m163 27 18-14 19 6M193 11l7 8-9 3"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M108 79h23v18h-23z" fill="currentColor" fillOpacity=".2" />
        </>
      )}
    </svg>
  );
}

function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <Translated>
    <dialog
      ref={ref}
      className={s.modal}
      onClose={close}
      aria-labelledby="reset-modal-title"
    >
      <div className={s.modalHead}>
        <h2 id="reset-modal-title">{title}</h2>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="关闭弹窗"
        >
          ×
        </button>
      </div>
      <div className={s.modalBody} data-testid="modal-scroll-body">{children}</div>
    </dialog>
    </Translated>
  );
}

function Rules() {
  const { t, i18n } = useTranslation();
  const steps = [
    ["dayTitle", "dayBody"],
    ["jobsTitle", "jobsBody"],
    ["strategyTitle", "strategyBody"],
    ["modelsTitle", "modelsBody"],
    ["quotaTitle", "quotaBody"],
    ["bugsTitle", "bugsBody"],
    ["restTitle", "restBody"],
  ] as const;
  return (
    <div className={s.rules}>
      <p className={s.lead}>{t("rules.lead")}</p>
      <ol>
        {steps.map(([title, body]) => (
          <li key={title}><strong>{t(`rules.${title}`)}</strong> {t(`rules.${body}`)}</li>
        ))}
      </ol>
      <h3>{t("rules.qualityTitle")}</h3>
      <p>{t("rules.qualityBody")}</p>
      <p>{t("rules.energyBody")}</p>
      <h3>{t("rules.studioTitle")}</h3>
      <p>{t("rules.studioBody")}</p>
      <p>{t("rules.collaborationBody")}</p>
      <p>{t("rules.discoveryBody")}</p>
      <h3>{t("rules.resetTitle")}</h3>
      <p>{t("rules.resetBody")}</p>
      <p>{t("rules.giftBody", { normal: RESET_SUPPLY.normal, bank: RESET_SUPPLY.bank })}</p>
      <h3>{t("rules.platformTitle")}</h3>
      <p>{t("rules.platformBody")}</p>
      <p>{t("rules.platformChangeBody")}</p>
      <h3>{t("rules.scoringTitle")}</h3>
      <div className={s.ruleCategories}>
        {(Object.keys(CATEGORIES) as Category[]).map((key) => (
          <div key={key}><b>{translateResetText(CATEGORIES[key].name, i18n.language as ResetLocale)}</b><span>{translateResetText(CATEGORIES[key].perk, i18n.language as ResetLocale)}</span></div>
        ))}
      </div>
      <p>{t("rules.scoringBody")}</p>
      <p>{t("rules.finalBody")}</p>
      <p className={s.ruleNote}>{t("rules.note")}</p>
    </div>
  );
}

function ProjectCard({
  job,
  selected,
  market,
  day,
  onChoose,
  disabled,
  assigned,
  marketHint,
}: {
  job: Project;
  selected?: boolean;
  market?: boolean;
  day: number;
  onChoose: () => void;
  disabled?: boolean;
  assigned?: string;
  marketHint?: string;
}) {
  return (
    <Translated>
    <button
      type="button"
      data-project={job.id}
      data-category={job.category}
      aria-pressed={selected}
      onClick={onChoose}
      disabled={disabled}
      className={`${s.project} ${s[job.category]} ${selected ? s.selected : ""} ${market ? s.marketProject : ""}`}
    >
      <span className={s.projectTop}>
        <span>{CATEGORIES[job.category].short}</span>
        <strong>
          {job.vp}
          <small> VP</small>
        </strong>
      </span>
      <Art kind={job.category} />
      <span className={s.projectName}>{job.name}</span>
      <span className={s.difficulty} data-difficulty={job.difficulty}>
        {"◆".repeat(job.difficulty)} {DIFFICULTIES[job.difficulty]}{job.understood ? (job.challenge ? " · 含集成难点" : " · 已摸清") : " · 需求估计"}
      </span>
      <span className={s.projectPerk}>
        {market
          ? CATEGORIES[job.category].perk
          : job.deadline !== null
            ? `D${job.deadline} 截止 · 剩 ${job.deadline - day + 1} 天`
            : CATEGORIES[job.category].perk}
      </span>
      <span className={s.projectReward}>
        <span>
          {market ? `${job.need} 进度` : `${fmt(job.work)} / ${job.need} 进度`}
        </span>
        <span>基础 +${job.cash}</span>
      </span>
      <span className={s.projectPerk}>
        {market ? "品质加成最高 +40%" : job.understood ? `已积累：${projectQuality(job).grade} · 交付自动结算` : "作品品质 · 开发后逐步揭晓"}
      </span>
      {!market && (
        <span className={s.progress}>
          <i style={{ width: `${(100 * job.work) / job.need}%` }} />
        </span>
      )}
      <span className={s.cardFooter}>
        {market
          ? (marketHint ?? "接下项目 ↗ · 1 精力")
          : job.bugs
            ? `${job.bugs} 个 bug · 完工后自动返工`
            : selected
              ? `正在查看 · ${assigned ?? "待托管"}`
              : (assigned ?? "待托管")}
      </span>
    </button>
    </Translated>
  );
}

function ProjectSettings({ game, job, open, onToggle, send }: {
  game: Game;
  job: Project;
  open: boolean;
  onToggle: (open: boolean) => void;
  send: (action: Action) => void;
}) {
  const settings = job.settings ?? { development: null, collaboration: null };
  const config = projectDevelopment(game, game.players[0], job);
  const custom = !!(settings.development || settings.collaboration);
  const change = (patch: Partial<NonNullable<Project["settings"]>>) => send({ type: "project-settings", project: job.id, settings: { ...settings, ...patch } });
  const development = (patch: Partial<Development>) => change({ development: { ...config, ...patch } });
  return (
    <Translated>
    <details id="reset-project-settings" className={s.projectSettings} open={open} onToggle={e => onToggle(e.currentTarget.open)}>
      <summary>《{job.name}》项目设置 · {custom ? "本项已单独设置" : "跟随全局，可不设置"}</summary>
      <fieldset disabled={game.phase !== "plan"}>
        <legend>只影响这个项目</legend>
        <div className={s.projectSettingsGrid}>
          <label htmlFor="project-config-mode">模型配置
            <select
              id="project-config-mode"
              value={settings.development ? "custom" : "global"}
              onChange={e => change({ development: e.target.value === "global" ? null : { ...config } })}>
              <option value="global">跟随全局策略</option>
              <option value="custom">本项目单独指定</option>
            </select>
          </label>
          <label htmlFor="project-collaboration">本项目最多几个 AI 对话合作
            <select
              id="project-collaboration"
              value={settings.collaboration ?? "global"}
              onChange={e => change({ collaboration: e.target.value === "global" ? null : Number(e.target.value) as Studio["collaboration"] })}>
              <option value="global">跟随全局 · 最多 {game.studio.collaboration} 个</option>
              <option value="1">最多 1 个 · 独立完成</option>
              <option value="2">最多 2 个 · 一起做</option>
              <option value="3">最多 3 个 · 集中协作</option>
            </select>
          </label>
          {settings.development && (
            <>
            <label htmlFor="project-model">模型
              <select id="project-model" value={config.model} onChange={e => development({ model: e.target.value as Model })}>
                {(Object.keys(MODELS) as Model[]).map(m => <option key={m} value={m}>{modelEdition(game, m).name}</option>)}
              </select>
            </label>
            <label htmlFor="project-effort">投入强度
              <select id="project-effort" value={config.effort} onChange={e => development({ effort: e.target.value as Effort })}>
                {(Object.keys(EFFORTS) as Effort[]).map(e => <option key={e} value={e}>{EFFORTS[e].name}</option>)}
              </select>
            </label>
            <label className={s.projectTurbo} htmlFor="project-turbo">
              <input id="project-turbo" type="checkbox" checked={config.turbo} onChange={e => development({ turbo: e.target.checked })} />
              Turbo · 更快，额外耗额
            </label>
            </>
          )}
        </div>
        <p>这是协作上限，不是预留数量。全工作室最多同时开 {game.studio.threads} 个 AI 对话，先分头做不同项目，有空闲再来帮忙；本项最多 {projectCollaboration(game, job)} 个。每个工作中的对话每天占你 1–2 点精力。</p>
        <p>当前：{developmentStats(game, game.players[0], config).name} · {riskAssessment(game, game.players[0], config, job).label} · {qualityForecast(game, game.players[0], config, job)} · {attentionCost(game, game.players[0], config, job)} 精力/对话/天</p>
        <button type="button" disabled={!custom} onClick={() => send({ type: "project-settings", project: job.id, settings: null })}>恢复全部跟随全局</button>
      </fieldset>
    </details>
    </Translated>
  );
}

export default function ResetRush() {
  const [locale, setLocale] = useState<ResetLocale>("zh");
  const [i18n] = useState(createResetI18n);
  const [game, setGame] = useState<Game | null>(null);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const [length, setLength] = useState(42);
  const [seed, setSeed] = useState("260926");
  const [modal, setModal] = useState<ModalKind>(null);
  const [inspect, setInspect] = useState(0);
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(0);
  const [onboarding, setOnboarding] = useState(false);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    let selected: ResetLocale | null = null;
    try {
      const stored = localStorage.getItem(LOCALE_KEY);
      if (stored && stored in resetLanguageNames) selected = stored as ResetLocale;
    } catch { /* Browser language remains the fallback. */ }
    const next = selected ?? browserLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
    i18n.changeLanguage(next);
    setLocale(next);
  }, [i18n]);
  useEffect(() => {
    document.title = i18n.t("pageTitle");
  }, [i18n, locale]);
  const chooseLocale = (next: ResetLocale) => {
    i18n.changeLanguage(next);
    setLocale(next);
    try { localStorage.setItem(LOCALE_KEY, next); } catch { /* The choice still applies to this session. */ }
  };

  useEffect(() => {
    try {
      const restored =
        restoreGame(localStorage.getItem(SAVE_KEY)) ??
        restoreGame(localStorage.getItem(V4_SAVE_KEY)) ??
        restoreGame(localStorage.getItem(V3_SAVE_KEY)) ??
        restoreGame(localStorage.getItem(V2_SAVE_KEY)) ??
        restoreGame(localStorage.getItem(LEGACY_SAVE_KEY));
      setGame(restored);
      if (restored) setSelectedProjects(restored.players[0].projects.slice(0, 1).map((j) => j.id));
    } catch {
      setSaved(false);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || !game) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(game));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [game, ready]);
  useEffect(() => {
    const w = window as Window & {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
    };
    w.render_game_to_text = () => JSON.stringify(
        game
          ? textState(game)
          : { title: "RESET / 开蹬！", phase: "intro", ready },
      );
    w.advanceTime = (ms: number) => {
      // Explicit test hook: one simulated minute per 60,000 ms, never a wall-clock timer.
      const minutes = Math.floor(ms / 60000);
      if (minutes > 0) setGame((g) => (g ? advanceMinutes(g, minutes) : g));
    };
    return () => {
      delete w.render_game_to_text;
      delete w.advanceTime;
    };
  }, [game, ready]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.code !== "KeyF" ||
        e.repeat ||
        modal ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement)?.tagName,
        )
      ) return;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else root.current?.requestFullscreen().catch(() => {});
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [modal]);

  const start = () => {
    const fresh = createGame(Number(seed) || 260926, length);
    setGame(fresh);
    setSelectedProjects([fresh.players[0].projects[0].id]);
    setOnboarding(true);
    setModal("shop");
    setSelectedAccount(0);
  };
  const send = (a: Action) => setGame((g) => (g ? act(g, a) : g));
  const human = game?.players[0];
  const chosen = selectedProjects.filter((id) => human?.projects.some((j) => j.id === id),);
  const job = human?.projects.find((j) => j.id === chosen[0]) ?? human?.projects[0];
  const account =
    human?.accounts.find((a) => a.id === selectedAccount) ?? human?.accounts[0];
  const playable = !!game && game.phase === "plan";
  const config = game?.development ?? DEFAULT_DEVELOPMENT;
  const effectiveConfig = game && human && job ? projectDevelopment(game, human, job) : config;
  const assessment = game && human && job ? riskAssessment(game, human, effectiveConfig, job) : null;
  const model =
    game && human
      ? developmentStats(game, human, effectiveConfig, job)
      : { name: "GPT-5.6 Sol · Medium", cost: 0, risk: 0, ability: 0, perHour: 0, quotaPerHour: 0, minutes: 0, quota: 0, tokensPerHour: 0 };
  const energy = game && human ? energyBreakdown(game, human) : null;
  const tomorrowHosting = game && human ? human.lanes.filter(l => l.enabled && l.projects.length).reduce((n, l) => n + attentionCost(game, human, l.development, human.projects.find(j => j.id === l.projects[0])), 0) : 0;
  const studio = game?.studio;
  const setStudio = (changes: Partial<Pick<NonNullable<typeof studio>, "threads" | "accountPolicy" | "preferredAccount" | "configuration" | "collaboration">>) => {
    if (!studio || !human) return;
    send({
      type: "studio",
      threads: changes.threads ?? studio.threads,
      accountPolicy: changes.accountPolicy ?? studio.accountPolicy,
      preferredAccount: changes.preferredAccount ?? studio.preferredAccount,
      configuration: changes.configuration ?? studio.configuration,
      collaboration: changes.collaboration ?? studio.collaboration,
    });
  };
  const bankAction: Action = { type: "bank", account: account?.id ?? -1 };
  const bankError = game ? actionError(game, 0, bankAction) : null;
  const normalCards = game?.resetDeck.filter((c) => c === "normal").length ?? RESET_SUPPLY.normal;
  const bankCards = game?.resetDeck.filter((c) => c === "bank").length ?? RESET_SUPPLY.bank;
  const totalCards = normalCards + bankCards;
  const close = () => {
    setModal(null);
    setOnboarding(false);
  };
  const advance = () => {
    setGame((g) => (g ? nextDay(g) : g));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const reveal = () => {
    setGame((g) => (g ? endDay(g) : g));
    setModal(null);
  };

  return (
    <I18nextProvider i18n={i18n}>
    <ResetLocaleContext.Provider value={locale}>
    <Translated>
    <main ref={root} className={s.root} lang={locale === "zh" ? "zh-CN" : "en"}>
      <header className={s.header}>
        <Link href="/demos" className={s.back} aria-label="返回游戏目录">
          ↖ <span>游戏柜</span>
        </Link>
        <div className={s.logo}>
          RESET<span> / </span>
          <b>开蹬！</b>
          <small>A DEVELOPER’S BOARD GAME</small>
        </div>
        <div className={s.headerActions}>
          <label htmlFor="reset-language" className={s.localeSwitch} title={i18n.t("language")}>
            <GlobalOutlined aria-hidden="true" />
            <select id="reset-language" aria-label={i18n.t("language")} value={locale} onChange={(event) => chooseLocale(event.target.value as ResetLocale)}>
              {(Object.entries(resetLanguageNames) as [ResetLocale, string][]).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </label>
          <GameShareButton key={locale} gamePath="/game/reset-rush" locale={locale} />
          {game && game.phase !== "over" && (
            <button onClick={() => setModal("shop")}>账号管理</button>
          )}
          <button onClick={() => setModal("rules")}>
            玩法说明 <span>?</span>
          </button>
          {game && (
            <button onClick={() => setModal("restart")} aria-label="重新开局">
              ↺
            </button>
          )}
        </div>
      </header>

      {!game ? (
        <section className={s.intro}>
          <div className={s.introCopy}>
            <span className={s.eyebrow}>
              1 HUMAN + 3 AI / 额度管理 × 开发竞赛
            </span>
            <h1>
              还没用完？
              <br />
              <em>已经重置了。</em>
            </h1>
            <p>
              tibo 发了一条谜语。你把几个 AI 对话同时挂上，
              <br className={s.desktopOnly} />
              时间有限，额度快重置了。现在，加不加速？
            </p>
            <div className={s.setup}>
              <p className={s.startingKit}>
                <strong>一个 $20 账号，$480 现金。</strong>
                <span>先入座，再决定升档、加号，还是小步慢蹬。</span>
              </p>
              <div className={s.setupRow}>
                <label htmlFor="reset-length">
                  赛程{" "}
                  <select
                    id="reset-length"
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value))}
                  >
                    <option value={42}>42 天 · 完整策略局</option>
                    <option value={21}>21 天 · 快速试玩</option>
                  </select>
                </label>
                <label htmlFor="reset-seed">
                  牌局种子{" "}
                  <input
                    id="reset-seed"
                    inputMode="numeric"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  />
                </label>
              </div>
            </div>
            <button
              id="start-game"
              className={s.start}
              disabled={!ready}
              onClick={start}
            >
              {ready ? "开一局，立即开蹬" : "准备牌桌…"} <span>↗</span>
            </button>
            <p className={s.introNote}>
              你 + 3 位性格不同的电脑对手 · 自动保存 · 随时收工再来
            </p>
          </div>
          <div className={s.introTable} aria-hidden="true">
            <div className={`${s.teaserCard} ${s.teaserBack}`}>
              <span>BANKED RESET</span>
              <b>↻</b>
              <small>30 DAYS / ONE MORE CHANCE</small>
            </div>
            <div className={`${s.teaserCard} ${s.teaserGame}`}>
              <span>
                PROJECT / 001 <b>23 VP</b>
              </span>
              <Art kind="game" />
              <h2>只有一条命</h2>
              <p>写一个让人想再开一局的游戏。</p>
              <div>
                221 进度 <span>+$35</span>
              </div>
            </div>
            <div className={s.teaserEvent}>
              <small>@tibo · JUST NOW</small>
              <p>
                “limits reset.
                <br />
                go build.”
              </p>
              <span>↗ 全员额度补满</span>
            </div>
            <div className={s.tableStamp}>
              USE IT
              <br />
              OR LOSE IT<span>EST. 2026</span>
            </div>
          </div>
          <div className={s.introSteps}>
            <p>
              <b>01</b>
              <span>
                读懂风向<small>消息公开，结局未定。</small>
              </span>
            </p>
            <p>
              <b>02</b>
              <span>
                选好策略，并行开蹬<small>接单后自动排队，真人管精力。</small>
              </span>
            </p>
            <p>
              <b>03</b>
              <span>
                带着作品离桌<small>额度会刷新，作品会留下。</small>
              </span>
            </p>
          </div>
        </section>
      ) : (
        <>
          <div className={s.gameTop}>
            <div className={s.day}>
              <span>DAY</span>
              <strong>
                {String(game.day).padStart(2, "0")}
                <small> / {game.length}</small>
              </strong>
            </div>
            <div className={s.calendar}>
              <div className={s.calendarHead}>
                <span>
                  {locale === "zh" ? `第 ${Math.ceil(game.day / 7)} 周 / 共 ${game.length / 7} 周` : `Week ${Math.ceil(game.day / 7)} of ${game.length / 7}`}
                </span>
                <span>每 7 天发薪 · 自然重置按账号计时</span>
              </div>
              <div className={s.days}>
                {Array.from(
                  { length: 7 },
                  (_, i) => (Math.ceil(game.day / 7) - 1) * 7 + i + 1,
                ).map((d) => (
                  <div
                    key={d}
                    className={
                      d === game.day ? s.today : d < game.day ? s.past : ""
                    }
                  >
                    <span>{String(d).padStart(2, "0")}</span>
                    <small>
                      {human?.accounts.some((a) => a.nextReset === d)
                        ? "↻ 重置"
                        : d % 7 === 0
                          ? "$ 发薪"
                          : d < game.day
                            ? "已完成"
                            : "·"}
                    </small>
                  </div>
                ))}
              </div>
            </div>
            <div className={s.turnCounter}>
              <span>
                {game.phase === "plan"
                  ? "真人精力"
                  : game.phase === "reveal"
                    ? "夜间结算"
                    : "开发季结束"}
              </span>
              <strong>
                {human?.energy}
                <small> / {DAILY_ENERGY}</small>
              </strong>
              <small>{game.minute === 0 ? "预留" : "跟进"} {energy?.hosting ?? 0} · 接单 {energy?.claims ?? 0} · 其他 {(energy?.other ?? 0) + (energy?.previous ?? 0)}</small>
              {game.phase !== "over" && <a href="#reset-energy">查看精力去向 ↓</a>}
            </div>
          </div>
          {game.phase === "plan" && (
            <section className={s.timeConsole} aria-label="模拟时钟">
              <div className={s.clockFace}>
                <strong data-testid="clock">{timeLabel(game.minute)}</strong>
                <span>
                  剩 {DAY_MINUTES - game.minute} 分钟 · 现实时间不走钟
                </span>
              </div>
              <div className={s.clockTrack}>
                <i style={{ width: `${(game.minute / DAY_MINUTES) * 100}%` }} />
                <span>09:00</span>
                <span>17:00 揭牌</span>
              </div>
              <div className={s.timeButtons}>
                <button id="next-node" onClick={() => send({ type: "next" })} title="项目交付、AI 等待补给时停下；已停工时不再推进时间">
                  推进开发 ↗
                </button>
                <button
                  id="end-day"
                  onClick={() => setModal("finish")}
                  title="确认后让后台 AI 对话跑完剩余时间，再揭晓今晚赠礼"
                >
                  准备收工 →
                </button>
              </div>
            </section>
          )}
          {playable && human && (
            <aside className={s.clockHelp} data-testid="clock-help">
              <p>{developmentBlocker(game) ?? "推进开发会在交付或等待补给时停下。额度用完不等于收工，免费 Luna 仍可继续开发。"}</p>
              <div>
                <button onClick={() => setModal("shop")}>账号与银行券</button>
                <a href="#development-presets">免费 Luna 配置 ↓</a>
                <a href="#freelance">手写外包 ↓</a>
              </div>
            </aside>
          )}

          <div className={s.players}>
            {game.players.map((p) => (
              <button
                key={p.id}
                className={`${s.player} ${p.id === 0 ? s.you : ""}`}
                onClick={() => {
                  setInspect(p.id);
                  setModal("portfolio");
                }}
                aria-label={`查看${p.name}的作品与计分`}
              >
                <span className={s.avatar}>
                  {["我", "林", "卷", "周"][p.id]}
                </span>
                <span className={s.playerName}>
                  <b>{p.name}</b>
                  <small>{STRATEGIES[p.id]}</small>
                </span>
                <span className={s.playerNumbers}>
                  <strong>
                    {score(p).total}
                    <small> VP</small>
                  </strong>
                  <span>
                    ${p.cash} <i> / </i> {p.shipped.length} 作品
                  </span>
                </span>
              </button>
            ))}
          </div>

          {game.phase === "over" ? (
            <section className={s.ending}>
              <span className={s.eyebrow}>THE SEASON IS SHIPPED.</span>
              <h1>
                {score(game.players[0]).total >=
                Math.max(...game.players.map((p) => score(p).total))
                  ? "这一季，你蹬出了名堂。"
                  : "额度归零，作品留下。"}
              </h1>
              <p>
                {game.length} 天，{human?.shipped.length} 个作品，
                {fmt(human?.used ?? 0)} 算力点。下一局，读懂另一种风向。
              </p>
              <div className={s.scoreTable}>
                <table>
                  <thead>
                    <tr>
                      <th>开发者</th>
                      <th>声望与奖项</th>
                      <th>多样性</th>
                      <th>现金</th>
                      <th>算力</th>
                      <th>总分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...game.players]
                      .sort((a, b) => score(b).total - score(a).total)
                      .map((p) => {
                        const sc = score(p);
                        return (
                          <tr key={p.id} className={p.id === 0 ? s.ownRow : ""}>
                            <th>{p.name}</th>
                            <td>{sc.projects}</td>
                            <td>+{sc.variety}</td>
                            <td>+{sc.cash}</td>
                            <td>+{sc.quota}</td>
                            <td>
                              <b>{sc.total}</b>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <p className={s.endDetail}>
                用掉{" "}
                {human?.banksUsed} 张银行券 · {human?.expired} 张过期 ·{" "}
                {human?.collisions} 次同日撞车
              </p>
              <button className={s.primary} onClick={() => setModal("restart")}>
                再开一局 ↗
              </button>
              <button
                className={s.textButton}
                onClick={() => {
                  setInspect(0);
                  setModal("portfolio");
                }}
              >
                看看我的作品
              </button>
            </section>
          ) : (
            <div className={s.board}>
              <aside className={s.news}>
                <div className={s.sectionLabel}>
                  <span>01 / 今日风向</span>
                  <span>公开消息</span>
                </div>
                <article
                  className={s.event}
                  key={`${game.day}-${game.event.id}`}
                >
                  <div className={s.eventAuthor}>
                    <span>t</span>
                    <div>
                      <b>tibo</b>
                      <small>@tibo · D{game.day} 早晨</small>
                    </div>
                    <i>✦</i>
                  </div>
                  <h2>{game.event.title}</h2>
                  <blockquote>{game.event.quote}</blockquote>
                  <p>{game.event.detail}</p>
                  <div className={s.odds}>
                    <svg viewBox="0 0 70 70" aria-hidden="true">
                      <circle
                        cx="35"
                        cy="35"
                        r="29"
                        stroke="currentColor"
                        opacity=".12"
                        strokeWidth="4"
                        fill="none"
                      />
                      <circle
                        cx="35"
                        cy="35"
                        r="29"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                        strokeDasharray={`${game.event.chance * 1.822} 182.2`}
                        transform="rotate(-90 35 35)"
                      />
                    </svg>
                    <strong>
                      {game.event.chance}
                      <small>%</small>
                    </strong>
                    <span>
                      今晚触发赠礼<small>先判定，再翻重置牌</small>
                    </span>
                  </div>
                  {game.phase === "plan" && game.receipt?.gains[0] && (
                    <p className={s.morningGift}>
                      {game.receipt.kind === "normal" ? "早晨已到账：有效账号恢复 100%" : `早晨已到账：+${game.receipt.gains[0].gained} 张银行券`}
                    </p>
                  )}
                </article>
                <div className={s.deck}>
                  <span className={s.deckIcon}>↻</span>
                  <div>
                    <strong>重置牌堆</strong>
                    <p>
                      直接补满 <b>{totalCards ? normalCards : RESET_SUPPLY.normal}</b> <i>/</i>{" "}
                      银行券 <b>{totalCards ? bankCards : RESET_SUPPLY.bank}</b>
                    </p>
                    <small>
                      {totalCards
                        ? "抽过的牌不放回，用完再洗"
                        : "已抽空，下次重新洗回 10 张"}
                    </small>
                  </div>
                </div>
                <div className={s.awards}>
                  <div className={s.sectionLabel}>
                    <span>抢先一步</span>
                    <span>唯一奖励</span>
                  </div>
                  {game.awards.map((a) => (
                    <div key={a.id}>
                      <span className={s.awardIcon}>✳</span>
                      <span>
                        <b>{a.name}</b>
                        <small>
                          {a.owner === null
                            ? "尚未有人达成"
                            : `${game.players[a.owner].name} 已领取`}
                        </small>
                      </span>
                      <strong className={a.owner !== null ? s.muted : ""}>
                        +{a.vp}
                      </strong>
                    </div>
                  ))}
                </div>
              </aside>

              <section className={s.workbench} id="reset-workbench">
                <div className={s.sectionLabel}>
                  <span>02 / 我的工作室</span>
                  <span>
                    {
                      human?.lanes.filter((l) => l.enabled && l.projects.length)
                        .length
                    }{" "}
                    个托管中的 AI 对话
                  </span>
                </div>
                <div className={s.threadBoard}>
                  <div className={s.threadTitle}>
                    <h2>工作室任务</h2>
                    <a href="#reset-command">调整策略 ↓</a>
                  </div>
                  {!human?.lanes.some((l) => l.projects.length) && (
                    <p className={s.threadEmpty}>
                      {human?.projects.length
                        ? studio?.threads === 0
                          ? "已暂停托管；调高全局 AI 对话总数即可续跑。"
                          : "已接项目待托管，收工时会自动开工。"
                        : "从公共项目池接单，工作室会自动排队。"}
                      <br />
                      <span>AI 对话数量和账号顺序都在下方统一设置。</span>
                    </p>
                  )}
                  {human?.lanes
                    .filter((l, index, lanes) => l.projects.length && lanes.findIndex(other => other.projects[0] === l.projects[0]) === index)
                    .map((lane) => {
                      const head = human.projects.find(
                        (j) => j.id === lane.projects[0],
                      )!;
                      const stats = developmentStats(
                        game,
                        human,
                        lane.development,
                        head,
                      );
                      const team = human.lanes.filter(l => l.projects[0] === head.id);
                      const working = team.filter(l => ["开发中", "自动返工", "收工待续"].includes(laneStatus(game, human, l)) && l.enabled);
                      const pace = working.length ? collaborationSpeed(working.length) : 0;
                      const assessed = riskAssessment(game, human, lane.development, head);
                      const status = working.length ? laneStatus(game, human, working[0]) : laneStatus(game, human, lane);
                      return (
                        <article
                          className={s.thread}
                          key={lane.id}
                          data-lane={lane.id}
                          data-team-size={team.length}
                          data-testid="project-team"
                          data-state={status}
                        >
                          <div className={s.threadHeader}>
                            <b>
                              <i />
                              {team.length} 个 AI 对话{team.length > 1 ? " · 协作开发" : " · 独立开发"}
                            </b>
                            <span>{status}</span>
                            <small>
                              账号{" "}
                              {Array.from(new Set(team.map(l => human.accounts.findIndex(a => a.id === l.account) + 1))).join(" / ")}
                            </small>
                          </div>
                          <strong>{head.name}</strong>
                          <p>
                            {stats.name}{" "}
                            <span>· 合计 {fmt(stats.perHour * pace)} 进度 / 时 · {assessed.label}</span>
                          </p>
                          <p className={s.qualityNote} data-testid="quality-note">
                            <b>{qualityForecast(game, human, lane.development, head)}</b>
                            <span>{attentionCost(game, human, lane.development, head) === 1 ? "省心托管" : "人工跟进"} · {attentionCost(game, human, lane.development, head)} 精力 / 对话 / 天 · 今日已占 {team.reduce((n, l) => n + (l.paidDay === game.day ? l.attentionPaid : 0), 0)}</span>
                          </p>
                          <div className={s.threadProgress}>
                            <i
                              style={{
                                width: `${(head.work / head.need) * 100}%`,
                              }}
                            />
                          </div>
                          <div className={s.threadMetrics}>
                            <span>
                              {fmt(head.work)} / {head.need}
                              {head.bugs ? ` · ${head.bugs} bug` : ""}
                            </span>
                            <span>
                              {status === "等待额度"
                                ? "补额即续跑，进度保留"
                                : `当前项约 ${pace ? Math.ceil(stats.minutes / pace) : "—"} 分钟 · ${stats.tokenCost ? `${fmt(stats.tokenCost * Math.max(0, head.need - head.work + head.bugs * 12 - head.repair))}k token` : "免费慢跑"}`}
                            </span>
                          </div>
                          <small className={s.learningNote}>
                            {head.understood ? "项目已摸清" : `摸底 ${fmt(Math.min(20, head.work))} / 20 进度`} · {modelEdition(game, lane.development.model).name} 实测 {fmt(modelExperience(game, human, lane.development.model))} / 60
                            {team.length > 1 ? ` · ${working.length} 个对话正在推进，协调后 ${fmt(pace)}× 速度` : ""}
                          </small>
                          <ol className={s.queueList}>
                            {lane.projects.map((id) => (
                              <li key={id}>
                                {human.projects.find((j) => j.id === id)?.name}
                              </li>
                            ))}
                          </ol>
                          <a className={s.projectSettingsLink} href="#reset-project-settings" onClick={() => { setSelectedProjects([head.id]); setProjectSettingsOpen(true); }}>
                            项目设置 · {head.settings?.development || head.settings?.collaboration ? "已单独设置" : "跟随全局"} ↘
                          </a>
                        </article>
                      );
                    })}
                </div>
                <div className={s.backlogHead}>
                  <h3>
                    我的项目{" "}
                    <small>{human?.projects.length} 项 · 自动分配</small>
                  </h3>
                </div>
                <div
                  className={`${s.activeProjects} ${human?.projects.length === 0 ? s.noProjects : ""}`}
                >
                  {human?.projects.map((j) => {
                    const lanes = human.lanes.filter(l => l.projects.includes(j.id));
                    return (
                      <ProjectCard
                        key={j.id}
                        job={j}
                        day={game.day}
                        selected={chosen.includes(j.id)}
                        assigned={lanes.length ? `${lanes.length} 个 AI 对话 · 自动排队` : "待托管"}
                        onChoose={() => setSelectedProjects([j.id])}
                      />
                    );
                  })}
                  {!human?.projects.length && (
                    <div className={s.emptyProject}>
                      <span>＋</span>
                      <p>下一个好点子</p>
                      <small>从公共项目池接单 · 1 精力</small>
                    </div>
                  )}
                </div>
                {job && <ProjectSettings game={game} job={job} open={projectSettingsOpen} onToggle={setProjectSettingsOpen} send={send} />}
                <div className={s.marketHead}>
                  <div>
                    <h2>
                      公共项目池 <span>{TEMPLATES.length} 种题材 · 优先补充不同项目</span>
                    </h2>
                    <p>接一项花 1 精力；如果同时启用空闲 AI 对话，还会收取跟进费用。卡片显示本次实际花费。</p>
                  </div>
                  <span>↓ 接单</span>
                </div>
                {energy && human && (
<div id="reset-energy" className={s.energyGuide} data-testid="energy-guide" data-empty={human.energy === 0}>
                  <strong>今日精力：12{energy.restored ? ` + 休息 ${energy.restored}` : ""} − AI {game.minute === 0 ? "预留" : "跟进"} {energy.hosting} − 接单 {energy.claims} − 其他操作 {energy.other}{energy.previous ? ` − 旧记录 ${energy.previous}` : ""} = 剩 {human.energy}</strong>
                  <p>{game.phase !== "plan" ? "今天已收工，进入下一天后恢复 12 点，再扣当天 AI 跟进费用。" : human.energy === 0
                    ? `现在不能接新项目：接单需要 1 精力，你只剩 0。${game.minute === 0 ? "还没开工，可调少 AI 对话立即释放预留精力。" : ""}${!actionError(game, 0, { type: "rest" }) ? "可以休息恢复 3 点，后台继续工作。" : human.rested ? "今天已经休息过，收工后次日恢复。" : "剩余时间不足 60 分钟，无法休息；收工后次日恢复。"}`
                    : `还能支付 ${human.energy} 次接单费；新启用对话另计。已在运行且付过跟进费的 AI 可以继续工作。`}</p>
                  <details>
                    <summary>费用怎么算 · 预留与已花精力</summary>
                    <p>AI 跟进是你安排、检查和沟通的精力，每个工作中的对话每天 1–2 点；同一天换更费心的项目或配置只补差额。接单每项 1 点，仅在接下时收一次；其他操作包括亲自排障、手写外包和手动重新派工。买号、升级和用银行券不花精力。</p>
                    <p>09:00 尚未推进时间时，减少对话或选更省心配置会退还预留差额；开工后已花掉的精力不退。按当前配置，现有对话明天约需 {tomorrowHosting} 点跟进费，届时约剩 {DAILY_ENERGY - tomorrowHosting} 点接单或处理其他事；模型更新和项目切换会改变实际费用。</p>
                  </details>
                  {playable && (
<div className={s.energyActions}>
                    {game.minute === 0 && <a href="#studio-threads">调整 AI 对话数，释放预留 ↓</a>}
                    <button type="button" disabled={!!actionError(game, 0, { type: "rest" })} title={actionError(game, 0, { type: "rest" }) ?? "后台继续工作，60 分钟后恢复 3 点"} onClick={() => send({ type: "rest" })}>休息恢复 3 精力 · 60 分钟</button>
                    <a href="#end-day">去收工，结算后进入下一天 ↑</a>
                  </div>
)}
                </div>
)}
                <div className={s.market}>
                  {game.market.map((j) => {
                    const preview = claimEnergyPreview(game, j.id);
                    const hint = !playable ? "已收工 · 明天再接" : !human?.energy ? "精力不足 · 接单需 1 点" : preview?.hosting ? `接单 1 + AI 跟进 ${preview.hosting} = ${1 + preview.hosting} 精力` : preview?.waiting ? "接单 1 精力 · AI 将等待精力" : "接下项目 ↗ · 1 精力";
                    return (
<ProjectCard
                      key={j.id}
                      job={j}
                      day={game.day}
                      market
                      marketHint={hint}
                      disabled={!playable || !human?.energy}
                      onChoose={() => {
                        send({ type: "claim", project: j.id });
                        setSelectedProjects([j.id]);
                      }}
                    />
);
                  })}
                </div>
                <div className={s.benchFoot}>
                  <span>
                    已发布 <b>{human?.shipped.length}</b> 款作品
                  </span>
                  <span>
                    开源加成 <b>+{(human?.knowledge ?? 0) * 8}%</b> 研发速度
                  </span>
                  <span>
                    每周收入{" "}
                    <b>
                      $
                      {35 +
                        (human?.shipped.filter((j) => j.category === "personal")
                          .length ?? 0) *
                          15}
                    </b>
                  </span>
                </div>
              </section>

              <aside className={s.accounts} id="reset-accounts">
                <div className={s.sectionLabel}>
                  <span>03 / 我的账号</span>
                  <button onClick={() => setModal("shop")}>＋ 管理</button>
                </div>
                {human?.accounts.map((a, i) => (
                  <div
                    key={a.id}
                    className={`${s.account} ${account?.id === a.id ? s.activeAccount : ""}`}
                  >
                    <button
                      className={s.accountSelect}
                      onClick={() => setSelectedAccount(a.id)}
                      aria-pressed={account?.id === a.id}
                      aria-label={`选择账号 ${i + 1}`}
                    >
                      <span>ACCOUNT 0{i + 1}</span>
                      <strong>
                        {PLANS[a.tier].name}
                        <i>{account?.id === a.id ? "●" : "○"}</i>
                      </strong>
                    </button>
                    <div className={s.quota}>
                      <strong>
                        {quotaPercent(a)}<small>%</small>
                      </strong>
                      <span>
                        {activeAccount(game, a) ? "剩余额度" : "订阅到期"}
                      </span>
                    </div>
                    <div className={s.quotaBar}>
                      <i
                        style={{
                          width: `${quotaPercent(a)}%`,
                        }}
                      />
                    </div>
                    <div className={s.accountMeta}>
                      <span>↻ 自然重置</span>
                      <b>
                        D{a.nextReset}{" "}
                        <small> / {a.nextReset - game.day} 天后</small>
                      </b>
                    </div>
                    <div className={s.accountMeta}>
                      <span>▱ 银行券</span>
                      <b>
                        {a.banks.length} <small>张 · 无上限</small>
                      </b>
                    </div>
                    {a.banks.length > 0 && (
                      <div
                        className={`${s.expiry} ${a.banks[0] - game.day <= 5 ? s.urgent : ""}`}
                      >
                        最早 D{a.banks[0]} 过期 · 剩 {a.banks[0] - game.day} 天
                      </div>
                    )}
                    <small className={s.subscription}>
                      订阅至 D{a.paidUntil} ·{" "}
                      {activeAccount(game, a)
                        ? `还有 ${a.paidUntil - game.day + 1} 天`
                        : "需续费"}
                    </small>
                    <small className={s.subscription}>
                      {a.renewal === null
                        ? "到期不续订"
                        : `到期按 $${a.renewal} 自动续订`}
                    </small>
                    <details className={s.meter} data-testid="quota-observation">
                      <summary>用量观察 · 自动估算</summary>
                      <p>套餐 {PLANS[a.tier].capacity / PLANS[20].capacity}× · 只公布百分比，实际容量会波动。</p>
                      <p>{quotaObservation(a).config ?? "运行付费任务后开始采样"}</p>
                      <p>本段 {fmt(quotaObservation(a).tokens)}k token · 掉额 {Math.max(0, quotaObservation(a).drop)} 个百分点</p>
                      <p>{quotaObservation(a).fullLow === null ? "至少观察 2 个百分点后给出范围。" : `按本段配置，满额约 ${fmt(quotaObservation(a).fullLow!)}–${fmt(quotaObservation(a).fullHigh!)}k token。`}</p>
                      <small>游戏模拟 token；重置、换配置或口径变化会重新采样，估计不保证未来用量。</small>
                    </details>
                    {!activeAccount(game, a) && (
                      <button
                        className={s.renew}
                        onClick={() => setModal("shop")}
                      >
                        选择套餐重新开通 →
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className={s.bankButton}
                  disabled={!!bankError}
                  title={
                    bankError ??
                    "补满当前账号，不花时间或精力，不改变自然重置日"
                  }
                  onClick={() => send(bankAction)}
                >
                  ↻ 使用银行券 <small>免费操作</small>
                </button>
                <p className={s.bankHint}>
                  {bankError && playable
                    ? bankError
                    : "只补满选中账号。今晚若强制 reset，这张券可能就白用了。"}
                </p>
              </aside>
            </div>
          )}

          {game.phase === "plan" && human && (
            <section
              className={s.commandArea}
              id="reset-command"
              aria-label="队列调度"
            >
              <div className={s.commandTitle}>
                <span>工作室策略</span>
                <span>全局默认；单独设置的项目保留自己的配置。</span>
              </div>
              <div className={s.platformStrip} data-testid="platform-status">
                <strong>{(["luna", "sol", "astra"] as Model[]).map(m => modelEdition(game, m).name).join(" / ")}</strong>
                <span>{proClosed(game) ? "$200 已停售 · 老号连续续费保留" : game.platform.proDeadline ? `$200 新开窗口：D${game.platform.proDeadline} 早晨关闭` : "套餐 1× / 5× / 20× · 新模型自动升级"}</span>
              </div>
              <div className={s.studioSettings}>
                <label className={s.threadCount} htmlFor="studio-threads">
                  <span>同时开几个 AI 对话 <b>{studio?.threads ?? 1}</b></span>
                  <input
                    id="studio-threads"
                    type="range"
                    min="0"
                    max="6"
                    step="1"
                    value={studio?.threads ?? 1}
                    onChange={(e) => setStudio({ threads: Number(e.target.value) })}
                  />
                  <small>全工作室共用的 AI 对话总数，不是真人数量。每个工作中的对话每天占你 1–2 精力；0 个暂停全部。开工前可调少并退回预留，开工后已花精力不退；接单每项另需 1 点。</small>
                </label>
                <label className={s.policySelect} htmlFor="studio-policy">
                  <span>账号使用顺序</span>
                  <select
                    id="studio-policy"
                    value={studio?.accountPolicy ?? "soon-reset"}
                    onChange={(e) => setStudio({ accountPolicy: e.target.value as AccountPolicy })}
                  >
                    {ACCOUNT_POLICIES.map((policy) => (
                      <option key={policy.id} value={policy.id}>{policy.name}</option>
                    ))}
                  </select>
                  <small>{ACCOUNT_POLICIES.find((policy) => policy.id === studio?.accountPolicy)?.detail}</small>
                </label>
                <label className={s.policySelect} htmlFor="studio-configuration">
                  <span>全局模型策略</span>
                  <select
id="studio-configuration"
value={studio?.configuration ?? "fixed"}
                    onChange={e => setStudio({ configuration: e.target.value as Studio["configuration"] })}>
                    <option value="fixed">统一配置 · 手动决定</option>
                    <option value="adaptive">自动稳妥 · 按项目省额度</option>
                    <option value="premium">自动精品 · 品质与省心</option>
                  </select>
                  <small>{studio?.configuration === "premium" ? "用额度换品质和省心，优先选精品档；能力不足时尽力优化。已做进度的品质不会补刷。" : studio?.configuration === "adaptive" ? "熟悉后选 0% 风险的最省额配置；摸底时留余量。能力不足时尽力攻坚，仍会提示风险。" : "跟随全局的项目沿用下方配置；也可自动选档，偏重省额或精品。"}</small>
                </label>
                <label className={s.policySelect} htmlFor="studio-collaboration">
                  <span>单个项目最多几个 AI 对话合作</span>
                  <select
id="studio-collaboration"
value={studio?.collaboration ?? 1}
                    onChange={e => setStudio({ collaboration: Number(e.target.value) as Studio["collaboration"] })}>
                    <option value="1">最多 1 个 · 独立完成</option>
                    <option value="2">最多 2 个 · 一起做</option>
                    <option value="3">最多 3 个 · 集中协作</option>
                  </select>
                  <small>上限，不是额外开对话。先分头做不同项目，空闲对话再帮忙；2 个合计 1.7×、3 个 2.2× 速度。</small>
                </label>
                {studio?.accountPolicy === "preferred" && (
                  <label className={s.policySelect} htmlFor="studio-account">
                    <span>优先账号</span>
                    <select
                      id="studio-account"
                      value={studio.preferredAccount}
                      onChange={(e) => setStudio({ preferredAccount: Number(e.target.value) })}
                    >
                      {human.accounts.map((a, index) => (
                        <option key={a.id} value={a.id}>账号 {index + 1} · ${a.tier}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {studio?.configuration !== "fixed" && (
                <label className={s.autoTurbo} htmlFor="studio-turbo">
                  <input
id="studio-turbo"
type="checkbox"
checked={config.turbo}
                    onChange={e => send({ type: "configure", development: { ...config, turbo: e.target.checked }, keepAutomatic: true })} />
                  Turbo · 自动选档后额外加速，速度 ×2、每进度额度 ×2.5
                </label>
              )}
              <div id="development-presets" className={s.studioModes} role="group" aria-label="开发节奏">
                {([
                  { label: "慢跑省额", development: { model: "luna", effort: "medium", turbo: false } },
                  { label: "均衡开发", development: { model: "sol", effort: "medium", turbo: false } },
                  { label: "重置冲刺", development: { model: "astra", effort: "ultra", turbo: true } },
                ] as const).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    aria-pressed={studio?.configuration === "fixed" && config.model === preset.development.model && config.effort === preset.development.effort && config.turbo === preset.development.turbo}
                    onClick={() => send({ type: "configure", development: { ...preset.development } })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className={s.studioSummary}>慢跑省额 = 免费 Luna · Medium · 不开 Turbo。仍需跟进精力，难题可能返工；单独配置过的项目请在 <a href="#reset-project-settings" onClick={() => setProjectSettingsOpen(true)}>项目设置</a> 中切换或恢复跟随全局。</p>
              <details className={s.experienceNotes} data-testid="model-roadmap">
                <summary>近期模型路线 · 两到四周一次</summary>
                <p>轻量：GPT-5.6 Luna → GPT-6 Luna</p>
                <p>主力：GPT-5.6 Sol → GPT-6 Sol</p>
                <p>攻坚：GPT-6 Astra → GPT-6.1 Astra（虚构）</p>
                <p>21 / 42 天局从近期模型起步，每隔 14–28 天出现一次模型消息，有时两款一起上线。全系到 GPT-6 后，后续 6.1 明确标为虚构推演。发布间隔、免费 Luna、Ultra 协作和配额倍率均为游戏设定，不是官方日程或计费规则。</p>
                <a href="https://developers.openai.com/api/docs/models/gpt-5.6-luna" target="_blank" rel="noreferrer">OpenAI · GPT-5.6 Luna</a>{" · "}
                <a href="https://developers.openai.com/api/docs/models/gpt-6-luna" target="_blank" rel="noreferrer">OpenAI · GPT-6 Luna</a>
              </details>
              <details className={s.advancedSettings}>
                <summary>手动配置 · 选择模型或强度会切回统一配置</summary>
                <div className={s.commandRow}>
                  <div className={s.developmentControls}>
                  <div className={s.modes} role="group" aria-label="开发模型">
                    {(Object.keys(MODELS) as Model[]).map((m) => (
                      <button
                        key={m}
                        data-model={m}
                        aria-pressed={config.model === m}
                        className={config.model === m ? s.chosenMode : ""}
                        onClick={() => send({
                            type: "configure",
                            development: { ...config, model: m },
                          })}
                      >
                        <b>{modelEdition(game, m).name}</b>
                        <span>{MODELS[m].description} · 费率 {Math.round(modelEdition(game, m).price * 100)}%</span>
                      </button>
                    ))}
                  </div>
                  <div className={s.configRow}>
                    <label htmlFor="reset-effort">
                      投入强度
                      <select
                        id="reset-effort"
                        value={config.effort}
                        onChange={(e) => send({
                            type: "configure",
                            development: {
                              ...config,
                              effort: e.target.value as Effort,
                            },
                          })}
                      >
                        {(Object.keys(EFFORTS) as Effort[]).map((e) => (
                          <option key={e} value={e}>
                            {EFFORTS[e].name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label htmlFor="reset-turbo" className={s.turboToggle}>
                      <input
                        id="reset-turbo"
                        type="checkbox"
                        checked={config.turbo}
                        onChange={(e) => send({
                            type: "configure",
                            development: { ...config, turbo: e.target.checked },
keepAutomatic: true,
                          })}
                      />
                      <b>Turbo</b>
                      <span>速度 ×2 · 每进度额度 ×2.5</span>
                    </label>
                  </div>
                  <div
                    className={s.devPreview}
                    aria-live="polite"
                    data-testid="development-preview"
                  >
                    <span>
                      每小时 <b>{fmt(model.perHour)} 进度</b>
                    </span>
                    <span>
                      每小时{" "}
                      <b>
                        {model.tokensPerHour
                          ? `${fmt(model.tokensPerHour)}k token`
                          : "免费"}
                      </b>
                    </span>
                    <span className={assessment && assessment.max > 0 ? s.risk : ""}>
                      所选项目 <b>{assessment?.label ?? "—"}</b>
                    </span>
                    <small>{job ? `所选项目约 ${Math.ceil(model.minutes)} 分钟；掉额参考账号的用量观察` : "接单后显示项目预估"}</small>
                  </div>
                  <p className={s.configHint}>
                    {config.effort === "ultra"
                      ? "Ultra 协作攻坚：更快完成大型任务，消耗更多额度。"
                      : config.model === "luna"
                        ? "Luna Medium 关闭 Turbo 可免费慢蹬，简单大项目也能交付。"
                        : "思考加深提升解题能力；High 到 Max 会多花时间。"}{" "}
                    {studio?.configuration !== "fixed" ? "自动策略逐项选档，预估显示所选项目的实际配置。" : "全局配置应用于未单独设置的项目，按实际工作扣额。"}
                  </p>
                  </div>
                </div>
              </details>
              <p className={s.studioSummary}>
                {job ? `《${job.name}》当前` : "当前"} {model.name} · 每小时 {fmt(model.perHour)} 进度 · {model.tokensPerHour ? `${fmt(model.tokensPerHour)}k token / 时 · 费率 ${Math.round(modelEdition(game, effectiveConfig.model).price * 100)}%` : "免费"}
                {job ? ` ·《${job.name}》${assessment?.label} · ${qualityForecast(game, human, effectiveConfig, job)} · ${attentionCost(game, human, effectiveConfig, job)} 精力/对话/天` : ""}
              </p>
              <details className={s.experienceNotes} data-testid="experience-notes">
                <summary>工作室经验 · 自动积累，无需操作</summary>
                <p>每个项目完成首段 20 进度或发现 bug 后，摸清真实难点；每代模型累计完成 60 进度（含返工）后校准能力。换投入强度、开关 Turbo 不丢经验，模型换代需重新实测。</p>
                <div>{(["luna", "sol", "astra"] as Model[]).map(m => <span key={m}>{modelEdition(game, m).name} · {fmt(modelExperience(game, human, m))} / 60{modelExperience(game, human, m) >= 60 ? " · 已校准" : " · 摸底中"}</span>)}</div>
                <p>摸底阶段不会把估计当成 0% 风险；熟悉后显示的 0% 指后续开发，之前埋下的 bug 仍可能暴露。</p>
              </details>
              <div className={s.secondaryActions}>
                <div>
                  <button
                    id="rest"
                    disabled={!!actionError(game, 0, { type: "rest" })}
                    title={
                      actionError(game, 0, { type: "rest" }) ??
                      "后台照跑，每天一次"
                    }
                    onClick={() => send({ type: "rest" })}
                  >
                    休息 +3 精力 <small>60 分钟 · 每天一次</small>
                  </button>
                  <button
                    id="freelance"
                    disabled={!!actionError(game, 0, { type: "freelance" })}
                    onClick={() => send({ type: "freelance" })}
                  >
                    手写外包 +$25 <small>1 精力 / 60 分钟</small>
                  </button>
                  {job && (
                    <button
                      disabled={
                        !!actionError(game, 0, {
                          type: "test",
                          project: job.id,
                        })
                      }
                      onClick={() => send({ type: "test", project: job.id })}
                    >
                      亲自排障 <small>2 精力 / 30 分钟</small>
                    </button>
                  )}
                  {job && (
                    <button
                      className={s.abandon}
                      onClick={() => {
                        send({ type: "abandon", project: job.id });
                        setSelectedProjects((ids) => ids.filter((id) => id !== job.id),);
                      }}
                    >
                      放弃选中首项 <small>−2 VP</small>
                    </button>
                  )}
                </div>
                <a href="#end-day">回到时钟 ↑</a>
              </div>
            </section>
          )}

          {game.phase === "reveal" && game.receipt && (
            <section
              className={`${s.reveal} ${game.receipt.kind === "normal" ? s.resetReveal : ""}`}
              key={`reveal-${game.day}`}
            >
              <div className={s.revealSymbol}>
                {game.receipt.kind === "normal"
                  ? "↻"
                  : game.receipt.kind === "bank"
                    ? "▱"
                    : "☾"}
              </div>
              <div>
                <span className={s.eyebrow}>D{game.day} / NIGHT REVEAL</span>
                <h2>{game.receipt.title}</h2>
                <p>{game.receipt.text}</p>
                {game.receipt.gains.length > 0 && (
                  <div className={s.receiptNumbers}>
                    {game.receipt.gains.map((r) => (
                      <span key={r.player}>
                        {game.players[r.player].name}
                        <b>{game.receipt?.kind === "normal" ? "已补满" : `+${r.gained}`}</b>
                        <small>
                          {game.receipt?.kind === "normal" ? "有效账号" : "银行券"}
                        </small>
                      </span>
                    ))}
                  </div>
                )}
                {game.receipt.gains[0]?.collision && (
                  <p className={s.collision}>
                    撞车了！你今天刚用过银行券。免费补满来得有点晚。
                  </p>
                )}
              </div>
              <button id="next-day" className={s.primary} onClick={advance}>
                {game.day === game.length
                  ? "查看最终排名"
                  : `进入第 ${game.day + 1} 天`}{" "}
                →
              </button>
            </section>
          )}

          <div className={s.status} role="status" aria-live="polite">
            <span className={s.statusDot} />
            {game.message}
          </div>
          <details className={s.journal}>
            <summary>
              开发日志 <span>最近 {game.logs.length} 条 · 点击展开</span>
            </summary>
            <div>
              {game.logs.slice(0, 30).map((l, i) => (
                <p
                  key={`${l.day}-${i}`}
                  className={l.player === 0 ? s.ownLog : ""}
                >
                  <span>
                    D{String(l.day).padStart(2, "0")} {timeLabel(l.minute)}
                  </span>
                  {l.text}
                </p>
              ))}
            </div>
          </details>
        </>
      )}

      {game && game.phase !== "over" && (
        <nav className={s.quickNav} aria-label="牌桌快捷跳转">
          <a href="#reset-workbench">工作台</a>
          <a href="#reset-accounts">账号 / 银行券</a>
          <a href={game.phase === "plan" ? "#reset-command" : "#next-day"}>
            {game.phase === "plan" ? "调度 ↓" : "夜间揭晓 ↓"}
          </a>
        </nav>
      )}
      <footer className={s.footer}>
        <span>
          RESET / 开蹬！ <i>v0.9 · 近期模型</i>
        </span>
        <span>
          {game
            ? saved
              ? "● 牌局已自动保存"
              : "本次未能保存，请勿关闭页面"
            : "虚构桌游 · 金额与额度均为游戏资源"}
          <i> / </i>F 全屏
        </span>
      </footer>

      {modal === "rules" && (
        <Modal title="怎样蹬出一局好游戏" close={close}>
          <Rules />
        </Modal>
      )}
      {modal === "finish" && game && human && (
        <Modal title="今天确定收工吗？" close={close}>
          <p className={s.modalCopy}>今天还剩 {DAY_MINUTES - game.minute} 分钟、{human.energy} 精力。确认后，后台任务会运行到 17:00，然后揭牌；中途不再停下让你补给。</p>
          <p className={s.modalCopy}>额度耗尽也能继续：有效账号还有 {human.accounts.filter(a => activeAccount(game, a)).reduce((n, a) => n + a.banks.filter(d => d > game.day).length, 0)} 张可用银行券；也可切免费 Luna，或用 1 精力和 60 分钟手写外包赚 $25。免费 Luna 仍需要跟进精力，难题可能返工。</p>
          <div className={s.modalButtons}>
            <button className={s.primary} onClick={close}>继续安排今天</button>
            <button id="confirm-end-day" className={s.textButton} onClick={reveal}>确认收工并揭牌</button>
          </div>
        </Modal>
      )}
      {modal === "restart" && (
        <Modal title="收起这桌，开新一局" close={close}>
          <p className={s.modalCopy}>{i18n.t("restartCopy")}</p>
          <div className={s.modalButtons}>
            <button
              className={s.primary}
              onClick={() => {
                setGame(null);
                setModal(null);
                setSeed(String((Number(seed) || 260926) + 1));
                try {
                  localStorage.removeItem(SAVE_KEY);
                  localStorage.removeItem(V4_SAVE_KEY);
                  localStorage.removeItem(V3_SAVE_KEY);
                  localStorage.removeItem(LEGACY_SAVE_KEY);
                  localStorage.removeItem(V2_SAVE_KEY);
                } catch {
                  setSaved(false);
                }
              }}
            >
              回到准备页
            </button>
            <button className={s.textButton} onClick={close}>
              继续这一局
            </button>
          </div>
        </Modal>
      )}
      {modal === "shop" && game && human && (
        <Modal title="账号管理" close={close}>
          {onboarding && (
            <div className={s.welcome}>
              <b>先给工作室配好账号。</b>
              <p>
                你已有一个 $20 账号和 $480
                现金。可直接开工，也可先升级或买新号；以后随时回来调整。
              </p>
            </div>
          )}
          <p className={s.modalCopy}>
            现金 <b>${human.cash}</b> · 账号管理不花精力或时间 ·
            一个账号可带多个 AI 对话
          </p>
          <p className={s.shopNotice} data-testid="subscription-notice">
            {proClosed(game) ? "$200 已停止新开和升级。仅现有 $200 账号可连续续费；断订或实际降档后失去资格。" : game.platform.proDeadline ? `$200 将于 D${game.platform.proDeadline} 早晨停售；现在仍可开通或升级。` : "$20 = 1×，$100 = 5×，$200 = 20×。界面只显示剩余百分比，真实可用量以运行观察估计。"}
          </p>
          <div className={s.managedAccounts}>
            {human.accounts.map((a, index) => (
              <section
                className={s.managedAccount}
                data-managed-account={a.id}
                key={a.id}
              >
                <div className={s.managedHead}>
                  <h3>
                    账号 {index + 1} <span>{PLANS[a.tier].name}</span>
                  </h3>
                  <b>
                    {activeAccount(game, a)
                      ? `${quotaPercent(a)}% 剩余 · ${PLANS[a.tier].capacity / PLANS[20].capacity}×`
                      : "已暂停"}
                  </b>
                </div>
                <p>
                  {activeAccount(game, a)
                    ? `订阅至 D${a.paidUntil} · 自然重置 D${a.nextReset}`
                    : "选择任意档位续开，恢复满额"}{" "}
                  · {a.banks.length} 张银行券
                </p>
                <div className={s.accountOperations}>
                  <button
                    disabled={!!actionError(game, 0, { type: "bank", account: a.id })}
                    title={actionError(game, 0, { type: "bank", account: a.id }) ?? "不花精力或时间；每天不限次数"}
                    onClick={() => send({ type: "bank", account: a.id })}
                  >
                    为此账号补满 · 用 1 张券
                  </button>
                  {([20, 100, 200] as Tier[])
                    .filter((t) => !activeAccount(game, a) || t > a.tier)
                    .map((t) => {
                      const action: Action = {
                        type: activeAccount(game, a) ? "upgrade" : "renew",
                        account: a.id,
                        tier: t,
                      };
                      const why = actionError(game, 0, action);
                      return (
                        <button
                          key={t}
                          disabled={!!why}
                          title={why ?? "只付套餐费用，不花精力或时间"}
                          onClick={() => send(action)}
                        >
                          {activeAccount(game, a)
                            ? `补 $${t - a.tier} → ${PLANS[t].name}`
                            : `$${t} 续开 ${PLANS[t].name}`}
                        </button>
                      );
                    })}
                </div>
                <label htmlFor={`renewal-${a.id}`} className={s.renewalPolicy}>
                  到期后
                  <select
                    id={`renewal-${a.id}`}
                    aria-label={`账号 ${index + 1} 到期方案`}
                    data-renewal={a.id}
                    value={a.renewal ?? 0}
                    onChange={(e) => send({
                        type: "renewal",
                        account: a.id,
                        tier:
                          Number(e.target.value) === 0
                            ? null
                            : (Number(e.target.value) as Tier),
                      })}
                  >
                    {([20, 100, 200] as Tier[]).map((t) => (
                      <option key={t} value={t} disabled={t === 200 && proClosed(game) && !canKeepPro(game, a)}>
                        ${t} / 30 天
                        {t < a.tier
                          ? " · 到期降档"
                          : t > a.tier
                            ? " · 到期升档"
                            : " · 保持此档"}
                      </option>
                    ))}
                    <option value={0}>不续订 · 到期停用</option>
                  </select>
                  <small>免费调整</small>
                </label>
                <p className={s.policyHint}>
                  {a.renewal === null
                    ? "到期清空额度并停用，银行券仍按原日期过期。"
                    : activeAccount(game, a)
                      ? `D${a.paidUntil + 1} 自动扣 $${a.renewal}，恢复 100%；余额不足则暂停。${a.tier === 200 ? "停售后请保持连续续费。" : ""}`
                      : "已暂停的账号需手动续开；仅改到期方案不会扣款。"}
                </p>
              </section>
            ))}
          </div>
          <h3 className={s.shopTitle}>
            加一个新账号 <small>{human.accounts.length} / 3</small>
          </h3>
          <div className={s.shopPlans}>
            {([20, 100, 200] as Tier[]).map((t) => (
              <div key={t}>
                <span>{PLANS[t].name}</span>
                <strong>${t}</strong>
                <p>
                  {PLANS[t].capacity / PLANS[20].capacity}× 额度 / 7 天<br />
                  订阅有效 30 天
                </p>
                <button
                  disabled={!!actionError(game, 0, { type: "buy", tier: t })}
                  title={actionError(game, 0, { type: "buy", tier: t }) ?? "开通后从 100% 开始"}
                  onClick={() => {
                    send({ type: "buy", tier: t });
                  }}
                >
                  开新号 · 只花钱
                </button>
              </div>
            ))}
          </div>
          <p className={s.policyHint}>
            升级只补容量差额、保留到期与重置日。到期续订会重新开始 30 天订阅和 7
            天周期；银行券期限始终不变。
          </p>
          <p className={s.shopFeedback} role="status">
            {game.message}
          </p>
          <div className={s.modalButtons}>
            <button className={s.primary} onClick={close}>
              {onboarding ? "就这样，开始开发 →" : "回到牌桌 →"}
            </button>
          </div>
        </Modal>
      )}
      {modal === "portfolio" && game && (
        <Modal title={`${game.players[inspect].name}的开发履历`} close={close}>
          <div className={s.portfolio}>
            <p>
              当前总分 <b>{score(game.players[inspect]).total} VP</b> · 算力点{" "}
              {fmt(game.players[inspect].used)} · 开源效率 +
              {game.players[inspect].knowledge * 8}%
            </p>
            <p className={s.muted}>
              总分含当前现金、多样性与算力分；实际以终局资源结算。
            </p>
            {game.players[inspect].shipped.length ? (
              game.players[inspect].shipped.map((j) => (
                <div key={j.id}>
                  <span>{CATEGORIES[j.category].name}</span>
                  <b>{j.name}</b>
                  <strong>{j.delivery?.grade ?? "合格"} · +{j.delivery?.vp ?? j.vp} VP · +${j.delivery?.cash ?? j.cash}</strong>
                </div>
              ))
            ) : (
              <p>第一款作品，还在路上。</p>
            )}
            <h3>进行中</h3>
            {game.players[inspect].projects.map((j) => (
              <div key={j.id}>
                <span>{CATEGORIES[j.category].name}</span>
                <b>{j.name}</b>
                <strong>
                  {fmt(j.work)}/{j.need}
                </strong>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </main>
    </Translated>
    </ResetLocaleContext.Provider>
    </I18nextProvider>
  );
}
