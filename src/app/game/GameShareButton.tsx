'use client';

import { CheckOutlined, CloseOutlined, ShareAltOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import { gameShareContent } from './shareContent';
import styles from './GameShareButton.module.css';

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function GameShareButton({ gamePath, locale = 'zh' }: { gamePath: string; locale?: 'zh' | 'en' }) {
  const game = gameShareContent[gamePath];
  const english = locale === 'en' && gamePath === '/game/reset-rush';
  const [status, setStatus] = useState('');
  const [fallbackText, setFallbackText] = useState('');
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!status) return undefined;
    const timeout = window.setTimeout(() => setStatus(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [status]);

  useEffect(() => {
    if (fallbackText) fallbackRef.current?.select();
  }, [fallbackText]);

  if (!game) return null;

  const share = async () => {
    const url = window.location.href;
    const title = english ? 'RESET / Build On!' : game.title;
    const description = english ? 'Manage accounts, build projects, and race three rivals before quota resets.' : game.description;
    const text = `【${title}】${description}`;
    const fullText = `${text} ${url}`;
    setStatus('');
    setFallbackText('');

    if (isMobileDevice() && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(fullText);
      setStatus(english ? 'Share text copied' : '分享文案已复制');
    } catch {
      setFallbackText(fullText);
      setStatus(english ? 'Copy failed; select the text below' : '复制失败，请手动复制');
    }
  };

  return (
    <div className={styles.shareControl}>
      {fallbackText && (
        <div className={styles.fallbackBackdrop}>
          <div className={styles.fallback} role="dialog" aria-modal="true" aria-label={english ? 'Copy share text manually' : '手动复制分享文案'}>
            <div className={styles.fallbackHeader}>
              <span>{english ? 'Share text' : '分享文案'}</span>
              <button type="button" aria-label={english ? 'Close share text' : '关闭分享文案'} title={english ? 'Close' : '关闭'} onClick={() => setFallbackText('')}>
                <CloseOutlined aria-hidden="true" />
              </button>
            </div>
            <textarea
              ref={fallbackRef}
              aria-label={english ? 'Share text; select to copy' : '分享文案，点击后可选择文字'}
              readOnly
              value={fallbackText}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        </div>
      )}
      <span className={styles.status} role="status">{status}</span>
      <button
        type="button"
        className={styles.shareButton}
        aria-label={english ? 'Share game' : '分享游戏'}
        title={status || (english ? 'Share game' : '分享游戏')}
        onClick={share}
      >
        {status === (english ? 'Share text copied' : '分享文案已复制')
          ? <CheckOutlined aria-hidden="true" />
          : <ShareAltOutlined aria-hidden="true" />}
      </button>
    </div>
  );
}
