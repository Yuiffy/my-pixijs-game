'use client';

import React, { useState, useEffect, useRef } from 'react';

// --- 1. 数据结构定义 ---

type Stats = {
  strength: number; // 武功：决定战斗胜负
  luck: number; // 福源：决定奇遇概率
  iq: number; // 悟性：决定习武速度
  karma: number; // 善恶：决定结局走向 (-100恶 ~ 100善)
  health: number; // 气血：归零则死亡
};

type Origin = {
  id: string;
  name: string;
  desc: string;
  stats: Stats;
};

type LogEntry = {
  year: number;
  text: string;
};

// --- 2. 游戏内容数据 (文案库) ---

const ORIGINS: Origin[] = [
  {
    id: 'noble',
    name: '名门之后',
    desc: '出生于武林世家，家传绝学渊源流长。',
    stats: {
      strength: 20, luck: 5, iq: 15, karma: 10, health: 100,
    },
  },
  {
    id: 'beggar',
    name: '市井小混混',
    desc: '从小摸爬滚打，机灵过人，但身无长物。',
    stats: {
      strength: 5, luck: 15, iq: 20, karma: -5, health: 80,
    },
  },
  {
    id: 'farmer',
    name: '山村野夫',
    desc: '天生神力，性格淳朴，从未见过外面的世界。',
    stats: {
      strength: 30, luck: 10, iq: 5, karma: 20, health: 120,
    },
  },
];

const EVENTS = [
  {
    text: '路遇恶霸欺凌弱小。',
    check: (s: Stats) => s.strength > 15,
    success: '你拔刀相助，三两下便打跑了恶霸，路人纷纷叫好。',
    fail: '你本想出手，奈何武艺不精，反而被恶霸打了一顿。',
    effectWin: { karma: 10, strength: 2 },
    effectLose: { health: -10, karma: 5 },
  },
  {
    text: '在一个隐秘的山洞中发现了一本积灰的秘籍。',
    check: (s: Stats) => s.iq > 10,
    success: '你仔细研读，竟然领悟了其中的奥妙，武功大进！',
    fail: '字你都认识，连在一起却看不懂，只能拿来垫桌角。',
    effectWin: { strength: 10 },
    effectLose: { luck: -2 },
  },
  {
    text: '偶遇一位落魄的老乞丐向你讨酒喝。',
    check: (s: Stats) => s.luck > 10,
    success: '老乞丐喝完酒大笑三声，传了你一套名为‘睡梦罗汉拳’的绝学。',
    fail: '老乞丐喝完酒打了个嗝，转身就走了，什么也没发生。',
    effectWin: { strength: 15, karma: 5 },
    effectLose: { money: -1 }, // 暂无金钱系统，仅作示意
  },
  {
    text: '遭遇魔教妖人偷袭！',
    check: (s: Stats) => s.strength > 30,
    success: '你与其大战三百回合，终于将其斩于马下，名震江湖。',
    fail: '你身受重伤，侥幸逃脱，不得不修养了一整年。',
    effectWin: { karma: 20, strength: 5 },
    effectLose: { health: -30, strength: -2 },
  },
  {
    text: '闭关修炼。',
    check: (s: Stats) => true, // 总是成功
    success: '这一年你心无旁骛，感觉内力精纯了不少。',
    fail: '',
    effectWin: { strength: 5, health: 5 },
    effectLose: {},
  },
];

// --- 3. 组件实现 ---

