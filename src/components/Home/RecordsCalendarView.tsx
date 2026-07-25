'use client';

import React from 'react';
import { Button, Calendar, ConfigProvider, theme, Radio, Tooltip, Space } from 'antd';
import { LeftOutlined, RightOutlined, DoubleLeftOutlined, DoubleRightOutlined, HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import weekday from 'dayjs/plugin/weekday';
import localeData from 'dayjs/plugin/localeData';
import { StreamData, getPeriodInfo } from './RecordsShared';

// Extend dayjs with required plugins for Ant Design Calendar
dayjs.extend(weekday);
dayjs.extend(localeData);

interface RecordsCalendarViewProps {
  streams: StreamData[];
  calendarValue: Dayjs;
  calendarMode: 'month' | 'year';
  onCalendarValueChange: (value: Dayjs) => void;
  onCalendarModeChange: (mode: 'month' | 'year') => void;
  onStreamSelect: (stream: StreamData) => void;
}

const RecordsCalendarView: React.FC<RecordsCalendarViewProps> = ({
  streams,
  calendarValue,
  calendarMode,
  onCalendarValueChange,
  onCalendarModeChange,
  onStreamSelect
}) => {
  const cellRender = (value: Dayjs, info: any) => {
    if (info.type === 'month') {
      const monthStr = value.format('YYYY-MM');
      const monthStreams = streams.filter(s => s.date.startsWith(monthStr));
      const count = monthStreams.length;

      if (count === 0) return null;

      const totalSeconds = monthStreams.reduce((acc, curr) => acc + (curr.duration || 0), 0);
      const totalHours = (totalSeconds / 3600).toFixed(1);

      return (
        <div className="flex flex-col items-center justify-center p-2 rounded-xl mt-2 group hover:bg-white/10 transition-colors cursor-pointer h-full border border-white/5 bg-white/5">
          <div className="text-xl font-black text-white mb-1">{count} <span className="text-xs font-normal text-slate-400">场</span></div>
          <div className="text-xs text-cyan-300 font-mono font-bold bg-cyan-950/30 px-2 py-0.5 rounded-full border border-cyan-500/20 group-hover:border-cyan-400/50 transition-colors">
            {totalHours} hrs
          </div>
        </div>
      );
    }

    if (info.type === 'date') {
      const dateStr = value.format('YYYY-MM-DD');
      const dayStreams = streams
        .filter(s => s.date === dateStr)
        .sort((a, b) => a.time.localeCompare(b.time));

      if (dayStreams.length === 0) {
        return null;
      }

      return (
        <div className="relative">
          {/* {info.originNode} */}
          <ul className="list-none p-0 flex flex-col gap-1.5 overflow-visible mt-1">
            {dayStreams.slice(0, 2).map((stream) => {
              const period = getPeriodInfo(stream.time);
              const hours = stream.duration ? (stream.duration / 3600).toFixed(1) : null;

              return (
                <li key={stream.id} className="relative group">
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onStreamSelect(stream);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onStreamSelect(stream);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className={`
                      stream-calendar-item rounded-lg p-1.5 transition-all duration-300 border cursor-pointer hover:scale-[1.02] active:scale-95
                      ${period.label === '早播' ? 'bg-cyan-500/10 border-cyan-500/20 hover:bg-cyan-500/20 hover:border-cyan-400/50' : ''}
                      ${period.label === '午播' ? 'bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-400/50' : ''}
                      ${period.label === '晚播' ? 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20 hover:border-purple-400/50' : ''}
                    `}
                  >
                    <Tooltip title={`${stream.time} ${stream.title}`} placement="top" overlayClassName="z-[9999]">
                      <div className="flex flex-col gap-1 w-full overflow-hidden">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-[10px] font-mono font-bold ${
                            period.label === '早播' ? 'text-cyan-400' :
                            period.label === '午播' ? 'text-orange-400' : 'text-purple-400'
                          }`}>
                            {stream.startTime}
                          </span>
                          {hours && (
                            <span className="text-[9px] opacity-40 font-mono text-white">
                              {hours}h
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-200/90 leading-tight line-clamp-2 break-all">{stream.title}</span>
                      </div>
                    </Tooltip>
                  </div>
                </li>
              );
            })}
            {dayStreams.length > 2 && (
              <div className="text-[8px] text-slate-400 font-bold text-center">+{dayStreams.length - 2}</div>
            )}
          </ul>
        </div>
      );
    }

    return info.originNode;
  };

  const calendarHeaderRender = ({ value, type, onChange, onTypeChange }: any) => {
    const today = dayjs();
    const isFutureYearCheck = (val: Dayjs) => val.year() >= today.year();
    const isFutureMonth = (val: Dayjs) => val.year() > today.year() || (val.year() === today.year() && val.month() >= today.month());

    return (
      <div className="flex items-center justify-between p-4 mb-4 bg-white/5 rounded-2xl border border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <Space size="large">
            <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-xl border border-white/10 shadow-inner">
              <Button
                size="small"
                type="text"
                icon={<DoubleLeftOutlined />}
                onClick={() => onChange(value.clone().subtract(1, 'year'))}
                className="text-slate-400 hover:text-cyan-400 hover:bg-white/10"
              />
              <Button
                size="small"
                type="text"
                icon={<LeftOutlined />}
                onClick={() => onChange(value.clone().subtract(1, 'month'))}
                className={`text-slate-400 hover:text-cyan-400 hover:bg-white/10 ${type === 'year' ? 'hidden' : ''}`}
              />
            </div>

            <div className="flex flex-col items-center min-w-[120px]">
              <span className="text-3xl font-black text-white leading-none font-mono tracking-tighter glow-text">
                {value.format('YYYY')}
              </span>
              {type === 'month' && (
                <span className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em] mt-1.5 opacity-80">
                  {value.format('MMMM')}
                </span>
              )}
            </div>

            {!(isFutureYearCheck(value.clone()) || (type === 'year' && value.year() === today.year()) || (type === 'month' && isFutureMonth(value.clone()))) && (
              <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-xl border border-white/10 shadow-inner">
                <Button
                  size="small"
                  type="text"
                  icon={<RightOutlined />}
                  onClick={() => {
                    const next = value.clone().add(1, 'month');
                    onChange(next.isAfter(today) ? today : next);
                  }}
                  className={`text-slate-400 hover:text-cyan-400 hover:bg-white/10 ${type === 'year' || isFutureMonth(value.clone()) ? 'hidden' : ''}`}
                />
                <Button
                  size="small"
                  type="text"
                  icon={<DoubleRightOutlined />}
                  onClick={() => {
                    const next = value.clone().add(1, 'year');
                    onChange(next.isAfter(today) ? today : next);
                  }}
                  className={`text-slate-400 hover:text-cyan-400 hover:bg-white/10 ${isFutureYearCheck(value.clone()) ? 'hidden' : ''}`}
                />
              </div>
            )}
          </Space>
        </div>

        <div className="flex items-center gap-4">
          <Button
            type="text"
            size="large"
            icon={<HistoryOutlined />}
            className="text-cyan-400/60 hover:text-cyan-400 font-black tracking-widest text-xs flex items-center gap-2 bg-white/5 px-6 rounded-xl border border-white/5 hover:border-cyan-500/30 transition-all hover:scale-105 active:scale-95"
            onClick={() => onChange(today)}
          >
            返回今天
          </Button>

          <Radio.Group
            value={type}
            onChange={e => onTypeChange(e.target.value)}
            className="custom-calendar-radio"
          >
            <Radio.Button value="month" className="rounded-l-xl">月视图</Radio.Button>
            <Radio.Button value="year" className="rounded-r-xl">年视图</Radio.Button>
          </Radio.Group>
        </div>
      </div>
    );
  };

  return (
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
              value={calendarValue}
              onChange={onCalendarValueChange}
              mode={calendarMode}
              onPanelChange={(value, mode) => {
                onCalendarModeChange(mode);
                onCalendarValueChange(value);
              }}
              cellRender={cellRender}
              headerRender={calendarHeaderRender}
              className="bg-transparent"
              fullscreen={true}
            />
          </ConfigProvider>
        </div>
      </div>
    </div>
  );
};

export default RecordsCalendarView;
