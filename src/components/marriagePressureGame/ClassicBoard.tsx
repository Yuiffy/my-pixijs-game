"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightOutlined,
  BankOutlined,
  CalendarOutlined,
  CloseOutlined,
  DollarOutlined,
  HeartOutlined,
  HomeOutlined,
  MessageOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  UserOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { CANDIDATES, CHILD_ACTIONS, PARENT_ACTIONS, STAGE_LABELS } from "./content";
import { getActionPreview, getCandidate } from "./engine";
import type { ChildActionId, MarriageGameAction, ParentActionId, ResolutionChange } from "./types";
import { getCandidateProfile, getHouseholdBudget, getLifeWarnings, getPartnerProfile, isHousehold } from "./household";
import { getProgressionGuide } from "./progression";
import { GROWTH_COSTS, getBalanceLabel, getGrowthAdvice, getRelationshipSituation, isGrowthAction } from "./growth";
import { HOBBY_OPTIONS } from "./interests";
import { ACTIVITIES, getActivityCost, getAvailableActivities } from "./activities";
import WeekInbox from "./WeekInbox";
import type { MarriageGameApi } from "./useMarriageGame";
import styles from "./marriage.module.css";

const LOWER_IS_BETTER_METRICS = new Set<ResolutionChange["key"]>(["stress", "pressure", "weddingDebt", "nextGenStress"]);

export function getChangeTone(change: ResolutionChange) {
  if (change.key === "parentFace") return "neutral";
  const improved = LOWER_IS_BETTER_METRICS.has(change.key) ? change.delta < 0 : change.delta > 0;
  return improved ? "better" : "worse";
}

export function Meter({ label, value, tone, description }: {
  label: string;
  description?: string;
  value: number;
  tone: "stress" | "autonomy" | "family" | "money" | "career" | "relation" | "nextgen";
}) {
  const shown = Math.max(0, Math.min(100, value));
  return (
    <div className={styles.meter} title={description} aria-label={`${label} ${value}${description ? `，${description}` : ""}`} data-tone={tone} data-testid={`meter-${tone}`}>
      <span>{label}</span>
      <strong>{Math.round(value)}</strong>
      <i><b style={{ width: `${shown}%` }} /></i>
    </div>
  );
}

export function CandidatePortrait({ id, priority = false }: { id: string; priority?: boolean }) {
  const candidate = CANDIDATES.find(item => item.id === id);
  if (!candidate) return null;
  return (
    <Image
      src={candidate.image}
      alt={`${candidate.name} 的虚构游戏角色立绘`}
      fill
      priority={priority}
      unoptimized
      sizes="(max-width: 760px) 46vw, 360px"
      className={styles.portraitImage}
    />
  );
}

type Inspector = "profile" | "household" | "history" | "progression" | "growth" | null;

