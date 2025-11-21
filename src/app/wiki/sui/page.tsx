'use client';

import React, { useState } from 'react';
import {
  Typography, Card, Tag,
  Divider, Timeline, Tabs, ConfigProvider,
  theme, Row, Col, Statistic, Image as AntImage,
} from 'antd';
import {
  ThunderboltOutlined, HistoryOutlined, ReadOutlined, CrownOutlined,
} from '@ant-design/icons';
import NextImage from 'next/image';

const { Text } = Typography;

type MediaItem = {
  src: string;
  caption: string;
  ratio?: string;
  fullWidth?: boolean;
  objectPosition?: string;
};

type Technique = {
  id: number;
  nameCN: string;
  nameJP: string;
  type: string;
  desc: string;
  scene: string;
  media?: MediaItem[];
};

// --- Data Definitions ---嗷

const basicInfo = [
  { label: '姓名', value: '岁己 (SUI / 歲己)' },
  { label: '阶级', value: '柱 (Hashira) / 鸟柱 (Bird Pillar)' },
  { label: '呼吸流派', value: '鸟之呼吸 (Tori no Kokyū)' },
  { label: '日轮刀', value: '幽紫色，刀身刻有羽毛纹路' },
  { label: '标志特征', value: '极速、立体空战、冷静、反差感' },
];

const stylesInfo = {
  origin: '鸟之呼吸是岁己在风柱门下接受培育时，结合自身对猛禽习性的观察和对“天空支配欲”所自创的个人流派。它从风之呼吸中衍生，但彻底放弃了传统的地面步伐，专注于空中战、超高速变向、高空俯冲和立体机动打击。',
  philosophy: '像猛禽一样，永远从敌人意想不到的高空角度发起攻击。放弃防御，追求极致的速度和滞空能力，以华丽且致命的方式，在夜空中终结鬼。',
  visual: '招式斩击会爆发幽紫色的光芒，伴随着大量发光的幻影羽毛飘落。高级招式中，刀气会化作巨大的紫色猛禽幻影。',
};

