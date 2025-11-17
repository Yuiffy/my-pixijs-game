import Image from 'next/image';
import { Button, Card, Space } from 'antd';
import Script from 'next/script';
import Head from 'next/head';

interface BigButtonItem {
  title: string
  href: string
  description: string
  target?: string
}

export default function Home() {
  // Next.js 静态导出行为：
  // - 开发环境：public/html/sui_weekly_schedule.html 需要完整路径（带 .html）
  // - 生产环境：静态导出后变成 out/html/sui_weekly_schedule（不带 .html 后缀）
  // 因此需要根据环境动态设置链接
  const weeklyScheduleHref = process.env.NODE_ENV === 'development'
    ? '/html/sui_weekly_schedule.html'
    : '/html/sui_weekly_schedule';

  const bigButtonData: BigButtonItem[] = [
    { title: '岁己按钮 SUI Button', href: 'https://button.suiji.site', description: '岁己声音按钮' },
    {
      title: '小鸟基础动画', href: '/anime/bird-base', description: '研究pixijs用', target: '',
    },
    {
      title: '小鸟刚体动画', href: '/anime/bird-matter-js-demo', description: '研究matter js用', target: '',
    },
    {
      title: '周表模版', href: weeklyScheduleHref, description: '我来替主播写周表！', target: '',
    },
    // {title: '熊蛙棋 Bear Frog Chess', href: 'http://www.yuiffy.com/bear-frog-chess/', description: '又被称为枪棋/炮棋，在4x4的棋盘上12颗棋子的简单的双人对战棋类游戏'},
    // {title: '冻鳗榜单王', href: 'http://rank.yuiffy.com', description: '能够对动画/游戏/食物等进行打分和发布排行榜的榜单网站'},
    // {title: '贪吃蛇 Greedy Hebi', href: 'hebi/hebi.html', description: '简单畅快的贪吃蛇游戏'},
  ];

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      {/* <Head> */}
      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7443445828476112"
        crossOrigin="anonymous"
      />
      {/* </Head> */}
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex" />

      <div className="relative flex place-items-center before:absolute before:h-[300px] before:w-[480px] before:-translate-x-1/2 before:rounded-full before:bg-gradient-radial before:from-white before:to-transparent before:blur-2xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-[240px] after:translate-x-1/3 after:bg-gradient-conic after:from-sky-200 after:via-blue-200 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700 before:dark:opacity-10 after:dark:from-sky-900 after:dark:via-[#0141ff] after:dark:opacity-40 before:lg:h-[360px] z-[-1]">
        <p className="text-4xl font-bold">岁己SUI应援站</p>
      </div>

      <div className="mb-32 grid text-center lg:mb-0 lg:grid-cols-4 lg:text-left">
        {bigButtonData.map(({
          title, href, description, target = '_blank',
        }) => (
          <a
            key={title}
            href={href}
            className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
            target={target}
            rel="noopener noreferrer"
          >
            <h2 className="mb-3 text-2xl font-semibold">{title}</h2>
            <p className="m-0 max-w-[30ch] text-sm opacity-50">{description}</p>
          </a>
        ))}
      </div>
      <div className="row">
        <div className="text-center">
          <Space direction="vertical" size={1} style={{ display: 'flex' }}>
            <Button type="link" href="https://www.daifish.top">带鱼主页</Button>
          </Space>

        </div>
      </div>
    </main>
  );
}
