'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { recordGameOpen } from './storage';

export default function RecentGameTracker() {
  const pathname = usePathname();
  useEffect(() => {
    recordGameOpen(pathname.replace(/\/$/, ''));
  }, [pathname]);
  return null;
}
