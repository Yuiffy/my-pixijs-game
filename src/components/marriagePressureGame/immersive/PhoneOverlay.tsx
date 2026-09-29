"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarOutlined,
  CameraOutlined,
  CloseOutlined,
  EnvironmentOutlined,
  LeftOutlined,
  LinkOutlined,
  MessageOutlined,
  PhoneOutlined,
  PictureOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { ACTIVITIES, getActivityCost, getAvailableActivities } from "../activities";
import { CHILD_ACTIONS, PARENT_ACTIONS } from "../content";
import { getCandidate } from "../engine";
import { getHouseholdBudget } from "../household";
import { MESSAGE_KINDS, SLOT_LABELS, getSlots, hashKey } from "../inbox";
import type { ActivityId, ChildActionId, InboxMessage, MarriageGameAction, ParentActionId } from "../types";
import type { MarriageGameApi } from "../useMarriageGame";
import { SENDER_CHAT, type ChatBubble, type DatePlan, type DialogueChoice } from "./dialogueTypes";
import { buildScript, buildThread, chatProfile, listChats } from "./dialogues";
import { pickLine, quarterLabel, type SenderProfile } from "./lines";
import { VENUE_TITLES, getFestivalReminders, type ChatId, type PhoneApp } from "./sceneRouter";
import styles from "./immersive.module.css";

export interface PhoneDebug {
  phoneApp: PhoneApp;
  chatId: ChatId | null;
  node: string | null;
  choices: string[];
}

interface PhoneProps {
  game: MarriageGameApi;
  app: PhoneApp;
  chat: ChatId | null;
  reducedMotion: boolean;
  onNavigate: (app: PhoneApp, chat?: ChatId | null) => void;
  onClose: () => void;
  onChoice: (choice: DialogueChoice) => void;
  onReply: (item: InboxMessage, choice: string) => void;
  onStartDate: (plan: DatePlan) => void;
  onDebug: (debug: PhoneDebug) => void;
}

const SLOT_CLOCK: Record<string, string> = { work: "11:42", commute: "18:36", evening: "22:08", morning: "09:15", afternoon: "15:20" };

export function Avatar({ profile, image, size = 40 }: { profile: SenderProfile; image?: string | null; size?: number }) {
  if (profile.avatar === "portrait" && image) {
    return <span className={styles.avatar} style={{ width: size, height: size }}><Image src={image} alt="" fill unoptimized sizes="48px" className={styles.avatarImage} /></span>;
  }
  if (profile.avatar === "lotus") {
    return (
      <span className={styles.avatar} style={{ width: size, height: size, background: "#f6e3e6" }} aria-hidden>
        <svg viewBox="0 0 40 40" width={size} height={size}>
          <rect width="40" height="40" fill="#cfe6e0" />
          <ellipse cx="20" cy="31" rx="15" ry="4" fill="#4f8a55" />
          {[-34, -12, 12, 34].map(angle => <ellipse key={angle} cx="20" cy="22" rx="5" ry="11" fill="#e98aa0" transform={`rotate(${angle} 20 28)`} />)}
          <ellipse cx="20" cy="21" rx="5" ry="11" fill="#f4a9b8" />
        </svg>
      </span>
    );
  }
  if (profile.avatar === "landscape") {
    return (
      <span className={styles.avatar} style={{ width: size, height: size }} aria-hidden>
        <svg viewBox="0 0 40 40" width={size} height={size}>
          <rect width="40" height="40" fill="#f3e7c9" />
          <circle cx="29" cy="11" r="5" fill="#e0703a" />
          <path d="M0 32 L12 16 L20 26 L28 14 L40 30 L40 40 L0 40Z" fill="#4f7f6a" />
          <path d="M0 36 L40 33 L40 40 L0 40Z" fill="#6aa0b8" />
        </svg>
      </span>
    );
  }
  if (profile.avatar === "group") {
    return (
      <span className={styles.avatarGroup} style={{ width: size, height: size }} aria-hidden>
        {[0, 1, 2, 3].map(index => <i key={index} style={{ background: [profile.color, "#e98aa0", "#6aa0b8", "#e0b24c"][index] }} />)}
      </span>
    );
  }
  return <span className={styles.avatar} style={{ width: size, height: size, background: profile.color }} aria-hidden><b>{profile.initial}</b></span>;
}

// 群聊里每个发言人用自己的字头像；妈妈在家庭群里仍是荷花头像
const SPEAKER_COLORS = ["#c0703a", "#4f7a9c", "#8a5a9c", "#4f8a55", "#b8433a", "#7a6a52"];

