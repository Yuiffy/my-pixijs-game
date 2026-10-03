'use client';

import type { GameState } from './types';
import { HAVEN_LORE } from './haven';
import { conversation, havenJournal } from './havenStory';
import { guideTargets } from './companion';
import styles from './nightRain.module.css';

export default function HavenPanel({ state, mode, choose, guide }: { state: GameState; mode: 'story' | 'journal'; choose: (choice: string) => void; guide: (id: string) => void }) {
  if (mode === 'story' && state.haven.talking) {
    const talk = conversation(state, state.haven.talking);
    return (
<div className={styles.havenStory}>
      <p className={styles.eyebrow}>{talk.speaker}</p><h2>{talk.title}</h2>
      {talk.lines.map(line => <p key={line}>{line}</p>)}
      {state.haven.talking === 'haven-keeper' && <p className={styles.havenBalance}>随身 {state.rice} · 寄存 {state.haven.savings}</p>}
      <div className={styles.havenChoices}>{talk.choices.map(c => <button key={c.id} disabled={c.disabled} onClick={() => choose(c.id)}><span>{c.label}</span>{c.detail && <small>{c.detail}</small>}</button>)}</div>
      {!!state.messageTime && state.messageKind === 'event' && <p role="status" className={styles.havenBalance}>{state.message}</p>}
    </div>
);
  }
  return (
<div className={styles.havenStory}>
    <p>院子会记住回来的人。名册与拓片可以先找到，再邀请他们；支路没有时限，也不会因先走另一关而失败。</p>
    <p className={styles.havenBalance}>归人 {state.haven.recruits.length} / 2 · 寄存 {state.haven.savings} · 三声 {state.haven.echoes} / 3</p>
    <ol className={styles.havenJournal}>{havenJournal(state).map((q, i) => (
<li key={q.title}>
      <small>{q.done ? '已留下回响' : `线索 ${i + 1}`}</small><h3>{q.title}</h3><p>{q.text}</p>
      {!q.done && guideTargets(state).some(l => l.id === q.id) && <button onClick={() => guide(q.id)}>请精灵带我去</button>}
    </li>
))}</ol>
    <details><summary>重读已经找到的文字</summary>{Object.entries(HAVEN_LORE).filter(([id]) => state.collected.includes(id)).map(([id, lines]) => <p key={id}>{lines[0]}</p>)}{!Object.keys(HAVEN_LORE).some(id => state.collected.includes(id)) && <p>读过的名册、拓片与守灯簿会留在这里。</p>}</details>
  </div>
);
}
