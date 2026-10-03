'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { bestiaryDescription, bestiaryKey, bestiaryName } from './bestiary';
import type { GameState } from './types';
import styles from './nightRain.module.css';

const Portrait = dynamic(() => import('./BestiaryPortrait'), { ssr: false });
export default function BestiaryPanel({ state }: { state: GameState }) {
  const entries = state.enemies.filter((e, i, all) => state.bestiary.includes(bestiaryKey(e)) && all.findIndex(other => bestiaryKey(other) === bestiaryKey(e)) === i);
  const [id, setId] = useState(entries[0]?.id ?? ''); const selected = entries.find(e => e.id === id) ?? entries[0];
  return (
    <div className={styles.bestiary}>
      <p>击败一次便留下记录，休息与死亡不会失去图鉴。已收录 {entries.length} 类。</p>
      <div className={styles.row}>{entries.map(e => <button data-game-primary={e === entries[0] || undefined} key={e.id} aria-pressed={selected?.id === e.id} onClick={() => setId(e.id)}>{bestiaryName(e)}</button>)}</div>
      {selected ? <article><Portrait key={selected.id} enemy={selected} /><h3>{bestiaryName(selected)}</h3><p>{bestiaryDescription(selected)}</p><small>生命 {selected.maxHp} · 架势 {selected.maxPosture} · 首次击败后收录</small></article> : <p>还没有击败过敌人。遇到的第一位守路人，会替你开启这一页。</p>}
    </div>
  );
}
