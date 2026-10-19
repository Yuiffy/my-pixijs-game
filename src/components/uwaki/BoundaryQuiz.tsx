'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Answer, Session, QUESTIONS, LABELS, calculate, emptySession, parseSession } from './questions';
import { drawResultCard } from './resultCard';
import styles from './BoundaryQuiz.module.css';

const KEY = 'love-boundary-zh-v1';
const pad = (n: number) => String(n).padStart(2, '0');

export default function BoundaryQuiz() {
  const [session, setSession] = useState<Session>(emptySession);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [card, setCard] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
  }, []);
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
  useEffect(() => {
    if (session.step !== 41) { setCard(''); return; }
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      try { setCard(drawResultCard(session)); } catch { setNotice('图片生成失败，可以先复制文字结果。'); }
    });
    return () => { cancelled = true; };
  }, [session]);
  const move = (next: number) => {
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
    setAdvancing(false);
    setSession(s => ({ ...s, step: next }));
    setNotice('');
  };
  const choose = (answer: Answer) => {
    if (advanceTimer.current !== null) return;
    setSession(s => ({ ...s, answers: s.answers.map((a, i) => (i === s.step ? answer : a)) }));
    setAdvancing(true);
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null;
      setAdvancing(false);
      setSession(s => (s.step === step ? { ...s, step: step + 1 } : s));
    }, 170);
  };
  const summary = `这算越界吗？我的恋爱边界是「${result.type.name}」\n算越界 ${result.counts[0]} / 不算但介意 ${result.counts[1]} / 完全 OK ${result.counts[2]}\n换成自己会改变答案：${reflection ? '会' : '不会'}\n`;

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(`${summary}${window.location.origin}/game/uwaki-hantei`);
      setNotice('结果已复制，去和朋友聊聊吧。');
    } catch { setNotice('复制失败，请手动选择页面上的结果文字。'); }
  }

  function download() {
    try {
      const a = document.createElement('a');
      a.href = card || drawResultCard(session);
      a.download = '我的恋爱边界判定表.png';
      a.click();
      setNotice('结果图已生成；手机上也可长按图片保存。');
    } catch { setNotice('图片生成失败，可以先复制文字结果。'); }
  }

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.progressRow}>
          <span aria-hidden="true">✕✕</span>
          <div className={styles.progress} role="progressbar" aria-label="答题进度" aria-valuemin={0} aria-valuemax={40} aria-valuenow={done}>
            <i style={{ width: `${(Math.max(0, Math.min(step, 40)) / 40) * 100}%` }} />
            <b>{step < 0 ? 'START' : isResult ? 'RESULT' : step === 40 ? 'LAST' : `${pad(step + 1)} / 40`}</b>
          </div>
          <span aria-hidden="true">✕✕</span>
        </div>
        <section className={styles.sheet} aria-label="恋爱边界判定表">
          {step === -1 && (
            <div className={styles.intro}>
              <p className={styles.lead}>和健屋一起填填看！</p>
              <h1><small>这算</small><br />越界？判定表</h1>
              <div className={styles.legend}>{LABELS.map((label, i) => <span key={label}>{['①', '②', '③'][i]} {label}</span>)}</div>
              <p className={styles.description}>如果恋人这样做……？共 40 题，只需点击「① 算越界」「② 不算，但介意」「③ 完全 OK」三个选项。最后会显示你的判定类型和结果图片，可以保存后分享。</p>
              <button className={styles.primary} disabled={!ready} onClick={() => move(done > 0 ? Math.max(0, answers.indexOf(null) === -1 ? 40 : answers.indexOf(null)) : 0)}>{ready ? done > 0 ? '继续作答' : '开始判定' : '正在读取进度'}</button>
              {done > 0 && <button className={styles.textButton} onClick={() => { setSession(emptySession()); }}>从头开始</button>}
            </div>
          )}
          {step >= 0 && step < 40 && (
            <div key={step} className={styles.question}>
              <div className={styles.number}>{pad(step + 1)}<span>.</span></div>
              <h2>{QUESTIONS[step]}</h2>
              <hr className={styles.rule} />
              <div className={styles.choices}>
                {LABELS.map((label, i) => (
                  <button key={label} disabled={advancing} aria-pressed={answers[step] === i} className={answers[step] === i ? styles.selected : ''} onClick={() => choose(i as Answer)}>
                    <span className={styles.box} aria-hidden="true" /><span>{['①', '②', '③'][i]} {label}</span>
                  </button>
                ))}
              </div>
              <nav className={styles.nav}><button onClick={() => move(step - 1)}>← {step === 0 ? '回到首页' : '上一题'}</button><button disabled={answers[step] === null} onClick={() => move(step + 1)}>{step === 39 ? '最后一问' : '下一题'} →</button></nav>
            </div>
          )}
          {step === 40 && (
            <div className={styles.question}>
              <div className={styles.number} style={{ fontSize: 40 }}>LAST<span>.</span></div>
              <h2>如果做这些事的人是你，<br />你的答案会改变吗？</h2>
              <hr className={styles.rule} />
              <div className={styles.yn}>{[true, false].map(v => <button className={reflection === v ? styles.primary : styles.outline} key={String(v)} aria-label={v ? '会，可能会不一样' : '不会，我的标准一致'} onClick={() => { setSession(s => ({ ...s, reflection: v, step: 41 })); }}> {v ? '会' : '不会'}</button>)}</div>
              <nav className={styles.nav}><button onClick={() => move(39)}>← 上一题</button></nav>
            </div>
          )}
          {isResult && (
            <div className={styles.result}>
              <p className={styles.lead} style={{ letterSpacing: '.2em' }}>你的判定类型是……</p>
              <h1>{result.type.name}</h1>
              <p className={styles.description}>{result.type.description}</p>
              <div className={styles.counts}>{LABELS.map((label, i) => <div key={label}><strong>{result.counts[i]}</strong><small>{['① 算越界', '② 介意', '③ 完全OK'][i]}</small></div>)}</div>
              {card && <Image className={styles.cardImage} src={card} alt="恋爱边界判定结果图" width={1200} height={1200} unoptimized />}
              <div className={styles.steps}>
                <div className={styles.step}><span className={styles.stepNumber}>1</span><div className={styles.stepBody}><button className={styles.primary} onClick={download}>下载完整结果图</button><p className={styles.note}>如果无法下载，手机可长按图片，电脑可右键保存。</p></div></div>
                <div className={styles.step}><span className={styles.stepNumber}>2</span><div className={styles.stepBody}><button className={styles.primary} onClick={copyResult}>复制文字结果</button><p className={styles.note}>分享时附上保存的图片，和朋友聊聊你们的答案。</p></div></div>
              </div>
              <textarea className={styles.shareText} aria-label="分享文字" readOnly value={summary} />
              <details className={styles.review}><summary>回顾 / 修改我的 40 个答案</summary><ol>{QUESTIONS.map((q, i) => <li key={q}><span>{pad(i + 1)}.</span><p>{q}</p><button aria-label={`修改第 ${i + 1} 题`} onClick={() => move(i)}>{['①', '②', '③'][answers[i] ?? 2]}</button></li>)}</ol></details>
              {confirmReset ? <div className={styles.reset}><p>清空这次的回答，重新开始？</p><button className={styles.textButton} onClick={() => { setSession(emptySession()); setConfirmReset(false); setNotice(''); }}>确认重新开始</button><button className={styles.textButton} onClick={() => setConfirmReset(false)}>保留结果</button></div> : <nav className={styles.nav}><button onClick={() => move(0)}>← 修改答案</button><button onClick={() => setConfirmReset(true)}>重新测一次</button></nav>}
            </div>
          )}
        </section>
        <footer className={styles.footer}>
          <p>根据健屋花那（<a href="https://x.com/sukosuko_sukoya/status/2107121927278166034" target="_blank" rel="noreferrer">@sukosuko_sukoya 的帖子</a>）的「这算出轨？判定表」制作<br />原表设计：ありあ（<a href="https://x.com/air_trpg" target="_blank" rel="noreferrer">@air_trpg</a>）<br />中文翻译版 · 参考 <a href="https://ikura1.github.io/uwaki-hantei/" target="_blank" rel="noreferrer">ikura1 的日文互动版</a></p>
          <Link href="/demos">返回游戏库</Link>
        </footer>
      </div>
      <p role="status" className={styles.notice}>{notice}</p>
    </main>
  );
}
