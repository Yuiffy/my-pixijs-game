'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Typography, Button, Spin, Layout, Empty } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, NumberOutlined } from '@ant-design/icons';

const { Title } = Typography;
const { Content, Header } = Layout;

const SRTViewerContent = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const url = searchParams.get('url');
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }

    const fetchSRT = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('无法加载字幕文件');
        const text = await response.text();
        setContent(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    };

    fetchSRT();
  }, [url]);

  if (!url) return <Empty description="未提供字幕地址" className="mt-20" />;

  return (
    <Layout className="min-h-screen bg-[#0A0D14]">
      <Header className="bg-[#0F172A]/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-50 flex items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-4">
          <Button
            icon={<ArrowLeftOutlined />}
            type="text"
            onClick={() => router.back()}
            className="text-slate-400 hover:text-white"
          />
          <Title level={4} className="!text-white !mb-0 flex items-center gap-2">
            <span className="text-cyan-400"><NumberOutlined /></span>
            语音转文字 (SRT 预览)
          </Title>
        </div>
        <Button
          icon={<DownloadOutlined />}
          href={url}
          download
          type="primary"
          className="bg-cyan-500 border-none hover:bg-cyan-400 rounded-full"
        >
          直接下载
        </Button>
      </Header>
      <Content className="p-4 md:p-8 max-w-4xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center items-center h-[60vh]">
            <Spin size="large" tip="正在解析语音识别内容..." />
          </div>
        ) : error ? (
          <Empty description={error} />
        ) : (
          <div className="bg-white/5 p-6 md:p-10 rounded-[32px] border border-white/10 shadow-2xl">
            <pre className="text-slate-200 text-sm md:text-base whitespace-pre-wrap font-sans leading-relaxed selection:bg-cyan-500/30">
              {content}
            </pre>
          </div>
        )}
      </Content>
    </Layout>
  );
};

export default function SRTViewerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0D14] flex items-center justify-center text-cyan-400">Loading...</div>}>
      <SRTViewerContent />
    </Suspense>
  );
}
