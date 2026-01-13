'use client';

import React from 'react';
import { Button, Select, Calendar, ConfigProvider, theme } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import weekday from 'dayjs/plugin/weekday';
import localeData from 'dayjs/plugin/localeData';
import { StreamData } from './RecordsShared';

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
  const handleDateSelect = (value: Dayjs) => {
    const dateStr = value.format('YYYY-MM-DD');
    const dayStreams = streams.filter(stream => stream.date === dateStr);

    if (dayStreams.length > 0) {
      onStreamSelect(dayStreams[0]);
    }
  };

  const cellRender = (value: Dayjs, info: any) => {
    const dateStr = value.format('YYYY-MM-DD');
    const dayStreams = streams.filter(stream => stream.date === dateStr);

    if (dayStreams.length === 0) {
      return info.originNode;
    }

    const isToday = value.isSame(dayjs(), 'day');

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleDateSelect(value);
      }
    };

    return (
      <div
        className="relative cursor-pointer hover:bg-white/5 transition-colors rounded"
        onClick={() => handleDateSelect(value)}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`查看${dateStr}的直播`}
      >
        {info.originNode}
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-0.5 p-1">
          {dayStreams.slice(0, 2).map((stream, index) => (
            <div
              key={stream.id}
              className={`w-full h-1.5 rounded-full ${index === 0 ? 'bg-cyan-500' : 'bg-pink-500'} ${isToday ? 'opacity-100' : 'opacity-80'}`}
              title={`${stream.title} (${stream.startTime})`}
            />
          ))}
          {dayStreams.length > 2 && (
            <div className="text-[8px] text-slate-400 font-bold">+{dayStreams.length - 2}</div>
          )}
        </div>
      </div>
    );
  };

  const calendarHeaderRender = ({ value, type, onChange, onTypeChange }: any) => {
    const start = 0;
    const end = 12;
    const monthOptions: React.ReactNode[] = [];
    const current = value.clone();
    const localeDataInstance = value.localeData();
    const months: string[] = [];
    for (let i = 0; i < 12; i++) {
      current.month(i);
      months.push(localeDataInstance.monthsShort(current));
    }

    for (let index = start; index < end; index++) {
      monthOptions.push(
        <Select.Option key={index} value={index} className="month-item">
          {months[index]}
        </Select.Option>,
      );
    }

    const month = value.month();
    const year = value.year();
    const options: React.ReactNode[] = [];
    for (let i = year - 10; i < year + 10; i += 1) {
      options.push(
        <Select.Option key={i} value={i} className="year-item">
          {i}
        </Select.Option>,
      );
    }

    return (
      <div className="flex items-center justify-between mb-6 p-4 bg-white/5 rounded-2xl border border-white/10">
        <div className="flex items-center gap-4">
          <Button
            type="text"
            icon={<LeftOutlined />}
            onClick={() => {
              const now = value.clone();
              now.month(month - 1);
              onChange(now);
            }}
            className="text-slate-300 hover:text-cyan-400"
          />
          <div className="flex items-center gap-2">
            <Select
              size="small"
              dropdownMatchSelectWidth={false}
              className="my-year-select bg-white/10 border-white/20 text-white"
              value={year}
              onChange={(newYear: number) => {
                const now = value.clone().year(newYear);
                onChange(now);
              }}
            >
              {options}
            </Select>
            <Select
              size="small"
              dropdownMatchSelectWidth={false}
              value={month}
              onChange={(selectedMonth: number) => {
                const newValue = value.clone();
                newValue.month(selectedMonth);
                onChange(newValue);
              }}
              className="my-month-select bg-white/10 border-white/20 text-white"
            >
              {monthOptions}
            </Select>
          </div>
          <Button
            type="text"
            icon={<RightOutlined />}
            onClick={() => {
              const now = value.clone();
              now.month(month + 1);
              onChange(now);
            }}
            className="text-slate-300 hover:text-cyan-400"
          />
        </div>
        <div className="flex gap-2">
          <Button
            type={type === 'month' ? 'primary' : 'default'}
            size="small"
            onClick={() => onTypeChange('month')}
            className={type === 'month' ? 'bg-cyan-600' : 'bg-white/10 text-slate-300'}
          >
            月视图
          </Button>
          <Button
            type={type === 'year' ? 'primary' : 'default'}
            size="small"
            onClick={() => onTypeChange('year')}
            className={type === 'year' ? 'bg-pink-600' : 'bg-white/10 text-slate-300'}
          >
            年视图
          </Button>
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
            />
          </ConfigProvider>
        </div>
      </div>
    </div>
  );
};

export default RecordsCalendarView;
