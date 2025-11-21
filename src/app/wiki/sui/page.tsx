'use client';

import React from 'react';
import {
  Typography, Card, Tag, Divider, Timeline, Tabs, ConfigProvider, theme, Row, Col, Statistic,
} from 'antd';
import {
  ThunderboltOutlined, HistoryOutlined, ReadOutlined, CrownOutlined,
} from '@ant-design/icons';
import Image from 'next/image';

const { Title, Paragraph, Text } = Typography;

// --- Data Definitions ---

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

const techniques = [
  {
    id: 1,
    nameCN: '壹之型 · 羽击',
    nameJP: 'Habataki',
    type: '基础型',
    desc: '极致速度的一刀斩，附带紫色羽毛光效。',
    scene: '初次任务：深夜森林中，鬼从树后扑来，岁己头也不回，反手一刀，鬼在空中一分为二，切口处飘落发光羽毛。',
  },
  {
    id: 2,
    nameCN: '贰之型 · 燕返·空舞',
    nameJP: 'Tsubame Gaeshi - Kūbu',
    type: '反击技',
    desc: '在半空中利用极小支点进行不可思议的锐角转向，躲避攻击并借力反杀敌人身后。',
    scene: '狭窄巷道：被多臂鬼逼入绝境，双脚在墙面一蹬，在空中划出“V”字形，倒悬着斩首。',
  },
  {
    id: 3,
    nameCN: '叁之型 · 疾隼',
    nameJP: 'Hayabusa',
    type: '直线突进',
    desc: '爆发性的直线加速，配合滑翔翼使用，像捕猎的游隼一样瞬间拉近距离。',
    scene: '屋顶追逐：逃跑的鬼被速度线模糊的岁己瞬间追上并超越，鬼的头颅在惯性作用下滚落。',
  },
  {
    id: 4,
    nameCN: '肆之型 · 群鸟乱舞·千羽从',
    nameJP: 'Gunchō Ranbu - Senba Jū',
    type: '范围攻击 (AOE)',
    desc: '在极短时间内的无死角连续斩击，形成紫色的羽毛风暴漩涡，绞碎复数敌人。',
    scene: '蝙蝠鬼群：被数十只飞行鬼包围，岁己中心爆发出紫光，所有蝙蝠鬼化为碎块落下。',
  },
  {
    id: 5,
    nameCN: '伍之型 · 滑空·奈落之喙',
    nameJP: 'Kakkū - Naraku no Kuchibashi',
    type: '单点突破',
    desc: '跳至高空垂直俯冲，将重力势能叠加到刀尖。威力足以击穿高硬度防御。',
    scene: '对战硬壳下弦：岁己在圆月背景下倒转俯冲，刀尖凝聚紫芒，一击击穿了鬼的坚硬外壳。',
  },
  {
    id: 6,
    nameCN: '陆之型 · 鵺之影',
    nameJP: 'Nue no Kage',
    type: '幻惑与位移',
    desc: '利用高速移动制造出极其逼真的紫色残影，扰乱敌人感知。敌人击中的永远是即将消散的残影。',
    scene: '对抗感知鬼：鬼的攻击穿透了岁己身体，但“岁己”化为烟雾消散，真身无声息地出现在鬼的视觉死角。',
  },
  {
    id: 99,
    nameCN: '终之型 · 天群·万羽葬送 (奥义)',
    nameJP: 'Tengun - Banba Sōsō',
    type: '最终绝杀',
    desc: '透支体力，在空中进行数百次超高速、不规则的立体机动斩击。刀光和羽毛填满天空，将敌人撕裂成无数碎块。',
    scene: '无限城：岁己开启斑纹，在童磨的冰莲花血鬼术中发动，整个屏幕被紫光占据，童磨的冰雕和本体被瞬间粉碎。',
  },
];

const wikiImages = [
  { src: '/images/wiki/wiki_snapshot.jpg', title: '档案封面', description: '早期概念设定图，展示岁己的鸟柱羽织与紫色光翼。' },
  { src: '/images/wiki/skill1_big.jpg', title: '壹之型·羽击（全景）', description: '一之型的广角镜头，大张力挥刀与紫色羽毛光效铺满画面。' },
  { src: '/images/wiki/skill1.jpg', title: '壹之型·羽击（动作特写）', description: '同一招式的细节截帧，展示出刀刃破空与回身反手的瞬间。' },
  { src: '/images/wiki/killmanybird.jpg', title: '一战成名·蝙蝠鬼群', description: '村庄夜战中单人面对蝙蝠鬼群，记录了她成名之战的终章。' },
  { src: '/images/wiki/vstm.jpg', title: '对上弦贰·童磨', description: '无限城战中切断冰莲的瞬间，突出滑翔骨架与冰雾对冲。' },
];

