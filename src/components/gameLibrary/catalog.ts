import {
  AUTOCHESS_VERSION,
  AUTOCHESS_RELEASE_DATE,
} from '../autoChessGame/version';
import { CONTENT_VERSION as SPARRING_VERSION } from '../oneMoreGame/content';
import { QUESTIONS as BUTTON_QUESTIONS } from '../buttonGame/content';

export interface ProjectItem {
  title: string;
  href: string;
  description: string;
  image?: string;
  meta: string;
  externalStats?: boolean;
}

export interface GameItem extends ProjectItem {
  releaseDate: string;
  updateDate?: string;
}

// Date sources and update rules are documented in docs/demos-dates.md.
export const gameGroups: { id: string; title: string; games: GameItem[] }[] = [
  {
    id: 'action',
    title: '动作与探索',
    games: [
      {
        title: '岁己 · 雨夜寻味',
        href: '/game/night-rain',
        description:
          '穿过雨中的旧城，打开近路、挑战铁伞，和饼干岁一起找一顿热饭。',
        image: '/games/night-rain/preview.png',
        meta: '3D 动作探索 · 扮演岁己 · 箱庭冒险',
        releaseDate: '2026-09-26',
        updateDate: '2026-09-26',
      },
      {
        title: '岁己：今天也要动',
        href: '/game/sui-fitness',
        description: '从 48.00 kg 向 40.00 kg 前进，训练减脂保肌。选开局天赋，混搭四种武器，靠行动升级。',
        image: '/games/sui-fitness/preview.svg',
        meta: '美食肉鸽 · 三种天赋 · 四种攻击 / 触屏',
        releaseDate: '2026-10-03',
      },
      {
        title: '晴海双打 · 岁己 × 栞栞 × 米汀',
        href: '/game/beach-volley',
        description: '迎着海风起跳扣杀，和岁己、栞栞、米汀在晴海沙滩打出漂亮的一球。',
        image: '/games/beach-volley/intro-v2.webp',
        meta: '沙滩排球 · 三位角色 · 方向击球 · 视频特写',
        releaseDate: '2026-10-02',
        updateDate: '2026-10-03',
      },
      {
        title: '岁岁过招',
        href: '/game/one-more',
        description: '接飞铃、截突进，在三庭收钟的道场中挑战三位对手。',
        image: '/games/one-more/dojo.webp',
        meta: `动作对战 · 扮演挑战者 · 三位首章 Boss · v${SPARRING_VERSION}`,
        releaseDate: '2026-09-06',
        updateDate: '2026-10-03',
      },
      {
        title: 'Knight：空洞搜打撤',
        href: '/knight',
        description: '深入空洞搜集资源、应对遭遇，在局势失控前带着战利品撤离。',
        meta: '搜打撤 · 扮演探索者 · 搜索、交战、撤离',
        externalStats: true,
        releaseDate: '2026-07-18',
      },
      {
        title: '潮夜格斗 · 岁己 vs 栞栞',
        href: '/game/tidal-duel',
        description: '岁己与栞栞的像素格斗。按后防御、单键必杀、辅助连招，五个动作键轻松过招。',
        image: '/games/tidal-duel/poster.webp',
        meta: '像素格斗 · 现代简易操作 · 单人 / 同机双人',
        releaseDate: '2026-10-03',
      },
      {
        title: '岁己：零点之后',
        href: '/game/after-hours',
        description: '下播之后，房间里的另一个你还在等最后一句话。找回午夜录音，穿过回声走廊，带着自己的名字走向天亮。',
        image: '/games/after-hours/preview.png',
        meta: '3D 心理恐怖 · 扮演岁己 · 探索 / 解谜 / 追逐',
        releaseDate: '2026-10-03',
      },
    ],
  },
  {
    id: 'virtual-streamer',
    title: '虚拟主播模拟',
    games: [
      {
        title: '岁己：马上就播',
        href: '/game/pre-stream',
        description:
          '跑遍公寓准备直播，趁保温杯慢慢接水去喂猫、试音，处理突发状况后赶到 OBS 开播。',
        image: '/games/pre-stream/preview-3d.webp',
        meta: '3D 开播竞速 · 扮演主播岁己 · 三晚计时摘星',
        releaseDate: '2026-09-12',
        updateDate: '2026-10-03',
      },
      {
        title: '嘘，TA还在播',
        href: '/game/hush-live',
        description: '递外卖、隔墙报点、偷一个吻，守住两个人的小秘密。',
        image: '/games/hush-live/preview.png',
        meta: '第一人称潜行 · 扮演主播的秘密恋人 · 五晚同居',
        releaseDate: '2026-09-22',
        updateDate: '2026-09-26',
      },
      {
        title: '饼干岁，听我说',
        href: '/game/streamer',
        description: '打出话题、挑选弹幕、救场转场，亲手控住三幕直播。',
        image: '/images/materials/岁己SUI小猫帽短发小揪揪半身金瞳.png',
        meta: '直播策略肉鸽 · 扮演主播岁己 · 七种结局',
        releaseDate: '2026-09-12',
        updateDate: '2026-09-12',
      },
      {
        title: '主播，别嚼了！',
        href: '/game/snack',
        description: '一边聊天一边偷偷吃零食，别让麦克风和观众发现。',
        image: '/games/mini/snack.png',
        meta: '实时操作 · 扮演偷吃的主播 · 五关挑战',
        releaseDate: '2026-09-11',
        updateDate: '2026-10-03',
      },
      {
        title: '不许手抖 · 黄金微针模拟室',
        href: '/game/golden-needle',
        description:
          '拿稳小方块探头，照顾岁己的变美愿望。清洁、敷麻、稳稳下针，别忘了冷敷，也可选栓剂止痛。',
        image: '/games/golden-needle/preview.png',
        meta: '手术操作模拟 · 三档难度 · 键鼠 / 触屏',
        releaseDate: '2026-10-02',
        updateDate: '2026-10-03',
      },
    ],
  },
  {
    id: 'strategy',
    title: '经营与策略',
    games: [
      {
        title: '维阿自走棋 · 裂隙阵线',
        href: '/game/autochess',
        description: '招募维阿棋手、搭配羁绊与站位，挑战敌阵或和朋友在线对局。',
        image: '/images/demos/rift-line-hero.png',
        meta: `策略自走棋 · 单人 / 在线多人 · v${AUTOCHESS_VERSION}`,
        releaseDate: '2026-01-10',
        updateDate: AUTOCHESS_RELEASE_DATE,
      },
      {
        title: '上船！应援事务所',
        href: '/game/hype-harbor',
        description:
          '四位主播三条船。应援出圈、押未达标人数，或抢名场面切片，和朋友比比眼光。',
        image: '/games/hype-harbor/preview.png',
        meta: '投资桌游 · 2–4 人 · AI / 本地多人',
        releaseDate: '2026-09-26',
        updateDate: '2026-10-03',
      },
      {
        title: 'RESET / 开蹬！',
        href: '/game/reset-rush',
        description:
          'tibo 又说要 reset 了。经营多账号、押注银行券，把额度变成下一款碉游。',
        image: '/games/reset-rush/preview.svg',
        meta: '开发者桌游 · 1 人 + 3 AI · 时间、精力与并行开发',
        releaseDate: '2026-09-26',
        updateDate: '2026-10-03',
      },
      {
        title: '平陆运河：造山移海',
        href: '/game/pinglu-canal',
        description:
          '逐格炸山、拓河、疏浚，再把土运去填沟造田。在真实高程与河网构成的 3456 格地图上跨分水岭、建三级船闸，只有最终采用的航线才得分。',
        image: '/games/pinglu-canal/preview.svg',
        meta: '地形工程 · 1–4 人 / AI · 自由施工',
        releaseDate: '2026-09-27',
        updateDate: '2026-10-03',
      },
      {
        title: '智能纪元',
        href: '/game/agi',
        description: '训练、蒸馏、发布大模型，与三家实验室竞速 AGI。',
        image: '/games/mini/agi.png',
        meta: '策略经营 · 扮演 AI 公司 · 发展大模型',
        releaseDate: '2026-09-11',
        updateDate: '2026-10-03',
      },
      {
        title: '晶圆周期',
        href: '/game/fab',
        description: '决定报价、库存和扩产时机，在六年产业周期中积累财富。',
        image: '/games/mini/fab.png',
        meta: '模拟经营 · 扮演内存颗粒厂商 · 把握行情',
        releaseDate: '2026-09-11',
        updateDate: '2026-10-03',
      },
    ],
  },
  {
    id: 'story',
    title: '故事与抉择',
    games: [
      {
        title: '虚境归途',
        href: '/game/rpg',
        description: '醒来成了一块饼干，结识伙伴，在山河间寻找通往现实的路。',
        image: '/images/autochess/portraits/biscuit_sui.png',
        meta: '角色扮演 · 扮演饼干 · 组队探索',
        releaseDate: '2026-09-12',
        updateDate: '2026-09-21',
      },
      {
        title: '年关牌局：这婚，你催吗？',
        href: '/game/family-pressure',
        description:
          '从妈妈推来的微信名片开始，在工位、下班路上与出租屋里，慢慢认识一个人。',
        image: '/images/marriage-pressure/reunion-dinner.jpg',
        meta: '3D 日常 · 微信与电话 · 相识和共同生活',
        releaseDate: '2026-09-20',
        updateDate: '2026-09-29',
      },
      {
        title: '武侠小说生成器',
        href: '/game/wuxia',
        description: '从一次选择开始，让随机事件和你的决定写成自己的江湖。',
        image: '/images/wiki/skill1.jpg',
        meta: '文字冒险 · 扮演江湖人物 · 自由抉择',
        releaseDate: '2025-11-29',
        updateDate: '2026-09-06',
      },
      {
        title: '这个按钮，你按吗？',
        href: '/game/button',
        description: '面对心动的奖励与纠结的代价，为虚拟主播的平行人生做选择。',
        image: '/games/button/press.svg',
        meta: `互动选择 · 扮演决策者 · ${BUTTON_QUESTIONS.length} 道难题`,
        releaseDate: '2026-09-08',
        updateDate: '2026-09-16',
      },
    ],
  },
  {
    id: 'quick',
    title: '轻松挑战',
    games: [
      {
        title: '维阿发掘局',
        href: '/game/brick-excavation',
        description: '敲落连成一片的彩色砖块，找齐一盘中埋藏的维阿主播。',
        image: '/games/brick-excavation/sui-excavation.png',
        meta: '连色解谜 · 触屏预览 / 键盘 · 多件出土',
        releaseDate: '2026-09-26',
        updateDate: '2026-10-03',
      },
      {
        title: '维阿弹棋',
        href: '/game/flick-chess',
        description: '挑选棋子，拉开角度与力度，用连锁碰撞把对手弹出棋盘。',
        image: '/games/flick-chess/preview.png',
        meta: '3D 物理对战 · 扮演维阿角色 · 本地双人 / AI',
        releaseDate: '2026-09-26',
        updateDate: '2026-10-03',
      },
      {
        title: '小鸟一百层',
        href: '/game/jumpone',
        description: '踩着云间平台一路向上，用跳跃和冲刺刷新纪录，也能分享同一路线。',
        image: '/images/sui-bird-jump.png',
        meta: '垂直跳跃 · 键盘 / 触屏 · 同路线挑战',
        releaseDate: '2025-11-27',
        updateDate: '2026-10-03',
      },
    ],
  },
];
