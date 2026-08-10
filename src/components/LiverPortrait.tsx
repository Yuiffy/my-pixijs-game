'use client';

import Image from 'next/image';
import { CSSProperties, useState } from 'react';
import styles from './LiverPortrait.module.css';

interface LiverPortraitProps {
  name: string;
  primarySrc?: string;
  fallbackSrc?: string;
  accent: string;
  className?: string;
}

export default function LiverPortrait({
  name,
  primarySrc,
  fallbackSrc,
  accent,
  className = '',
}: LiverPortraitProps) {
  const initial = Array.from(name.trim())[0] || '?';
  const [src, setSrc] = useState(primarySrc || fallbackSrc || '');
  const [usingFallback, setUsingFallback] = useState(!primarySrc && Boolean(fallbackSrc));

  const handleError = () => {
    if (fallbackSrc && src !== fallbackSrc) {
      setSrc(fallbackSrc);
      setUsingFallback(true);
      return;
    }
    setSrc('');
  };

  return (
    <div
      className={`${styles.portrait} ${className}`}
      style={{ '--portrait-accent': accent } as CSSProperties}
      aria-hidden="true"
    >
      {src ? (
        <Image
          fill
          src={src}
          alt=""
          sizes="72px"
          className={usingFallback ? `${styles.image} ${styles.imageFallback}` : styles.image}
          onError={handleError}
        />
      ) : (
        <span className={styles.fallback}>{initial}</span>
      )}
    </div>
  );
}