const journey = [
  {
    color: 'gray',
    children: (
      <>
        <Text strong className="text-lg text-purple-300">悲惨过去</Text>
        <br />
        <Text className="text-gray-300">
          居住在深山的家人被一只拥有飞行能力的异形鬼袭击。年幼的岁己躲在高树的鸟巢中幸存。她立誓要成为支配天空的人，不再让任何鬼在头顶作祟。
        </Text>
      </>
    ),
  },
  {
    color: 'purple',
    children: (
      <>
        <Text strong className="text-lg text-purple-300">最终选拔</Text>
        <br />
        <Text className="text-gray-300">
          她没有在地面躲藏，而是利用自制的简易滑翔翼在树冠层顶端移动，像鹰一样俯冲猎杀鬼，展现了独特的空战天赋。
        </Text>
      </>
    ),
  },
  {
    color: '#a855f7',
    children: (
      <>
        <Text strong className="text-lg text-purple-300">一战成名</Text>
        <br />
        <Text className="text-gray-300">
          在成为甲级队员后，某个村庄遭遇棘手的“蝙蝠鬼群”袭击。普通队员无法应对空中的群鬼。岁己单枪匹马冲入夜空，利用滑翔装备缠斗一整夜，将所有鬼斩杀。黎明时，她站在屋顶，身后是被斩断的鬼之翼，宛如堕天使，因此获得了主公的关注。
        </Text>
      </>
    ),
  },
  {
    color: '#d8b4fe',
    dot: <CrownOutlined style={{ fontSize: '20px' }} />,
    children: (
      <>
        <Text strong className="text-lg text-purple-300">晋升为柱</Text>
        <br />
        <Text className="text-gray-300">
          凭借对空战的绝对统治力，她在两年内成功讨伐了一位下弦，并积累了惊人的斩杀数，被主公破格提拔为鸟柱。
        </Text>
      </>
    ),
  },
  {
    color: 'red',
    children: (
      <>
        <Text strong className="text-lg text-purple-300">无限城战绩</Text>
        <br />
        <Text className="text-gray-300">
          是少数能对上弦之贰·童磨造成有效干扰的柱。她的极致空战机动性让她能够勉强躲避冰雾，并成功利用特制羽织切断童磨释放血鬼术的冰莲，为队友争取时间。
        </Text>
      </>
    ),
  },
];

export default function SuiWikiPage() {
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
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.6)] bg-slate-800 flex items-center justify-center">
                {/* Using existing asset as avatar */}
                <Image src="/images/sui-bird-jump.png" alt="Sui Avatar" width={100} height={100} className="object-contain" />
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
                    <ReadOutlined /> 档案资料
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
                          {/* Stats or additional visual */}
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

                    {/* Visual Gallery */}
                    <Card className="bg-slate-900/80 border-purple-900/30 shadow-xl">
                      <Divider orientation="left" className="border-purple-500"><span className="text-purple-300 text-lg">Ⅲ. 视觉资料库</span></Divider>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                        {wikiImages.map((img) => (
                          <div key={img.src} className="bg-slate-950/40 rounded-2xl border border-purple-900/30 p-4 hover:border-purple-500/70 transition-colors duration-300 shadow-inner shadow-black/40">
                            <div className="relative h-48 w-full overflow-hidden rounded-xl">
                              <Image
                                src={img.src}
                                alt={img.title}
                                fill
                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                className="object-cover transition-transform duration-500 hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 to-transparent" />
                              <div className="absolute bottom-3 left-4 right-4">
                                <p className="text-purple-200 font-semibold text-base drop-shadow">{img.title}</p>
                              </div>
                            </div>
                            <p className="text-xs text-slate-400 mt-3 leading-relaxed">{img.description}</p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                ),
              },
              {
                key: '2',
                label: (
                  <span className="px-4 flex items-center gap-2">
                    <ThunderboltOutlined /> 呼吸招式
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
                    <HistoryOutlined /> 传奇历程
                  </span>
                ),
                children: (
                  <Card className="bg-slate-900/80 border-purple-900/30 shadow-xl animate-slide-in">
                    <Divider orientation="left" className="border-purple-500"><span className="text-purple-300 text-lg">Ⅲ. 鸟柱成长史</span></Divider>
                    <div className="px-4 py-8 md:px-12">
                      <Timeline
                        mode="alternate"
                        items={journey}
                      />
                    </div>
                  </Card>
                ),
              },
            ]}
          />
        </div>

        {/* CSS Animations embedded for this page */}
        <style jsx global>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes slideIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in-up {
            animation: fadeInUp 0.8s ease-out forwards;
          }
          .animate-slide-in {
            animation: slideIn 0.5s ease-out forwards;
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
        `}</style>
      </div>
    </ConfigProvider>
  );
}
