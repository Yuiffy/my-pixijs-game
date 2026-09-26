"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  act,
  actionError,
  actionsLeft,
  activeAccount,
  CATEGORIES,
  createGame,
  endDay,
  MODELS,
  EFFORTS,
  DIFFICULTIES,
  DEFAULT_DEVELOPMENT,
  developmentStats,
  LEGACY_SAVE_KEY,
  nextDay,
  PLANS,
  restoreGame,
  SAVE_KEY,
  score,
  textState,
  type Action,
  type Category,
  type Game,
  type Model,
  type Effort,
  type Project,
  type Tier,
} from "./engine";
import s from "./resetRush.module.css";

const STRATEGIES = ["独立开发者", "开源效率流", "极限冲刺流", "多号银行流"];
type ModalKind = "rules" | "shop" | "restart" | "early" | "portfolio" | null;

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
      {children}
    </dialog>
  );
}

function Rules() {
  return (
    <div className={s.rules}>
      <p className={s.lead}>
        先看消息，再把额度变成作品。
        <br />
        每天只有 3 个行动，别浪费那次 reset。
      </p>
      <ol>
        <li>
          <strong>早晨看风向。</strong>
          消息可能立即重置、发银行券，或给出今晚赠礼概率。概率是准确的；谜语并不是承诺。
        </li>
        <li>
          <strong>轮流做 3 个行动。</strong>你和 3 位 AI
          逐次行动，每日轮换先手。开发、测试、接项目、购买/升级/续费、外包，各用
          1 行动。切换账号、调整开发配置与到期方案免费；用银行券免费，每号每天最多用 1 张。
        </li>
        <li>
          <strong>夜里翻牌。</strong>先按消息概率决定是否送礼，再抽重置牌：初始
          4 张直接 reset、2 张 banked reset，用完洗回。赠礼影响所有有效账号。
        </li>
      </ol>
      <h3>两个时钟，才是这局的核心</h3>
      <p>
        每个账号从开通日起，每 7 天自然补满。直接 reset
        与银行券都不改变这个日期，余额不叠加。银行券绑定账号、30 天有效、最多存
        3 张，优先用最早到期的。刚用券又撞上直接
        reset，不会扣分，但白白浪费了补满空间。
      </p>
      <p>
        每人都从 $20 账号和 $480 现金起步。订阅有效 30 天，可随时安排到期续订某档或停订。
        自动续订不花行动，按所选档位扣费、补满并重新计时；余额不足则暂停，之后需手动续开。
        升级只收差价、增加容量差额，保留两个日期。停订后的银行券仍按原日期过期。
      </p>
      <h3>模型 × 思考强度 × Turbo</h3>
      <p>
        三种模型都能选择 Low 到 Ultra，并独立勾选 Turbo。思考越深越能胜任难题，但额度更贵。
        Turbo 把速度折算成单次行动约 1.8 倍产出、双倍额度，不改变 bug 概率。
        Luna + Medium、不勾 Turbo 永远免费，每次 3 进度；Luna 的 High 以上和 Turbo 仍需额度。
      </p>
      <h3>作品才是胜利点</h3>
      <p>
        项目分简单、常规、复杂、攻坚四档。规模与难度是两回事：大而简单的项目可用 Luna 慢慢做。
        能力不足时，每次开发按面板所示概率产生 1 个 bug；更强模型与更深思考能降低风险。
        进度完成且无 bug 自动发布。测试一次修复 2 个 bug、+2 进度。最多同时做 2 个项目。公司项目有 8 天交付，超期撤单扣
        3 声望；主动放弃用 1 行动、扣 2 声望。
      </p>
      <div className={s.ruleCategories}>
        {(Object.keys(CATEGORIES) as Category[]).map((k) => (
          <p key={k}>
            <strong>{CATEGORIES[k].name}</strong>
            {CATEGORIES[k].perk}
          </p>
        ))}
      </div>
      <p>
        每 7 天发 $35 周薪，每个已发布个人项目再
        +$15。公共里程碑先到先得。结束时：声望（含首发奖）+ 四类作品 12 分 /
        三类 5 分 + 每 $100 现金 1 分（最多 10）+ 每消耗 120 额度 1 分（最多
        10）。未发布项目不计分；同分共享名次。
      </p>
      <p className={s.muted}>
        本作是开发者文化主题的虚构桌游。套餐、模型、概率与 tibo
        台词均为游戏设定；没有真实充值、账号或服务调用。
      </p>
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
}: {
  job: Project;
  selected?: boolean;
  market?: boolean;
  day: number;
  onChoose: () => void;
  disabled?: boolean;
}) {
  return (
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
      <span className={s.difficulty} data-difficulty={job.difficulty}>{"◆".repeat(job.difficulty)} {DIFFICULTIES[job.difficulty]}</span>
      <span className={s.projectPerk}>
        {market
          ? CATEGORIES[job.category].perk
          : job.deadline !== null
            ? `D${job.deadline} 截止 · 剩 ${job.deadline - day + 1} 天`
            : CATEGORIES[job.category].perk}
      </span>
      <span className={s.projectReward}>
        <span>
          {market ? `${job.need} 进度` : `${job.work} / ${job.need} 进度`}
        </span>
        <span>+${job.cash}</span>
      </span>
      {!market && (
        <span className={s.progress}>
          <i style={{ width: `${(100 * job.work) / job.need}%` }} />
        </span>
      )}
      <span className={s.cardFooter}>
        {market
          ? "接下项目 ↗ · 1 行动"
          : job.bugs
            ? `${job.bugs} 个 bug 待测试`
            : selected
              ? "● 当前开发目标"
              : "选择这个项目"}
      </span>
    </button>
  );
}

