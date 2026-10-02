"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { MESSAGE_KINDS, SLOT_LABELS, getSlots, hashKey, isReplyPending, contextualReplyLabel } from "../inbox";
import type { ActivityId, ChildActionId, InboxMessage, MarriageGameAction, ParentActionId } from "../types";
import type { MarriageGameApi } from "../useMarriageGame";
import { SENDER_CHAT, type ChatBubble, type DatePlan, type DialogueChoice } from "./dialogueTypes";
import { arrivedMessages, buildScript, buildThread, chatProfile, listChats } from "./dialogues";
import { dailyMoments } from "./dailyStories";
import { quarterLabel, type SenderProfile } from "./lines";
import { VENUE_TITLES, getFestivalReminders, phoneClock, type ChatId, type PhoneApp } from "./sceneRouter";
import styles from "./immersive.module.css";
import { CHAT_MEMORY_KEY, restoreConversations } from "./conversationMemory";
import ChatPicture from "./ChatPicture";

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
        {(bubble.kind === "moment" || bubble.kind === "image") && <ChatPicture subject={bubble.meta || bubble.text || "生活随拍"} />}
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

function ReplyChips({ item, onReply, state }: { item: InboxMessage; onReply: PhoneProps["onReply"]; state: MarriageGameApi["state"] }) {
  const kind = MESSAGE_KINDS[item.kind];
  return (
    <div className={styles.replyChips} data-testid={`inbox-${item.kind}`}>
      <small>{item.urgent ? "快速回复 · 对方在等你" : "快速回复 · 也可以先放着"}</small>
      {kind.replies.filter(reply => !(item.kind === "candidate-share" && reply.id === "later" && state.week.slot !== "work")).map(reply => (
        <button key={reply.id} data-testid={`reply-${item.kind}-${reply.id}`} onClick={() => onReply(item, reply.id)}>{contextualReplyLabel(state, item, reply)}</button>
      ))}
    </div>
  );
}

