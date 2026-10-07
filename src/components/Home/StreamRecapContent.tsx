'use client';

import React from 'react';
import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import { duration, formatBeijingTime } from '@/components/songs/catalog';
import { isStreamRecap, splitStreamText, StreamRecap } from './streamRecap';

interface StreamRecapContentProps {
  content: string;
  recap?: StreamRecap;
  liverId: string;
  streamId?: string;
  components: Components;
}

const categories = [
  { key: 'songs', label: '歌曲' },
  { key: 'games', label: '游戏' },
  { key: 'watch', label: '同步视听' },
  { key: 'other', label: '其他' },
] as const;

export default function StreamRecapContent({ content, recap, liverId, streamId, components }: StreamRecapContentProps) {
  const text = splitStreamText(content);
  const structured = isStreamRecap(recap) ? recap : undefined;
  const songQuery = streamId?.replace(/^(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})$/, '$1-$2-$3 $4:$5:$6') || '';
  const hasSummary = Boolean(structured || text.summary);

  return (
    <div className="space-y-6 break-words" aria-label="直播内容">
      {hasSummary && (
        <section aria-label="直播梗概">
          <h2 className="!mt-0 !mb-3 !text-lg font-bold !text-cyan-300">直播梗概</h2>
          {structured?.overview && <p className="!mt-0 !mb-4">{structured.overview}</p>}
          {text.summary && <ReactMarkdown components={components}>{text.summary}</ReactMarkdown>}
          {structured && categories.map(({ key, label }) => structured[key].length > 0 && (
            <section key={key} aria-label={label} className="mt-4">
              <h3 className="!mt-0 !mb-2 !text-sm font-bold !text-slate-200">{label}</h3>
              <ul className="!my-0 !pl-4 space-y-2 marker:text-slate-500">
                {structured[key].map((item, index) => (
                  <li key={`${item.name}-${item.start ?? index}`} className="!my-0">
                    {key === 'songs' && liverId === 'sui' ? (
                      <Link
                        href={`/liver/sui/songs?${new URLSearchParams({ q: item.name === '未识别歌名' ? songQuery : item.name })}`}
                        className="!text-cyan-300 underline-offset-4 hover:!text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                        aria-label={`查看${item.name}的歌切记录`}
                      >
                        {item.name} ↗
                      </Link>
                    ) : <span>{item.name}</span>}
                    {item.start !== undefined && <span className="ml-2 text-xs font-mono text-slate-400">{duration(item.start)}{item.end !== undefined ? `–${duration(item.end)}` : ''}</span>}
                    {item.clips?.map(clip => (
                      <a key={clip.url} href={clip.url} target="_blank" rel="noopener noreferrer" className={`${clip.title ? 'block mt-2' : 'ml-2'} !text-cyan-300 hover:!text-cyan-100 text-xs`} aria-label={`在 B 站观看${clip.title || item.name}`}>
                        {clip.title || 'B 站'} ↗
                      </a>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </section>
      )}
      {text.goodnight && (
        <section aria-label="晚安回复">
          <h2 className="!mt-0 !mb-3 !text-lg font-bold !text-cyan-300">晚安回复</h2>
          <ReactMarkdown components={components}>{text.goodnight}</ReactMarkdown>
        </section>
      )}
      {text.highlights && (
        <section aria-label="Highlight">
          <h2 className="!mt-0 !mb-3 !text-lg font-bold !text-cyan-300">Highlight</h2>
          <ReactMarkdown components={components}>{text.highlights}</ReactMarkdown>
        </section>
      )}
      {(text.metadata.length > 0 || structured?.generatedAt) && (
        <details className="border-t border-white/10 pt-3 text-xs text-slate-400" aria-label="生成信息">
          <summary className="cursor-pointer hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">生成信息</summary>
          {structured?.generatedAt && <p className="!my-3">梗概更新：<time dateTime={structured.generatedAt}>{formatBeijingTime(Date.parse(structured.generatedAt))}</time>（北京时间）</p>}
          {text.metadata.map((metadata, index) => <pre key={index} className="!bg-transparent !px-0 !text-slate-400 whitespace-pre-wrap break-all">{metadata}</pre>)}
        </details>
      )}
      {!hasSummary && !text.goodnight && !text.highlights && !text.metadata.length && <p className="!my-0 text-slate-400">暂无直播梗概与精彩回顾。</p>}
    </div>
  );
}
