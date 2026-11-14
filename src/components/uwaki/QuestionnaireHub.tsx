'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import BoundaryQuiz from './BoundaryQuiz';
import IdealCreator from './IdealCreator';
import { IDEAL, QUESTIONNAIRES, storageKey } from './questionnaires';
import { parseSession } from './questions';
import { parseIdeal } from './ideal';
import styles from './BoundaryQuiz.module.css';

export default function QuestionnaireHub() {
  const [selected, setSelected] = useState('');
  const [progress, setProgress] = useState<Record<string, string>>({});
  useEffect(() => {
    function sync() {
      setSelected(window.location.hash.slice(1));
      try {
        const entries = QUESTIONNAIRES.map(q => {
          const s = parseSession(localStorage.getItem(storageKey(q.id)), q.questions.length, q.reflection);
          const done = s.answers.filter(a => a !== null).length;
          return [q.id, s.step === q.questions.length + 1 ? '已完成 · 查看结果' : done ? `已答 ${done} / ${q.questions.length} · 继续` : `${q.questions.length} 题 · 开始`];
        });
        const ideal = parseIdeal(localStorage.getItem(storageKey('ideal')));
        entries.push(['ideal', ideal.step === 4 ? '已完成 · 查看结果' : ideal.abilities.some(Boolean) || ideal.preferences.some(v => v !== null) ? '已保存 · 继续创建' : '4 个部分 · 开始创建']);
        setProgress(Object.fromEntries(entries));
      } catch { /* The questionnaires also work without persistent storage. */ }
    }
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const quiz = QUESTIONNAIRES.find(q => q.id === selected);
  if (quiz) return <BoundaryQuiz key={quiz.id} quiz={quiz} />;
  if (selected === IDEAL.id) return <IdealCreator />;
  return (
<main className={styles.page}><div className={styles.wrap}>
    <div className={styles.progressRow}><span aria-hidden="true">✕✕</span><div className={styles.progress}><b>SELECT</b></div><span aria-hidden="true">✕✕</span></div>
    <section className={styles.sheet}>
      <div className={styles.intro}>
        <p className={styles.lead}>和健屋一起填填看！</p>
        <h1><small>我们的恋爱</small><br />判断问卷集</h1>
        <p className={styles.description}>从哪一份开始？聊聊边界、爱的分量，以及你理想中的恋人。</p>
        <div className={styles.quizList}>{[...QUESTIONNAIRES, IDEAL].map((q, i) => (
<a key={q.id} href={`#${q.id}`} className={styles.quizLink}>
          <span className={styles.quizIndex}>{String(i + 1).padStart(2, '0')}.</span>
          <div><small>{q.subtitle}</small><h2>{q.title}</h2><p>{q.description}</p><b>{progress[q.id] || '打开问卷'} →</b></div>
        </a>
))}</div>
        <p className={styles.note}>进度分别保存在当前浏览器，可随时切换问卷。</p>
      </div>
    </section>
    <footer className={styles.footer}><p>题表：健屋花那 · 原表设计：ありあ<br />中文互动版</p><Link href="/demos">返回游戏库</Link></footer>
  </div></main>
);
}