const techniques: Technique[] = [
  {
    id: 1,
    nameCN: '壹之型 · 羽击',
    nameJP: 'Habataki',
    type: '基础型',
    desc: '极致速度的一刀斩，附带紫色羽毛光效。',
    scene: '初次任务：深夜森林中，鬼从树后扑来，岁己头也不回，反手一刀，鬼在空中一分为二，切口处飘落发光羽毛。',
    media: [
      {
        src: '/images/wiki/skill1.jpg', caption: '回身斩瞬间的特写，刀锋与羽毛残影交织。', ratio: '9 / 16',
        //  fullWidth: true,
      },
      {
        src: '/images/wiki/skill1_big.jpg',
        caption: '夜空俯瞰的羽击全景，羽翼光效化作紫色风暴。',
        ratio: '9 / 16',
        objectPosition: 'center',
        // fullWidth: true,
      },
    ],
  },
  {
    id: 2,
    nameCN: '贰之型 · 燕返·空舞',
    nameJP: 'Tsubame Gaeshi - Kūbu',
    type: '反击技',
    desc: '在半空中利用极小支点进行不可思议的锐角转向，躲避攻击并借力反杀敌人身后。',
    scene: '狭窄巷道：被多臂鬼逼入绝境，双脚在墙面一蹬，在空中划出“V”字形，倒悬着斩首。',
    media: [
      {
        src: '/images/wiki/skill2.png', caption: '空中燕返的特写', ratio: '9 / 16',
      },
    ],
  },
  {
    id: 3,
    nameCN: '叁之型 · 疾隼',
    nameJP: 'Hayabusa',
    type: '直线突进',
    desc: '爆发性的直线加速，配合滑翔翼使用，像捕猎的游隼一样瞬间拉近距离。',
    scene: '屋顶追逐：逃跑的鬼被速度线模糊的岁己瞬间追上并超越，鬼的头颅在惯性作用下滚落。',
    media: [
      {
        src: '/images/wiki/skill3.png', caption: '疾隼的特写', ratio: '9 / 16',
      },
    ],
  },
  {
    id: 4,
    nameCN: '肆之型 · 群鸟乱舞·千羽从',
    nameJP: 'Gunchō Ranbu - Senba Jū',
    type: '范围攻击 (AOE)',
    desc: '在极短时间内的无死角连续斩击，形成紫色的羽毛风暴漩涡，绞碎复数敌人。',
    scene: '蝙蝠鬼群：被数十只飞行鬼包围，岁己中心爆发出紫光，所有蝙蝠鬼化为碎块落下。',
    media: [
      {
        src: '/images/wiki/skill4.png', caption: '群鸟乱舞的羽毛风暴', ratio: '9 / 16',
      },
    ],
  },
  {
    id: 5,
    nameCN: '伍之型 · 滑空·奈落之喙',
    nameJP: 'Kakkū - Naraku no Kuchibashi',
    type: '单点突破',
    desc: '跳至高空垂直俯冲，将重力势能叠加到刀尖。威力足以击穿高硬度防御。',
    scene: '对战硬壳下弦：岁己在圆月背景下倒转俯冲，刀尖凝聚紫芒，一击击穿了鬼的坚硬外壳。',
    media: [
      {
        src: '/images/wiki/skill5.png', caption: '岁己使用奈落之喙，威力足以击穿高硬度防御', ratio: '9 / 16',
      },
    ],
  },
  {
    id: 6,
    nameCN: '陆之型 · 鵺之影',
    nameJP: 'Nue no Kage',
    type: '幻惑与位移',
    desc: '利用高速移动制造出极其逼真的紫色残影，扰乱敌人感知。敌人击中的永远是即将消散的残影。',
    scene: '对抗感知鬼：鬼的攻击穿透了岁己身体，但“岁己”化为烟雾消散，真身无声息地出现在鬼的视觉死角。',
    media: [
      {
        src: '/images/wiki/skill6.png', caption: '岁己使用鵺之影，制造出逼真的幻影迷惑敌人', ratio: '9 / 16',
      },
    ],
  },
  {
    id: 99,
    nameCN: '终之型 · 天群·万羽葬送 (奥义)',
    nameJP: 'Tengun - Banba Sōsō',
    type: '最终绝杀',
    desc: '透支体力，在空中进行数百次超高速、不规则的立体机动斩击。刀光和羽毛填满天空，将敌人撕裂成无数碎块。',
    scene: '无限城：岁己开启斑纹，在童磨的冰莲花血鬼术中发动，整个屏幕被紫光占据，童磨的冰雕和本体被瞬间粉碎。',
    media: [
      {
        src: '/images/wiki/vstm.jpg',
        caption: '无限城上空的终之型，全身光翼展开，刀芒切裂冰莲。',
        ratio: '16 / 20',
        objectPosition: 'top center',
        // fullWidth: true,
      },
    ],
  },
];
const outfitMedia: MediaItem = {
  src: '/images/wiki/sui_clothes_stand.png',
  caption: '羽织装配示意 · 全身立绘',
  ratio: '9 / 16',
};

const conceptArtwork: MediaItem = {
  src: '/images/wiki/wiki_snapshot.jpg',
  caption: '早期概念稿',
  ratio: '3 / 4',
};

const heroPortrait: MediaItem = {
  src: '/images/wiki/sui_charactor_half_body.png',
  caption: '岁己头像特写',
  ratio: '1 / 1',
};

