'use client';

import React, { useState, useEffect } from 'react';
import { Typography, Button, Space, Modal } from 'antd';
// eslint-disable-next-line import/no-duplicates
import { HistoryOutlined, CalendarOutlined, ThunderboltOutlined, CloseOutlined, PlayCircleOutlined, InfoCircleOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import weekday from 'dayjs/plugin/weekday';
import localeData from 'dayjs/plugin/localeData';
import RecordsListView from './RecordsListView';
import RecordsCalendarView from './RecordsCalendarView';
import { StreamData, HighlightsDisplay, ModalMarkdownComponents, getDownloadFilename, getPeriodInfo, getPublicFileUrl } from './RecordsShared';
import { Image as AntImage, Tag } from 'antd';
// eslint-disable-next-line import/no-duplicates
import { getLiverConfig, type LiverInfo } from '@/data/livers';

// Extend dayjs with required plugins for Ant Design Calendar
dayjs.extend(weekday);
dayjs.extend(localeData);

const { Title, Text } = Typography;

interface RecordsModuleProps {
  streams?: StreamData[];
  liverId?: string;
}

const RecordsModule = ({ streams: externalStreams, liverId = 'sui' }: RecordsModuleProps) => {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarMode, setCalendarMode] = useState<'month' | 'year'>('month');
  const [calendarValue, setCalendarValue] = useState<Dayjs>(dayjs());
  const [streams, setStreams] = useState<StreamData[]>(externalStreams || []);
  const [loading, setLoading] = useState(!externalStreams);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStream, setSelectedStream] = useState<StreamData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [liverConfig, setLiverConfig] = useState<LiverInfo | null>(null);
  const pageSize = 5;

  // 加载主播配置
  useEffect(() => {
    const config = getLiverConfig(liverId);
    setLiverConfig(config);
  }, [liverId]);

  // 加载直播数据（如果没有外部传入）
  useEffect(() => {
    if (externalStreams) {
      setStreams(externalStreams);
      setLoading(false);
      return;
    }

    setLoading(true);
    const config = getLiverConfig(liverId);

    // 使用主播配置的数据路径
    const dataPath = config?.dataPath || '/data/streams/';

    fetch(`${dataPath}/streams.json`)
      .then(res => res.json())
      .then(data => {
        setStreams(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load streams', err);
        setLoading(false);
      });
  }, [liverId, externalStreams]);

  const handleStreamSelect = (stream: StreamData) => {
    setSelectedStream(stream);
    setIsModalOpen(true);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleCalendarValueChange = (value: Dayjs) => {
    setCalendarValue(value);
  };

  const handleCalendarModeChange = (mode: 'month' | 'year') => {
    setCalendarMode(mode);
  };

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
            {liverConfig?.bilibiliReplayUrl && (
              <Button
                 type="link"
                 href={liverConfig.bilibiliReplayUrl}
                 target="_blank"
                 className="text-cyan-400 p-0 hover:text-cyan-300 font-bold flex items-center gap-1"
                 icon={<ThunderboltOutlined />}
              >
                 前往 Bilibili 直播录像合集 →
              </Button>
            )}
          </div>
        </div>
        <div className="bg-white/5 p-1 rounded-full border border-white/10 shrink-0">
          <Button
            icon={<HistoryOutlined />}
            onClick={() => setViewMode('list')}
            type={viewMode === 'list' ? 'primary' : 'text'}
            className={viewMode === 'list' ? 'bg-cyan-600 rounded-full' : 'text-slate-400 hover:!text-cyan-300'}
            style={liverConfig ? {
              backgroundColor: viewMode === 'list' ? liverConfig.colorMain : undefined
            } : {}}
          >
            列表视图
          </Button>
          <Button
            icon={<CalendarOutlined />}
            onClick={() => setViewMode('calendar')}
            type={viewMode === 'calendar' ? 'primary' : 'text'}
            className={viewMode === 'calendar' ? 'bg-pink-600 rounded-full ml-1' : 'text-slate-400 hover:!text-pink-300 ml-1'}
            style={liverConfig ? {
              backgroundColor: viewMode === 'calendar' ? liverConfig.colorSub : undefined
            } : {}}
          >
            日历视图
          </Button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <RecordsListView
          streams={streams}
          loading={loading}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onStreamSelect={handleStreamSelect}
        />
      ) : (
        <RecordsCalendarView
          streams={streams}
          calendarValue={calendarValue}
          calendarMode={calendarMode}
          onCalendarValueChange={handleCalendarValueChange}
          onCalendarModeChange={handleCalendarModeChange}
          onStreamSelect={handleStreamSelect}
        />
      )}

      {/* Stream Detail Modal */}
      <Modal
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={850}
        closeIcon={<CloseOutlined className="text-white hover:rotate-90 transition-transform" />}
        centered
        className="stream-detail-modal"
        styles={{
            mask: { backdropFilter: 'blur(10px)' },
            content: {
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(135, 234, 255, 0.1)',
                padding: 0,
                borderRadius: '32px',
                overflow: 'hidden',
                maxHeight: '90vh'
            }
        }}
      >
        {(() => {
          if (!selectedStream) return null;
          const period = getPeriodInfo(selectedStream.time);
          return (
            <div className="flex flex-col md:flex-row h-full max-h-[80vh] overflow-hidden">
              {/* Left Column: Image */}
              <div className="w-full md:w-[45%] shrink-0 h-[300px] md:h-full bg-slate-900/50 relative overflow-hidden border-r border-white/5">
                <div
                  className={`absolute top-0 left-0 h-full w-1.5 bg-gradient-to-b from-transparent ${period.accent} to-transparent opacity-80 z-20 pointer-events-none`}
                  style={{
                    '--tw-gradient-to': `from transparent to ${liverConfig?.colorMain || '#87EAFF'}`
                  } as React.CSSProperties}
                />
                <div className="h-full w-full">
                  <AntImage.PreviewGroup>
                    {selectedStream.images && selectedStream.images.length > 0 ? (
                      <AntImage
                        src={selectedStream.images[0]}
                        alt={selectedStream.title}
                        className="!h-full !w-full object-cover animate-slow-pan"
                        wrapperClassName="h-full w-full block"
                      />
                    ) : selectedStream.cover ? (
                      <AntImage
                        src={selectedStream.cover}
                        alt={selectedStream.title}
                        className="!h-full !w-full object-cover opacity-80 animate-slow-pan"
                        wrapperClassName="h-full w-full block"
                      />
                    ) : (
                      <div className="flex items-center justify-center p-12 text-slate-500 font-bold h-full">NO VISUAL</div>
                    )}
                  </AntImage.PreviewGroup>
                </div>
                {/* Image Thumbnails Overlay */}
                {selectedStream.images && selectedStream.images.length > 1 && (
                  <div className="absolute bottom-4 left-4 right-4 flex gap-2 overflow-x-auto pb-2 custom-scrollbar z-30">
                     <AntImage.PreviewGroup>
                        {selectedStream.images.slice(1).map((img, i) => (
                           <AntImage
                              key={i}
                              src={img}
                              width={60}
                              height={45}
                              className="rounded-lg object-cover border border-white/20 hover:border-cyan-400 transition-colors shadow-xl"
                           />
                        ))}
                     </AntImage.PreviewGroup>
                  </div>
                )}
              </div>

              {/* Right Column: Info */}
               <div
                  className={`w-full md:w-[55%] flex flex-col p-8 bg-gradient-to-br ${period.bg} overflow-hidden`}
                  style={{
                   background: liverConfig ?
                     `linear-gradient(to bottom right, ${liverConfig.colorMain}20, ${liverConfig.colorSub}20)` :
                     undefined
                 }}
               >
                <div className="flex flex-col gap-4 mb-6 shrink-0">
                   <div className="flex flex-wrap items-center gap-3">
                      <Tag color={period.tagColor as any} className="font-bold border-none px-4 py-1 uppercase text-[10px] tracking-widest flex items-center gap-2 shadow-lg m-0 rounded-full">
                         {period.icon} {period.label}
                      </Tag>
                      <Text className="text-white text-xl font-black font-mono tracking-tight glow-text">{selectedStream.date}</Text>
                   </div>
                   <Title level={3} className="!text-white !mb-0 !text-2xl md:!text-3xl leading-tight font-black">{selectedStream.title}</Title>

                   <div className="flex items-center gap-4 text-slate-200 font-mono text-sm bg-black/40 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/5 shadow-inner w-fit">
                      <span className="flex items-center gap-2"><CalendarOutlined className="text-pink-400" /> <b>{selectedStream.startTime} ~ {selectedStream.endTime}</b></span>
                      {selectedStream.durationStr && (
                         <span className="flex items-center gap-2 border-l border-white/10 pl-4">
                            <HistoryOutlined className="text-cyan-400" /> <b>{selectedStream.durationStr}</b>
                         </span>
                      )}
                   </div>
                </div>

                <div className="flex-1 bg-black/50 backdrop-blur-xl p-6 rounded-[24px] mb-6 overflow-y-auto custom-scrollbar border border-white/5 shadow-inner min-h-0">
                   <div className="flex items-center gap-2 mb-4 opacity-60">
                      <InfoCircleOutlined className="text-cyan-400" />
                      <span className="text-[11px] font-black uppercase tracking-widest">AI Highlights</span>
                   </div>
                   <article className="prose prose-invert prose-sm max-w-none text-slate-300 font-sans leading-relaxed">
                     <HighlightsDisplay highlights={selectedStream.highlights} components={ModalMarkdownComponents} />
                   </article>
                </div>

                <div className="mt-auto flex items-center justify-between pt-4 border-t border-white/5 shrink-0">
                   <Space size="middle">
                      {selectedStream.replayUrl && (
                         <Button
                            type="primary"
                            icon={<PlayCircleOutlined />}
                            href={selectedStream.replayUrl}
                            target="_blank"
                            className="bg-cyan-500 hover:bg-cyan-400 border-none rounded-xl font-bold px-6"
                         >
                            看回放
                         </Button>
                      )}
                      {selectedStream.srt && (
                         <Button
                            icon={<EyeOutlined />}
                            href={`/wiki/${liverId}/srt?url=${encodeURIComponent(selectedStream.srt)}`}
                            target="_blank"
                            className="bg-white/5 border-white/10 text-slate-300 hover:!text-cyan-400 hover:!bg-white/10 rounded-xl"
                         >
                            语音字幕
                         </Button>
                      )}
                   </Space>

                   {selectedStream.xml && (
                      <Button
                         icon={<ThunderboltOutlined />}
                         href={getPublicFileUrl(selectedStream.xml)}
                         download={getDownloadFilename(selectedStream.xml)}
                         className="text-pink-400 hover:text-pink-300 font-bold"
                         type="link"
                      >
                         弹幕存档
                      </Button>
                   )}
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default RecordsModule;
