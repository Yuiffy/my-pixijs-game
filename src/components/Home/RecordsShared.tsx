'use client';

import React, { useState, useEffect } from 'react';
import type { Components } from 'react-markdown';
import { StarOutlined, ThunderboltOutlined, CoffeeOutlined } from '@ant-design/icons';
import StreamRecapContent from './StreamRecapContent';
import type { StreamRecap } from './streamRecap';

export interface StreamData {
  id: string;
  title: string;
  date: string;
  time: string;
  startTime: string;
  endTime: string | null;
  durationStr: string | null;
  srt: string | null;
  xml: string | null;
  cover: string | null;
  highlights: string | null; // Now can be a path or content
  recap?: StreamRecap;
  images: string[];
  replayUrl?: string;
  duration?: number;
}

export const getPublicFileUrl = (filePath: string) => {
  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }

  return filePath
    .split('/')
    .map((segment, index) => (index === 0 ? segment : encodeURIComponent(segment)))
    .join('/');
};

export const getDownloadFilename = (filePath: string) => (
  filePath.split('/').pop() || undefined
);

// Markdown 组件定义
export const MarkdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-4 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-4 mb-4">{children}</ul>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="mb-1">{children}</li>,
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-xl font-bold mb-3 text-cyan-300">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-lg font-bold mb-2 text-cyan-400">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-base font-bold mb-2 text-pink-300">{children}</h3>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="text-cyan-200 font-bold">{children}</strong>
};

// 模态框中的 Markdown 组件定义
export const ModalMarkdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-4 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-4 mb-4">{children}</ul>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="mb-1">{children}</li>,
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-xl font-bold mb-3 text-cyan-300">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-lg font-bold mb-2 text-cyan-400">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-base font-bold mb-2 text-pink-300">{children}</h3>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="text-cyan-200 font-bold">{children}</strong>
};

interface HighlightsDisplayProps {
  highlights: string | null;
  recap?: StreamRecap;
  liverId?: string;
  streamId?: string;
  components?: Components;
}

export const HighlightsDisplay = ({ highlights, recap, liverId = 'sui', streamId, components = MarkdownComponents }: HighlightsDisplayProps) => {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setFailed(false);
    setContent(null);
    setLoading(false);
    if (!highlights) {
      return () => controller.abort();
    } if (highlights.startsWith('/data/streams/')) {
      setLoading(true);
      fetch(highlights, { signal: controller.signal })
        .then(res => { if (!res.ok) throw new Error('Highlights unavailable'); return res.text(); })
        .then(text => { if (active) setContent(text); })
        .catch(() => { if (active) setFailed(true); })
        .finally(() => { if (active) setLoading(false); });
    } else {
      setContent(highlights);
    }
    return () => { active = false; controller.abort(); };
  }, [highlights]);

  return (
    <>
      {(!loading && !failed) || recap ? <StreamRecapContent content={content || ''} recap={recap} liverId={liverId} streamId={streamId} components={components} /> : null}
      {loading && <p role="status" className="text-slate-400 text-xs">正在加载晚安回复与 Highlight…</p>}
      {failed && <p role="status" className="text-slate-400 text-xs">晚安回复与 Highlight 加载失败。</p>}
    </>
  );
};

// 获取时间段信息的函数
export const getPeriodInfo = (time?: string) => {
  // 根据时间判断是早播、午播还是晚播
  const hour = time ? parseInt(time.split(':')[0]) : 20; // 默认晚播

  if (hour >= 5 && hour < 12) return {
    label: '早播',
    color: 'cyan',
    tagColor: 'cyan',
    icon: <ThunderboltOutlined />,
    bg: 'from-cyan-500/20 to-emerald-500/20',
    border: 'border-cyan-500/30',
    accent: 'via-cyan-500'
  };
  if (hour >= 12 && hour < 18) return {
    label: '午播',
    color: 'orange',
    tagColor: 'orange',
    icon: <CoffeeOutlined />,
    bg: 'from-orange-500/20 to-amber-500/20',
    border: 'border-orange-500/30',
    accent: 'via-orange-500'
  };
  return {
    label: '晚播',
    color: 'purple',
    tagColor: 'purple',
    icon: <StarOutlined />,
    bg: 'from-purple-500/20 to-indigo-500/20',
    border: 'border-purple-500/30',
    accent: 'via-purple-500'
  };
};
