import type { Candidate, CandidateId } from "./types";

// All named autochess characters, including both guests. Sui forms are one person.
export const AUTOCHESS_CANDIDATE_MAP: Record<string, CandidateId> = {
  sun_guard: "hazel",
  ember_blade: "liko",
  gale_archer: "izayoi",
  sui: "sui",
  rift_brawler: "kloa",
  grove_mender: "nana7mi",
  cinder_ram: "azi",
  shiori: "shiori",
  xuehui: "xuehui",
  sui_blue: "sui",
  sui_bird: "sui",
  sui_flower: "sui",
  sui_cat: "sui",
  biscuit_sui: "sui",
  rift_stalker: "rift_stalker",
  cog_scribe: "cog_scribe",
  mossback: "mossback",
  spark_mage: "spark_mage",
  clock_gunner: "clock_gunner",
  dawn_duelist: "dawn_duelist",
  yua: "yua",
  seki_boar_king: "seki_boar_king",
  sumi: "sumi",
  mitsuri: "mitsuri",
  guangyi: "guangyi",
  nagisa: "nagisa",
  tower_god: "tower_god",
  nori: "nori",
  meme: "meme",
  zeyin: "zeyin",
  kioi: "kioi",
  nightin: "nightin",
  tiandou: "tiandou",
  youyi: "youyi",
  akirinco: "akirinco",
  lovely: "lovely",
  komichi: "komichi",
  mumu: "mumu",
  yukisyo: "yukisyo",
  rei: "rei",
  rutice: "rutice",
  lian: "lian",
  pako: "pako",
  miki_guest: "miki_guest",
  hatsuse_guest: "hatsuse_guest"
};