// 单个会话：本周消息与小回应在上，下面是能推进本季主投入的多轮对话
function ChatView({ game, chat, reducedMotion, onChoice, onReply, onDebug, voice = false }: {
  game: MarriageGameApi;
  chat: ChatId;
  reducedMotion: boolean;
  voice?: boolean;
  onChoice: PhoneProps["onChoice"];
  onReply: PhoneProps["onReply"];
  onDebug: (node: string | null, choices: string[]) => void;
}) {
  const { state, playerName } = game;
  const profile = chatProfile(state, chat, playerName);
  const candidate = getCandidate(state.candidateId);
  const image = chat === "candidate" ? candidate?.image : null;
  const script = useMemo(() => buildScript(state, chat), [state, chat]);
  const memoryKey = `${state.seed}-${state.turn}-${state.activeActor}-${state.candidateId}`;
  const memoryChat = `${chat}-${voice ? "voice" : "text"}`;
  const [remembered] = useState(() => {
    try { return restoreConversations(localStorage.getItem(CHAT_MEMORY_KEY), memoryKey).chats[memoryChat]; } catch { return undefined; }
  });
  const [nodeId, setNodeId] = useState<string | null>(remembered?.nodeId && script?.nodes[remembered.nodeId] ? remembered.nodeId : script?.start ?? null);
  const [sent, setSent] = useState<ChatBubble[]>(remembered?.sent ?? []);
  useEffect(() => {
    try {
      const book = restoreConversations(localStorage.getItem(CHAT_MEMORY_KEY), memoryKey);
      book.chats[memoryChat] = { nodeId, sent: sent.slice(-100) };
      localStorage.setItem(CHAT_MEMORY_KEY, JSON.stringify(book));
    } catch { /* Current conversation remains usable without storage. */ }
  }, [memoryKey, memoryChat, nodeId, sent]);
  const [typing, setTyping] = useState(false);
  const thread = voice ? [] : buildThread(state, chat, playerName);
  const pending = voice ? [] : arrivedMessages(state).filter(item => SENDER_CHAT[item.from] === chat && isReplyPending(state, item));
  const node = script && nodeId ? script.nodes[nodeId] : null;
  const threadRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Replies and the choices tray both change the available height. Track both,
  // including image loads and viewport changes, without scrolling the whole page.
  useLayoutEffect(() => {
    const element = threadRef.current;
    if (!element) return undefined;
    const bottom = () => { element.scrollTop = element.scrollHeight; };
    bottom();
    const observer = new ResizeObserver(bottom);
    observer.observe(element);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [chat]);
  useLayoutEffect(() => {
    const element = threadRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [thread.length, sent.length, typing, nodeId, pending.length]);

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
      <div className={styles.thread} ref={threadRef} data-testid="chat-thread" role="log" aria-live="polite">
        <div ref={contentRef}>
        <p className={styles.threadDate}>{voice ? state.week.slot === "commute" ? "电话接通了。你沿着人行道，听着那头的声音。" : "电话接通了。你们慢慢聊。" : `${quarterLabel(state)} · ${SLOT_LABELS[state.week.slot]}`}</p>
        {thread.map(bubble => <Bubble key={bubble.id} bubble={bubble} profile={profile} image={image} />)}
        {/* 本周已经有消息往来时，不再重复一句开场白 */}
        {script && thread.length === 0 && script.nodes[script.start].lines.map(line => <Bubble key={`start-${line.id}`} bubble={line} profile={profile} image={image} />)}
        {sent.map(bubble => <Bubble key={bubble.id} bubble={bubble} profile={profile} image={image} />)}
        {typing && <p className={styles.typing} data-testid="typing">{voice ? "听筒那头传来了声音…" : "对方正在输入…"}</p>}
        </div>
      </div>
      <div className={styles.replyTray} data-testid="chat-reply-tray">
      {pending.length > 0 && (
        <div className={styles.composer}>
          {pending.map(item => <ReplyChips key={item.id} item={item} onReply={onReply} state={state} />)}
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
    </div>
  );
}

function MomentsView({ game, onReply }: { game: MarriageGameApi; onReply: PhoneProps["onReply"] }) {
  const { state } = game;
  const candidate = getCandidate(state.candidateId);
  const moment = arrivedMessages(state).find(item => item.kind === "candidate-moments");
  const posts = dailyMoments(state, candidate);
  return (
    <div className={styles.moments} data-testid="moments-feed">
      <header className={styles.momentsCover}><strong>朋友圈</strong><small>{quarterLabel(state)}</small></header>
      {posts.map(post => (
        <article key={post.id}>
          <span className={styles.momentAvatar}>{post.image ? <Image src={post.image} alt="" fill unoptimized sizes="40px" className={styles.avatarImage} /> : post.name.slice(0, 1)}</span>
          <div>
            <strong>{post.name}</strong>
            <p>{post.text}</p>
            {post.picture && <ChatPicture subject={post.picture} />}
            {post.id === "candidate" && moment && !state.week.handled[moment.id] && state.week.actor === state.activeActor && <ReplyChips item={moment} onReply={onReply} state={state} />}
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

function CallView({ game, onReply, onChoice, reducedMotion }: { game: MarriageGameApi; onReply: PhoneProps["onReply"]; onChoice: PhoneProps["onChoice"]; reducedMotion: boolean }) {
  const { state } = game;
  const [contact, setContact] = useState<ChatId | null>(null);
  const [connected, setConnected] = useState(false);
  if (contact) return (
    <div className={styles.chatView} data-testid="active-call">
      <div className={styles.callHeader}><PhoneOutlined /> 与{chatProfile(state, contact).name}通话中<button data-testid="hang-up" onClick={() => { setContact(null); setConnected(true); }}>挂断</button></div>
      <ChatView key={`${contact}-${state.turn}`} game={game} chat={contact} voice reducedMotion={reducedMotion} onReply={onReply} onChoice={onChoice} onDebug={() => undefined} />
    </div>
  );
  const incoming = state.week.actor === state.activeActor
    ? arrivedMessages(state).find(item => item.kind === "mom-marriage" && !state.week.handled[item.id])
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
            <button key={reply.id} data-testid={`reply-${incoming.kind}-${reply.id}`} data-answer={reply.id === "answer"} onClick={() => { onReply(incoming, reply.id); if (reply.id === "answer") setContact("mom"); }}>{reply.label}</button>
          ))}
        </div>
      </div>
    );
  }
  const handled = arrivedMessages(state).filter(item => item.kind === "mom-marriage");
  return (
    <ul className={styles.callLog} data-testid="call-log">
      <li className={styles.callContacts}>
        {connected && <small>通话已结束</small>}
        <button data-testid="call-mom" onClick={() => setContact(state.activeActor === "parent" ? "child" : "mom")}><PhoneOutlined /> {state.activeActor === "parent" ? "打给孩子" : "打给妈妈"}</button>
        {state.candidateId && !state.matchClosed && state.activeActor === "child" && <button data-testid="call-candidate" onClick={() => setContact("candidate")}><PhoneOutlined /> 打给{getCandidate(state.candidateId)?.name}</button>}
      </li>
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
        <header className={styles.statusBar}><b>{phoneClock(state)}</b><span>5G ▮▮▮ 78%</span></header>
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
              <div className={styles.lockClock}><strong>{phoneClock(state)}</strong><small>{quarterLabel(state)} · {SLOT_LABELS[state.week.slot]}</small></div>
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
          {app === "chat" && chat && <ChatView key={`${state.seed}-${chat}-${state.turn}-${state.activeActor}-${state.candidateId}`} game={game} chat={chat} reducedMotion={reducedMotion} onChoice={onChoice} onReply={onReply} onDebug={(node, choices) => setChatDebug(current => (current.node === node && current.choices.join() === choices.join() ? current : { node, choices }))} />}
          {app === "moments" && <MomentsView game={game} onReply={onReply} />}
          {app === "map" && <MapView game={game} onStartDate={onStartDate} />}
          {app === "call" && <CallView game={game} onReply={onReply} onChoice={onChoice} reducedMotion={reducedMotion} />}
          {app === "bank" && <BankView game={game} onChoice={onChoice} />}
          {app === "calendar" && <CalendarView game={game} onChoice={onChoice} />}
          {app === "album" && <AlbumView game={game} />}
        </div>
      </section>
    </div>
  );
}