// 经典卡片界面：保留 V5 的全部交互与 testid
export default function ClassicBoard({ game }: { game: MarriageGameApi }) {
  const { state, playerName, resolution, eventNotice, childActions, parentActions, event, candidate } = game;
  const [actionTab, setActionTab] = useState("connection");
  const [pendingMeeting, setPendingMeeting] = useState<ChildActionId | null>(null);
  const [meetingActivity, setMeetingActivity] = useState("meal");
  const [pendingDecision, setPendingDecision] = useState<ChildActionId | null>(null);
  const [pendingHobby, setPendingHobby] = useState(false);
  const [inspector, setInspector] = useState<Inspector>(null);
  const [showActionNumbers, setShowActionNumbers] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const guide = getProgressionGuide(state);
  const budget = getHouseholdBudget(state);
  const partnerProfile = getPartnerProfile(state);
  const lifeWarnings = getLifeWarnings(state);
  const activities = useMemo(() => getAvailableActivities(state), [state]);

  useEffect(() => {
    game.debugRef.current = { pendingDecision, pendingMeeting, inspector, view: "classic" };
  }, [game.debugRef, pendingDecision, pendingMeeting, inspector]);

  const commitAction = useCallback((action: MarriageGameAction) => {
    const before = state;
    const result = game.commitAction(action);
    if (!result) return;
    const next = result.state;
    if (next.matchClosed && !before.matchClosed) setActionTab("decision");
    else if (isHousehold(next) && !isHousehold(before)) setActionTab("connection");
    else if (next.stress >= 85) setActionTab("life");
  }, [game, state]);

  useEffect(() => {
    if (!resolution && !pendingDecision && !pendingMeeting && !inspector && !pendingHobby) return undefined;
    const dialog = rootRef.current?.querySelector<HTMLElement>('[data-testid="resolution-dialog"], [data-testid="decision-dialog"], [data-testid="meeting-dialog"], [data-testid="inspector-dialog"], [data-testid="hobby-dialog"]');
    const previous = document.activeElement;
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const trap = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") { setPendingDecision(null); setPendingMeeting(null); setInspector(null); setPendingHobby(false); }
      if (keyboardEvent.key !== "Tab") return;
      const buttons = dialog?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (keyboardEvent.shiftKey && document.activeElement === first) { keyboardEvent.preventDefault(); last.focus(); } else if (!keyboardEvent.shiftKey && document.activeElement === last) { keyboardEvent.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [resolution, pendingDecision, pendingMeeting, inspector, pendingHobby]);

  useEffect(() => {
    const grid = rootRef.current?.querySelector<HTMLElement>("[data-action-grid]");
    if (grid) grid.scrollTop = 0;
  }, [actionTab, state.turn, state.stage, state.candidateId]);

  const renderResources = () => (
    <section className={styles.primaryResources} aria-label="当前状态">
      <Meter label="压力" value={state.stress} tone="stress" />
      <Meter label="存款" value={state.savings} tone="money" />
      <Meter label="伴侣感情" value={state.relation} tone="relation" />
      <button data-testid="open-household" onClick={() => setInspector("household")}>家庭与账本 <ArrowRightOutlined /></button>
    </section>
  );

  const renderResolutionDialog = () => {
    if (!resolution) return null;
    const step = resolution.steps[resolution.index];
    const isLast = resolution.index === resolution.steps.length - 1;
    const kindLabel = { choice: "我的行动", reality: "现实事件", family: "家长回应", response: "当事人回应", match: "对象变化", household: "共同生活", message: "消息往来" }[step.kind];
    return (
      <div className={styles.resolutionOverlay}>
        <section className={styles.resolutionModal} data-kind={step.kind} data-testid="resolution-dialog" role="dialog" aria-modal="true" aria-label="本回合数值结算">
          <header>
            <span>{kindLabel}</span>
            <b>{resolution.index + 1} / {resolution.steps.length}</b>
          </header>
          <div className={styles.resolutionLead}>
            <span>{step.kind === "reality" ? <ThunderboltOutlined /> : step.kind === "family" || step.kind === "message" ? <MessageOutlined /> : step.kind === "match" ? <ReloadOutlined /> : <UserOutlined />}</span>
            <div>
              <small>这一步单独结算</small>
              <h2>{game.personalizeResolution(step.title)}</h2>
            </div>
          </div>
          <p>{game.personalizeResolution(step.detail)}</p>
          {step.changes.length ? (
            <div className={styles.resolutionChanges}>
              {step.changes.map(change => (
                <span key={change.key} data-tone={getChangeTone(change)} data-testid={`resolution-change-${change.key}`}>
                  <small>{change.label}</small>
                  <strong>{change.before} → {change.after}</strong>
                  <i>{change.delta > 0 ? "+" : ""}{change.delta}</i>
                </span>
              ))}
            </div>
          ) : <p className={styles.noResolutionChange}>这一步没有直接改数字，但改变了关系阶段或接下来轮到谁。</p>}
          <div className={styles.resolutionFooter}>
            <small>这里只显示当前这一步的影响，不把后续事件混在一起。</small>
            <button className={styles.primaryButton} data-testid="resolution-next" onClick={game.advanceResolution}>
              {isLast ? "知道了，继续" : "继续看下一项"} <ArrowRightOutlined />
            </button>
          </div>
        </section>
      </div>
    );
  };

  const renderCandidateDraft = () => (
    <section className={styles.draftSection}>
      <div className={styles.draftHeading}>
        <span className={styles.eyebrow}>MATCHMAKING DESK / 相亲角</span>
        <h2>{state.selectionKind === "replace" ? "上一位已经翻篇。" : "家长先挑一份简历。"}</h2>
        <p>先认识对方，再看双方是否愿意继续。有人被催着来，也有人见过几次才发现没感觉。</p>
      </div>
      <div className={styles.candidateGrid}>
        {state.candidateOptions.map((id, index) => {
          const option = getCandidate(id);
          if (!option) return null;
          return (
            <button key={id} className={styles.candidateCard} data-testid={`candidate-${id}`} onClick={() => commitAction({ type: "candidate", id })}>
              <span className={styles.cardNumber}>0{index + 1}</span>
              <span className={styles.candidatePortrait}><CandidatePortrait id={id} /></span>
              <span className={styles.candidateCardCopy}>
                <small>{option.subtitle}</small>
                <strong>{option.name}</strong>
                <span className={styles.candidateStats}>
                  <b>履历 {option.resume}</b>
                  <b>契合 {option.compatibility}</b>
                  <b>意愿 {option.initialIntent}</b>
                </span>
                <span className={styles.tagRow}>{option.tags.map(tag => <i key={tag}>{tag}</i>)}</span>
                <q>{option.boundary}</q><span className={styles.candidateWish}>{getCandidateProfile(state.seed, option.id).title}</span>
                <span className={styles.pickLabel}>我选这位推荐给 {playerName} <ArrowRightOutlined /></span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );

  const renderActions = () => {
    const actor = state.activeActor;
    const definitions = (actor === "parent" ? PARENT_ACTIONS : CHILD_ACTIONS).filter(item => item.id !== "invest" && item.id !== "meet-aa");
    const available = new Set<string>(actor === "parent" ? parentActions : childActions);
    const groupFor = (id: string) => {
      if (isGrowthAction(id as ChildActionId)) return "growth";
      if (["chat-listen", "chat-share", "chat-checklist", "meet", "meet-aa", "invest", "build-home", "protect-child"].includes(id)) return "connection";
      if (["work", "rest", "budget", "ask-help", "boundary", "support", "listen"].includes(id)) return "life";
      return "decision";
    };
    const tabs = [{ id: "connection", title: isHousehold(state) ? "一起生活" : "聊天见面" }, ...(actor === "child" ? [{ id: "growth", title: "经营自己" }] : []), { id: "life", title: "生活边界" }, { id: "decision", title: "关系决定" }];
    const shownTab = definitions.some(item => available.has(item.id) && groupFor(item.id) === actionTab)
      ? actionTab : tabs.find(tab => definitions.some(item => available.has(item.id) && groupFor(item.id) === tab.id))?.id;
    const relationshipSituation = shownTab === "decision" && available.has("relationship-boundary") ? getRelationshipSituation(state) : null;
    return (
      <section className={styles.actionSection} data-actor={actor} data-testid="turn-actions">
        <div className={styles.actionHeading}>
          <span>{actor === "parent" ? <HomeOutlined /> : <UserOutlined />}</span>
          <div>
            <small>{state.mode === "duel" ? "把设备交给下一位玩家" : "本回合决策"}</small>
            <h2>{state.mode === "duel"
              ? `轮到${actor === "parent" ? "家长玩家出牌" : `${playerName}回应`}`
              : `轮到我${actor === "parent" ? "出牌" : "回应"}`}</h2>
          </div>
          <b>{state.turn} / {state.maxTurns} <small>{state.monthsPerTurn === 3 ? "季" : "年"}</small></b>
        </div>
        <nav className={styles.actionTabs} aria-label="行动分类">
          {tabs.map(tab => (
            <button key={tab.id} data-testid={`actions-${tab.id}`} aria-pressed={shownTab === tab.id} onClick={() => setActionTab(tab.id)}>
              {tab.title} <small>{definitions.filter(item => available.has(item.id) && groupFor(item.id) === tab.id).length}</small>
            </button>
          ))}
        </nav>
        {shownTab === "growth" ? (
          <div className={styles.progressionGuide} data-testid="growth-guide">
            <div><strong>自己的生活，也值得经营</strong><button data-testid="open-growth" onClick={() => setInspector("growth")}>成长记录</button></div>
            <p>{getGrowthAdvice(state)}</p>
          </div>
        ) : (
          <div className={styles.progressionGuide} data-testid="progression-guide">
            <div><strong>下一步 · {guide.title}</strong><button data-testid="open-progression" onClick={() => setInspector("progression")}>查看条件</button></div>
            <p>{guide.advice} {actor === "child" && guide.unlocked && shownTab !== "decision" && <button data-testid="show-marriage-options" onClick={() => setActionTab("decision")}>去看结婚选择 <ArrowRightOutlined /></button>}</p>
          </div>
        )}
        <div className={styles.actionTools}><span>每回合选一项</span><button data-testid="toggle-action-numbers" aria-pressed={showActionNumbers} onClick={() => setShowActionNumbers(!showActionNumbers)}>{showActionNumbers ? "收起数值预览" : "查看数值影响"}</button></div>
        <div className={styles.actionGrid} data-action-grid>
          {relationshipSituation && <p className={styles.relationshipSituation} data-testid="relationship-situation"><strong>{relationshipSituation.title}</strong>{relationshipSituation.detail}</p>}
          {definitions.filter(item => (available.has(item.id) || groupFor(item.id) === "growth") && groupFor(item.id) === shownTab).map(definition => {
            const enabled = available.has(definition.id);
            const preview = enabled ? getActionPreview(state, actor, definition.id as ChildActionId | ParentActionId) : "当前阶段不可用";
            return (
              <button
                key={definition.id}
                data-testid={`${actor}-action-${definition.id}`}
                data-suggested={actor === "child" && definition.id === guide.suggested}
                disabled={!enabled}
                onClick={() => {
                  if (actor === "child" && ["meet", "meet-aa", "invest"].includes(definition.id)) setPendingMeeting("meet-aa");
                  else if (actor === "child" && ["marry", "simple-wedding", "baby", "separate"].includes(definition.id)) setPendingDecision(definition.id as ChildActionId);
                  else if (actor === "child" && definition.id === "hobby") setPendingHobby(true);
                  else commitAction(actor === "parent"
                    ? { type: "parent-action", id: definition.id as ParentActionId }
                    : { type: "child-action", id: definition.id as ChildActionId });
                }}
              >
                <span className={styles.actionIcon}>
                  {definition.id.includes("support") ? <DollarOutlined />
                    : definition.id.includes("listen") || definition.id.includes("boundary") ? <MessageOutlined />
                      : definition.id.includes("protect") ? <SafetyCertificateOutlined />
                        : definition.id.includes("education") ? <ThunderboltOutlined />
                          : definition.id.includes("baby") ? <HeartOutlined />
                            : definition.id.includes("work") ? <BankOutlined />
                              : definition.id.includes("next") ? <ReloadOutlined />
                                : definition.id.includes("compare") ? <ThunderboltOutlined />
                                  : <ArrowRightOutlined />}
                </span>
                <span><strong>{definition.id === "meet" ? state.meetings > 0 ? "再约一次见面" : "约一次见面" : definition.title}</strong><small>{definition.id === "meet" ? "先选活动与请客或 AA，再聊聊彼此的生活。" : definition.detail}</small>{isGrowthAction(definition.id as ChildActionId) && <em className={styles.growthCost}>{GROWTH_COSTS[definition.id as keyof typeof GROWTH_COSTS] === 0 ? "免费" : `预算 ${GROWTH_COSTS[definition.id as keyof typeof GROWTH_COSTS]}`} · {enabled ? "占用本季行动" : "存款不足，先稳住生活"}</em>}{definition.id === "overgive" && <em className={styles.growthCost}>额外花费 8 · 相处更失衡，不增加爱意</em>}{showActionNumbers && <i>{preview || definition.hint}</i>}</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  const renderInspector = () => inspector && (
    <div className={styles.overlay}>
      <section className={`${styles.helpModal} ${styles.inspector}`} role="dialog" aria-modal="true" aria-label="人物与家庭详情" data-testid="inspector-dialog">
        <header><h2>人物与家庭</h2><button aria-label="关闭详情" data-testid="close-inspector" onClick={() => setInspector(null)}><CloseOutlined /></button></header>
        <nav className={styles.inspectorTabs} aria-label="详情分类">
          {([{ id: "profile", title: "人物" }, { id: "growth", title: "自己" }, { id: "household", title: "账本" }, { id: "history", title: "记录" }, { id: "progression", title: "下一步" }] as const).map(tab => <button key={tab.id} aria-pressed={inspector === tab.id} onClick={() => setInspector(tab.id)}>{tab.title}</button>)}
        </nav>
        {inspector === "growth" && (
          <div data-testid="growth-details">
            <h3>留给自己的时间</h3><p>{state.growthNote}</p>
            <dl><div><dt>体能 · 60 后每季减压</dt><dd>{state.fitness}</dd></div><div><dt>仪容 · 额外状态需维护</dt><dd>{state.grooming}</dd></div><div><dt>生活内容 · 60 后更会分享</dt><dd>{state.interests}</dd></div><div><dt>事业 · 影响每季收入</dt><dd>{state.career}</dd></div><div><dt>相处平衡 · {getBalanceLabel(state)}</dt><dd>{state.relationshipBalance}</dd></div></dl>
            <p>我的爱好：{state.playerHobbies.length ? state.playerHobbies.map(id => ACTIVITIES[id].title).join("、") : "还没有固定的爱好方向"}。和对方兴趣相同时，聊天与约会更容易聊到一起。</p>
            <p>运动、仪容、兴趣和技能能有限改善初见印象；见面与双向回应仍不可省略。明确拒绝之后，成长不会改变对方已经作出的决定。</p>
            <p>请客、AA 和关心不会降低相处平衡。反复取消自己的安排、包下额外开销才会消耗自主与平衡；低于 35 时，恋爱或婚姻每季都会积累压力与疏远。低于 40 时先处理分工，再考虑结婚。</p>
            <p>体能、兴趣和事业随换对象保留。仪容额外状态每季回落 6，最低回到 40；本季刚打理则不回落。所有数值都是游戏抽象。</p>
          </div>
        )}
        {inspector === "progression" && (
          <div data-testid="progression-details">
            <h3>{guide.title}</h3><p>{guide.explanation}</p>
            <ul className={styles.requirements}>{guide.requirements.map(item => <li key={item.label} data-met={item.met}><span>{item.met ? "✓" : "○"} {item.label}</span><strong>{item.value} / {item.target}</strong><small>{item.met ? "已满足" : `还差 ${item.remaining}`}</small></li>)}</ul>
            <p>{guide.preparationNote}</p>
            {guide.preparation.length > 0 && <><h3>{state.stage === "dating" ? "婚礼准备" : "育儿准备"}</h3><ul className={styles.requirements}>{guide.preparation.map(item => <li key={item.label} data-met={item.met}><span>{item.met ? "✓" : "○"} {item.label}</span><strong>{item.value} / {item.lower ? "≤" : "≥"}{item.target}</strong><small>{item.met ? "已准备好" : item.lower ? `需降低 ${item.remaining}` : `还差 ${item.remaining}`}</small></li>)}</ul></>}
            {state.activeActor === "parent" && <p>家长可以倾听、支持、减少催促，交往和婚育仍需当事人与对象作决定。</p>}
          </div>
        )}
        {inspector === "profile" && candidate && (
          <div data-testid="partner-profile">
            <h3>{candidate.name} · {candidate.subtitle}</h3>
            <blockquote>{candidate.boundary}</blockquote>
            <h3>{partnerProfile.title}</h3><p>{partnerProfile.wish}</p>
            <p>已知的兴趣：{state.knownInterests.length ? state.knownInterests.map(id => ACTIVITIES[id].title).join("、") : "还不清楚，聊天、看朋友圈或一起出去玩会慢慢知道"}{state.knownDislikes.length ? `；不太喜欢：${state.knownDislikes.map(id => ACTIVITIES[id].title).join("、")}` : ""}。兴趣是虚构的游戏设定。</p>
            <p>人物生活观采用固定游戏设定；双向好感仍随这次相处变化。</p>
            <p>目前相处：{getBalanceLabel(state)}。这描述本局的互动，不是人物的固定品性。</p>
            <dl><div><dt>本人意愿</dt><dd>{state.mutualIntent}</dd></div><div><dt>相互了解</dt><dd>{state.understanding}</dd></div><div><dt>生活契合</dt><dd>{candidate.compatibility}</dd></div><div><dt>履历分</dt><dd>{candidate.resume}</dd></div></dl>
          </div>
        )}
        {inspector === "household" && (
          <div>
            <div className={styles.secondaryResources}><Meter label="与父母的亲情" value={state.familyBond} tone="family" /><Meter label="自主" value={state.autonomy} tone="autonomy" /><Meter label="事业" value={state.career} tone="career" /></div>
            <div className={styles.budgetPanel} data-testid="household-budget"><h3>每回合生活账本 · {budget.net >= 0 ? "+" : ""}{budget.net}</h3><p>工作结余 +{budget.income} · 伴侣投入 +{budget.partnerIncome}<br />基本生活 −{budget.essentials} · 弹性消费 −{budget.extras} · 还款 −{budget.repayment}</p><small>游戏预算点，事件和行动另外结算。</small></div>
            <dl>{[["家庭催促", state.pressure], ["家里可支援", state.familyReserve], ["累计支援", state.support], ["婚育债务", state.weddingDebt], ["家长面子", state.parentFace], ["边界表达", state.boundaries], ...(state.stage === "parenthood" ? [["下一代压力", state.nextGenStress]] : [])].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            {lifeWarnings.map(warning => <p key={warning}>{warning}</p>)}
          </div>
        )}
        {inspector === "history" && (
          <div className={styles.historyDetails}>
            {eventNotice && <div data-testid="event-notice"><h3>{eventNotice.title}</h3><p>{eventNotice.detail}</p></div>}
            {event && <p><CalendarOutlined /> {event.title}：{event.detail}</p>}
            {[...state.log].reverse().map((line, index) => <p key={`${index}-${line}`}>{game.personalizeNarrative(line)}</p>)}
          </div>
        )}
      </section>
    </div>
  );

  return (
    <div ref={rootRef} className={styles.classicBoard}>
      {renderResources()}
      {state.phase === "candidate" ? renderCandidateDraft() : (
        <div className={styles.decisionLayout}>
          <aside className={styles.characterScene}>
            <div className={styles.characterPortrait}>{candidate && <CandidatePortrait id={candidate.id} priority />}</div>
            <div className={styles.characterCaption}><small>正在了解的人</small><h2>{candidate?.name}</h2><p>{partnerProfile.title}</p><button data-testid="open-profile" onClick={() => setInspector("profile")}>人物与生活偏好 <ArrowRightOutlined /></button></div>
          </aside>
          <div className={styles.decisionMain}>
            <section className={styles.turnContext} data-testid="relationship-feedback">
              <div><small>{STAGE_LABELS[state.stage]} · {isHousehold(state) ? "共同生活" : `已见面 ${state.meetings} 次`}</small><button data-testid="open-history" onClick={() => setInspector("history")}>本季动态 <ArrowRightOutlined /></button></div>
              <p>{isHousehold(state) ? state.partnerNote : state.datingFeedback}</p>
              {(lifeWarnings.length > 0 || state.familyBond <= 25 || state.nextGenStress >= 70) && <button className={styles.compactWarning} data-testid="life-warning" onClick={() => { setActionTab("life"); setInspector("household"); }}><WarningOutlined /> {state.familyBond <= 25 ? "与父母的关系紧张" : state.nextGenStress >= 70 ? "孩子的压力需要关注" : state.stress >= 85 || state.burnoutTurns > 0 ? "先让自己喘口气" : state.conflictTurns > 0 ? "伴侣正在疏远" : "生活预算需要调整"} · 看看详情</button>}
            </section>
            <WeekInbox game={game} />
            {renderActions()}
          </div>
        </div>
      )}
      {renderInspector()}
      {pendingMeeting && (
        <div className={styles.overlay}>
          <section className={styles.helpModal} role="dialog" aria-modal="true" aria-label="见面聊什么" data-testid="meeting-dialog">
            <span className={styles.eyebrow}>{candidate?.name} · 第 {state.meetings + 1} 次见面 · {pendingMeeting === "meet-aa" ? "提前说好 AA" : "这次我请客"}</span>
            <h2>这次见面，怎么安排？</h2>
            <div className={styles.activityChoices} aria-label="选择约会活动">
              {activities.map(item => (
                <button key={item.id} data-testid={`activity-${item.id}`} aria-pressed={meetingActivity === item.id} onClick={() => setMeetingActivity(item.id)}>
                  <strong>{item.title}</strong>
                  <small>{item.liked ? "对方可能喜欢 · " : item.disliked ? "对方不太喜欢 · " : ""}{item.early ? "初见偏久，对方可能拘谨" : item.summary}</small>
                </button>
              ))}
            </div>
            <div className={styles.paymentChoices} aria-label="选择付款方式">
              <button data-testid="payment-aa" aria-pressed={pendingMeeting === "meet-aa"} onClick={() => setPendingMeeting("meet-aa")}>提前说好 AA · {candidate ? Math.ceil(getActivityCost(candidate.cityCost, meetingActivity as never) / 2) : 0}</button>
              <button data-testid="payment-treat" aria-pressed={pendingMeeting === "meet"} onClick={() => setPendingMeeting("meet")}>这次我请 · {candidate ? getActivityCost(candidate.cityCost, meetingActivity as never) : 0}</button>
            </div>
            <div className={styles.meetingOptions}>
              {([
                { id: "everyday", title: "互相分享平时的生活", detail: "说说兴趣、工作和周末安排，看看聊不聊得来。" },
                { id: "listen", title: "先听对方说最近怎么样", detail: "了解更多，气氛更轻松；也要给对方认识你的机会。" },
                { id: "plans", title: "谈谈城市与婚育预期", detail: state.understanding < 40 ? "目前了解较少，可能显得太急，但能更快了解分歧。" : "已有一些了解，可以认真确认未来有没有交集。" },
              ] as const).map(item => (
                <button key={item.id} data-testid={`meeting-${item.id}`} onClick={() => { const id = pendingMeeting; setPendingMeeting(null); commitAction({ type: "child-action", id, topic: item.id, activity: meetingActivity as never }); setMeetingActivity("meal"); }}>
                  <strong>{item.title}</strong><span>{item.detail}</span>
                  {showActionNumbers && <small>{getActionPreview(state, "child", pendingMeeting, item.id, meetingActivity as never)}</small>}
                </button>
              ))}
            </div>
            <button className={styles.secondaryButton} onClick={() => setPendingMeeting(null)}>先不约，重新想想</button>
          </section>
        </div>
      )}
      {pendingHobby && (
        <div className={styles.overlay}>
          <section className={styles.helpModal} role="dialog" aria-modal="true" aria-label="培养什么爱好" data-testid="hobby-dialog">
            <span className={styles.eyebrow}>爱好与朋友 · 花费 {GROWTH_COSTS.hobby}</span>
            <h2>这一季想把时间花在哪？</h2>
            <div className={styles.meetingOptions}>
              {HOBBY_OPTIONS.map(id => (
                <button key={id} data-testid={`hobby-${id}`} onClick={() => { setPendingHobby(false); commitAction({ type: "child-action", id: "hobby", activity: id }); }}>
                  <strong>{ACTIVITIES[id].title}</strong><span>{state.playerHobbies.includes(id) ? "已经在坚持，继续深入" : "新方向，和同好更聊得来"}</span>
                </button>
              ))}
              <button data-testid="hobby-general" onClick={() => { setPendingHobby(false); commitAction({ type: "child-action", id: "hobby" }); }}>
                <strong>见见朋友，随便放松</strong><span>不固定方向，只是让生活丰富一点。</span>
              </button>
            </div>
            <button className={styles.secondaryButton} onClick={() => setPendingHobby(false)}>再想想</button>
          </section>
        </div>
      )}
      {pendingDecision && (
        <div className={styles.overlay}>
          <section className={styles.helpModal} role="dialog" aria-modal="true" aria-label="确认人生决定" data-testid="decision-dialog">
            <span className={styles.eyebrow}>先确认，这会改变生活阶段</span>
            <h2>{CHILD_ACTIONS.find(item => item.id === pendingDecision)?.title}</h2>
            <p>{pendingDecision === "separate" ? "确认后会结束这段婚姻并记录离婚结局。" : pendingDecision === "baby" ? "确认后会进入育儿阶段，生活开支与照护责任增加。" : "确认后会正式登记结婚，之后继续经营共同生活。"}</p>
            <p>{getActionPreview(state, "child", pendingDecision)}</p>
            <div className={styles.resultActions}>
              <button className={styles.secondaryButton} data-testid="decision-cancel" onClick={() => setPendingDecision(null)}>再想一想</button>
              <button className={styles.primaryButton} data-testid="decision-confirm" onClick={() => { const id = pendingDecision; setPendingDecision(null); commitAction({ type: "child-action", id }); }}>确认这个决定</button>
            </div>
          </section>
        </div>
      )}
      {renderResolutionDialog()}
    </div>
  );
}
