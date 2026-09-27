"use client";

import { useEffect, useRef, useState } from "react";
import { UnitPortrait } from "../hud/shared";
import { EnemyFormationOverlay } from "../hud/EnemyFormationOverlay";
import type { MultiplayerBridge } from "./MultiplayerBridge";
import "./multiplayer-controls.css";

export default function MultiplayerControls({
  bridge,
}: {
  bridge: MultiplayerBridge;
}) {
  const { match, me, session } = bridge;
  const [scout, setScout] = useState<number | null>(null);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    setScout(null);
  }, [match.round, match.phase]);
  useEffect(() => {
    if (!bridge.panelOpen) return undefined;
    const prior = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (scout !== null) setScout(null);
        else bridge.openPanel(false);
      }
      if (e.key === "Tab" && scout === null) {
        const items = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), select, a[href]",
          ) || [],
        );
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        }
        if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, [bridge, bridge.panelOpen, scout]);
  const label = (index: number) => {
    const b = match.battles[index];
    return b.rescueFor !== null
      ? `${match.players[b.a].name} → 救援 ${match.players[b.rescueFor].name}`
      : b.b === null
        ? `${match.players[b.a].name}的防线`
        : `${match.players[b.a].name} vs ${match.players[b.b].name}${b.ghost ? "（幻象）" : ""}`;
  };
  const { report } = me;
  const resultText = report
    ? `${report.rescuedBy !== null ? `${match.players[report.rescuedBy].name}前来兜底 · ` : ""}${report.helped !== null ? `已协助 ${match.players[report.helped].name} · ` : ""}${report.damage ? `损失 ${report.damage} 生命` : "未损失生命"} · 收入 +${report.income} 金`
    : "观战中";
  return (
    <>
      {(session.message || !session.connected) && (
        <div className="rift-match-notice" role="status">
          {session.message || "连接中断，正在重连；已确认操作已保存"}
        </div>
      )}
      {match.phase !== "preparation" && (
        <section className="rift-match-live-bar" aria-label="多人战斗控制">
          <div className="rift-match-live-status" role="status">
            <div>
              <strong>{bridge.stageLabel}</strong>
              <span>{bridge.statusText}</span>
            </div>
            <button type="button" onClick={() => bridge.openPanel(true)}>
              {bridge.settled ? "本轮战报" : "房间"}
            </button>
          </div>
          {bridge.settled && (
            <p className="rift-match-round-result">{resultText}</p>
          )}
          <nav className="rift-match-spectators" aria-label="点击玩家头像观战">
            {match.players.map((p, seat) => {
              const index = bridge.battleForSeat(seat);
              const unitId = p.previous.find(Boolean)?.id ?? "nori";
              return (
                <button
                  type="button"
                  key={seat}
                  aria-label={`观战 ${p.name}`}
                  aria-pressed={bridge.watchedSeat === seat}
                  disabled={index < 0}
                  onClick={() => bridge.watchSeat(seat)}
                >
                  <span className="rift-match-avatar">
                    <UnitPortrait unitId={unitId} size={36} />
                  </span>
                  <span>
                    <strong>
                      {p.name}
                      {seat === session.room.seat ? " · 你" : ""}
                    </strong>
                    <small>
                      {bridge.hpFor(seat)} ♥ ·{" "}
                      {index < 0 ? "已淘汰" : bridge.battleStatus(index)}
                    </small>
                  </span>
                </button>
              );
            })}
          </nav>
        </section>
      )}
      {bridge.panelOpen && (
        <div
          className="rift-match-scrim"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) bridge.openPanel(false);
          }}
        >
          <section
            ref={dialog}
            className="rift-match-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="多人房间与战报"
          >
            <header>
              <div>
                <small>
                  {session.room.code === "LOCAL"
                    ? "本地人机"
                    : `房间 ${session.room.code}`}{" "}
                  · {bridge.modeName}
                </small>
                <h2>
                  {bridge.stage === "finished"
                    ? match.mode === "coop"
                      ? match.winners.length
                        ? "防线守住了"
                        : "防线失守"
                      : `${match.winners.map((i) => match.players[i].name).join("、")}获得胜利`
                    : `第 ${match.round} 轮 · ${bridge.stageLabel}`}
                </h2>
              </div>
              <button
                type="button"
                aria-label="关闭房间面板"
                onClick={() => bridge.openPanel(false)}
              >
                关闭 ×
              </button>
            </header>
            <p>
              {match.phase === "preparation"
                ? `剩余 ${bridge.seconds} 秒。准备后锁定阵容，可取消准备继续调整。`
                : bridge.statusText}
            </p>
            <div className="rift-match-roster">
              {match.players.map((p, i) => (
                <article key={i}>
                  <div>
                    <strong>
                      {p.name}
                      {i === session.room.seat ? " · 你" : ""}
                    </strong>
                    <small>
                      {bridge.hpFor(i) <= 0
                        ? "已淘汰 · 观战"
                        : p.ai
                          ? "电脑玩家"
                          : match.phase === "preparation"
                            ? p.ready
                              ? "已准备"
                              : "备战中"
                            : bridge.battleStatus(bridge.battleForSeat(i))}
                    </small>
                  </div>
                  <b>{bridge.hpFor(i)} ♥</b>
                  <button type="button" onClick={() => setScout(i)}>
                    上轮阵容
                  </button>
                  {p.report &&
                    (match.phase === "preparation" || bridge.settled) && (
                      <p>
                        {p.report.rescuedBy !== null
                          ? `${match.players[p.report.rescuedBy].name}前来救援 · `
                          : ""}
                        {p.report.helped !== null
                          ? `已协助 ${match.players[p.report.helped].name} · `
                          : ""}
                        {p.report.damage
                          ? `损失 ${p.report.damage} 生命`
                          : "未损失生命"}{" "}
                        · 收入 +{p.report.income} 金
                      </p>
                    )}
                </article>
              ))}
            </div>
            {match.phase !== "preparation" && match.battles.length > 0 && (
              <div className="rift-match-battles">
                {match.battles.map(
                  (b, i) => (b.rescueFor === null ||
                      !["starting", "battle"].includes(bridge.stage)) && (
                      <button
                        type="button"
                        key={i}
                        onClick={() => {
                          bridge.watchedSeat = match.battles[i].a;
                          bridge.playBattle(i);
                          bridge.tickRoundClock();
                          bridge.openPanel(false);
                        }}
                      >
                        {label(i)} ↗
                      </button>
                    ),
                )}
              </div>
            )}
            <footer>
              <button type="button" onClick={session.leave}>
                返回多人大厅
              </button>
              {match.phase === "preparation" ? (
                <button
                  type="button"
                  className="rift-match-primary"
                  disabled={bridge.busy || me.hp <= 0}
                  onClick={() => bridge.dispatch({ type: "battle" })}
                >
                  {bridge.readyLabel}
                </button>
              ) : null}
            </footer>
          </section>
          {scout !== null && (
            <EnemyFormationOverlay
              engine={bridge.engine}
              enemyBoard={match.players[scout].previous}
              opponentName={match.players[scout].name}
              onClose={() => setScout(null)}
            />
          )}
        </div>
      )}
    </>
  );
}
