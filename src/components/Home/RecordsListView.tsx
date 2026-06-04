'use client';

import React from 'react';
import { Typography, Button, Space, Card, Tag, Pagination, Image as AntImage } from 'antd';
import { CalendarOutlined, HistoryOutlined, StarOutlined, EyeOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { StreamData, HighlightsDisplay, getDownloadFilename, getPeriodInfo, getPublicFileUrl } from './RecordsShared';

const { Title, Text } = Typography;

interface RecordsListViewProps {
  streams: StreamData[];
  loading: boolean;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onStreamSelect: (stream: StreamData) => void;
}

const RecordsListView: React.FC<RecordsListViewProps> = ({
  streams,
  loading,
  currentPage,
  pageSize,
  onPageChange,
  onStreamSelect
}) => {
  const paginatedStreams = streams.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-[40px] border border-white/5">
        <div className="w-12 h-12 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mb-4" />
        <Text className="text-slate-400 font-bold tracking-widest uppercase text-xs">Loading Highlights...</Text>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {paginatedStreams.map((stream) => {
        const period = getPeriodInfo(stream.time);
        return (
          <Card
            key={stream.id}
            id={`stream-${stream.id}`}
            className="bg-white/5 border-white/5 overflow-hidden hover:border-cyan-500/30 transition-all rounded-3xl group md:h-[500px]"
            bodyStyle={{ padding: 0, height: '100%' }}
            // onClick={() => onStreamSelect(stream)}
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
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : stream.cover ? (
                      <AntImage
                        src={stream.cover}
                        alt={stream.title}
                        className="!h-full !w-full object-cover opacity-80 grayscale-[0.3] group-hover:grayscale-0 transition-all duration-700 animate-slow-pan"
                        wrapperClassName="h-full w-full block"
                        onClick={(e) => e.stopPropagation()}
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
                    <HighlightsDisplay highlights={stream.highlights} />
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
                            onClick={(e) => e.stopPropagation()}
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
                          onClick={(e) => e.stopPropagation()}
                        >
                          语音转文字
                        </Button>
                        <Button
                          icon={<CloudDownloadOutlined />}
                          href={getPublicFileUrl(stream.srt)}
                          download={getDownloadFilename(stream.srt)}
                          size="small"
                          className="bg-white/10 border-none text-cyan-500 hover:!bg-cyan-500/20 rounded-r-lg border-l border-white/10 px-2"
                          title="直接下载 SRT"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}
                    {stream.xml && (
                      <Button
                        icon={<CloudDownloadOutlined />}
                        href={getPublicFileUrl(stream.xml)}
                        download={getDownloadFilename(stream.xml)}
                        size="small"
                        className="bg-white/10 border-none text-pink-300 hover:!bg-pink-500/20 rounded-lg px-4 font-bold"
                        onClick={(e) => e.stopPropagation()}
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
          onChange={onPageChange}
          showSizeChanger={false}
          className="custom-pagination scale-110"
        />
      </div>
    </div>
  );
};

export default RecordsListView;
