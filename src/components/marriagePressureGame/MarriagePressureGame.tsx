"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import GameShareButton from "@/app/game/GameShareButton";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckOutlined,
  FireOutlined,
  FullscreenOutlined,
  HomeOutlined,
  MobileOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { ACTIVITIES } from "./activities";
import { CANDIDATES, DIFFICULTIES, GAME_TITLE, STAGE_LABELS } from "./content";
import { getAgeAtTurn, getEndingReason } from "./engine";
import type { Difficulty, GameMode, MarriageGameState } from "./types";
import { getBalanceLabel } from "./growth";
import CandidateCatalog from "./CandidateCatalog";
import ClassicBoard, { CandidatePortrait } from "./ClassicBoard";
import { pickInitialName, useMarriageGame } from "./useMarriageGame";
import styles from "./marriage.module.css";

// 沉浸版包含 WebGL 场景，只在浏览器端加载
const ImmersiveGame = dynamic(() => import("./immersive/ImmersiveGame"), {
  ssr: false,
  loading: () => <div className={styles.immersiveLoading}>正在布置场景……</div>,
});

const VIEW_KEY = "marriage-pressure-view";
type ViewMode = "immersive" | "classic";

const SHARE_URL = "my-pixijs-game.vercel.app/game/family-pressure";
const MODE_COPY: Record<GameMode, { title: string; subtitle: string }> = {
  child: { title: "我就是当事人", subtitle: "替自己做决定，也决定要不要靠近谁" },
  parent: { title: "我是家长", subtitle: "挑人、催进度，或真正提供支持" },
  duel: { title: "家庭对弈", subtitle: "两人同屏，家长与当事人轮流回应" },
};

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function getEconomySummary(state: MarriageGameState) {
  const net = state.savings - state.weddingDebt;
  if (net >= 68 && state.career >= 68) return { title: "宽裕上升", detail: `净余量 ${net} · 事业 ${state.career}` };
  if (net >= 28) return { title: "基本稳住", detail: `净余量 ${net} · 事业 ${state.career}` };
  if (net >= 0) return { title: "收支紧绷", detail: `存款 ${state.savings} · 债务 ${state.weddingDebt}` };
  return { title: "债务压顶", detail: `存款 ${state.savings} · 债务 ${state.weddingDebt}` };
}

function getRelationshipSummary(state: MarriageGameState) {
  if (state.ending === "runaway") return "已经离婚";
  if (state.matchClosed) return "没有继续交往";
  if (state.relation >= 76 && state.mutualIntent >= 66) return "仍然相爱";
  if (state.relation >= 52 && state.mutualIntent >= 45) return "还在磨合";
  if (state.stage === "single") return "已经翻篇";
  return "关系破裂";
}

