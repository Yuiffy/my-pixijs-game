'use client'; // 必须标记为客户端组件

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

export default function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 使用 useRef 避免开发环境下 React Strict Mode 导致的重复统计（可选）
  const isFirstRender = useRef(true);

  useEffect(() => {
    // 拼接完整路径，例如 /game/wuxia?id=123
    const url = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

    // 开发环境防止重复触发的简单处理（生产环境通常不需要这个if，或者后端做防抖）
    // if (process.env.NODE_ENV === 'development' && !isFirstRender.current) return;
    // isFirstRender.current = false;

    console.log(`[Analytics] Reporting view: ${url}`);

    // 调用你之前写好的 API
    fetch('/api/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: url }),
    }).catch((err) => console.error('[Analytics] Failed:', err));

  }, [pathname, searchParams]); // 只要路径或参数变化，就触发

  return null; // 这个组件不渲染任何 UI
}