export const ROSTER_CANDIDATES: Candidate[] = [
  {
    id: "rift_stalker",
    name: "未知夜",
    subtitle: "广告策划 · 喜欢即兴喜剧",
    image: "/images/autochess/portraits/rift-stalker-head.png",
    resume: 55,
    compatibility: 58,
    initialIntent: 24,
    cityCost: 4,
    tags: [
      "广告策划",
      "被家里催",
      "先聊微信"
    ],
    boundary: "幽默也要有分寸，不想被拿来反复开玩笑。",
    opening: "忙完项目会去看演出，想找能接住玩笑的人。"
  },
  {
    id: "cog_scribe",
    name: "轴伊",
    subtitle: "图书编辑 · 慢慢熟悉",
    image: "/images/autochess/portraits/classic/cog-scribe.png",
    resume: 62,
    compatibility: 69,
    initialIntent: 37,
    cityCost: 5,
    tags: [
      "图书编辑",
      "主动认识",
      "慢慢了解"
    ],
    boundary: "回消息慢不代表没礼貌，我需要自己的时间。",
    opening: "朋友介绍来的，比起条件更想先聊喜欢的书。"
  },
  {
    id: "mossback",
    name: "犬绒",
    subtitle: "宠物护理师 · 周末排班",
    image: "/images/livers/mofu.jpg",
    resume: 69,
    compatibility: 80,
    initialIntent: 50,
    cityCost: 6,
    tags: [
      "宠物护理师",
      "朋友牵线",
      "见面再看"
    ],
    boundary: "宠物是生活的一部分，不能默认结婚就送走。",
    opening: "家里总催，自己更想找能接受养宠物的人。"
  },
  {
    id: "spark_mage",
    name: "瑞娅",
    subtitle: "语言教师 · 两城生活",
    image: "/images/livers/rhea.png",
    resume: 76,
    compatibility: 58,
    initialIntent: 63,
    cityCost: 7,
    tags: [
      "语言教师",
      "被家里催",
      "先聊微信"
    ],
    boundary: "跨城计划需要一起决定，不能让一方默认跟随。",
    opening: "来见面是自己的选择，但未来可能换城市。"
  },
  {
    id: "clock_gunner",
    name: "弥月",
    subtitle: "硬件工程师 · 夜间爱好",
    image: "/images/livers/mizuki.png",
    resume: 83,
    compatibility: 69,
    initialIntent: 34,
    cityCost: 8,
    tags: [
      "硬件工程师",
      "主动认识",
      "慢慢了解"
    ],
    boundary: "不需要兴趣完全相同，但希望别嘲笑彼此的爱好。",
    opening: "不太会寒暄，但聊到手头的小制作就停不下来。"
  },
  {
    id: "dawn_duelist",
    name: "大黑鼠",
    subtitle: "配音演员 · 项目制收入",
    image: "/images/livers/harei.png",
    resume: 90,
    compatibility: 80,
    initialIntent: 47,
    cityCost: 9,
    tags: [
      "配音演员",
      "朋友牵线",
      "见面再看"
    ],
    boundary: "没有感觉会直接说，希望不用互相猜来猜去。",
    opening: "家里要求我来，我自己还在慢慢考虑。"
  },
  {
    id: "yua",
    name: "悠亚",
    subtitle: "游戏本地化 · 远程办公",
    image: "/images/livers/yua.png",
    resume: 57,
    compatibility: 58,
    initialIntent: 60,
    cityCost: 10,
    tags: [
      "游戏本地化",
      "被家里催",
      "先聊微信"
    ],
    boundary: "不喜欢查岗式问候，亲密也需要空间。",
    opening: "想先加微信，看看不见面时也能不能聊得来。"
  },
  {
    id: "seki_boar_king",
    name: "星汐",
    subtitle: "运动教练 · 早睡早起",
    image: "/images/livers/seki.webp",
    resume: 64,
    compatibility: 69,
    initialIntent: 31,
    cityCost: 11,
    tags: [
      "运动教练",
      "主动认识",
      "慢慢了解"
    ],
    boundary: "忙不是敷衍，希望我们能提前说好见面的时间。",
    opening: "可以约个白天的见面，晚上还有工作安排。"
  },
  {
    id: "sumi",
    name: "礼墨",
    subtitle: "文创设计 · 和家人同城",
    image: "/images/livers/sumi.jpg",
    resume: 71,
    compatibility: 80,
    initialIntent: 44,
    cityCost: 4,
    tags: [
      "文创设计",
      "朋友牵线",
      "见面再看"
    ],
    boundary: "我在意家人，但不会让家人替我作最后决定。",
    opening: "家里介绍了不少，想这次按自己的节奏认识。"
  },
  {
    id: "mitsuri",
    name: "三理",
    subtitle: "实验室技术员 · 稳定作息",
    image: "/images/livers/mitsuri.jpg",
    resume: 78,
    compatibility: 58,
    initialIntent: 57,
    cityCost: 5,
    tags: [
      "实验室技术员",
      "被家里催",
      "先聊微信"
    ],
    boundary: "干净、尊重和分担，比纪念日礼物更重要。",
    opening: "不着急结婚，想先确认生活习惯合不合拍。"
  },
  {
    id: "guangyi",
    name: "光一",
    subtitle: "软件开发 · 业余电竞",
    image: "/images/livers/guangyi.jpg",
    resume: 85,
    compatibility: 69,
    initialIntent: 28,
    cityCost: 6,
    tags: [
      "软件开发",
      "主动认识",
      "慢慢了解"
    ],
    boundary: "兴趣不该挤掉所有相处时间，双方都要安排。",
    opening: "周末偶尔打比赛，也想留时间认真交往。"
  },
  {
    id: "nagisa",
    name: "米汀",
    subtitle: "社区社工 · 常听别人说话",
    image: "/images/livers/nagisa.png",
    resume: 92,
    compatibility: 80,
    initialIntent: 41,
    cityCost: 7,
    tags: [
      "社区社工",
      "朋友牵线",
      "见面再看"
    ],
    boundary: "情绪不能永远由一方接住，也请认真听我说话。",
    opening: "不想一直当倾听的人，也希望有人关心我的日常。"
  },
  {
    id: "tower_god",
    name: "笙歌",
    subtitle: "音乐制作 · 自由接单",
    image: "/images/livers/shengge.jpg",
    resume: 59,
    compatibility: 58,
    initialIntent: 54,
    cityCost: 8,
    tags: [
      "音乐制作",
      "被家里催",
      "先聊微信"
    ],
    boundary: "可以一起努力，但不能把未来收入当现在的存款。",
    opening: "事业还在起步，来见面也带着一点犹豫。"
  },
  {
    id: "nori",
    name: "能能",
    subtitle: "电商美术 · 喜欢小旅行",
    image: "/images/livers/nori.jpg",
    resume: 66,
    compatibility: 69,
    initialIntent: 25,
    cityCost: 9,
    tags: [
      "电商美术",
      "主动认识",
      "慢慢了解"
    ],
    boundary: "一起开心不该只等于消费，希望能找到共同兴趣。",
    opening: "期待周末短途走走，不一定要花很多钱。"
  },
  {
    id: "meme",
    name: "毛神",
    subtitle: "餐饮经营 · 作息不同",
    image: "/images/livers/meme.jpg",
    resume: 73,
    compatibility: 80,
    initialIntent: 38,
    cityCost: 10,
    tags: [
      "餐饮经营",
      "朋友牵线",
      "见面再看"
    ],
    boundary: "夜里收工很晚，希望不是只有我调整作息。",
    opening: "最近工作很忙，是朋友反复劝才来认识一下。"
  },
  {
    id: "zeyin",
    name: "泽音",
    subtitle: "舞台美术 · 全国跑项目",
    image: "/images/livers/zeyin.jpg",
    resume: 80,
    compatibility: 58,
    initialIntent: 51,
    cityCost: 11,
    tags: [
      "舞台美术",
      "被家里催",
      "先聊微信"
    ],
    boundary: "距离可以解决，默认失联和查岗都不行。",
    opening: "愿意交往，但要先谈清如何面对出差。"
  },
  {
    id: "kioi",
    name: "美鱿",
    subtitle: "影像后期 · 慢热表达",
    image: "/images/livers/kioi.jpg",
    resume: 87,
    compatibility: 69,
    initialIntent: 64,
    cityCost: 4,
    tags: [
      "影像后期",
      "主动认识",
      "慢慢了解"
    ],
    boundary: "礼貌的回复不代表恋爱承诺，别急着代入。",
    opening: "可能见几次才知道感觉，先不用替关系定性。"
  },
  {
    id: "nightin",
    name: "南町",
    subtitle: "服装买手 · 都市生活",
    image: "/images/livers/nightin.jpg",
    resume: 94,
    compatibility: 80,
    initialIntent: 35,
    cityCost: 5,
    tags: [
      "服装买手",
      "朋友牵线",
      "见面再看"
    ],
    boundary: "消费习惯要谈清，但不想一见面就被贴标签。",
    opening: "喜欢打扮和出门，也会为喜欢的东西自己攒钱。"
  },
  {
    id: "tiandou",
    name: "恬豆",
    subtitle: "甜点研发 · 小城工作",
    image: "/images/livers/tiandou.jpg",
    resume: 61,
    compatibility: 58,
    initialIntent: 48,
    cityCost: 6,
    tags: [
      "甜点研发",
      "被家里催",
      "先聊微信"
    ],
    boundary: "喜欢热闹也需要休息，不想被安排每一个周末。",
    opening: "我想认真交往，不过家里比我还急。"
  },
  {
    id: "youyi",
    name: "又一",
    subtitle: "舞蹈教师 · 晚间授课",
    image: "/images/livers/youyi.jpg",
    resume: 68,
    compatibility: 69,
    initialIntent: 61,
    cityCost: 7,
    tags: [
      "舞蹈教师",
      "主动认识",
      "慢慢了解"
    ],
    boundary: "可以不认同我的工作，但不能要求我立刻放弃。",
    opening: "来之前被家里念了很久，先做朋友也不错。"
  },
  {
    id: "akirinco",
    name: "秋凛子",
    subtitle: "法务助理 · 准备考试",
    image: "/images/livers/akirinco.jpg",
    resume: 75,
    compatibility: 80,
    initialIntent: 32,
    cityCost: 8,
    tags: [
      "法务助理",
      "朋友牵线",
      "见面再看"
    ],
    boundary: "提前说清楚忙和累，比勉强答应更让我安心。",
    opening: "考试和约会得一起安排，不想随口答应又失约。"
  },
  {
    id: "lovely",
    name: "狍子",
    subtitle: "演出统筹 · 周末工作",
    image: "/images/livers/lovely.webp",
    resume: 82,
    compatibility: 58,
    initialIntent: 45,
    cityCost: 9,
    tags: [
      "演出统筹",
      "被家里催",
      "先聊微信"
    ],
    boundary: "相处需要双方留时间，不能总让我取消工作。",
    opening: "想找能接受不固定休息日的人，先了解看看。"
  },
  {
    id: "komichi",
    name: "四时小路",
    subtitle: "城市规划 · 喜欢散步",
    image: "/images/autochess/portraits/classic/komichi.png",
    resume: 89,
    compatibility: 69,
    initialIntent: 58,
    cityCost: 10,
    tags: [
      "城市规划",
      "主动认识",
      "慢慢了解"
    ],
    boundary: "生活在哪座城市、离家多远，都不能只听长辈。",
    opening: "比起正式饭局，更愿意边走边聊。"
  },
  {
    id: "mumu",
    name: "沐霂",
    subtitle: "健身指导 · 租房独居",
    image: "/images/livers/mumu.webp",
    resume: 56,
    compatibility: 80,
    initialIntent: 29,
    cityCost: 11,
    tags: [
      "健身指导",
      "朋友牵线",
      "见面再看"
    ],
    boundary: "结婚也应保留各自的朋友和独处时间。",
    opening: "独居久了，期待陪伴也担心失去自己的节奏。"
  },
  {
    id: "yukisyo",
    name: "雪烛",
    subtitle: "独立插画 · 长期储蓄",
    image: "/images/livers/yukisyo.png",
    resume: 63,
    compatibility: 58,
    initialIntent: 42,
    cityCost: 4,
    tags: [
      "独立插画",
      "被家里催",
      "先聊微信"
    ],
    boundary: "安全感来自兑现的小事，不只是漂亮的承诺。",
    opening: "会认真考虑未来，但不想把每次聊天都变成规划会。"
  },
  {
    id: "rei",
    name: "病院坂灵",
    subtitle: "档案管理 · 安静生活",
    image: "/images/livers/rei.jpg",
    resume: 70,
    compatibility: 69,
    initialIntent: 55,
    cityCost: 5,
    tags: [
      "档案管理",
      "主动认识",
      "慢慢了解"
    ],
    boundary: "安静不是没想法，希望不用一直被要求外向。",
    opening: "不太擅长第一次见面，愿意先文字聊聊。"
  },
  {
    id: "rutice",
    name: "露蒂丝",
    subtitle: "康复治疗师 · 轮休",
    image: "/images/livers/rutice.jpg",
    resume: 77,
    compatibility: 80,
    initialIntent: 26,
    cityCost: 6,
    tags: [
      "康复治疗师",
      "朋友牵线",
      "见面再看"
    ],
    boundary: "职业是照护别人，不代表回家还要包办所有照护。",
    opening: "想先看看意见不同时，彼此是怎么说话的。"
  },
  {
    id: "lian",
    name: "梨安",
    subtitle: "活动策划 · 临时加班",
    image: "/images/livers/lian.jpg",
    resume: 84,
    compatibility: 58,
    initialIntent: 39,
    cityCost: 7,
    tags: [
      "活动策划",
      "被家里催",
      "先聊微信"
    ],
    boundary: "安排变了可以商量，不要到最后一刻才告诉我。",
    opening: "很珍惜能提前约好的时间，不想只是完成相亲任务。"
  },
  {
    id: "pako",
    name: "帕可",
    subtitle: "游戏测试 · 合租生活",
    image: "/images/livers/pako.jpg",
    resume: 91,
    compatibility: 69,
    initialIntent: 52,
    cityCost: 8,
    tags: [
      "游戏测试",
      "主动认识",
      "慢慢了解"
    ],
    boundary: "可以互相照顾，但每个人也要为自己负责。",
    opening: "希望遇到不用一直找话题也舒服的人。"
  },
  {
    id: "miki_guest",
    name: "弥希",
    subtitle: "声音设计 · 异地发展",
    image: "/images/autochess/enemy-guests/miki.jpg",
    resume: 58,
    compatibility: 80,
    initialIntent: 65,
    cityCost: 9,
    tags: [
      "声音设计",
      "朋友牵线",
      "见面再看"
    ],
    boundary: "不会为了让父母放心，就假装我们已经在交往。",
    opening: "先认识一下，是否继续要看双方能投入多少时间。"
  },
  {
    id: "hatsuse_guest",
    name: "初濑",
    subtitle: "演出摄影 · 夜间工作",
    image: "/images/autochess/enemy-guests/hatsuse.jpg",
    resume: 65,
    compatibility: 58,
    initialIntent: 36,
    cityCost: 10,
    tags: [
      "演出摄影",
      "被家里催",
      "先聊微信"
    ],
    boundary: "见面之后没感觉也没关系，希望彼此坦诚一点。",
    opening: "父母推荐来的，我想自己见过再判断。"
  }
];
