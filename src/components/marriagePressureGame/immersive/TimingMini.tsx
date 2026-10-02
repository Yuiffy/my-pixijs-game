"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hashKey } from "../inbox";
import type { SkillMini } from "./activityScripts";
import styles from "./immersive.module.css";

// 目标区半宽（0~1 的轨道比例）
const ZONE = 0.12;

interface Props {
  skill: SkillMini;
  seed: string;
  reducedMotion: boolean;
  onDone: (hits: number) => void;
}

// 指针在轨道上来回摆动，按下时判定是否落在目标区；成绩只影响台词
export default function TimingMini({ skill, seed, reducedMotion, onDone }: Props) {
  const [round, setRound] = useState(0);
  const [hits, setHits] = useState<boolean[]>([]);
  const marker = useRef<HTMLSpanElement>(null);
  const position = useRef(0.5);
  const center = 0.25 + (hashKey(seed, round) % 50) / 100;

  useEffect(() => {
    if (reducedMotion) {
      // 减少动态：指针停在目标区中间，不做计时挑战
      position.current = center;
      if (marker.current) marker.current.style.left = `${center * 100}%`;
      return undefined;
    }
    const period = 1500 - round * 260;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const phase = ((now - started) % period) / period;
      const value = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      position.current = value;
      if (marker.current) marker.current.style.left = `${value * 100}%`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [round, reducedMotion, center]);

  const press = useCallback(() => {
    const hit = Math.abs(position.current - center) <= ZONE;
    const next = [...hits, hit];
    setHits(next);
    if (next.length >= skill.rounds.length) onDone(next.filter(Boolean).length);
    else setRound(round + 1);
  }, [center, hits, onDone, round, skill.rounds.length]);

  const current = skill.rounds[Math.min(round, skill.rounds.length - 1)];
  return (
    <div className={styles.timing} data-testid="timing-mini" data-round={round}>
      <p><strong>{current.label}</strong> · {current.hint}</p>
      <div className={styles.timingTrack} aria-hidden="true">
        <i style={{ left: `${(center - ZONE) * 100}%`, width: `${ZONE * 200}%` }} />
        <span ref={marker} />
      </div>
      <ol className={styles.timingDots} aria-label="已完成的回合">
        {skill.rounds.map((item, index) => <li key={item.label} data-state={index < hits.length ? (hits[index] ? "hit" : "miss") : "todo"} />)}
      </ol>
      <button className={styles.primary} data-testid="timing-hit" onClick={press}>{reducedMotion ? "稳稳地来" : "就是现在！"}</button>
    </div>
  );
}
