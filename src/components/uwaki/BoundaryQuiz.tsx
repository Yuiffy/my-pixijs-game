'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Answer, Session, QUESTIONS, LABELS, calculate, emptySession, parseSession } from './questions';
import styles from './BoundaryQuiz.module.css';

const KEY = 'love-boundary-zh-v1';
const pad = (n: number) => String(n).padStart(2, '0');

export default function BoundaryQuiz() {
  const [session, setSession] = useState<Session>(emptySession);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    try { setSession(parseSession(localStorage.getItem(KEY))); } catch { /* Storage can be unavailable. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { setNotice('当前浏览器无法保存进度，请尽量一次完成。'); }
  }, [session, ready]);

  const { step, answers, reflection } = session;
  const done = answers.filter(a => a !== null).length;
  const result = calculate(answers);
  const isResult = step === QUESTIONS.length + 1;
  const move = (next: number) => { setSession(s => ({ ...s, step: next })); setNotice(''); };
  const choose = (answer: Answer) => setSession(s => ({ ...s, answers: s.answers.map((a, i) => (i === s.step ? answer : a)) }));
  const summary = `这算越界吗？我的恋爱边界是「${result.type.name}」\n算越界 ${result.counts[0]} / 不算但介意 ${result.counts[1]} / 完全 OK ${result.counts[2]}\n换成自己会改变答案：${reflection ? '会' : '不会'}\n`;

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(`${summary}${window.location.origin}/game/uwaki-hantei`);
      setNotice('结果已复制，去和朋友聊聊吧。');
    } catch { setNotice('复制失败，请手动选择页面上的结果文字。'); }
  }

  async function download() {
    try {
      await document.fonts.ready;
      const canvas = document.createElement('canvas');
      canvas.width = 1200; canvas.height = 1960;
      const g = canvas.getContext('2d');
      if (!g) throw new Error('Canvas unavailable');
      g.fillStyle = '#eeedf0'; g.fillRect(0, 0, 1200, 1960);
      g.fillStyle = '#ef299c'; g.fillRect(40, 40, 1120, 10);
      g.font = 'bold 34px sans-serif'; g.fillText('这算越界吗？ / 恋爱边界判定表', 70, 115);
      g.font = '900 90px sans-serif'; g.fillText(result.type.name, 65, 245);
      g.font = '26px sans-serif'; g.fillText(`算越界 ${result.counts[0]}    不算但介意 ${result.counts[1]}    完全 OK ${result.counts[2]}`, 70, 320);
      g.fillStyle = '#4d3446'; g.font = '24px sans-serif';
      g.fillText(`换成自己会改变答案：${reflection ? '会' : '不会'}   ·   以下是我的 40 条边界`, 70, 380);
      QUESTIONS.forEach((q, i) => {
        const y = 440 + i * 34;
        g.fillStyle = '#4d3446'; g.font = '21px sans-serif';
        g.fillText(`${pad(i + 1)}  ${q}`, 70, y, 830);
        g.fillStyle = '#ef299c'; g.font = 'bold 21px sans-serif';
        g.fillText(LABELS[answers[i] ?? 2], 940, y);
      });
      g.fillStyle = '#4d3446'; g.font = '20px sans-serif';
      g.fillText('只是一次边界讨论，没有标准答案，也不作为心理诊断。', 70, 1850);
      g.fillText('参考 ikura1/uwaki-hantei · 原始题表：健屋花那 · 原表设计：ありあ', 70, 1890);
      const blob = await new Promise<Blob | null>(resolve => { canvas.toBlob(resolve, 'image/png'); });
      if (!blob) throw new Error('Export failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = '我的恋爱边界判定表.png'; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      setNotice('结果图已生成；手机上可在下载文件中长按保存。');
    } catch { setNotice('图片生成失败，可以先复制文字结果。'); }
  }

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.header}><Link href="/demos">← 返回游戏库</Link><span>LOVE BOUNDARY / 中文版</span></header>
        <div className={styles.progressRow}><span aria-hidden="true">✕ ✕</span><div className={styles.progress} role="progressbar" aria-label="答题进度" aria-valuemin={0} aria-valuemax={40} aria-valuenow={done}><i style={{ width: `${(done / 40) * 100}%` }} /><b>{step < 0 ? 'LET’S TALK ABOUT US' : isResult ? 'YOUR BOUNDARY' : `${pad(done)} / 40`}</b></div><span aria-hidden="true">✕ ✕</span></div>
        <section className={styles.sheet} aria-label="恋爱边界判定表">
          {step === -1 && (
<div className={styles.intro}>
            <p className={styles.eyebrow}>亲密关系里的那条线，由你来画。</p>
            <h1>这算<span>越界</span>吗<span className={styles.questionMark}>？</span></h1>
            <div className={styles.subtitle}><span>恋爱边界判定表</span><span>VOL. 01</span></div>
            <div className={styles.legend}>{LABELS.map((l, i) => <span key={l}>{['×', '△', '○'][i]} {l}</span>)}</div>
            <p className={styles.description}>如果你的恋人这样做，你会怎么想？<br />40 个日常情境，找到你的「可以」与「不可以」。</p>
            <div className={styles.sample}><span className={styles.sampleNum}>例如 / 01</span><p>和异性单独<br />去吃午饭<span>……？</span></p><span className={styles.stamp}>你介意吗</span></div>
            <button className={styles.primary} disabled={!ready} onClick={() => move(done > 0 ? Math.max(0, answers.indexOf(null) === -1 ? 40 : answers.indexOf(null)) : 0)}>{ready ? done > 0 ? `继续作答 · 已完成 ${done} / 40` : '开始画出我的边界' : '正在读取进度'}<span>↗</span></button>
            <p className={styles.hint}>约 3 分钟 · 无需登录 · 进度保存在本机</p>
          </div>
)}

          {step >= 0 && step < 40 && (
<div key={step} className={styles.question}>
            <div className={styles.questionTop}><span>{step < 10 ? '日常来往' : step < 20 ? '微妙的距离' : step < 30 ? '两个人的相处' : '关于前任'}</span><span>想象一下，你的恋人……</span></div>
            <div className={styles.number}>{pad(step + 1)}<small>/ 40</small></div>
            <h2>{QUESTIONS[step]}</h2>
            <p className={styles.prompt}>对你来说，这算越界吗？</p>
            <div className={styles.choices}>{LABELS.map((label, i) => <button key={label} aria-pressed={answers[step] === i} className={answers[step] === i ? styles.selected : ''} onClick={() => choose(i as Answer)}><span>{['×', '△', '○'][i]}</span>{label}<small>{answers[step] === i ? '✓' : `0${i + 1}`}</small></button>)}</div>
            <nav className={styles.nav}><button onClick={() => move(step - 1)}>← {step === 0 ? '回到首页' : '上一题'}</button><button disabled={answers[step] === null} onClick={() => move(step + 1)}>{step === 39 ? '最后一问' : '下一题'} →</button></nav>
            <p className={styles.hint}>不用猜“正确答案”，选你真实的感受。</p>
          </div>
)}

          {step === 40 && (
<div className={styles.question}>
            <p className={styles.eyebrow}>换个角度，问问自己。</p><div className={styles.last}>ONE MORE<span>?</span></div>
            <h2>如果做这些事的人是你，<br />你的答案会改变吗？</h2>
            <p className={styles.description}>这道题不计分，只留一个诚实的自我观察。</p>
            <div className={styles.choices}>{[true, false].map(v => <button key={String(v)} onClick={() => { setSession(s => ({ ...s, reflection: v, step: 41 })); }}><span>{v ? '↻' : '='}</span>{v ? '会，可能会不一样' : '不会，我的标准一致'}<small>↗</small></button>)}</div>
            <nav className={styles.nav}><button onClick={() => move(39)}>← 上一题</button></nav>
          </div>
)}

          {isResult && (
<div className={styles.result}>
            <p className={styles.eyebrow}>你的恋爱边界画像</p><p className={styles.resultLabel}>MY BOUNDARY IS</p><h1>{result.type.name}</h1>
            <p className={styles.description}>{result.type.description}</p>
            <div className={styles.counts}>{LABELS.map((l, i) => <div key={l}><strong>{pad(result.counts[i])}</strong><span>{l}</span></div>)}</div>
            <p className={styles.reflection}>换成自己，会改变答案吗？<b>{reflection ? '会' : '不会'}</b></p>
            <button className={styles.primary} onClick={download}>下载完整结果图<span>↓</span></button><button className={styles.outline} onClick={copyResult}>复制文字结果 ↗</button>
            <p className={styles.hint}>发给朋友或恋人，聊聊你们在意的那条线。</p>
            <details className={styles.review}><summary>回顾 / 修改我的 40 个答案 <span>＋</span></summary><ol>{QUESTIONS.map((q, i) => <li key={q}><span>{pad(i + 1)}</span><p>{q}</p><button aria-label={`修改第 ${i + 1} 题`} onClick={() => move(i)}>{LABELS[answers[i] ?? 2]} ↗</button></li>)}</ol></details>
            {confirmReset ? <div className={styles.reset}><p>清空这次的回答，重新开始？</p><button onClick={() => { setSession(emptySession()); setConfirmReset(false); setNotice(''); }}>确认重新开始</button><button onClick={() => setConfirmReset(false)}>保留结果</button></div> : <button className={styles.textButton} onClick={() => setConfirmReset(true)}>重新测一次</button>}
          </div>
)}
        </section>
        <p role="status" className={styles.notice}>{notice}</p>
        <footer className={styles.footer}><p>边界没有标准答案，彼此沟通才是开始。<br />本问卷仅供娱乐和交流，不作为心理诊断或关系结论。</p><p>参考 <a href="https://ikura1.github.io/uwaki-hantei/" target="_blank" rel="noreferrer">ikura1 的日文互动版 ↗</a><br />原始题表：<a href="https://x.com/sukosuko_sukoya/status/2107121927278166034" target="_blank" rel="noreferrer">健屋花那</a> · 原表设计：<a href="https://x.com/air_trpg" target="_blank" rel="noreferrer">ありあ</a></p></footer>
      </div>
    </main>
  );
}
