'use client';

import Image from 'next/image';
import { useState } from 'react';

interface LiverAvatarProps {
  avatarSrc?: string;
  name: string;
  color: string;
  size: number;
  priority?: boolean;
  className?: string;
}

export default function LiverAvatar({
  avatarSrc,
  name,
  color,
  size,
  priority = false,
  className = '',
}: LiverAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initial = Array.from(name.trim())[0] || '?';
  const showImage = avatarSrc && avatarSrc !== failedSrc;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full flex items-center justify-center text-white font-bold ${className}`}
      style={{ width: size, height: size, background: color }}
    >
      <span aria-hidden>{initial}</span>
      {showImage && (
        <Image
          fill
          src={avatarSrc}
          alt={`${name}头像`}
          className="object-cover"
          sizes={`${size}px`}
          priority={priority}
          onError={() => setFailedSrc(avatarSrc)}
        />
      )}
    </div>
  );
}