const journeyStages = [
  {
    key: 'past',
    title: '悲惨过去',
    description: '居住在深山的家人被一只拥有飞行能力的异形鬼袭击。年幼的岁己躲在高树的鸟巢中幸存。她立誓要成为支配天空的人，不再让任何鬼在头顶作祟。',
    color: 'gray',
  },
  {
    key: 'exam',
    title: '最终选拔',
    description: '她没有在地面躲藏，而是利用自制的简易滑翔翼在树冠层顶端移动，像鹰一样俯冲猎杀鬼，展现了独特的空战天赋。',
    color: 'purple',
  },
  {
    key: 'fame',
    title: '一战成名',
    description: '在成为甲级队员后，某个村庄遭遇棘手的“蝙蝠鬼群”袭击。普通队员无法应对空中的群鬼。岁己单枪匹马冲入夜空，利用滑翔装备缠斗一整夜，将所有鬼斩杀。黎明时，她站在屋顶，身后是被斩断的鬼之翼，宛如堕天使，因此获得了主公的关注。',
    color: '#a855f7',
    image: {
      src: '/images/wiki/killmanybird.jpg',
      caption: '蝙蝠鬼群夜战的决胜瞬间，紫光漩涡吞噬整片天空。',
      ratio: '10 / 16',
    },
  },
  {
    key: 'pillar',
    title: '晋升为柱',
    description: '凭借对空战的绝对统治力，她在两年内成功讨伐了一位下弦，并积累了惊人的斩杀数，被主公破格提拔为鸟柱。',
    color: '#d8b4fe',
    dot: <CrownOutlined style={{ fontSize: '20px' }} />,
    image: {
      src: '/images/wiki/to_be_zhu.jpg',
      caption: '在柱的会议中，岁己晋升为鸟柱。',
      ratio: '10 / 16',
    },
  },
  {
    key: 'infinite',
    title: '无限城战绩',
    description: '是少数能对上弦之贰·童磨造成有效干扰的柱。她的极致空战机动性让她能够勉强躲避冰雾，并成功利用特制羽织切断童磨释放血鬼术的冰莲，为队友争取时间。',
    color: 'red',
    image: {
      src: '/images/wiki/vstm.jpg',
      caption: '无限城屋檐之上与童磨对峙，羽织与冰莲交织成紫色光翼。',
      ratio: '9 / 16',
    },
  },
];

