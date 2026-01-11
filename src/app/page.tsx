'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { ConfigProvider, theme, Typography, Space } from 'antd';
import {
  ExperimentOutlined,
  HistoryOutlined,
  PictureOutlined,
  HomeOutlined,
  ThunderboltOutlined,
  AudioOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

import HomeModule from '@/components/Home/HomeModule';
import GalleryModule from '@/components/Home/GalleryModule';
import RecordsModule from '@/components/Home/RecordsModule';

const { Text, Paragraph } = Typography;

const useScrollDirection = () => {
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    let lastScrollY = window.pageYOffset;
    let ticking = false;

    const updateScrollDirection = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.pageYOffset;
          const direction = scrollY > lastScrollY ? 'down' : 'up';

          // 只有当滚动距离足够大时才更新方向，并且避免页面加载时的误判
          if (direction !== scrollDirection && Math.abs(scrollY - lastScrollY) > 15) {
            // 如果是页面刚加载且滚动位置很小，不隐藏导航栏
            if (scrollY < 50 && direction === 'down') {
              setScrollDirection(null);
            } else {
              setScrollDirection(direction);
            }
          }

          lastScrollY = scrollY > 0 ? scrollY : 0;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', updateScrollDirection, { passive: true });
    return () => window.removeEventListener('scroll', updateScrollDirection);
  }, [scrollDirection]); // 移除 scrollDirection 依赖，避免不必要的重新绑定

  return scrollDirection;
};

