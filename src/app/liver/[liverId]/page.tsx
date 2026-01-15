'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { ConfigProvider, theme, Typography, Spin } from 'antd';
import { notFound } from 'next/navigation';
import { getLiverConfig, LiverInfo } from '@/data/livers';
import RecordsModule from '@/components/Home/RecordsModule';
import { StreamData } from '@/components/Home/RecordsShared';
import Link from 'next/link';
import { ArrowLeftOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

const { Title, Text } = Typography;

function LiverPageContent({ liverId }: { liverId: string }) {
  const [liverConfig, setLiverConfig] = useState<LiverInfo | null>(null);
  const [streams, setStreams] = useState<StreamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 获取主播配置
    const config = getLiverConfig(liverId);
    if (!config) {
      setError('主播未找到');
      setLoading(false);
      return;
    }

    setLiverConfig(config);

    // 加载直播数据
    const dataPath = config.dataPath;
    fetch(`${dataPath}streams.json`)
      .then(res => {
        if (!res.ok) {
          // 如果状态码是404，表示数据文件不存在（新主播没有数据）
          // 这不应该视为错误，而是空数据
          if (res.status === 404) {
            console.log('Streams file not found, using empty array');
            return [];
          }
          throw new Error('Failed to load streams data: ' + res.status);
        }
        return res.json();
      })
      .then(data => {
        setStreams(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load streams:', err);
        // 对于新主播，如果没有数据文件，也视为空数据而不是错误
        if (err.message.includes('Failed to fetch') || err.message.includes('404')) {
          console.log('Treating missing data as empty array');
          setStreams([]);
          setLoading(false);
        } else {
          setError('加载直播数据失败');
          setLoading(false);
        }
      });
  }, [liverId]);

  if (error) {
    console.error('Rendering error state:', error);
    return (
      <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center">
        <div className="text-center">
          <Title level={2} className="!text-white !mb-4">
            {error}
          </Title>
          <Link href="/liver" className="text-cyan-400 hover:text-cyan-300">
            返回主播列表
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !liverConfig) {
    return (
      <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: liverConfig.colorMain,
          borderRadius: 20,
          fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
        },
      }}
    >
      <main className="min-h-screen bg-[#0A0D14] text-slate-200 overflow-x-hidden">
        {/* Hero Background Elements */}
        <div className="fixed inset-0 pointer-events-none">
          <div
            className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] blur-[120px] rounded-full animate-pulse"
            style={{ background: `${liverConfig.colorMain}10` }}
          />
          <div
            className="absolute bottom-1/4 right-1/4 w-[40vw] h-[40vw] blur-[120px] rounded-full"
            style={{ background: `${liverConfig.colorSub}10` }}
          />
        </div>

        {/* Navigation */}
        <nav className="fixed top-0 inset-x-0 z-[100] p-4 flex justify-center">
          <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-full flex items-center px-4 py-2">
            <Link
              href="/liver"
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors px-3 py-1"
            >
              <ArrowLeftOutlined />
              <span>返回列表</span>
            </Link>
          </div>
        </nav>

        <div className="max-w-5xl mx-auto px-6 pt-24 pb-24 relative z-10">
          {/* Header */}
          <div className="text-center mb-12">
            <div
              className="inline-block w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold mb-4"
              style={{ background: liverConfig.colorMain }}
            >
              {liverConfig.shortName[0]}
            </div>
            <Title level={1} className="!text-white !mb-2 text-4xl">
              {liverConfig.name}
            </Title>
            <Text className="text-slate-400 text-lg block mb-4">
              {liverConfig.group}
            </Text>
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {liverConfig.tags.map((tag: string, index: number) => (
                <span
                  key={index}
                  className="px-3 py-1 rounded-full text-sm font-medium text-white"
                  style={{
                    background: `${liverConfig.colorMain}40`,
                    border: `1px solid ${liverConfig.colorMain}60`
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
            {liverConfig.description && (
              <Text className="text-slate-300 max-w-2xl mx-auto block">
                {liverConfig.description}
              </Text>
            )}
          </div>

          {/* Records Module */}
          <RecordsModule
            streams={streams}
            liverId={liverId}
          />

          <footer className="mt-16 pt-12 border-t border-white/5 text-center opacity-40 hover:opacity-100 transition-opacity">
            <Text className="text-slate-500 text-xs italic">
              "{liverConfig.shortName}的直播记录"
            </Text>
          </footer>
        </div>
      </main>
    </ConfigProvider>
  );
}

export default function LiverPage({ params }: { params: { liverId: string } }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0D14] flex items-center justify-center"><Spin size="large" /></div>}>
      <LiverPageContent liverId={params.liverId} />
    </Suspense>
  );
}