function speakerProfile(speaker: string): SenderProfile {
  if (speaker === "妈妈") return { name: speaker, avatar: "lotus", color: "#e98aa0", initial: "妈" };
  if (speaker === "爸爸") return { name: speaker, avatar: "landscape", color: "#4f7f6a", initial: "爸" };
  return { name: speaker, avatar: "letter", color: SPEAKER_COLORS[hashKey(speaker) % SPEAKER_COLORS.length], initial: speaker.slice(0, 1) };
}

function Bubble({ bubble, profile, image }: { bubble: ChatBubble; profile: SenderProfile; image?: string | null }) {
  if (bubble.kind === "system") return <p className={styles.systemLine}>{bubble.text}</p>;
  const sender = bubble.speaker ? speakerProfile(bubble.speaker) : profile;
  const content = bubble.kind === "sticker"
    ? <span className={styles.sticker} data-testid="bubble-sticker">{bubble.text}</span>
    : (
      <div className={styles.bubble} data-kind={bubble.kind}>
        {bubble.kind === "voice" && <span className={styles.voice}><i /><i /><i /> {bubble.meta}</span>}
        {bubble.kind === "transfer" && <span className={styles.transfer}><WalletOutlined /> <b>{bubble.meta}</b></span>}
        {bubble.kind === "card" && <span className={styles.card}><small>个人名片</small><b>{bubble.meta}</b></span>}
        {bubble.kind === "link" && <span className={styles.card}><small><LinkOutlined /> 链接</small><b>{bubble.meta}</b></span>}
        {bubble.kind === "moment" && <span className={styles.moment}><PictureOutlined /> <small>{bubble.meta}</small></span>}
        {bubble.kind === "image" && <span className={styles.photo}><CameraOutlined /> <small>{bubble.meta}</small></span>}
        {bubble.kind === "call" && <span className={styles.callBubble}><PhoneOutlined /> {bubble.meta}</span>}
        {bubble.text && <span className={bubble.kind === "voice" ? styles.voiceText : undefined}>{bubble.text}</span>}
      </div>
    );
  return (
    <div className={styles.bubbleRow} data-mine={bubble.mine}>
      {!bubble.mine && <Avatar profile={sender} image={bubble.speaker ? null : image} size={34} />}
      {bubble.speaker && !bubble.mine ? <div className={styles.speakerWrap}><small className={styles.speaker}>{bubble.speaker}</small>{content}</div> : content}
    </div>
  );
}

function ReplyChips({ item, onReply }: { item: InboxMessage; onReply: PhoneProps["onReply"] }) {
  const kind = MESSAGE_KINDS[item.kind];
  return (
    <div className={styles.replyChips} data-testid={`inbox-${item.kind}`}>
      <small>{item.urgent ? "快速回复 · 对方在等你" : "快速回复 · 也可以先放着"}</small>
      {kind.replies.map(reply => (
        <button key={reply.id} data-testid={`reply-${item.kind}-${reply.id}`} onClick={() => onReply(item, reply.id)}>{reply.label}</button>
      ))}
    </div>
  );
}