export default function ResetRush() {
  const [game, setGame] = useState<Game | null>(null);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const [length, setLength] = useState(42);
  const [seed, setSeed] = useState("260926");
  const [modal, setModal] = useState<ModalKind>(null);
  const [inspect, setInspect] = useState(0);
  const [selectedProject, setSelectedProject] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState(0);
  const [onboarding, setOnboarding] = useState(false);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      setGame(restoreGame(localStorage.getItem(SAVE_KEY)) ?? restoreGame(localStorage.getItem(LEGACY_SAVE_KEY)));
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
    w.advanceTime = () => {
      /* Turn-based: elapsed time never spends a player's actions. */
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
    setGame(createGame(Number(seed) || 260926, length));
    setOnboarding(true);
    setModal("shop");
    setSelectedProject(0);
    setSelectedAccount(0);
  };
  const send = (a: Action) => setGame((g) => (g ? act(g, a) : g));
  const human = game?.players[0];
  const job =
    human?.projects.find((j) => j.id === selectedProject) ?? human?.projects[0];
  const account =
    human?.accounts.find((a) => a.id === selectedAccount) ?? human?.accounts[0];
  const playable =
    !!game && game.phase === "plan" && game.order[game.cursor] === 0;
  const config = game?.development ?? DEFAULT_DEVELOPMENT;
  const model = game && human ? developmentStats(game, human, config, job) : { work: 0, cost: 0, risk: 0, ability: 0 };
  const devAction: Action = {
    type: "develop",
    project: job?.id ?? -1,
    account: account?.id ?? -1,
    ...config,
  };
  const error = game ? actionError(game, 0, devAction) : null;
  const bankAction: Action = { type: "bank", account: account?.id ?? -1 };
  const bankError = game ? actionError(game, 0, bankAction) : null;
  const normalCards = game?.resetDeck.filter((c) => c === "normal").length ?? 4;
  const bankCards = game?.resetDeck.filter((c) => c === "bank").length ?? 2;
  const totalCards = normalCards + bankCards;
  const close = () => { setModal(null); setOnboarding(false); };
  const advance = () => {
    setGame((g) => (g ? nextDay(g) : g));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const reveal = () => {
    setGame((g) => (g ? endDay(g) : g));
    setModal(null);
  };

  return (
    <main ref={root} className={s.root}>
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
          {game && game.phase !== "over" && <button onClick={() => setModal("shop")}>账号管理</button>}
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
              tibo 发了一条谜语。你有三个行动、两个账号，
              <br className={s.desktopOnly} />
              和一个还没写完的碉游。现在，蹬不蹬？
            </p>
            <div className={s.setup}>
              <p className={s.startingKit}><strong>一个 $20 账号，$480 现金。</strong><span>先入座，再决定升档、加号，还是小步慢蹬。</span></p>
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
              1 人 + 3 位性格不同的 AI · 自动保存 · 随时收工再来
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
                42 进度 <span>+$35</span>
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
                选一个号，开蹬<small>七天时钟，三十天银行券。</small>
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
                  第 {Math.ceil(game.day / 7)} 周 / 共 {game.length / 7} 周
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
                  ? "你的剩余行动"
                  : game.phase === "reveal"
                    ? "夜间结算"
                    : "开发季结束"}
              </span>
              <strong>
                {game.phase === "plan" ? (
                  <>
                    {Array.from({ length: 3 }, (_, i) => (
                      <i
                        key={i}
                        className={i < actionsLeft(game) ? s.actionOn : ""}
                      />
                    ))}
                  </>
                ) : (
                  "✦"
                )}
              </strong>
            </div>
          </div>

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
                {game.length} 天，{human?.shipped.length} 个作品，{human?.used}{" "}
                额度。下一局，读懂另一种风向。
              </p>
              <div className={s.scoreTable}>
                <table>
                  <thead>
                    <tr>
                      <th>开发者</th>
                      <th>声望与奖项</th>
                      <th>多样性</th>
                      <th>现金</th>
                      <th>额度</th>
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
                免费重置共补回 {human?.resetGain} 额度 · 用掉{" "}
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
                  {game.phase === 'plan' && game.receipt?.gains[0] && <p className={s.morningGift}>早晨已到账：+{game.receipt.gains[0].gained} {game.receipt.kind === 'normal' ? '额度' : '张银行券'}{game.receipt.kind === 'bank' && game.receipt.gains[0].unused > 0 ? `（${game.receipt.gains[0].unused} 张超出仓位）` : ''}</p>}
                </article>
                <div className={s.deck}>
                  <span className={s.deckIcon}>↻</span>
                  <div>
                    <strong>重置牌堆</strong>
                    <p>
                      直接补满 <b>{totalCards ? normalCards : 4}</b> <i>/</i>{" "}
                      银行券 <b>{totalCards ? bankCards : 2}</b>
                    </p>
                    <small>
                      {totalCards
                        ? "抽过的牌不放回，用完再洗"
                        : "已抽空，下次重新洗回 6 张"}
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
                  <span>02 / 我的工作台</span>
                  <span>{human?.projects.length} / 2 项目</span>
                </div>
                <div className={`${s.activeProjects} ${human?.projects.length === 0 ? s.noProjects : ''}`}>
                  {human?.projects.map((j) => (
                    <ProjectCard
                      key={j.id}
                      job={j}
                      day={game.day}
                      selected={job?.id === j.id}
                      onChoose={() => setSelectedProject(j.id)}
                    />
                  ))}
                  {(human?.projects.length ?? 0) < 2 && (
                    <div className={s.emptyProject}>
                      <span>＋</span>
                      <p>下一个好点子</p>
                      <small>
                        从下面的公共项目池接单
                        <br />
                        需要 1 个行动
                      </small>
                    </div>
                  )}
                </div>
                <div className={s.marketHead}>
                  <div>
                    <h2>
                      公共项目池 <span>THE NEXT BIG THING</span>
                    </h2>
                    <p>每天最旧项目换新。每次行动后，电脑也会出手。</p>
                  </div>
                  <span>↓ 接单</span>
                </div>
                <div className={s.market}>
                  {game.market.map((j) => (
                    <ProjectCard
                      key={j.id}
                      job={j}
                      day={game.day}
                      market
                      disabled={!playable || (human?.projects.length ?? 0) >= 2}
                      onChoose={() => {
                        send({ type: "claim", project: j.id });
                        setSelectedProject(j.id);
                      }}
                    />
                  ))}
                </div>
                <div className={s.benchFoot}>
                  <span>
                    已发布 <b>{human?.shipped.length}</b> 款作品
                  </span>
                  <span>
                    开源加成 <b>+{human?.knowledge}</b> / 次开发
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
                  <button onClick={() => setModal("shop")}>
                    ＋ 管理
                  </button>
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
                        {a.quota}
                        <small> / {PLANS[a.tier].capacity}</small>
                      </strong>
                      <span>
                        {activeAccount(game, a) ? "剩余额度" : "订阅到期"}
                      </span>
                    </div>
                    <div className={s.quotaBar}>
                      <i
                        style={{
                          width: `${(100 * a.quota) / PLANS[a.tier].capacity}%`,
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
                        {a.banks.length} <small>/ 3 张</small>
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
                    <small className={s.subscription}>{a.renewal === null ? "到期不续订" : `到期按 $${a.renewal} 自动续订`}</small>
                    {!activeAccount(game, a) && <button className={s.renew} onClick={() => setModal("shop")}>选择套餐重新开通 →</button>}
                  </div>
                ))}
                <button
                  className={s.bankButton}
                  disabled={!!bankError}
                  title={
                    bankError ?? "补满当前账号，不花行动，不改变自然重置日"
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

          {game.phase === "plan" && (
            <section className={s.commandArea} id="reset-command" aria-label="开发操作">
              <div className={s.commandTitle}>
                <span>现在，怎么蹬？</span>
                <span>
                  目标：{job?.name ?? "先从项目池接一个项目"}
                  <i> / </i>账号{" "}
                  {Math.max(
                    1,
                    (human?.accounts.findIndex((a) => a.id === account?.id) ??
                      0) + 1,
                  )}
                </span>
              </div>
              <div className={s.commandRow}>
                <div className={s.developmentControls}>
                <div className={s.modes} role="group" aria-label="开发模型">
                  {(Object.keys(MODELS) as Model[]).map((m) => {
                    const stats = MODELS[m];
                    return (
                      <button
                        key={m}
                        data-model={m}
                        aria-pressed={config.model === m}
                        className={config.model === m ? s.chosenMode : ""}
                        onClick={() => send({ type: "configure", development: { ...config, model: m } })}
                      >
                        <b>{stats.name}</b>
                        <span>{stats.description}</span>
                      </button>
                    );
                  })}
                </div>
                <div className={s.configRow}>
                  <label htmlFor="reset-effort">思考强度<select id="reset-effort" value={config.effort} onChange={e => send({ type: "configure", development: { ...config, effort: e.target.value as Effort } })}>{(Object.keys(EFFORTS) as Effort[]).map(e => <option key={e} value={e}>{EFFORTS[e].name}</option>)}</select></label>
                  <label htmlFor="reset-turbo" className={s.turboToggle}><input id="reset-turbo" type="checkbox" checked={config.turbo} onChange={e => send({ type: "configure", development: { ...config, turbo: e.target.checked } })} /><b>Turbo</b><span>更快 · 更多额度</span></label>
                </div>
                <div className={s.devPreview} aria-live="polite" data-testid="development-preview">
                  <span>消耗 <b>{model.cost ? `${model.cost} 额度` : "免费"}</b></span>
                  <span>进度 <b>+{job ? Math.min(model.work, job.need - job.work) : model.work}</b></span>
                  <span className={model.risk > 0 ? s.risk : ""}>bug 风险 <b>{job ? `${model.risk}%` : "—"}</b></span>
                  <small>{job ? `${DIFFICULTIES[job.difficulty]}任务 · 能力 ${model.ability.toFixed(1)} / 难度 ${job.difficulty}` : "选一个项目查看风险"}</small>
                </div>
                {config.model === "luna" && <p className={s.configHint}>Medium、不勾 Turbo 可免费慢蹬；High 以上与加速会消耗额度。</p>}
                </div>
                <button
                  id="develop"
                  className={s.develop}
                  disabled={!!error}
                  onClick={() => send(devAction)}
                >
                  <span>立即开蹬 ↗</span>
                  <small>1 行动 · {model.cost ? `−${model.cost} 额度` : "免费开发"}</small>
                </button>
              </div>
              <div className={s.secondaryActions}>
                <div>
                  <button
                    disabled={!playable || !job?.bugs}
                    onClick={() => job && send({ type: "test", project: job.id })}
                  >
                    测试修 bug <small>1 行动</small>
                  </button>
                  <button
                    disabled={!playable}
                    onClick={() => send({ type: "freelance" })}
                  >
                    手写外包 +$25 <small>1 行动</small>
                  </button>
                  {job && (
                    <button
                      disabled={!playable}
                      className={s.abandon}
                      onClick={() => send({ type: "abandon", project: job.id })}
                    >
                      放弃项目 <small>−2 VP / 1 行动</small>
                    </button>
                  )}
                </div>
                <button
                  id="end-day"
                  className={s.endDay}
                  onClick={() => (actionsLeft(game) ? setModal("early") : reveal())}
                >
                  {actionsLeft(game) ? "提前收工" : "结束今日，揭牌"}{" "}
                  <span>→</span>
                </button>
              </div>
              {error && playable && <p className={s.actionHint}>{error}</p>}
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
                        <b>+{r.gained}</b>
                        <small>
                          {game.receipt?.kind === "normal" ? "额度" : "银行券"}
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
                  <span>D{String(l.day).padStart(2, "0")}</span>
                  {l.text}
                </p>
              ))}
            </div>
          </details>
        </>
      )}

      {game && game.phase !== 'over' && <nav className={s.quickNav} aria-label="牌桌快捷跳转"><a href="#reset-workbench">工作台</a><a href="#reset-accounts">账号 / 银行券</a><a href={game.phase === 'plan' ? '#reset-command' : '#next-day'}>{game.phase === 'plan' ? '开蹬 ↓' : '夜间揭晓 ↓'}</a></nav>}
      <footer className={s.footer}>
        <span>
          RESET / 开蹬！ <i>v0.2</i>
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
      {modal === "early" && (
        <Modal
          title={`今天还有 ${game ? actionsLeft(game) : 0} 个行动`}
          close={close}
        >
          <p className={s.modalCopy}>
            未用行动会消失，电脑仍会完成各自的行动，然后揭晓今晚的消息。
          </p>
          <div className={s.modalButtons}>
            <button className={s.primary} onClick={close}>
              再蹬一会儿
            </button>
            <button className={s.textButton} onClick={reveal}>
              确认收工并揭牌 →
            </button>
          </div>
        </Modal>
      )}
      {modal === "restart" && (
        <Modal title="收起这桌，开新一局" close={close}>
          <p className={s.modalCopy}>
            当前牌局的自动存档会被新局替换。新局从 $20 账号起步，可重新选择赛程和种子。
          </p>
          <div className={s.modalButtons}>
            <button
              className={s.primary}
              onClick={() => {
                setGame(null);
                setModal(null);
                setSeed(String((Number(seed) || 260926) + 1));
                try {
                  localStorage.removeItem(SAVE_KEY);
                  localStorage.removeItem(LEGACY_SAVE_KEY);
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
          {onboarding && <div className={s.welcome}><b>先给工作室配好账号。</b><p>你已有一个 $20 账号和 $480 现金。可直接开工，也可先升级或买新号；以后随时回来调整。</p></div>}
          <p className={s.modalCopy}>
            现金 <b>${human.cash}</b> · 今日剩 <b>{actionsLeft(game)} 行动</b> · 开通/升级/手动续开各用 1 行动
          </p>
          <div className={s.managedAccounts}>
            {human.accounts.map((a, index) => (
<section className={s.managedAccount} data-managed-account={a.id} key={a.id}>
              <div className={s.managedHead}><h3>账号 {index + 1} <span>{PLANS[a.tier].name}</span></h3><b>{activeAccount(game, a) ? `${a.quota} / ${PLANS[a.tier].capacity} 额度` : "已暂停"}</b></div>
              <p>{activeAccount(game, a) ? `订阅至 D${a.paidUntil} · 自然重置 D${a.nextReset}` : "选择任意档位续开，恢复满额"} · {a.banks.length} 张银行券</p>
              <div className={s.accountOperations}>
                {([20, 100, 200] as Tier[]).filter(t => !activeAccount(game, a) || t > a.tier).map(t => {
                  const action: Action = { type: activeAccount(game, a) ? "upgrade" : "renew", account: a.id, tier: t };
                  const why = actionError(game, 0, action);
                  return <button key={t} disabled={!!why} title={why ?? "使用 1 行动"} onClick={() => send(action)}>{activeAccount(game, a) ? `补 $${t - a.tier} → ${PLANS[t].name}` : `$${t} 续开 ${PLANS[t].name}`}</button>;
                })}
              </div>
              <label htmlFor={`renewal-${a.id}`} className={s.renewalPolicy}>到期后<select id={`renewal-${a.id}`} aria-label={`账号 ${index + 1} 到期方案`} data-renewal={a.id} value={a.renewal ?? 0} onChange={e => send({ type: "renewal", account: a.id, tier: Number(e.target.value) === 0 ? null : Number(e.target.value) as Tier })}>
                {([20, 100, 200] as Tier[]).map(t => <option key={t} value={t}>${t} / 30 天{t < a.tier ? " · 到期降档" : t > a.tier ? " · 到期升档" : " · 保持此档"}</option>)}
                <option value={0}>不续订 · 到期停用</option>
              </select><small>免费调整</small></label>
              <p className={s.policyHint}>{a.renewal === null ? "到期清空额度并停用，银行券仍按原日期过期。" : activeAccount(game, a) ? `D${a.paidUntil + 1} 自动扣 $${a.renewal}，补满 ${PLANS[a.renewal].capacity} 额度；余额不足则暂停。` : "已暂停的账号需手动续开；仅改到期方案不会扣款。"}</p>
            </section>
))}
          </div>
          <h3 className={s.shopTitle}>加一个新账号 <small>{human.accounts.length} / 3</small></h3>
          <div className={s.shopPlans}>
            {([20, 100, 200] as Tier[]).map((t) => (
              <div key={t}>
                <span>{PLANS[t].name}</span>
                <strong>${t}</strong>
                <p>
                  {PLANS[t].capacity} 额度 / 7 天<br />
                  订阅有效 30 天
                </p>
                <button
                  disabled={!!actionError(game, 0, { type: "buy", tier: t })}
                  onClick={() => {
                    send({ type: "buy", tier: t });
                  }}
                >
                  开新号 · 1 行动
                </button>
              </div>
            ))}
          </div>
          <p className={s.policyHint}>升级只补容量差额、保留到期与重置日。到期续订会重新开始 30 天订阅和 7 天周期；银行券期限始终不变。</p>
          <p className={s.shopFeedback} role="status">{game.message}</p>
          <div className={s.modalButtons}><button className={s.primary} onClick={close}>{onboarding ? "就这样，开始开发 →" : "回到牌桌 →"}</button></div>
        </Modal>
      )}
      {modal === "portfolio" && game && (
        <Modal title={`${game.players[inspect].name}的开发履历`} close={close}>
          <div className={s.portfolio}>
            <p>
              当前总分 <b>{score(game.players[inspect]).total} VP</b> · 消耗额度{" "}
              {game.players[inspect].used} · 开源效率 +
              {game.players[inspect].knowledge}
            </p>
            <p className={s.muted}>
              总分含当前现金、多样性与额度分；实际以终局资源结算。
            </p>
            {game.players[inspect].shipped.length ? (
              game.players[inspect].shipped.map((j) => (
                <div key={j.id}>
                  <span>{CATEGORIES[j.category].name}</span>
                  <b>{j.name}</b>
                  <strong>+{j.vp} VP</strong>
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
                  {j.work}/{j.need}
                </strong>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </main>
  );
}
