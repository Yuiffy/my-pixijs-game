'use client';

import { useEffect, useState } from 'react';
import type { GameState } from './types';
import styles from './nightRain.module.css';

export function interludeKind(s: GameState) { return s.valleyComplete ? 'river' : s.chapterComplete ? 'bell' : 'dinner'; }
const SCRIPT = {
  dinner: [['摊主', '雨还这么大？先坐下，饭马上好。'], ['岁己', '下播后走了好久……原来炉火一直在等我。'], ['摊主', '北口的香料街也亮着灯。吃饱了再赶路，没人催你。']],
  bell: [['归夜钟', '钟声越过王寺，也越过今夜未归的名字。'], ['岁己', '城里终于安静了。可后山那边，还有灯没有回来。'], ['风中的回声', '从钟台东侧下山吧。两岸的水，需要有人重新接起来。']],
  river: [['归水灯', '两道旧闸重开，水把灯送向了旧城。'], ['岁己', '路通了。那些没能回家的人，会不会也在等这盏灯？'], ['庭灯的回声', '旅馆南桥，留着一张空椅。回来听听他们的故事。']],
};
export default function Interlude({ state, done, guide }: { state: GameState; done: () => void; guide: () => void }) {
  const [beat, setBeat] = useState(0); const kind = interludeKind(state); const script = SCRIPT[kind];
  useEffect(() => { const timer = window.setInterval(() => setBeat(v => Math.min(script.length, v + 1)), 3600); return () => window.clearInterval(timer); }, [script]);
  return (
<section className={styles.interlude} data-game-menu data-menu-id={`interlude-${kind}-${beat}`} aria-label="旅途过场">
    <p className={styles.interludeCaption}><small>{kind === 'dinner' ? '深夜食堂 · 炉边小憩' : kind === 'bell' ? '归夜钟 · 下一程' : '雾河回响 · 归水灯'}</small><b>{script[Math.min(beat, 2)][0]}</b><span>{script[Math.min(beat, 2)][1]}</span></p>
    <div className={styles.interludeActions}>{beat < script.length ? <button data-game-primary onClick={() => setBeat(v => v + 1)}>继续对白 →</button> : <><button data-game-primary onClick={done}>起身，继续旅途 →</button><button onClick={guide}>请精灵指路</button></>}</div>
  </section>
);
}