// 单个会话：本周消息与小回应在上，下面是能推进本季主投入的多轮对话
function ChatView({ game, chat, reducedMotion, onChoice, onReply, onDebug }: {
  game: MarriageGameApi;
  chat: ChatId;
  reducedMotion: boolean;
  onChoice: PhoneProps["onChoice"];
  onReply: PhoneProps["onReply"];
  onDebug: (node: string | null, choices: string[]) => void;
}) {
  const { state, playerName } = game;
  const profile = chatProfile(state, chat, playerName);
  const candidate = getCandidate(state.candidateId);
  const image = chat === "candidate" ? candidate?.image : null;
  const script = useMemo(() => buildScript(state, chat), [state, chat]);
  const [nodeId, setNodeId] = useState<string | null>(script?.start ?? null);
  const [sent, setSent] = useState<ChatBubble[]>([]);
  const [typing, setTyping] = useState(false);
  const thread = buildThread(state, chat, playerName);
  const pending = state.week.actor === state.activeActor ? state.week.inbox.filter(item => SENDER_CHAT[item.from] === chat && !state.week.handled[item.id]) : [];
  const node = script && nodeId ? script.nodes[nodeId] : null;

  useEffect(() => {
    setNodeId(script?.start ?? null);
    setSent([]);
  }, [chat, state.turn, state.activeActor, script?.start]);

  useEffect(() => {
    if (reducedMotion || !node?.lines.length) { setTyping(false); return undefined; }
    setTyping(true);
    const timer = window.setTimeout(() => setTyping(false), 520);
    return () => window.clearTimeout(timer);
  }, [node, reducedMotion]);

  useEffect(() => {
    onDebug(nodeId, typing ? [] : node?.choices.map(choice => choice.id) ?? []);
  }, [nodeId, node, typing, onDebug]);

  const choose = (choice: DialogueChoice) => {
    const { reply, replyKind = "text", replyMeta } = choice;
    if (reply) setSent(current => [...current, { id: `sent-${current.length}`, mine: true, kind: replyKind, text: reply, meta: replyMeta }]);
    if (choice.next && script) {
      const target = script.nodes[choice.next];
      if (target) setSent(current => [...current, ...target.lines.map(line => ({ ...line, id: `${line.id}-${current.length}` }))]);
      setNodeId(choice.next);
      return;
    }
    onChoice(choice);
  };

  return (
    <div className={styles.chatView} data-testid={`chat-view-${chat}`}>
      <div className={styles.thread}>
        <p className={styles.threadDate}>{quarterLabel(state)} · {SLOT_LABELS[state.week.slot]}</p>
        {thread.map(bubble => <Bubble key={bubble.id} bubble={bubble} profile={profile} image={image} />)}
        {/* 本周已经有消息往来时，不再重复一句开场白 */}
        {script && thread.length === 0 && script.nodes[script.start].lines.map(line => <Bubble key={`start-${line.id}`} bubble={line} profile={profile} image={image} />)}
        {sent.map(bubble => <Bubble key={bubble.id} bubble={bubble} profile={profile} image={image} />)}
        {typing && <p className={styles.typing} data-testid="typing">对方正在输入…</p>}
      </div>
      {pending.length > 0 && (
        <div className={styles.composer}>
          {pending.map(item => <ReplyChips key={item.id} item={item} onReply={onReply} />)}
        </div>
      )}
      {node && !typing && (
        <div className={styles.choices} data-testid="dialogue-choices">
          {node.choices.map(choice => (
            <button key={choice.id} data-testid={`choice-${choice.id}`} data-close={Boolean(choice.close)} onClick={() => choose(choice)}>
              <span>{choice.label}</span>{choice.hint && <small>{choice.hint}</small>}
            </button>
          ))}
        </div>
      )}
      {!script && !pending.length && <p className={styles.systemLine}>这个会话本周没有需要处理的事。</p>}
    </div>
  );
}

function MomentsView({ game, onReply }: { game: MarriageGameApi; onReply: PhoneProps["onReply"] }) {
  const { state } = game;
  const candidate = getCandidate(state.candidateId);
  const moment = state.week.inbox.find(item => item.kind === "candidate-moments");
  const revealed = state.knownInterests[state.knownInterests.length - 1];
  const posts = [
    ...(candidate && !state.matchClosed ? [{
      id: "candidate",
      name: candidate.name,
      image: candidate.image,
      text: revealed ? `周末又去${ACTIVITIES[revealed].title}了，下次想带朋友一起。` : pickLine(["今天的晚霞，拍了九张还是觉得不如眼睛看到的好看。", "打卡。", "周末的碎片。", "又是一周，辛苦了自己。"], state.seed, state.turn, candidate.id),
    }] : []),
    { id: "classmate", name: "大学同学小周", image: null, text: pickLine(["婚礼请柬已发，大家一定要来！", "宝宝满月啦，感谢大家的祝福。", "终于上岸了，明天入职。"], state.seed, state.turn, "classmate") },
    { id: "coworker", name: "隔壁组的阿杰", image: null, text: pickLine(["凌晨一点的办公室，灯还亮着。", "周末爬了个山，腿废了。", "裸辞第一天，去看海。"], state.seed, state.turn, "coworker") },
    { id: "aunt", name: "三姑", image: null, text: pickLine(["转发：《这三种人最容易被剩下》", "我家孙子会背唐诗了！", "今天广场舞比赛拿了第二名。"], state.seed, state.turn, "aunt") },
  ];
  return (
    <div className={styles.moments} data-testid="moments-feed">
      <header className={styles.momentsCover}><strong>朋友圈</strong><small>{quarterLabel(state)}</small></header>
      {posts.map(post => (
        <article key={post.id}>
          <span className={styles.momentAvatar}>{post.image ? <Image src={post.image} alt="" fill unoptimized sizes="40px" className={styles.avatarImage} /> : post.name.slice(0, 1)}</span>
          <div>
            <strong>{post.name}</strong>
            <p>{post.text}</p>
            <i className={styles.momentPhotos} style={{ ["--seed" as string]: hashKey(post.id, state.turn) % 360 }} />
            {post.id === "candidate" && moment && !state.week.handled[moment.id] && state.week.actor === state.activeActor && <ReplyChips item={moment} onReply={onReply} />}
          </div>
        </article>
      ))}
    </div>
  );
}

