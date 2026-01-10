'use client';

import React, { useState, useEffect } from 'react';
import { Typography, Button, Space, Card, Tag, Pagination, Calendar, Badge, Tooltip, ConfigProvider, theme } from 'antd';
import { HistoryOutlined, CalendarOutlined, ThunderboltOutlined, CoffeeOutlined, StarOutlined, EyeOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { Image as AntImage } from 'antd';
import ReactMarkdown from 'react-markdown';

const { Title, Text } = Typography;

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
  highlights: string | null;
  images: string[];
  replayUrl?: string;
}

const RecordsModule = () => {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [streams, setStreams] = useState<StreamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  useEffect(() => {
    setLoading(true);
    fetch('/data/streams/streams.json')
      .then(res => res.json())
      .then(data => {
        setStreams(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load streams', err);
        setLoading(false);
      });
  }, []);

  const getPeriodInfo = (time: string) => {
    const hour = parseInt(time.split(':')[0]);
    if (hour >= 5 && hour < 12) return {
      label: '早台',
      color: 'cyan',
      tagColor: 'cyan',
      icon: <ThunderboltOutlined />,
      bg: 'from-cyan-500/20 to-emerald-500/20',
      border: 'border-cyan-500/30',
      accent: 'via-cyan-500'
    };
    if (hour >= 12 && hour < 18) return {
      label: '午台',
      color: 'orange',
      tagColor: 'orange',
      icon: <CoffeeOutlined />,
      bg: 'from-orange-500/20 to-amber-500/20',
      border: 'border-orange-500/30',
      accent: 'via-orange-500'
    };
    return {
      label: '晚台',
      color: 'purple',
      tagColor: 'purple',
      icon: <StarOutlined />,
      bg: 'from-purple-500/20 to-indigo-500/20',
      border: 'border-purple-500/30',
      accent: 'via-purple-500'
    };
  };

  const onCalendarSelect = (value: any) => {
    const dateStr = value.format('YYYY-MM-DD');
    const dayStreams = streams.filter(s => s.date === dateStr);
    if (dayStreams.length > 0) {
      const index = streams.findIndex(s => s.id === dayStreams[0].id);
      if (index !== -1) {
        const page = Math.floor(index / pageSize) + 1;
        setCurrentPage(page);
        setViewMode('list');
        setTimeout(() => {
          const element = document.getElementById(`stream-${dayStreams[0].id}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    }
  };

  const dateCellRender = (value: any) => {
    const dateStr = value.format('YYYY-MM-DD');
    const dayStreams = streams
      .filter(s => s.date === dateStr)
      .sort((a, b) => a.time.localeCompare(b.time));
    return (
      <ul className="list-none p-0">
        {dayStreams.map(item => (
          <li key={item.id}>
            <Tooltip title={`${item.time} ${item.title}`}>
              <Badge status="processing" text={item.title} className="text-[10px] text-pink-300 transform scale-90 truncate max-w-full block" />
            </Tooltip>
          </li>
        ))}
      </ul>
    );
  };

  const paginatedStreams = streams.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-col md:flex-row items-center justify-between mb-10 gap-4">
        <div>
          <Title level={2} className="!text-white !mb-2 flex items-center gap-3">
            <HistoryOutlined className="text-cyan-400" /> 直播回顾
          </Title>
          <div className="flex items-center gap-4 flex-wrap">
            <Text className="text-slate-400">
              记录每一场（其实没有每一场）直播的珍贵瞬间 📅 {loading ? '加载中...' : `共 ${streams.length} 场`}
            </Text>
            <Button
               type="link"
               href="https://space.bilibili.com/1954091502/lists/2609053?type=series"
               target="_blank"
               className="text-cyan-400 p-0 hover:text-cyan-300 font-bold flex items-center gap-1"
               icon={<ThunderboltOutlined />}
            >
              前往 Bilibili 直播录像合集 →
            </Button>
          </div>
        </div>
        <div className="bg-white/5 p-1 rounded-full border border-white/10 shrink-0">
          <Button
            icon={<HistoryOutlined />}
            onClick={() => setViewMode('list')}
            type={viewMode === 'list' ? 'primary' : 'text'}
            className={viewMode === 'list' ? 'bg-cyan-600 rounded-full' : 'text-slate-400 hover:!text-cyan-300'}
          >
            列表视图
          </Button>
          <Button
            icon={<CalendarOutlined />}
            onClick={() => setViewMode('calendar')}
            type={viewMode === 'calendar' ? 'primary' : 'text'}
            className={viewMode === 'calendar' ? 'bg-pink-600 rounded-full ml-1' : 'text-slate-400 hover:!text-pink-300 ml-1'}
          >
            日历视图
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-[40px] border border-white/5">
           <div className="w-12 h-12 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mb-4" />
           <Text className="text-slate-400 font-bold tracking-widest uppercase text-xs">Loading Highlights...</Text>
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-8">
          {paginatedStreams.map((stream) => {
            const period = getPeriodInfo(stream.time);
            return (
              <Card
                key={stream.id}
                id={`stream-${stream.id}`}
                className="bg-white/5 border-white/5 overflow-hidden hover:border-cyan-500/30 transition-all rounded-3xl group md:h-[500px]"
                bodyStyle={{ padding: 0, height: '100%' }}
              >
               <div className="flex flex-col md:flex-row h-full">
                  <div className="w-full md:w-[45%] shrink-0 h-[300px] md:h-full bg-slate-900/50 relative overflow-hidden border-r border-white/5">
                     <div className={`absolute top-0 left-0 h-full w-1.5 bg-gradient-to-b from-transparent ${period.accent} to-transparent opacity-80 z-20 pointer-events-none`} />
                     <div className="h-full w-full">
                        <AntImage.PreviewGroup>
                          {stream.images && stream.images.length > 0 ? (
                            <AntImage
                              src={stream.images[0]}
                              alt={stream.title}
                              className="!h-full !w-full object-cover animate-slow-pan"
                              wrapperClassName="h-full w-full block"
                            />
                          ) : stream.cover ? (
                            <AntImage
                              src={stream.cover}
                              alt={stream.title}
                              className="!h-full !w-full object-cover opacity-80 grayscale-[0.3] group-hover:grayscale-0 transition-all duration-700 animate-slow-pan"
                              wrapperClassName="h-full w-full block"
                            />
                          ) : (
                            <div className="flex items-center justify-center p-12 text-slate-500 font-bold w-full h-full">NO VISUAL</div>
                          )}
                        </AntImage.PreviewGroup>
                     </div>
                  </div>

                  <div className={`w-full md:w-[55%] flex flex-col p-6 md:p-8 bg-gradient-to-br ${period.bg} h-full overflow-hidden`}>
                      <div className="flex flex-col gap-4 mb-6">
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                           <div className="flex items-center gap-3">
                              <Tag color={period.tagColor as any} className="font-bold border-none px-4 py-1 uppercase text-xs tracking-widest flex items-center gap-2 shadow-lg m-0 rounded-full">
                                {period.icon} {period.label}
                              </Tag>
                              <Text className="text-white text-2xl font-black font-mono tracking-tight glow-text">{stream.date}</Text>
                           </div>
                           <div className="flex items-center gap-4 text-slate-200 font-mono text-sm bg-white/10 backdrop-blur-md px-5 py-2 rounded-2xl border border-white/10 shadow-xl">
                              <span className="flex items-center gap-2.5 whitespace-nowrap"><CalendarOutlined className="text-pink-400 text-base" /> <span className="font-bold">{stream.startTime} ~ {stream.endTime}</span></span>
                              {stream.durationStr && (
                                 <span className="flex items-center gap-2.5 border-l border-white/20 pl-4 whitespace-nowrap">
                                    <HistoryOutlined className="text-cyan-400 text-base" /> <span className="font-bold">{stream.durationStr}</span>
                                 </span>
                              )}
                           </div>
                        </div>
                        <Title level={2} className="!text-white group-hover:text-cyan-300 transition-colors !mb-0 !text-2xl md:!text-3xl leading-tight font-black">{stream.title}</Title>
                      </div>

                      <div className="flex-1 bg-black/40 backdrop-blur-md p-5 rounded-2xl mb-6 overflow-y-auto custom-scrollbar border border-white/10 shadow-inner group/summary">
                        <article className="prose prose-invert prose-sm max-w-none text-slate-300 font-sans leading-relaxed opacity-80 group-hover/summary:opacity-100 transition-opacity">
                          {stream.highlights ? (
                            <ReactMarkdown
                              components={{
                                p: ({ children }: { children?: React.ReactNode }) => <p className="mb-4 last:mb-0">{children}</p>,
                                ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-4 mb-4">{children}</ul>,
                                li: ({ children }: { children?: React.ReactNode }) => <li className="mb-1">{children}</li>,
                                h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-xl font-bold mb-3 text-cyan-300">{children}</h1>,
                                h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-lg font-bold mb-2 text-cyan-400">{children}</h2>,
                                h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-base font-bold mb-2 text-pink-300">{children}</h3>,
                                strong: ({ children }: { children?: React.ReactNode }) => <strong className="text-cyan-200 font-bold">{children}</strong>
                              }}
                            >
                              {stream.highlights}
                            </ReactMarkdown>
                          ) : '暂无 AI 总结摘要...'}
                        </article>
                      </div>

                      <div className="mt-auto flex items-center justify-between gap-6 pt-2 border-t border-white/5">
                        <div className="flex gap-2 overflow-x-auto pb-1 max-w-[50%] custom-scrollbar">
                           {stream.images && stream.images.length > 1 && (
                             <AntImage.PreviewGroup>
                               {stream.images.slice(1).map((img, i) => (
                                 <AntImage
                                  key={i}
                                  src={img}
                                  width={50}
                                  height={40}
                                  className="rounded-lg object-cover border border-white/10 hover:border-cyan-400/50 transition-colors"
                                 />
                               ))}
                             </AntImage.PreviewGroup>
                           )}
                        </div>
                        <Space size="middle" className="flex-wrap justify-end shrink-0">
                          {stream.srt && (
                            <div className="flex items-center gap-1.5">
                              <Button
                                icon={<EyeOutlined />}
                                href={`/wiki/sui/srt?url=${encodeURIComponent(stream.srt)}`}
                                target="_blank"
                                size="small"
                                className="bg-white/10 border-none text-cyan-300 hover:!bg-cyan-500/20 rounded-l-lg pr-3 font-bold"
                              >
                                语音转文字
                              </Button>
                              <Button
                                icon={<CloudDownloadOutlined />}
                                href={stream.srt}
                                download
                                size="small"
                                className="bg-white/10 border-none text-cyan-500 hover:!bg-cyan-500/20 rounded-r-lg border-l border-white/10 px-2"
                                title="直接下载 SRT"
                              />
                            </div>
                          )}
                          {stream.xml && (
                             <Button
                              icon={<EyeOutlined />}
                              href={stream.xml}
                              target="_blank"
                              rel="noopener noreferrer"
                              size="small"
                              className="bg-white/10 border-none text-pink-300 hover:!bg-pink-500/20 rounded-lg px-4 font-bold"
                            >
                               弹幕
                            </Button>
                          )}
                        </Space>
                      </div>
                  </div>
               </div>
              </Card>
            );
          })}
          <div className="flex justify-center pt-12">
            <Pagination
              current={currentPage}
              total={streams.length}
              pageSize={pageSize}
              onChange={(page) => setCurrentPage(page)}
              showSizeChanger={false}
              className="custom-pagination scale-110"
            />
          </div>
        </div>
      ) : (
        <div className="bg-white/5 p-4 md:p-8 rounded-[40px] border border-white/5 shadow-2xl overflow-hidden ring-1 ring-white/10">
          <div className="overflow-x-auto custom-scrollbar">
            <div className="min-w-[800px]">
              <ConfigProvider
                theme={{
                  algorithm: theme.darkAlgorithm,
                  token: {
                    colorBgContainer: 'transparent',
                  },
                }}
              >
                <Calendar
                  fullscreen={true}
                  cellRender={dateCellRender}
                  onSelect={onCalendarSelect}
                  className="bg-transparent"
                />
              </ConfigProvider>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecordsModule;
