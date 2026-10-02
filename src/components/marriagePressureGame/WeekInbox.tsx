"use client";

import { useState } from "react";
import { MessageOutlined } from "@ant-design/icons";
import { MESSAGE_KINDS, SLOT_LABELS } from "./inbox";
import { describeMessage, senderName } from "./immersive/lines";
import type { MarriageGameApi } from "./useMarriageGame";
import styles from "./marriage.module.css";

// 经典模式下的紧凑收件箱：可以回复本周的任意一条消息
export default function WeekInbox({ game }: { game: MarriageGameApi }) {
  const { state } = game;
  const [feedback, setFeedback] = useState("");
  const [open, setOpen] = useState(false);
  if (state.week.actor !== state.activeActor || !state.week.inbox.length) return null;
  const pending = state.week.inbox.filter(item => !state.week.handled[item.id]);
  return (
    <section className={styles.weekInbox} data-testid="week-inbox">
      <button className={styles.weekInboxToggle} data-testid="week-inbox-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MessageOutlined /> 本周消息 · {pending.length ? `${pending.length} 条待回` : "都处理了"}
        {pending.some(item => item.urgent) && <em>有人在等你回复</em>}
      </button>
      {open && (
        <div className={styles.weekInboxList}>
          {state.week.inbox.map(item => {
            const kind = MESSAGE_KINDS[item.kind];
            const handled = state.week.handled[item.id];
            return (
              <article key={item.id} data-testid={`inbox-${item.kind}`} data-handled={Boolean(handled)}>
                <header><strong>{senderName(state, item.from)}</strong><small>{SLOT_LABELS[item.slot]}{item.urgent ? " · 等你回复" : ""}</small></header>
                <p>{describeMessage(state, item)}</p>
                {handled ? (
                  <small>{handled === "ignored" ? "已读未回" : `已回复：${kind.replies.find(reply => reply.id === handled)?.label}`}</small>
                ) : (
                  <div>
                    {kind.replies.map(reply => (
                      <button
key={reply.id}
data-testid={`reply-${item.kind}-${reply.id}`}
onClick={() => {
                        const result = game.commitAction({ type: "reply", messageId: item.id, choice: reply.id }, { quiet: true });
                        if (result) setFeedback(result.steps[result.steps.length - 1]?.detail ?? reply.note);
                      }}>{reply.label}</button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
          {feedback && <p className={styles.weekInboxFeedback} data-testid="week-inbox-feedback">{feedback}</p>}
          <small>紧急消息在选择本季主投入时仍未回复，会按“已读不回”结算。每季小回应对同一数值最多累计 ±4。</small>
        </div>
      )}
    </section>
  );
}