// 点评风格的约会地图：价格按对象所在城市计算，已知喜好会标出来
function MapView({ game, onStartDate }: { game: MarriageGameApi; onStartDate: PhoneProps["onStartDate"] }) {
  const { state, childActions } = game;
  const candidate = getCandidate(state.candidateId);
  const [payment, setPayment] = useState<DatePlan["payment"]>("meet-aa");
  const activities = getAvailableActivities(state);
  const canMeet = state.activeActor === "child" && (childActions.includes("meet-aa") || childActions.includes("meet"));
  if (!candidate || !canMeet) return <p className={styles.systemLine}>现在还约不了见面。</p>;
  return (
    <div className={styles.mapView} data-testid="date-map">
      <div className={styles.mapHeader}>
        <strong>周末去哪儿 · {candidate.name}</strong>
        <div role="group" aria-label="付款方式">
          <button data-testid="payment-aa" aria-pressed={payment === "meet-aa"} onClick={() => setPayment("meet-aa")}>提前说好 AA</button>
          <button data-testid="payment-treat" aria-pressed={payment === "meet"} disabled={!childActions.includes("meet")} onClick={() => setPayment("meet")}>这次我请</button>
        </div>
      </div>
      <div className={styles.mapList}>
        {activities.map(item => {
          const cost = getActivityCost(candidate.cityCost, item.id);
          const rating = (40 + (hashKey(item.id, candidate.id) % 10)) / 10;
          return (
            <button key={item.id} data-testid={`venue-${item.id}`} onClick={() => onStartDate({ activity: item.id, payment })}>
              <i className={styles.venueThumb} data-venue={item.venue} />
              <span>
                <strong>{VENUE_TITLES[item.venue]} · {item.title}</strong>
                <small>★ {rating.toFixed(1)} · 人均 {payment === "meet-aa" ? Math.ceil(cost / 2) : cost} 预算 · {((hashKey(item.id, "km") % 60) / 10 + 0.4).toFixed(1)} km</small>
                <em>{item.liked ? "对方可能喜欢" : item.disliked ? "对方不太喜欢" : item.early ? "初见偏久，对方可能拘谨" : item.summary}</em>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CallView({ game, onReply }: { game: MarriageGameApi; onReply: PhoneProps["onReply"] }) {
  const { state } = game;
  const incoming = state.week.actor === state.activeActor
    ? state.week.inbox.find(item => item.kind === "mom-marriage" && !state.week.handled[item.id])
    : undefined;
  if (incoming) {
    const kind = MESSAGE_KINDS[incoming.kind];
    return (
      <div className={styles.incoming} data-testid="incoming-call">
        <Avatar profile={chatProfile(state, "mom")} size={86} />
        <strong>妈妈</strong>
        <small>语音通话邀请…</small>
        <div>
          {kind.replies.map(reply => (
            <button key={reply.id} data-testid={`reply-${incoming.kind}-${reply.id}`} data-answer={reply.id === "answer"} onClick={() => onReply(incoming, reply.id)}>{reply.label}</button>
          ))}
        </div>
      </div>
    );
  }
  const handled = state.week.inbox.filter(item => item.kind === "mom-marriage");
  return (
    <ul className={styles.callLog} data-testid="call-log">
      {handled.map(item => <li key={item.id}><PhoneOutlined /> 妈妈 · {state.week.handled[item.id] === "answer" ? "已接听" : "未接来电"}</li>)}
      <li><PhoneOutlined /> 快递 · 已接听 0:32</li>
      <li><PhoneOutlined /> 推销 · 已拒接</li>
    </ul>
  );
}

function BankView({ game, onChoice }: { game: MarriageGameApi; onChoice: PhoneProps["onChoice"] }) {
  const { state, event, childActions } = game;
  const budget = getHouseholdBudget(state);
  const lines = [
    `【招财银行】您尾号 0612 的账户可用余额约 ${state.savings} 预算点。`,
    `【记账】本季固定：工作结余 +${budget.income}，伴侣投入 +${budget.partnerIncome}，基本生活 −${budget.essentials}，弹性 −${budget.extras}，还款 −${budget.repayment}；合计 ${budget.net >= 0 ? "+" : ""}${budget.net}。`,
    ...(event ? [`【招财银行】您尾号 0612 的账户${event.savings >= 0 ? "入账" : "支出"} ${Math.abs(event.savings)} 预算点，摘要：${event.title}。`] : []),
    ...(state.weddingDebt > 0 ? [`【分期】婚育相关分期剩余 ${state.weddingDebt}。`] : []),
  ];
  const actions: Array<{ id: ChildActionId; label: string }> = [
    { id: "budget", label: "和对方商量：这阵子过简单一点" },
    { id: "ask-help", label: "把账单发给家里，请他们帮一次" },
  ];
  return (
    <div className={styles.bank} data-testid="bank-sms">
      {lines.map(line => <p key={line}>{line}</p>)}
      {state.activeActor === "child" && actions.filter(item => childActions.includes(item.id)).map(item => (
        <button key={item.id} data-testid={`plan-${item.id}`} onClick={() => onChoice({ id: item.id, label: item.label, action: { type: "child-action", id: item.id } })}>{item.label}</button>
      ))}
    </div>
  );
}

// 日历：本周时段、节日提醒，以及本季所有可选的主投入（兜底入口）
function CalendarView({ game, onChoice }: { game: MarriageGameApi; onChoice: PhoneProps["onChoice"] }) {
  const { state, childActions, parentActions } = game;
  const slots = getSlots(state.week.actor);
  const actor = state.activeActor;
  const definitions = actor === "parent" ? PARENT_ACTIONS.filter(item => parentActions.includes(item.id)) : CHILD_ACTIONS.filter(item => childActions.includes(item.id) && item.id !== "invest");
  return (
    <div className={styles.calendar} data-testid="calendar">
      <ol className={styles.weekStrip}>
        {slots.map(slot => <li key={slot} data-current={state.week.slot === slot}>{SLOT_LABELS[slot]}</li>)}
        <li data-current={false}>周末</li>
      </ol>
      {getFestivalReminders(state).map(line => <p key={line} className={styles.festival}>{line}</p>)}
      <h3>这一季，把时间花在哪？</h3>
      <small>只能选一项，选完这一季就过去了。</small>
      <div className={styles.planList}>
        {definitions.map(item => (
          <button
            key={item.id}
            data-testid={`plan-${item.id}`}
            onClick={() => {
              const action: MarriageGameAction = actor === "parent"
                ? { type: "parent-action", id: item.id as ParentActionId }
                : { type: "child-action", id: item.id as ChildActionId };
              const confirm = ["marry", "simple-wedding", "baby", "separate"].includes(item.id) ? item.id as ChildActionId : undefined;
              onChoice({ id: item.id, label: item.title, action: confirm ? undefined : action, confirm, openApp: item.id === "meet" || item.id === "meet-aa" ? "map" : undefined });
            }}
          >
            <strong>{item.title}</strong><small>{item.detail}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function AlbumView({ game }: { game: MarriageGameApi }) {
  const { state } = game;
  const photos = [...state.dateLog].reverse();
  if (!photos.length) return <p className={styles.systemLine}>还没有一起出去玩的照片。</p>;
  return (
    <div className={styles.album} data-testid="album">
      {photos.map(photo => {
        const who = getCandidate(photo.candidateId);
        const activity = ACTIVITIES[photo.activity as ActivityId];
        return (
          <figure key={`${photo.turn}-${photo.activity}-${photo.candidateId}`} data-testid="album-photo" data-venue={activity.venue}>
            <span className={styles.albumPortrait}>{who && <Image src={who.image} alt="" fill unoptimized sizes="120px" className={styles.avatarImage} />}</span>
            <figcaption><strong>{activity.title}</strong><small>第 {photo.turn} 季 · {who?.name}{photo.liked ? " · 对方很开心" : photo.disliked ? " · 对方有点勉强" : ""}</small></figcaption>
          </figure>
        );
      })}
    </div>
  );
}

const APPS: Array<{ id: PhoneApp; title: string; icon: JSX.Element; color: string }> = [
  { id: "chats", title: "微信", icon: <MessageOutlined />, color: "#57b36a" },
  { id: "moments", title: "朋友圈", icon: <PictureOutlined />, color: "#e0a03a" },
  { id: "map", title: "点评", icon: <EnvironmentOutlined />, color: "#e8663a" },
  { id: "call", title: "电话", icon: <PhoneOutlined />, color: "#3fa85a" },
  { id: "bank", title: "短信", icon: <WalletOutlined />, color: "#3d6a9c" },
  { id: "calendar", title: "日历", icon: <CalendarOutlined />, color: "#c24b4b" },
  { id: "album", title: "相册", icon: <CameraOutlined />, color: "#8a6ab0" },
];

const APP_TITLES: Record<PhoneApp, string> = { home: "", chats: "微信", chat: "", moments: "朋友圈", map: "点评 · 附近", call: "电话", bank: "短信", calendar: "日历", album: "相册" };

export default function PhoneOverlay({ game, app, chat, reducedMotion, onNavigate, onClose, onChoice, onReply, onStartDate, onDebug }: PhoneProps) {
  const { state, playerName } = game;
  const [chatDebug, setChatDebug] = useState<{ node: string | null; choices: string[] }>({ node: null, choices: [] });
  const chats = listChats(state, playerName);
  const unread = chats.reduce((sum, entry) => sum + entry.unread, 0);
  const candidate = getCandidate(state.candidateId);
  const title = app === "chat" && chat ? chatProfile(state, chat, playerName).name : APP_TITLES[app];

  useEffect(() => {
    onDebug({ phoneApp: app, chatId: app === "chat" ? chat : null, node: app === "chat" ? chatDebug.node : null, choices: app === "chat" ? chatDebug.choices : [] });
  }, [app, chat, chatDebug, onDebug]);

  const back = () => {
    if (app === "chat") onNavigate("chats");
    else if (app === "home") onClose();
    else onNavigate("home");
  };

  return (
    <div className={styles.phoneLayer} role="dialog" aria-modal="true" aria-label="手机">
      <section className={styles.phone} data-testid="phone" data-app={app}>
        <header className={styles.statusBar}><b>{SLOT_CLOCK[state.week.slot] ?? "20:00"}</b><span>5G ▮▮▮ 78%</span></header>
        {app !== "home" && (
          <nav className={styles.phoneNav}>
            <button aria-label="返回" data-testid="phone-back" onClick={back}><LeftOutlined /></button>
            <strong>{title}</strong>
            <button aria-label="收起手机" data-testid="phone-close" onClick={onClose}><CloseOutlined /></button>
          </nav>
        )}
        <div className={styles.phoneBody}>
          {app === "home" && (
            <div className={styles.homeScreen}>
              <div className={styles.lockClock}><strong>{SLOT_CLOCK[state.week.slot] ?? "20:00"}</strong><small>{quarterLabel(state)} · {SLOT_LABELS[state.week.slot]}</small></div>
              <div className={styles.appGrid}>
                {APPS.map(item => (
                  <button key={item.id} data-testid={`app-${item.id}`} onClick={() => onNavigate(item.id)}>
                    <i style={{ background: item.color }}>{item.icon}{item.id === "chats" && unread > 0 && <em>{unread}</em>}</i>
                    <span>{item.title}</span>
                  </button>
                ))}
              </div>
              <button className={styles.phoneHomeClose} data-testid="phone-close" onClick={onClose}>收起手机</button>
            </div>
          )}
          {app === "chats" && (
            <ul className={styles.chatList} data-testid="chat-list">
              {chats.map(entry => (
                <li key={entry.id}>
                  <button data-testid={`chat-${entry.id}`} onClick={() => onNavigate("chat", entry.id)}>
                    <Avatar profile={entry.profile} image={entry.id === "candidate" ? candidate?.image : null} />
                    <span><strong>{entry.profile.name}</strong><small>{entry.preview}</small></span>
                    {entry.unread > 0 && <em data-urgent={entry.urgent}>{entry.unread}</em>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {app === "chat" && chat && <ChatView key={`${chat}-${state.turn}-${state.activeActor}`} game={game} chat={chat} reducedMotion={reducedMotion} onChoice={onChoice} onReply={onReply} onDebug={(node, choices) => setChatDebug(current => (current.node === node && current.choices.join() === choices.join() ? current : { node, choices }))} />}
          {app === "moments" && <MomentsView game={game} onReply={onReply} />}
          {app === "map" && <MapView game={game} onStartDate={onStartDate} />}
          {app === "call" && <CallView game={game} onReply={onReply} />}
          {app === "bank" && <BankView game={game} onChoice={onChoice} />}
          {app === "calendar" && <CalendarView game={game} onChoice={onChoice} />}
          {app === "album" && <AlbumView game={game} />}
        </div>
      </section>
    </div>
  );
}