export default function MarriagePressureGame() {
  const game = useMarriageGame();
  const {
    state, saved, mode, setMode, difficulty, setDifficulty, seedInput, setSeedInput, playerName, setPlayerName,
    help, setHelp, ready, storageAvailable, candidate, ending, resolution, start, restart, resume, personalizeNarrative,
  } = game;
  const [view, setView] = useState<ViewMode>("immersive");
  const [viewNotice, setViewNotice] = useState("");
  const rootRef = useRef<HTMLElement>(null);
  const modalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(VIEW_KEY);
    } catch {
      stored = null;
    }
    const preferred: ViewMode = requested === "classic" || requested === "immersive" ? requested : stored === "classic" ? "classic" : "immersive";
    if (preferred === "immersive" && !supportsWebGL()) {
      setView("classic");
      setViewNotice("当前浏览器不支持 3D 场景，已切换到经典卡片模式。");
    } else setView(preferred);
  }, []);

  const switchView = useCallback((next: ViewMode, notice = "") => {
    if (next === "immersive" && !supportsWebGL()) {
      setViewNotice("当前浏览器不支持 3D 场景，仍使用经典卡片模式。");
      return;
    }
    setView(next);
    setViewNotice(notice);
    game.setResolution(null);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // 无法保存偏好时仍然可以切换
    }
  }, [game]);

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else rootRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKey = (keyboardEvent: KeyboardEvent) => {
      if (!(keyboardEvent.target instanceof HTMLInputElement) && keyboardEvent.key.toLowerCase() === "f") fullscreen();
      if (keyboardEvent.key === "Escape" && help) setHelp(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, help, setHelp]);

  useEffect(() => {
    if (!help) return undefined;
    const before = document.activeElement;
    modalRef.current?.querySelector("button")?.focus();
    const trap = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== "Tab") return;
      const buttons = modalRef.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (keyboardEvent.shiftKey && document.activeElement === first) {
        keyboardEvent.preventDefault();
        last.focus();
      } else if (!keyboardEvent.shiftKey && document.activeElement === last) {
        keyboardEvent.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (before instanceof HTMLElement) before.focus();
    };
  }, [help, setHelp]);

  const renderLobby = () => (
    <section className={styles.lobby}>
      <div className={styles.lobbyScene} aria-hidden>
        <div className={`${styles.lobbyPortrait} ${styles.lobbyPortraitLeft}`}>
          <CandidatePortrait id="shiori" />
        </div>
        <div className={`${styles.lobbyPortrait} ${styles.lobbyPortraitMain}`}>
          <CandidatePortrait id="sui" priority />
        </div>
        <div className={`${styles.lobbyPortrait} ${styles.lobbyPortraitRight}`}>
          <CandidatePortrait id="kloa" />
        </div>
        <div className={styles.redEnvelope}>相亲简历<br /><b>{CANDIDATES.length}</b> 份</div>
      </div>
      <div className={styles.lobbyCopy}>
        <span className={styles.eyebrow}>V6 · 沉浸一周，再回牌桌</span>
        <h1>{GAME_TITLE}<small>这婚，你催吗？</small></h1>
        <p>健身、理发、学点东西，再去认识喜欢的人。24 个季度里，经营自己的生活，也找到愿意双向靠近的人。</p>
        <div className={styles.modePicker} aria-label="选择扮演身份">
          {(Object.keys(MODE_COPY) as GameMode[]).map(id => (
            <button
              key={id}
              data-testid={`mode-${id}`}
              className={mode === id ? styles.selectedChoice : ""}
              onClick={() => setMode(id)}
            >
              {id === "child" ? <UserOutlined /> : id === "parent" ? <HomeOutlined /> : <TeamOutlined />}
              <span><strong>{MODE_COPY[id].title}</strong><small>{MODE_COPY[id].subtitle}</small></span>
              {mode === id && <CheckOutlined />}
            </button>
          ))}
        </div>
        <div className={styles.nameField}>
          <label htmlFor="marriage-player-name">{mode === "child" ? "这局里，我叫" : mode === "parent" ? "孩子的昵称" : "当事人的昵称"}</label>
          <div className={styles.nameControls}>
          <input
            id="marriage-player-name"
            data-testid="player-name"
            value={playerName}
            maxLength={8}
            placeholder="留空会随机取一个昵称"
            onChange={input => setPlayerName(input.target.value.slice(0, 8))}
          />
          <button type="button" data-testid="random-player-name" disabled={!ready} onClick={() => setPlayerName(pickInitialName(playerName.trim()))}><ReloadOutlined /> 随机名字</button>
          </div>
          <small>可自己填写，也可随机换一个；续玩沿用存档昵称。</small>
        </div>
        <div className={styles.difficultyPicker} aria-label="选择压力档位">
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map(id => (
            <button
              key={id}
              data-testid={`difficulty-${id}`}
              className={difficulty === id ? styles.selectedDifficulty : ""}
              onClick={() => setDifficulty(id)}
            >
              <strong>{DIFFICULTIES[id].title}</strong>
              <small>{DIFFICULTIES[id].description}</small>
            </button>
          ))}
        </div>
        <div className={styles.startRow}>
          <label htmlFor="marriage-seed">同局种子
            <input
              id="marriage-seed"
              value={seedInput}
              inputMode="numeric"
              maxLength={10}
              placeholder="随机饭桌"
              onChange={input => setSeedInput(input.target.value.replace(/\D/g, ""))}
            />
          </label>
          <button className={styles.primaryButton} data-testid="start-game" disabled={!ready} onClick={start}>
            开始这局 <ArrowRightOutlined />
          </button>
        </div>
        {saved && (
          <button
            className={styles.resumeButton}
            data-testid="resume-game"
            onClick={resume}
          >
            继续第 {saved.turn} 回合 · {MODE_COPY[saved.mode].title} <ArrowRightOutlined />
          </button>
        )}
        <CandidateCatalog />
        <p className={styles.disclaimer}>虚构策略游戏。人物资料与对话均为玩法改编，不代表立绘角色或主播本人的真实经历、学历、婚恋观与言行。</p>
      </div>
    </section>
  );

  const renderEnding = () => {
    if (!ending) return null;
    const endingTitle = ending.id === "depressed"
      ? state.mode === "parent" ? "孙辈需要被接住" : "孩子需要被接住"
      : ending.id === "burnout" && state.mode !== "child" ? `${playerName}先撑不住了` : ending.title;
    const endingAge = getAgeAtTurn(state);
    const marriedAge = state.marriedAtTurn === null
      ? null
      : getAgeAtTurn(state, state.marriedAtTurn);
    const parenthoodAge = state.parenthoodAtTurn === null
      ? null
      : getAgeAtTurn(state, state.parenthoodAtTurn);
    const childSummary = state.stage === "parenthood"
      ? { title: "已经生子", detail: parenthoodAge ? `${parenthoodAge} 岁进入育儿` : "旧档未记录年龄" }
      : state.childPlan === "childfree"
        ? { title: "决定不生", detail: "已明确不生的立场" }
        : { title: "没有孩子", detail: state.stage === "married" ? "生育仍未达成共识" : "尚未进入婚育" };
    const economy = getEconomySummary(state);
    const relationship = getRelationshipSummary(state);

    return (
      <section className={styles.ending} style={{ "--ending": ending.color } as React.CSSProperties}>
        <div className={styles.endingPoster} data-testid="ending-poster">
          <div className={styles.endingPortrait}>
            {candidate ? <CandidatePortrait id={candidate.id} priority /> : <span className={styles.noPartner}>这一局没有留下对象</span>}
            <div className={styles.endingPartner}>
              <small>这段人生的对象</small>
              <strong>{candidate?.name ?? "没有对象"}</strong>
              <span>{candidate?.subtitle ?? "选择权回到自己手里"}</span>
            </div>
          </div>
          <div className={styles.endingCopy}>
            <div className={styles.endingBrand}>
              <span>{GAME_TITLE} · 这婚，你催吗？</span>
              <b>{SHARE_URL}</b>
            </div>
            <span className={styles.eyebrow}>FAMILY REPORT / {playerName} 的阶段记录</span>
            <p>{ending.kicker}</p>
            <h1>{endingTitle}</h1>
            <blockquote>{ending.description}</blockquote>
            <p className={styles.endingReason} data-testid="ending-reason">{getEndingReason(state)}</p>
            <div className={styles.endingFacts}>
              <span><small>对象</small><strong>{candidate?.name ?? "没有对象"}</strong><i>{relationship} · 伴侣感情 {state.relation}</i></span>
              <span><small>结婚年龄</small><strong>{marriedAge ? `${marriedAge} 岁` : state.stage === "married" || state.stage === "parenthood" ? "旧档未记录" : "没有结婚"}</strong><i>{ending.id === "runaway" ? "曾经结婚 · 现已离婚" : STAGE_LABELS[state.stage]}</i></span>
              <span><small>走到结局</small><strong>{endingAge} 岁</strong><i>经历 {state.turn} 个家庭回合</i></span>
              <span><small>生育选择</small><strong>{childSummary.title}</strong><i>{childSummary.detail}</i></span>
              <span><small>家庭经济</small><strong>{economy.title}</strong><i>{economy.detail}</i></span>
              <span><small>与父母的关系</small><strong>{state.familyBond >= 68 ? "彼此支持" : state.familyBond >= 38 ? "勉强维系" : "已经决裂"}</strong><i>亲情 {state.familyBond} · 支持 {state.support}</i></span>
            </div>
            <div className={styles.scoreRow}>
              <span><small>{state.mode === "child" ? "我的分数" : `${playerName}的分数`}</small><b>{state.scores.child}</b></span>
              <span><small>家长期待分</small><b>{state.scores.parent}</b></span>
              <span><small>家庭生活分</small><b>{state.scores.family}</b></span>
            </div>
          </div>
        </div>
        <div className={styles.endingDetails}>
          <div className={styles.resultPanel}>
            <span className={styles.eyebrow}>这一段故事，暂时落笔</span>
            <h2>{endingTitle}</h2>
            <p>{playerName} 从 {state.startAge} 岁走到 {endingAge} 岁。下一局，换一种回应，也许会走向完全不同的家。</p>
            <div className={styles.resultActions}>
              <button className={styles.primaryButton} data-testid="play-again" onClick={start}><ReloadOutlined /> 同身份再来一局</button>
              <button className={styles.secondaryButton} data-testid="back-lobby" onClick={restart}>换身份 / 难度</button>
            </div>
            {state.dateLog.length > 0 && (
              <div className={styles.endingAlbum} data-testid="ending-album">
                <span className={styles.eyebrow}>相册回顾 · {state.dateLog.length} 次见面</span>
                <ol>
                  {state.dateLog.map((record, index) => (
                    <li key={`${record.turn}-${record.activity}-${index}`} data-liked={record.liked}>
                      <strong>{ACTIVITIES[record.activity].title}</strong>
                      <small>第 {record.turn} 季 · {CANDIDATES.find(item => item.id === record.candidateId)?.name ?? "对方"}{record.liked ? " · 对方很开心" : record.disliked ? " · 不太合适" : ""}</small>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
          <div className={styles.endingLedger}>
            <span className={styles.ledgerTitle}><SafetyCertificateOutlined /> 最终账本</span>
            <dl>
              <div><dt>压力 / 自主</dt><dd>{state.stress} / {state.autonomy}</dd></div>
              <div><dt>存款 / 债务</dt><dd>{state.savings} / {state.weddingDebt}</dd></div>
              <div><dt>体能 / 生活内容</dt><dd>{state.fitness} / {state.interests}</dd></div>
              <div><dt>相处平衡</dt><dd>{getBalanceLabel(state)}</dd></div>
              <div><dt>下一代压力</dt><dd>{state.nextGenStress}</dd></div>
              <div><dt>强压 / 倾听</dt><dd>{state.coerciveMoves} / {state.supportiveMoves}</dd></div>
            </dl>
            <details>
              <summary>展开本局家庭记录</summary>
              {[...state.log].reverse().map((line, index) => <p key={`${line}-${index}`}>{personalizeNarrative(line)}</p>)}
            </details>
          </div>
        </div>
      </section>
    );
  };

  // 终局当回合若仍有结算步骤，先让玩家点完再展示结局页，避免 resolution-dialog 被卸载
  const awaitingResolution = Boolean(resolution);
  const playing = state.phase !== "lobby" && (state.phase !== "ended" || awaitingResolution);
  return (
    <main ref={rootRef} className={styles.game} data-phase={state.phase} data-view={view}>
      <header className={styles.topbar}>
        <Link href="/demos#games" aria-label="返回小游戏列表" title="返回小游戏列表"><ArrowLeftOutlined /></Link>
        <div><strong>{GAME_TITLE}</strong><small>V6 · 一季，一个代表性的一周</small></div>
        <nav>
          <GameShareButton gamePath="/game/family-pressure" />
          {state.phase !== "lobby" && <span>{state.mode === "child" ? `我 · ${playerName}` : MODE_COPY[state.mode].title} · {DIFFICULTIES[state.difficulty].title}</span>}
          <button data-testid="view-toggle" onClick={() => switchView(view === "immersive" ? "classic" : "immersive")} title={view === "immersive" ? "切换到经典卡片模式" : "切换到沉浸模式"} aria-label={view === "immersive" ? "切换到经典卡片模式" : "切换到沉浸模式"}>{view === "immersive" ? <AppstoreOutlined /> : <MobileOutlined />}</button>
          <button onClick={() => setHelp(true)} title="玩法说明" aria-label="玩法说明"><QuestionCircleOutlined /></button>
          <button onClick={fullscreen} title="全屏" aria-label="全屏"><FullscreenOutlined /></button>
        </nav>
      </header>
      {viewNotice && <p className={styles.storageNotice} data-testid="view-notice">{viewNotice}</p>}
      {state.phase === "lobby" && renderLobby()}
      {playing && view === "classic" && <ClassicBoard game={game} />}
      {playing && view === "immersive" && <ImmersiveGame game={game} onFallback={(reason: string) => switchView("classic", reason)} />}
      {state.phase === "ended" && !awaitingResolution && renderEnding()}
      {!storageAvailable && <p className={styles.storageNotice}>当前浏览器无法保存进度，本局仍可正常游玩。</p>}
      {help && (
        <div className={styles.overlay}>
          <section ref={modalRef} className={styles.helpModal} role="dialog" aria-modal="true" aria-label="玩法说明">
            <span className={styles.eyebrow}>HOW TO PLAY</span>
            <h2>不是谁先结婚谁就赢。</h2>
            <ol>
              <li><b>先认识，再决定。</b>微信倾听、分享日常或直接问条件；见面可请客或提前说好 AA，花钱不会额外买到好感。见过几次仍没感觉，就换下一个。</li>
              <li><b>一季是一周。</b>工位、下班路上、晚上和周末依次展开；消息可以回、晚点回或不回，影响很小且有上限。每季仍然只选一项主投入。</li>
              <li><b>每回合选一项。</b>新局一回合是一季，24 回合后记录阶段结果；晚婚和首次困境会留出后续时间。相互了解、伴侣感情、对方意愿各不相同。</li>
              <li><b>经营自己。</b>运动、理发、爱好与技能需要时间，有些还需要预算。自己的积累换对象也保留；良好状态有助于初见，不能保证对方喜欢。</li>
              <li><b>相处需要双向。</b>正常请客不会吃亏。回避分歧、反复取消自己安排才会积累失衡；可以谈清边界与分工，也可以离开。</li>
              <li><b>现实事件会插手。</b>房租、裁员、加班和照护成本每回合结算，存款与事业不是装饰数字。</li>
              <li><b>双人模式轮流操作。</b>家长先出牌，当事人再回应。双方都有分数，但家庭分低时谁的个人高分都很难看。</li>
              <li><b>育儿不是终点。</b>随意生育后继续鸡娃会累积“下一代压力”；到达 100 时，我的孩子会在高压教育中先撑不住。</li>
              <li><b>两种关系分开看。</b>“与父母的亲情”是原生家庭关系，“伴侣感情”是当前对象的相处质量。家里支援总额有限，伴侣婚后也承担生活开支。</li>
              <li><b>困难先给补救窗口。</b>连续 2 回合压力 ≥95 才会暂停生活；连续 3 回合收支缺口且债务 ≥45 才会长期困顿。婚后感情与意愿均低于 35 连续 3 回合才会自动离婚，也可主动分开。</li>
            </ol>
            <p>内容包含家庭冲突、心理压力和经济困境。若这些主题让你不适，可随时退出。F 切换全屏，Esc 关闭说明。</p>
            <button className={styles.primaryButton} onClick={() => setHelp(false)}>明白了 <ArrowRightOutlined /></button>
          </section>
        </div>
      )}
      <footer className={styles.footer}>
        <span>虚构家庭策略游戏 · 角色设定不代表真人经历与立场</span>
        <span><FireOutlined /> 压力不是推进条，支持也不是一句“为你好”</span>
      </footer>
    </main>
  );
}
