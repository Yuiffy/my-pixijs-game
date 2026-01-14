'use client';

import React from 'react';
import Link from 'next/link';
import { getAllLiverConfigs } from '@/data/livers';
import { ConfigProvider, Typography, Card } from 'antd';
import { theme } from 'antd';

const { Title, Text } = Typography;

export default function LiverIndexPage() {
  const livers = getAllLiverConfigs();

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#87EAFF',
          borderRadius: 20,
          fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
        },
      }}
    >
      <main className="min-h-screen bg-[#0A0D14] text-slate-200 overflow-x-hidden">
        {/* Hero Background Elements */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] bg-cyan-600/5 blur-[120px] rounded-full animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-[40vw] h-[40vw] bg-pink-600/5 blur-[120px] rounded-full" />
        </div>

        <div className="max-w-6xl mx-auto px-6 pt-24 pb-24 relative z-10">
          <div className="text-center mb-12">
            <Title level={1} className="!text-white !mb-4 text-4xl md:text-5xl">
              主播列表
            </Title>
            <Text className="text-slate-400 text-lg">
              选择一个主播查看直播记录
            </Text>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {livers.map((liver) => (
              <Link key={liver.id} href={`/liver/${liver.id}`}>
                <Card
                  hoverable
                  className="!bg-slate-900/50 !border-white/10 !border-2 transition-all hover:!border-cyan-400/50 hover:scale-105"
                  style={{
                    background: `linear-gradient(135deg, ${liver.colorMain}10, ${liver.colorSub}10)`,
                  }}
                  bodyStyle={{ padding: '24px' }}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-white text-2xl font-bold mb-2">{liver.name}</h3>
                        <p className="text-slate-400 text-sm mb-3">{liver.group}</p>
                      </div>
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ background: liver.colorMain }}
                      >
                        {liver.shortName[0]}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {liver.tags.slice(0, 3).map((tag, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 rounded-full text-xs font-medium text-white"
                          style={{ background: `${liver.colorMain}40`, border: `1px solid ${liver.colorMain}60` }}
                        >
                          {tag}
                        </span>
                      ))}
                      {liver.tags.length > 3 && (
                        <span className="px-3 py-1 rounded-full text-xs font-medium text-slate-400">
                          +{liver.tags.length - 3}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <span className="px-2 py-1 rounded bg-white/5 font-mono text-xs">
                        /liver/{liver.id}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          <footer className="mt-16 pt-12 border-t border-white/5 text-center opacity-40 hover:opacity-100 transition-opacity">
            <Text className="text-slate-500 text-xs italic">
              "每一个主播都有属于自己的故事"
            </Text>
          </footer>
        </div>
      </main>
    </ConfigProvider>
  );
}