export default function SuiWikiPage() {
  const [activeMedia, setActiveMedia] = useState<MediaItem | null>(null);

  const openMedia = (media: MediaItem) => {
    setActiveMedia(media);
  };
  const closeMedia = () => setActiveMedia(null);

  const journeyTimelineItems = journeyStages.map((stage) => ({
    color: stage.color,
    dot: stage.dot,
    children: (
      <>
        <Text strong className="text-lg text-purple-300">{stage.title}</Text>
        <br />
        <Text className="text-gray-300">{stage.description}</Text>
        {stage.image && (
          <button
            type="button"
            onClick={() => openMedia(stage.image!)}
            className="mt-4 block w-full rounded-2xl overflow-hidden border border-purple-900/30 bg-slate-950/40 shadow-inner shadow-black/40 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            <div
              className="relative w-full bg-black/30"
              style={{
                aspectRatio: stage.image.ratio || undefined,
                minHeight: '14rem',
              }}
            >
              <NextImage
                src={stage.image.src}
                alt={stage.image.caption}
                fill
                sizes="(max-width: 768px) 100vw, 60vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <p className="text-xs text-slate-200/80 px-4 py-3 text-left">{stage.image.caption}</p>
          </button>
        )}
      </>
    ),
  }));

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#a855f7', // Purple-500
          colorLink: '#d8b4fe',
          fontFamily: "'Noto Sans SC', sans-serif",
        },
      }}
    >
      <div className="min-h-screen bg-slate-950 text-slate-200 pb-20">
        {/* Hero / Header Section */}
        <div className="relative h-[400px] w-full bg-gradient-to-b from-purple-900 to-slate-950 flex flex-col items-center justify-center overflow-hidden">
          {/* Background Particles/Feathers Effect (CSS simulated) */}
          <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]" />

          <div className="z-10 text-center p-4 animate-fade-in-up">
            <div className="mb-4 relative inline-block">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-36 h-36 rounded-full bg-purple-500/10 blur-2xl" />
              </div>
              <div className="relative w-32 h-32">
                <div className="absolute inset-0 rounded-full border border-purple-500/50 blur-sm" />
                <div className="absolute inset-1 rounded-full border border-purple-300/40 animate-slow-spin" />
                <div className="absolute -top-4 left-1 text-purple-200/70 text-2xl">🪶</div>
                <div className="absolute -bottom-3 right-0 text-purple-200/70 text-xl">✨</div>
                <button
                  type="button"
                  onClick={() => openMedia(heroPortrait)}
                  className="relative w-full h-full rounded-full overflow-hidden border-4 border-purple-500 shadow-[0_0_25px_rgba(168,85,247,0.65)] bg-slate-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                  aria-label="查看岁己头像"
                >
                  <NextImage
                    src={heroPortrait.src}
                    alt="Sui 头像"
                    fill
                    className="object-cover object-[center_25%]"
                    priority
                  />
                </button>
              </div>
              <Tag color="purple" className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 text-sm border-none shadow-lg">
                鳥柱
              </Tag>
            </div>
            <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-purple-100 to-indigo-300 mb-2 font-serif tracking-wider">
              岁己
            </h1>
            <p className="text-xl text-purple-200 tracking-[0.2em] uppercase opacity-80">Bird Pillar · SUI</p>
          </div>
        </div>

        {/* Main Content Container */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 relative z-20">

          <Tabs
            defaultActiveKey="1"
            type="card"
            size="large"
            className="custom-tabs"
            items={[
              {
                key: '1',
                label: (
                  <span className="px-4 flex items-center gap-2">
                    <ReadOutlined />
                    {' '}
                    档案资料
                  </span>
                ),
                children: (
                  <div className="space-y-8 animate-slide-in">
                    {/* Basic Info Card */}
                    <Card className="bg-slate-900/80 border-purple-900/30 shadow-xl backdrop-blur-sm">
                      <Divider orientation="left" className="border-purple-500"><span className="text-purple-300 text-lg">Ⅰ. 基本信息</span></Divider>
                      <Row gutter={[24, 24]}>
                        <Col xs={24} md={14}>
                          <div className="grid grid-cols-1 gap-4">
                            {basicInfo.map((item) => (
                              <div key={item.label} className="flex border-b border-purple-900/30 pb-2">
                                <span className="w-24 text-purple-400 font-bold opacity-80">{item.label}</span>
                                <span className="flex-1 text-slate-200">{item.value}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-6 p-4 bg-purple-900/20 rounded-lg border border-purple-500/20">
                            <h4 className="text-purple-300 font-bold mb-2">战斗服饰</h4>
                            <p className="text-sm text-slate-300 leading-relaxed">
                              将队服改造为紫黑色调的机能风/哥特服饰，佩戴有“光环”特殊发饰，背部是内嵌轻量金属骨架的特制羽织 (滑翔翼)。
                            </p>
                          </div>
                        </Col>
                        <Col xs={24} md={10} className="flex flex-col gap-4">
                          <button
                            type="button"
                            onClick={() => openMedia(outfitMedia)}
                            className="group relative w-full rounded-2xl overflow-hidden border border-purple-900/40 shadow-[0_10px_30px_rgba(0,0,0,0.5)] bg-gradient-to-b from-slate-900/80 to-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                            style={{ aspectRatio: outfitMedia.ratio }}
                          >
                            <NextImage
                              src={outfitMedia.src}
                              alt="岁己 · 羽织立绘"
                              fill
                              sizes="(max-width: 768px) 100vw, 40vw"
                              className="object-contain transition-transform duration-500 group-hover:scale-105"
                              priority
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/10 to-transparent px-4 py-3">
                              <span className="block text-purple-200 font-semibold tracking-wide">羽织装配示意</span>
                              <span className="text-xs text-slate-200/80">特制滑翔骨架 + 哥特羽缘</span>
                              <span className="text-[10px] text-purple-300/80">点击展开查看全图</span>
                            </div>
                          </button>
                          <Card size="small" title="战斗能力值 (估)" className="bg-slate-800 border-none">
                            <Row gutter={16}>
                              <Col span={12}><Statistic title="速度" value={100} suffix="/100" valueStyle={{ color: '#d8b4fe' }} /></Col>
                              <Col span={12}><Statistic title="机动" value={95} suffix="/100" valueStyle={{ color: '#d8b4fe' }} /></Col>
                              <Col span={12} className="mt-4"><Statistic title="力量" value={60} suffix="/100" valueStyle={{ color: '#a1a1aa' }} /></Col>
                              <Col span={12} className="mt-4"><Statistic title="防御" value={40} suffix="/100" valueStyle={{ color: '#ef4444' }} /></Col>
                            </Row>
                          </Card>
                        </Col>
                      </Row>
                    </Card>

                    {/* Breathing Style Section */}
                    <Card className="bg-slate-900/80 border-purple-900/30 shadow-xl">
                      <Divider orientation="left" className="border-purple-500"><span className="text-purple-300 text-lg">Ⅱ. 流派解析：鸟之呼吸</span></Divider>
                      <Row gutter={[24, 24]}>
                        <Col xs={24} lg={8}>
                          <div className="h-full bg-gradient-to-br from-purple-900/40 to-transparent p-6 rounded-xl border-l-4 border-purple-500">
                            <h3 className="text-xl font-bold text-white mb-4">起源</h3>
                            <p className="text-slate-300 text-justify">{stylesInfo.origin}</p>
                          </div>
                        </Col>
                        <Col xs={24} lg={8}>
                          <div className="h-full bg-gradient-to-br from-purple-900/40 to-transparent p-6 rounded-xl border-l-4 border-purple-400">
                            <h3 className="text-xl font-bold text-white mb-4">战斗哲学</h3>
                            <p className="text-slate-300 text-justify">{stylesInfo.philosophy}</p>
                          </div>
                        </Col>
                        <Col xs={24} lg={8}>
                          <div className="h-full bg-gradient-to-br from-purple-900/40 to-transparent p-6 rounded-xl border-l-4 border-purple-300">
                            <h3 className="text-xl font-bold text-white mb-4">视觉特效</h3>
                            <p className="text-slate-300 text-justify">{stylesInfo.visual}</p>
                          </div>
                        </Col>
                      </Row>
                    </Card>

                    {/* Concept Artwork */}
                    <Card className="bg-slate-900/80 border-purple-900/30 shadow-xl">
                      <Divider orientation="left" className="border-purple-500"><span className="text-purple-300 text-lg">Ⅲ. 早期角色概念稿</span></Divider>
                      <div className="flex flex-col md:flex-row gap-6 items-center">

                        <div className="flex-1 min-w-[200px]">
                          <p className="text-slate-300 leading-relaxed">
                            在最初的设计中，有岁己SUI作为鸟柱，但装扮太过现代化，并且特色盖过主角，该角色被删除，剧情挪到虫柱、恋柱、花柱身上。
                          </p>
                          <button
                            type="button"
                            className="mt-4 inline-flex items-center gap-2 text-sm text-purple-200 border border-purple-500/40 px-4 py-2 rounded-full hover:bg-purple-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                            onClick={() => openMedia(conceptArtwork)}
                          >
                            查看原稿
                            <span aria-hidden>⤴</span>
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => openMedia(conceptArtwork)}
                          className="flex-2 w-full max-h-64 group rounded-3xl overflow-hidden border border-purple-900/40 bg-slate-950/50 shadow-inner shadow-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                          style={{ aspectRatio: conceptArtwork.ratio }}
                        >
                          <div className="relative w-full h-full">
                            <NextImage
                              src={conceptArtwork.src}
                              alt={conceptArtwork.caption}
                              fill
                              sizes="100vw, 40vw"
                              className="object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent px-4 py-3">
                              <p className="text-xs text-slate-200/80">{conceptArtwork.caption}</p>
                            </div>
                          </div>
                        </button>
                      </div>
                    </Card>

                  </div>
                ),
              },
              {
                key: '2',
                label: (
                  <span className="px-4 flex items-center gap-2">
                    <ThunderboltOutlined />
                    {' '}
                    呼吸招式
                  </span>
                ),
                children: (
                  <div className="animate-slide-in space-y-6">
                    <Card className="bg-slate-900/80 border-purple-900/30 shadow-xl">
                      <Divider orientation="center" className="border-purple-500"><span className="text-purple-300 text-2xl font-serif">鸟之呼吸 · 招式一览</span></Divider>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                        {techniques.map((tech) => (
                          <div
                            key={tech.id}
                            className={`relative group overflow-hidden rounded-xl border ${tech.type === '最终绝杀' ? 'border-purple-400 bg-purple-900/20 col-span-1 md:col-span-2' : 'border-slate-700 bg-slate-800/50'} hover:border-purple-500 transition-all duration-300 hover:shadow-[0_0_15px_rgba(168,85,247,0.3)]`}
                          >
                            <div className="p-6">
                              <div className="flex justify-between items-start mb-2">
                                <Tag color={tech.type === '最终绝杀' ? 'gold' : 'purple'}>{tech.type}</Tag>
                                <span className="text-xs text-slate-500 font-mono">{tech.nameJP}</span>
                              </div>
                              <h3 className={`text-xl font-bold mb-3 ${tech.type === '最终绝杀' ? 'text-yellow-200' : 'text-purple-200'}`}>{tech.nameCN}</h3>
                              <p className="text-slate-300 mb-4 text-sm leading-relaxed border-l-2 border-slate-600 pl-3">{tech.desc}</p>
                              <div className="bg-black/30 rounded p-3 text-xs text-slate-400">
                                <span className="text-purple-400 font-bold mr-2">登场:</span>
                                {tech.scene}
                              </div>
                              {tech.media && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                                  {tech.media.map((media) => (
                                    <div
                                      key={media.src}
                                      role="button"
                                      tabIndex={0}
                                      className={`relative w-full rounded-xl overflow-hidden border border-purple-900/30 bg-slate-950/40 shadow-inner shadow-black/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${media.fullWidth ? 'sm:col-span-2' : ''}`}
                                      style={{ aspectRatio: media.ratio || '16 / 9' }}
                                      onClick={() => openMedia(media)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') openMedia(media);
                                      }}
                                    >
                                      <NextImage
                                        src={media.src}
                                        alt={media.caption}
                                        fill
                                        sizes="(max-width: 640px) 100vw, 50vw"
                                        className="object-cover transition-transform duration-500 hover:scale-105"
                                        style={{ objectPosition: media.objectPosition || 'center' }}
                                      />
                                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent px-3 py-2">
                                        <p className="text-[11px] text-purple-100">{media.caption}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Decorative background element */}
                            <div className="absolute -right-4 -bottom-4 text-9xl opacity-5 select-none pointer-events-none rotate-12">🪶</div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                ),
              },
              {
                key: '3',
                label: (
                  <span className="px-4 flex items-center gap-2">
                    <HistoryOutlined />
                    {' '}
                    传奇历程
                  </span>
                ),
                children: (
                  <Card className="bg-slate-900/80 border-purple-900/30 shadow-xl animate-slide-in">
                    <Divider orientation="left" className="border-purple-500"><span className="text-purple-300 text-lg">Ⅲ. 鸟柱成长史</span></Divider>
                    <div className="px-4 py-8 md:px-12">
                      <Timeline
                        mode="alternate"
                        items={journeyTimelineItems}
                      />
                    </div>
                  </Card>
                ),
              },
            ]}
          />
        </div>
        <AntImage.PreviewGroup
          preview={{
            visible: Boolean(activeMedia),
            onVisibleChange: (visible) => {
              if (!visible) {
                closeMedia();
              }
            },
          }}
        >
          {activeMedia && (
            <AntImage
              src={activeMedia.src}
              alt={activeMedia.caption}
              style={{ display: 'none' }}
            />
          )}
        </AntImage.PreviewGroup>

        {/* CSS Animations embedded for this page */}
        <style jsx global>
          {`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes slideIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes slowOrbit {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .animate-fade-in-up {
            animation: fadeInUp 0.8s ease-out forwards;
          }
          .animate-slide-in {
            animation: slideIn 0.5s ease-out forwards;
          }
          .animate-slow-spin {
            animation: slowOrbit 12s linear infinite;
          }
          /* Customize Antd Tabs for Dark Theme */
          .custom-tabs .ant-tabs-nav::before {
            border-bottom: 1px solid rgba(147, 51, 234, 0.3);
          }
          .custom-tabs .ant-tabs-tab {
            background: rgba(15, 23, 42, 0.8) !important;
            border-color: rgba(147, 51, 234, 0.3) !important;
            color: #cbd5e1 !important;
          }
          .custom-tabs .ant-tabs-tab-active {
            background: rgba(88, 28, 135, 0.5) !important;
            border-bottom-color: transparent !important;
          }
          .custom-tabs .ant-tabs-tab-active .ant-tabs-tab-btn {
            color: #d8b4fe !important;
            text-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
          }
        `}
        </style>
      </div>
    </ConfigProvider>
  );
}
