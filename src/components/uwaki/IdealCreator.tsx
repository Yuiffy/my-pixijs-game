'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ABILITIES, PREFERENCES, DEBUFFS, SKILLS, IdealSession, emptyIdeal, parseIdeal, idealBudget, validIdeal, idealSummary } from './ideal';
import { storageKey, IDEAL } from './questionnaires';
import { drawTextCard } from './resultCard';
import styles from './BoundaryQuiz.module.css';

const KEY = storageKey('ideal');
export default function IdealCreator() {
  const [session, setSession] = useState<IdealSession>(emptyIdeal);
  const [ready, setReady] = useState(false);
  const [card, setCard] = useState('');
  const [notice, setNotice] = useState('');
  const [reset, setReset] = useState(false);
  useEffect(() => {
    try { setSession(parseIdeal(localStorage.getItem(KEY))); } catch { /* Optional storage. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { setNotice('当前浏览器无法保存进度，请尽量一次完成。'); }
  }, [session, ready]);
  const summary = idealSummary(session);
  useEffect(() => {
    if (session.step !== 4) { setCard(''); return; }
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) try { setCard(drawTextCard('理想恋人创建表', summary)); } catch { setNotice('图片生成失败，可以先复制文字。'); }
    });
    return () => { cancelled = true; };
  }, [session.step, summary]);
  const total = session.abilities.reduce((a, b) => a + b, 0);
  const budget = idealBudget(session);
  const canNext = [total === 25, session.preferences.every(v => v !== null), session.debuffs.length === 3 && budget >= 0, validIdeal(session)][session.step];
  const move = (step: number) => { setSession(s => ({ ...s, step })); setNotice(''); window.scrollTo(0, 0); };
  const update = <K extends keyof IdealSession>(key: K, value: IdealSession[K]) => setSession(s => ({ ...s, [key]: value }));
  async function copy() {
    try { await navigator.clipboard.writeText(`${summary}\n${window.location.origin}/game/uwaki-hantei#ideal`); setNotice('结果已复制。'); } catch { setNotice('复制失败，请手动复制下方文字。'); }
  }
  function download() {
    try { const a = document.createElement('a'); a.href = card || drawTextCard('理想恋人创建表', summary); a.download = '我的理想恋人.png'; a.click(); } catch { setNotice('图片生成失败，可以先复制文字。'); }
  }
  return (
<main className={styles.page}><div className={styles.wrap}>
    <a href="#questionnaires" className={styles.textButton}>← 选择其他问卷</a>
    <div className={styles.progressRow}><span aria-hidden="true">✕✕</span><div className={styles.progress} role="progressbar" aria-label="创建进度" aria-valuemin={0} aria-valuemax={4} aria-valuenow={session.step}><i style={{ width: `${session.step * 25}%` }} /><b>{session.step === 4 ? 'RESULT' : `${session.step + 1} / 4`}</b></div><span aria-hidden="true">✕✕</span></div>
    <section className={styles.sheet} aria-label="理想恋人创建表"><div className={styles.intro}>
      <p className={styles.lead}>和健屋一起创造吧！</p><h1><small>理想恋人</small><br />创建表</h1>
      {!ready ? <p>正在读取进度</p> : (
<>
        {session.step === 0 && (
<><h2>01. 能力值</h2><p className={styles.description}>把总计 25 点分配给 7 项能力，每项 0～6 点。</p><p className={styles.budget} role="status">已分配 {total} / 25 · 剩余 {25 - total}</p>
          {ABILITIES.map((a, i) => <label className={styles.ability} key={a} htmlFor={`ability-${i}`}><span>{a}</span><select id={`ability-${i}`} aria-label={a.split('｜')[0]} value={session.abilities[i]} onChange={e => update('abilities', session.abilities.map((v, n) => (n === i ? Number(e.target.value) : v)))}>{Array.from({ length: 7 }, (_, n) => <option key={n} value={n}>{n} 点</option>)}</select></label>)}
        </>
)}
        {session.step === 1 && <><h2>02. 相处类型</h2><p className={styles.description}>每一组选择一个你理想中的答案。</p>{PREFERENCES.map((p, i) => <fieldset className={styles.preference} key={p.title}><legend>{p.title}</legend><div className={styles.choices}>{p.options.map((o, n) => <button key={o} aria-pressed={session.preferences[i] === n} className={session.preferences[i] === n ? styles.selected : ''} onClick={() => update('preferences', session.preferences.map((v, j) => (j === i ? n : v)))}><span className={styles.box} aria-hidden="true" />{o}</button>)}</div></fieldset>)}</>}
        {session.step === 2 && (
<><h2>03. 缺点与专属技能</h2><p className={styles.description}>先选 3 个可以接受的缺点，再花获得的点数选择技能。可以不花完。</p><p className={styles.budget} role="status">缺点 {session.debuffs.length} / 3 · 剩余技能点 {budget}</p>
          <h3>可以接受的缺点</h3><div className={styles.choices}>{DEBUFFS.map((d, i) => <button key={d.name} aria-pressed={session.debuffs.includes(i)} className={session.debuffs.includes(i) ? styles.selected : ''} disabled={!session.debuffs.includes(i) && session.debuffs.length >= 3} onClick={() => { const debuffs = session.debuffs.includes(i) ? session.debuffs.filter(n => n !== i) : [...session.debuffs, i]; setSession(s => ({ ...s, debuffs, skills: [] })); }}><span className={styles.box} aria-hidden="true" />{d.name}（+{d.cost}）</button>)}</div><p className={styles.note}>修改缺点时会清空技能选择，便于重新分配点数。</p>
          <h3>专属技能</h3><div className={styles.choices}>{SKILLS.map((s, i) => <button key={s.name} aria-pressed={session.skills.includes(i)} className={session.skills.includes(i) ? styles.selected : ''} disabled={!session.skills.includes(i) && (session.debuffs.length !== 3 || s.cost > budget)} onClick={() => update('skills', session.skills.includes(i) ? session.skills.filter(n => n !== i) : [...session.skills, i])}><span className={styles.box} aria-hidden="true" /><span>{s.name}（{s.cost} 点）<small className={styles.skillDescription}>{s.description}</small></span></button>)}</div>
        </>
)}
        {session.step === 3 && <><h2>04. 自由填写</h2><p className={styles.description}>还有哪些想补充的理想？外貌、性格、小习惯……都写下来吧。</p><textarea className={styles.shareText} aria-label="自由填写" maxLength={500} value={session.notes} onChange={e => update('notes', e.target.value)} /></>}
        {session.step < 4 ? <nav className={styles.nav}>{session.step > 0 ? <button onClick={() => move(session.step - 1)}>← 上一步</button> : <span />}<button disabled={!canNext} onClick={() => move(session.step + 1)}>{session.step === 3 ? '生成创建表' : '下一部分'} →</button></nav> : <><p className={styles.description}>你的理想恋人创建表完成啦！</p>{card && <Image src={card} width={1200} height={1600} unoptimized className={styles.cardImage} alt="我的理想恋人创建表结果图" />}<button className={styles.primary} onClick={download}>下载完整结果图</button><button className={styles.outline} onClick={copy}>复制文字结果</button><textarea className={styles.shareText} aria-label="分享文字" readOnly value={summary} /><nav className={styles.nav}><button onClick={() => move(0)}>← 修改创建表</button><button onClick={() => setReset(true)}>重新创建</button></nav>{reset && <div className={styles.reset}><p>清空这份创建表，重新开始？</p><button className={styles.textButton} onClick={() => { setSession(emptyIdeal()); setReset(false); }}>确认重新开始</button><button className={styles.textButton} onClick={() => setReset(false)}>保留结果</button></div>}</>}
      </>
)}
    </div></section>
    <footer className={styles.footer}><p>题表：健屋花那 · 原表设计：ありあ<br /><a href={`https://x.com/sukosuko_sukoya/status/${IDEAL.source}`} target="_blank" rel="noreferrer">查看原始题表（星川莎拉填写版）</a><br />能力分配部分参考原表注明的 Emoklore TRPG 角色创建规则。</p></footer>
  </div><p className={styles.notice} role="status">{notice}</p></main>
);
}