const HomeContent = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [activeTab, setActiveTab] = useState('home');
  const scrollDirection = useScrollDirection();
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['home', 'gallery', 'records'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsScrolled(currentScrollY > 50);
      setScrollY(currentScrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
      <main className="min-h-screen bg-[#0A0D14] text-slate-200 overflow-x-hidden selection:bg-[#DA5D77]/50">
        {/* Smart Top Nav */}
        <nav className={`fixed top-0 inset-x-0 z-[100] p-4 flex justify-center transition-all duration-500 ${
          scrollDirection === 'down' && scrollY > 100 ? '-translate-y-[120%]' : 'translate-y-0'
        } ${isScrolled ? 'pt-2' : 'pt-6'}`}>
           <div className={`transition-all duration-500 bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-full flex items-center shadow-[0_20px_50px_rgba(0,0,0,0.6)] ${
             isScrolled ? 'px-2 py-1' : 'px-4 py-2'
           }`}>
                {[
                { key: 'home', label: '主页', icon: <HomeOutlined /> },
                { key: 'gallery', label: '素材图', icon: <PictureOutlined /> },
                { key: 'records', label: '直播记录', icon: <HistoryOutlined /> },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => handleTabChange(item.key)}
                  className={`relative px-6 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${
                    activeTab === item.key
                    ? 'text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {activeTab === item.key && (
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/80 to-blue-600/80 rounded-full -z-10 shadow-lg animate-fade-in" />
                  )}
                  {item.icon} {item.label}
                </button>
              ))}
              <div className="w-[1px] h-6 bg-white/10 mx-2" />
              <Link href="/demos" className="px-4 py-2 hover:text-cyan-400 transition-colors text-slate-400 flex items-center gap-2 text-sm font-bold group">
                 <ExperimentOutlined className="group-hover:rotate-45 transition-transform" /> 实验室
              </Link>
              <div className="w-[1px] h-4 bg-white/10 mx-1" />
              <a
                href="https://button.suiji.site"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 hover:text-pink-400 transition-colors text-slate-400 flex items-center gap-2 text-sm font-bold group"
              >
                 <AudioOutlined className="group-hover:scale-110 transition-transform" /> 岁己按钮
              </a>
           </div>
        </nav>

        {/* Hero Background Elements */}
        <div className="fixed inset-0 pointer-events-none">
           <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] bg-cyan-600/5 blur-[120px] rounded-full animate-pulse" />
           <div className="absolute bottom-1/4 right-1/4 w-[40vw] h-[40vw] bg-pink-600/5 blur-[120px] rounded-full" />
           {/* Floating Feathers / Bits */}
           <div className="absolute top-40 right-[15%] text-2xl opacity-10 animate-bounce">🪶</div>
           <div className="absolute bottom-40 left-[10%] text-xl opacity-5 animate-bounce delay-700">🐦</div>
           <div className="absolute top-1/2 left-[5%] text-xl opacity-10 animate-pulse">✨</div>
        </div>

        <div className="max-w-5xl mx-auto px-6 pt-24 pb-24 relative z-10 min-h-screen">

          {/* Module Content */}
          <div className="mt-4">
            {activeTab === 'home' && <HomeModule />}
            {activeTab === 'gallery' && <GalleryModule />}
            {activeTab === 'records' && <RecordsModule />}
          </div>

          <footer className="mt-16 pt-12 border-t border-white/5 text-center opacity-40 hover:opacity-100 transition-opacity">
            <Space className="mb-4">
               <ThunderboltOutlined className="text-yellow-500" />
               <Text className="text-slate-500">POWERED BY SUI FAN CLUB | 2026</Text>
            </Space>
            <Paragraph className="text-slate-600 text-xs italic">
               “就算是一两克重量的小鸟，也有着支配天空的梦想。”
            </Paragraph>
          </footer>
        </div>

        <style jsx global>{`
          .animate-fade-in-up {
            animation: fadeInUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
          }
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .custom-pagination .ant-pagination-item-active {
            border-color: #87EAFF;
            background: rgba(135, 234, 255, 0.1);
          }
          .custom-pagination .ant-pagination-item-active a {
            color: #87EAFF;
          }
          /* Override Antd Calendar */
          .ant-picker-calendar {
            background: transparent !important;
          }
          .ant-picker-cell-inner {
            border-radius: 12px !important;
            border: 1px solid rgba(255,255,255,0.08) !important;
            transition: all 0.3s !important;
          }
          .ant-picker-cell-inner:hover {
            background: rgba(255,255,255,0.05) !important;
            border-color: rgba(255,255,255,0.2) !important;
          }

          .ant-picker-calendar-date-content {
            height: 110px !important;
            min-height: 110px !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            scrollbar-width: thin;
            scrollbar-color: rgba(135, 234, 255, 0.3) transparent;
          }
          /* Webkit browsers (Chrome, Safari, Edge) */
          .ant-picker-calendar-date-content::-webkit-scrollbar {
             width: 6px;
          }
          .ant-picker-calendar-date-content::-webkit-scrollbar-track {
             background: rgba(0, 0, 0, 0.2);
             border-radius: 10px;
          }
          .ant-picker-calendar-date-content::-webkit-scrollbar-thumb {
             background: rgba(135, 234, 255, 0.3);
             border-radius: 10px;
             transition: background 0.2s;
          }
          .ant-picker-calendar-date-content::-webkit-scrollbar-thumb:hover {
             background: rgba(135, 234, 255, 0.5);
          }
          /* Additional Calendar Dark Overrides */
          .ant-picker-calendar-header {
            padding-inline: 0 !important;
            margin-bottom: 20px !important;
          }
          .glow-text {
            text-shadow: 0 0 20px rgba(135, 234, 255, 0.4);
          }
          .stream-detail-modal .ant-modal-close {
            top: 24px !important;
            right: 24px !important;
            color: #fff !important;
            background: rgba(0,0,0,0.5) !important;
            backdrop-filter: blur(10px) !important;
            width: 40px !important;
            height: 40px !important;
            border-radius: 50% !important;
            display: flex !important;
           align-items: center !important;
            justify-content: center !important;
           z-index: 100 !important;
          }
          .stream-detail-modal .ant-modal-close:hover {
             background: rgba(255,255,255,0.1) !important;
          }
          /* Disable AntD's default today highlighting */
          .ant-picker-calendar .ant-picker-cell-today .ant-picker-calendar-date {
             border-top-color: transparent !important;
             background: transparent !important;
          }
          .ant-picker-calendar .ant-picker-cell-today .ant-picker-calendar-date-value {
             color: rgba(255,255,255,0.9) !important;
             font-weight: normal !important;
          }
          /* Disable selected cell highlighting */
          .ant-picker-calendar .ant-picker-cell-selected .ant-picker-calendar-date {
             border-top-color: transparent !important;
             background: transparent !important;
          }
          .ant-picker-calendar .ant-picker-cell-selected .ant-picker-calendar-date-value {
             color: rgba(255,255,255,0.9) !important;
             font-weight: normal !important;
          }
          /* Enable today highlighting ONLY for cells that are both today AND in current view */
          .ant-picker-calendar .ant-picker-cell-in-view.ant-picker-cell-today .ant-picker-calendar-date {
             border-top: 2px solid rgba(135, 234, 255, 0.5) !important;
             background: rgba(135, 234, 255, 0.05) !important;
          }
          .ant-picker-calendar .ant-picker-cell-in-view.ant-picker-cell-today .ant-picker-calendar-date-value {
             color: #87eaff !important;
             font-weight: 900 !important;
          }
          .ant-picker-calendar .ant-picker-panel {
            background: transparent !important;
            border: none !important;
          }
          .ant-select-selector {
            background: rgba(255, 255, 255, 0.05) !important;
            border-color: rgba(255, 255, 255, 0.1) !important;
            color: white !important;
          }
          .ant-radio-button-wrapper {
            background: rgba(255, 255, 255, 0.05) !important;
            border-color: rgba(255, 255, 255, 0.1) !important;
            color: #94a3b8 !important;
          }
          .ant-radio-button-wrapper-checked {
            background: #fff !important;
            color: #0A0D14 !important;
          }
          .custom-calendar-radio .ant-radio-button-wrapper {
            border: none !important;
            background: rgba(255, 255, 255, 0.05) !important;
            color: #94a3b8 !important;
            padding-inline: 20px !important;
            height: 40px !important;
            line-height: 40px !important;
            font-weight: bold !important;
          }
          .custom-calendar-radio .ant-radio-button-wrapper-checked {
            background: #87EAFF !important;
            color: #0A0D14 !important;
            box-shadow: 0 0 20px rgba(135, 234, 255, 0.3) !important;
          }
          .custom-calendar-radio .ant-radio-button-wrapper::before {
             display: none !important;
          }
          .ant-badge-status-dot {
             top: 6px !important;
          }
          /* Custom Gallery Tabs */
          .custom-gallery-tabs .ant-tabs-nav::before {
            border-bottom: 2px solid rgba(255,255,255,0.05);
          }
          .custom-gallery-tabs .ant-tabs-ink-bar {
            background: linear-gradient(to right, #87EAFF, #DA5D77) !important;
            height: 4px !important;
            border-radius: 2px;
            bottom: 0 !important;
          }
          .custom-gallery-tabs .ant-tabs-tab {
            margin-right: 24px !important;
            padding: 8px 0 20px 0 !important;
            transition: all 0.3s ease;
          }
          .custom-gallery-tabs .ant-tabs-tab-btn {
            color: #94a3b8 !important;
          }
          .custom-gallery-tabs .ant-tabs-tab-active .ant-tabs-tab-btn {
            color: #fff !important;
            text-shadow: 0 0 15px rgba(135, 234, 255, 0.4);
          }
          .custom-gallery-tabs .ant-tabs-tab-active img {
            border-color: #DA5D77 !important;
            transform: scale(1.1);
            box-shadow: 0 0 20px rgba(218, 93, 119, 0.4);
          }
        `}</style>
      </main>
    </ConfigProvider>
  );
};

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0D14] flex items-center justify-center text-cyan-400 font-bold">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
