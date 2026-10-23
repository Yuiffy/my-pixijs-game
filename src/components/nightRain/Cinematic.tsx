'use client';

import { useEffect, useRef, useState } from 'react';
import type { AudioSettings } from './audio';
import styles from './nightRain.module.css';

const ROOT = '/games/night-rain/cinema/';
export function TitleFilm() {
  const video = useRef<HTMLVideoElement>(null);
  const background = useRef<HTMLVideoElement>(null);
  const [looping, setLooping] = useState(false);
  useEffect(() => {
    const film = video.current;
    const idle = background.current;
    if (!film || !idle) return undefined;
    let disposed = false;
    let inLoop = false;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const startLoop = () => {
      if (preference.matches || document.hidden) return;
      inLoop = true;
      idle.play().then(() => { if (!disposed) setLooping(true); }).catch(() => {});
    };
    const update = () => {
      if (preference.matches || document.hidden) { film.pause(); idle.pause(); } else if (inLoop || film.ended) startLoop();
      else film.play().catch(() => {});
    };
    film.addEventListener('ended', startLoop); film.addEventListener('error', startLoop);
    film.src = `${ROOT}title.mp4`;
    idle.src = `${ROOT}title-loop.mp4`;
    update(); preference.addEventListener('change', update); document.addEventListener('visibilitychange', update);
    return () => {
      disposed = true;
      preference.removeEventListener('change', update); document.removeEventListener('visibilitychange', update);
      film.removeEventListener('ended', startLoop); film.removeEventListener('error', startLoop);
      for (const clip of [film, idle]) { clip.pause(); clip.removeAttribute('src'); clip.load(); }
    };
  }, []);
  return (
<>
    <video ref={video} className={styles.titleFilm} poster={`${ROOT}title-poster.jpg`} muted playsInline preload="auto" aria-hidden="true" />
    <video ref={background} className={`${styles.titleFilm} ${styles.titleLoop}`} data-visible={looping} loop muted playsInline preload="auto" aria-hidden="true" />
  </>
);
}

export default function Cinematic({ kind, settings, done }: { kind: 'title' | 'opening'; settings: AudioSettings; done: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const exit = useRef(done); exit.current = done;
  const [status, setStatus] = useState<'loading' | 'playing' | 'paused' | 'error'>('loading');
  const [muted, setMuted] = useState(settings.muted);
  const [time, setTime] = useState(0);
  const [reduced, setReduced] = useState(false);
  const play = () => {
    const film = video.current;
    if (!film) return;
    film.play().then(() => setStatus('playing')).catch(() => setStatus('paused'));
  };
  useEffect(() => {
    const film = video.current!;
    film.src = `${ROOT}${kind}.mp4`;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReduced(preference.matches); if (preference.matches) { film.pause(); setStatus('paused'); } };
    update();
    if (!preference.matches) film.play().then(() => setStatus('playing')).catch(() => setStatus('paused'));
    const pause = () => { film.pause(); setStatus(s => (s === 'error' ? s : 'paused')); };
    const visibility = () => { if (document.hidden) pause(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); exit.current(); } };
    const timeout = window.setTimeout(() => { if (!film.readyState) { film.pause(); setStatus('error'); } }, 12000);
    document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', pause); window.addEventListener('keydown', key, true); preference.addEventListener('change', update);
    return () => { clearTimeout(timeout); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', pause); window.removeEventListener('keydown', key, true); preference.removeEventListener('change', update); film.pause(); film.removeAttribute('src'); film.load(); };
  }, [kind]);
  const caption = kind === 'title' ? '长夜有尽，归灯有声。' : time < 5.5 ? '雨停之前，有人还在等一盏灯。' : time < 11 ? '穿过旧城，循钟声越过雾河。' : '把走过的路，留给未归的人。';
  return (
    <section className={styles.cinema} role="dialog" aria-modal="true" aria-label={kind === 'title' ? '旅居之魂入场' : '旅居之魂序章'} data-game-menu data-menu-id={`cinema-${kind}-${status}`}>
      <video ref={video} poster={`${ROOT}title-poster.jpg`} playsInline preload="auto" muted={muted || settings.muted} onLoadedMetadata={event => { event.currentTarget.volume = Math.max(settings.music, settings.effects); }} onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onEnded={done} onError={() => setStatus('error')}><track kind="captions" src={`${ROOT}${kind}.vtt`} srcLang="zh" label="环境声音" /></video>
      <div className={styles.cinemaHeading}><small>{kind === 'title' ? '长夜归灯' : '序章 · 雨仍未歇'}</small><h2>旅居之魂</h2></div>
      <p className={styles.cinemaCaption}>{caption}</p>
      {status !== 'playing' && <div className={styles.cinemaStatus} role="status">{status === 'error' ? '影像暂不可用，仍可继续旅途。' : reduced ? '已采用减少动态效果，可直接继续或手动播放。' : status === 'loading' ? '雨幕正在展开……' : '旅途停在这一刻。'}{status !== 'error' && <button data-game-primary onClick={play}>播放影像</button>}</div>}
      <div className={styles.cinemaActions}><button disabled={settings.muted} aria-pressed={!muted && !settings.muted} onClick={() => setMuted(v => !v)}>{muted || settings.muted ? '影像静音' : '影像声音已开启'}</button><button data-game-primary={status === 'playing' || status === 'error' || undefined} onClick={done}>{kind === 'opening' ? '跳过序章，开始旅途 →' : '进入标题 →'}</button></div>
    </section>
  );
}