export default function WuxiaGame() {
  const [gameState, setGameState] = useState<'SELECT' | 'PLAYING' | 'ENDED'>('SELECT');
  const [stats, setStats] = useState<Stats>(ORIGINS[0].stats);
  const [age, setAge] = useState(16);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [story, setStory] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // 开始游戏
  const startGame = (origin: Origin) => {
    setStats({ ...origin.stats });
    setAge(16);
    setLogs([{ year: 16, text: `你出生于${origin.name}，${origin.desc} 自此，你的江湖路由此开始。` }]);
    setStory(`${origin.name}：${origin.desc}\n\n16岁：初入江湖。`);
    setGameState('PLAYING');
  };

  // 下一年 (核心循环)
  const nextYear = () => {
    if (gameState !== 'PLAYING') return;

    const newAge = age + 1;
    const newStats = { ...stats };
    let logText = '';

    // 1. 随机选择事件
    const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    const isSuccess = event.check(newStats);

    // 2. 结算结果
    logText = `${event.text} ${isSuccess ? event.success : event.fail}`;

    const effect = isSuccess ? event.effectWin : event.effectLose;

    // 应用属性变化
    if (effect.strength) newStats.strength += effect.strength;
    if (effect.luck) newStats.luck += effect.luck;
    if (effect.iq) newStats.iq += effect.iq;
    if (effect.karma) newStats.karma += effect.karma;
    if (effect.health) newStats.health += effect.health;

    // 3. 检查死亡/通关
    let isDead = false;
    if (newStats.health <= 0) {
      isDead = true;
      logText += ' 你伤势过重，不治身亡。一代大侠就此陨落。';
    } else if (newAge >= 60) {
      isDead = true;
      logText += ' 你年事已高，决定金盆洗手，退隐江湖。你的传说在武林中流传。';
    }

    // 4. 更新状态
    setStats(newStats);
    setAge(newAge);
    const newLog = { year: newAge, text: logText };
    setLogs((prev) => [...prev, newLog]);
    setStory((prev) => `${prev}\n\n${newAge}岁：${logText}`);

    if (isDead) {
      setGameState('ENDED');
    }
  };

  // 导出小说
  const exportNovel = () => {
    navigator.clipboard.writeText(story).then(() => {
      alert('小说内容已复制到剪贴板！快去粘贴分享吧！');
    });
  };

  // --- 渲染界面 ---

  if (gameState === 'SELECT') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-stone-900 text-stone-200 font-serif p-4">
        <h1 className="text-4xl mb-8 text-amber-500 font-bold tracking-widest">武侠小说生成器</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
          {ORIGINS.map((origin) => (
            <button
              key={origin.id}
              type="button"
              onClick={() => startGame(origin)}
              className="bg-stone-800 border-2 border-stone-600 p-6 hover:border-amber-500 hover:bg-stone-700 transition rounded-lg text-left"
            >
              <h3 className="text-xl font-bold mb-2 text-amber-400">{origin.name}</h3>
              <p className="text-sm text-stone-400 mb-4">{origin.desc}</p>
              <div className="text-xs space-y-1 text-stone-500">
                <div>
                  武功:
                  {origin.stats.strength}
                </div>
                <div>
                  悟性:
                  {origin.stats.iq}
                </div>
                <div>
                  福源:
                  {origin.stats.luck}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-stone-900 text-stone-300 font-serif">
      {/* 左侧：属性面板 */}
      <div className="w-full md:w-64 bg-stone-800 p-6 border-r border-stone-700 flex flex-col gap-4">
        <h2 className="text-2xl text-amber-500 font-bold border-b border-stone-600 pb-2">侠客属性</h2>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span>年龄</span>
            {' '}
            <span className="font-bold">{age}</span>
          </div>
          <div className="flex justify-between">
            <span>气血</span>
            {' '}
            <span className={stats.health < 30 ? 'text-red-500' : 'text-green-500'}>{stats.health}</span>
          </div>
          <div className="h-px bg-stone-700 my-2" />
          <div className="flex justify-between">
            <span>武功</span>
            {' '}
            <span>{stats.strength}</span>
          </div>
          <div className="flex justify-between">
            <span>悟性</span>
            {' '}
            <span>{stats.iq}</span>
          </div>
          <div className="flex justify-between">
            <span>福源</span>
            {' '}
            <span>{stats.luck}</span>
          </div>
          <div className="flex justify-between">
            <span>善恶</span>
            {' '}
            <span className={stats.karma > 0 ? 'text-blue-400' : 'text-red-400'}>{stats.karma}</span>
          </div>
        </div>

        {gameState === 'PLAYING' && (
          <button
            type="button"
            onClick={nextYear}
            className="mt-auto w-full py-4 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded text-lg shadow-lg active:scale-95 transition"
          >
            游历江湖 (下一年)
          </button>
        )}
        {gameState === 'ENDED' && (
          <button
            type="button"
            onClick={() => setGameState('SELECT')}
            className="mt-auto w-full py-4 bg-stone-600 hover:bg-stone-500 text-white font-bold rounded text-lg"
          >
            再入江湖 (重开)
          </button>
        )}
      </div>

      {/* 右侧：小说文本区域 */}
      <div className="flex-1 p-6 md:p-10 flex flex-col h-screen max-h-screen">
        <h1 className="text-3xl text-center mb-6 text-stone-500 tracking-[0.5em] border-b border-stone-800 pb-4">江湖风云录</h1>

        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-4 scrollbar-thin scrollbar-thumb-stone-600 scrollbar-track-stone-800">
          {logs.map((log, index) => (
            <div key={index} className="animate-fade-in">
              <span className="text-amber-600 font-bold mr-2">
                [
                {log.year}
                岁]
              </span>
              <span className="leading-relaxed text-lg text-stone-300">{log.text}</span>
            </div>
          ))}
          {gameState === 'ENDED' && (
            <div className="py-8 text-center text-amber-500 text-xl font-bold border-t border-stone-700 mt-8">
              —— 全书完 ——
            </div>
          )}
        </div>

        {gameState === 'ENDED' && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={exportNovel}
              className="px-8 py-3 border border-amber-600 text-amber-500 hover:bg-amber-900/30 rounded transition flex items-center gap-2"
            >
              📜 复制整本小说
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
