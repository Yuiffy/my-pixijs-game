export type AiCompanyId =
  | "deepseek"
  | "anthropic"
  | "openai"
  | "xai"
  | "zai"
  | "minimax"
  | "google"
  | "qwen"
  | "kimi"
  | "meta"
  | "router";
export type AiService = "research" | "balanced" | "consumer";
export type AiSource = {
  title: string;
  url: string;
  basis: "官方资料" | "媒体报道" | "社区二创";
};
export const AI_SOURCES: Record<string, AiSource> = {
  deepseek: {
    title: "梁文锋闭门交流：AGI 主线与 C/B 端副产物",
    url: "https://www.nbd.com.cn/articles/2026-07-23/4504599.html",
    basis: "媒体报道",
  },
  whale: {
    title: "鲸鱼娘社区工具包",
    url: "https://github.com/Neko3000/deepseek-whalechan",
    basis: "社区二创",
  },
  whaleStory: {
    title: "鲸鱼娘与吃饭、睡觉轶事汇编（非原始运行记录）",
    url: "https://www.jdon.com/94278-whale-chan-memes-deepseek-in-the-chinese-ai.html",
    basis: "社区二创",
  },
  distill: {
    title: "Anthropic 对蒸馏攻击的指控与应对声明",
    url: "https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks",
    basis: "官方资料",
  },
  restrictions: {
    title: "Anthropic 扩大不支持地区的销售限制",
    url: "https://www.anthropic.com/news/updating-restrictions-of-sales-to-unsupported-regions",
    basis: "官方资料",
  },
  reset: {
    title: "Romain Huet 转发 Tibo：重置 Codex 使用额度",
    url: "https://x.com/romainhuet/status/2086993788040540339",
    basis: "官方资料",
  },
  resetDocs: {
    title: "Codex 官方文档：额度重置接口",
    url: "https://learn.chatgpt.com/docs/app-server#api-overview-1",
    basis: "官方资料",
  },
  grok: {
    title: "Grok Spicy Mode 争议与后续限制",
    url: "https://www.dw.com/en/musks-xai-curbs-sexually-explicit-image-generation-in-grok/a-75511331",
    basis: "媒体报道",
  },
  glm: {
    title: "GLM-5.3：沿用 5.2 基座，扩展后训练",
    url: "https://z.ai/blog/glm-5.3",
    basis: "官方资料",
  },
  minimax: {
    title: "MiniMax H3 开源公告（2026-08-03）",
    url: "https://www.minimax.io/news/minimax-h3-open-source",
    basis: "官方资料",
  },
  google: {
    title: "Gemini：多模态、长上下文与 TPU",
    url: "https://deepmind.google/models/model-cards/gemini-3-1-flash-lite/",
    basis: "官方资料",
  },
  qwen: {
    title: "Qwen3：开放权重、多尺寸与思考模式",
    url: "https://github.com/QwenLM/Qwen3",
    basis: "官方资料",
  },
  wan: {
    title: "Wan2.1：2025-02-25 发布视频模型权重与代码",
    url: "https://github.com/Wan-Video/Wan2.1",
    basis: "官方资料",
  },
  kimi: {
    title: "Kimi K2：工具调用与 Agent 路线",
    url: "https://github.com/MoonshotAI/Kimi-K2",
    basis: "官方资料",
  },
  meta: {
    title: "Llama 模型目录与社区许可证",
    url: "https://github.com/meta-llama/llama-models",
    basis: "官方资料",
  },
  router: {
    title: "OpenRouter：供应商路由与蒸馏许可筛选",
    url: "https://openrouter.ai/docs/guides/routing/provider-selection",
    basis: "官方资料",
  },
  privacy: {
    title: "OpenRouter：各供应商的数据训练政策",
    url: "https://openrouter.ai/docs/guides/privacy/logging",
    basis: "官方资料",
  },
};
export type AiCompany = {
  id: AiCompanyId;
  name: string;
  prototype: string;
  playstyle: string;
  models: string;
  mark: string;
  color: string;
  style: "frontier" | "efficient" | "product";
  slogan: string;
  trait: string;
  specialty: string;
  specialHint: string;
  sourceIds: string[];
  open: boolean;
  lane: "research" | "coding" | "creative" | "ecosystem";
};
export const AI_COMPANIES: AiCompany[] = [
  {
    id: "deepseek",
    name: "蓝湾研究所",
    prototype: "DeepSeek",
    playstyle: "开源研究 · 精打细算",
    models: "潮汐 / 深蓝推理",
    mark: "鲸",
    color: "#4b80bc",
    style: "efficient",
    slogan: "饭可以吃，AGI 主线不能丢。",
    trait:
      "研究优先仍保留网页：训练 +2，但每季有维护开销。社区二创会吸引自来水。",
    specialty: "开饭，继续研究",
    specialHint: "8 M · 社区 +12、可靠性 +8；研发气氛回暖。",
    sourceIds: ["deepseek", "whale", "whaleStory"],
    open: true,
    lane: "research",
  },
  {
    id: "anthropic",
    name: "灯塔实验室",
    prototype: "Anthropic / Claude",
    playstyle: "企业客户 · 访问防线",
    models: "守灯 / 工程助手",
    mark: "章",
    color: "#b7876b",
    style: "frontier",
    slogan: "门要关紧，模型还得更快。",
    trait: "企业合同收入 +20%；限制准入与反蒸馏会使其他公司更难借用你的能力。",
    specialty: "升级访问防线",
    specialHint: "18 M · 防线 +2、安全 +10、社区 −5；对手追赶收益降低。",
    sourceIds: ["distill", "restrictions"],
    open: false,
    lane: "coding",
  },
  {
    id: "openai",
    name: "晴空智能",
    prototype: "OpenAI",
    playstyle: "订阅经营 · 新手推荐",
    models: "晨星 / 云端工坊",
    mark: "明",
    color: "#42917a",
    style: "product",
    slogan: "朋友，给你的额度再按一次。",
    trait:
      "面向用户的成熟产品收入 +15%；重置额度招揽开发者，也要支付额外算力。",
    specialty: "按下重置按钮",
    specialHint: "16 M · 社区 +22、信誉 +5；本季产品收入 +20%。",
    sourceIds: ["reset", "resetDocs"],
    open: false,
    lane: "coding",
  },
  {
    id: "xai",
    name: "野火实验室",
    prototype: "xAI / Grok",
    playstyle: "话题冒险 · 高风险回报",
    models: "火花 / 幻想画室",
    mark: "野",
    color: "#796897",
    style: "product",
    slogan: "热搜先来，审核也要跟上。",
    trait: "创意产品收入 +20%；高话题性带来流量，也带来额外审核支出。",
    specialty: "午夜创意频道",
    specialHint: "12 M · 社区 +24、安全 −8；下两季各支出 6 M 做内容审核。",
    sourceIds: ["grok"],
    open: false,
    lane: "creative",
  },
  {
    id: "zai",
    name: "星序科技",
    prototype: "智谱 / Z.ai",
    playstyle: "后训练 · 交付质量",
    models: "星序二代 → 星序三代",
    mark: "序",
    color: "#657db1",
    style: "efficient",
    slogan: "基座没换，后训练还没到头。",
    trait:
      "后训练额外可靠性 +8、能力 +2。宣传可以先行，产品不成熟则有口碑反噬。",
    specialty: "发布会预热",
    specialHint: "10 M · 市场预期 +25、社区 +10；高预期且低可靠性时容易退订。",
    sourceIds: ["glm"],
    open: true,
    lane: "coding",
  },
  {
    id: "minimax",
    name: "流光影业",
    prototype: "MiniMax",
    playstyle: "视频创作 · 多线赚钱",
    models: "流光 / 音画引擎",
    mark: "螺",
    color: "#aa7465",
    style: "product",
    slogan: "画面要动，声音也要一起响。",
    trait:
      "视频研发每次 +28，创意收入 +30%；开源视频能带动生态，但并非现实世界最早。",
    specialty: "音画同步",
    specialHint: "20 M · 视频 +30、可靠性 +6；解锁更高创意收入。",
    sourceIds: ["minimax", "wan"],
    open: true,
    lane: "creative",
  },
  {
    id: "google",
    name: "天穹计算",
    prototype: "Google DeepMind",
    playstyle: "算力投入 · 多模态",
    models: "穹顶 / 自研计算阵列",
    mark: "双",
    color: "#5e85a2",
    style: "frontier",
    slogan: "上下文很长，自家芯片也很忙。",
    trait: "算力扩建便宜 5 M，视频研发兼顾通用能力；云端多模态路线。",
    specialty: "长上下文工作台",
    specialHint: "18 M · 能力 +5、可靠性 +10、视频 +10。",
    sourceIds: ["google"],
    open: false,
    lane: "research",
  },
  {
    id: "qwen",
    name: "积木工坊",
    prototype: "阿里 / Qwen / Wan",
    playstyle: "开源生态 · 规模经营",
    models: "积木语言 / 动画积木",
    mark: "千",
    color: "#826fad",
    style: "efficient",
    slogan: "大模型小模型，先摆满一桌。",
    trait:
      "开源发布额外生态 +6；生态每 20 点增加 1 M 季收入，第三方也会学得更快。",
    specialty: "全家桶开源日",
    specialHint: "14 M · 生态 +18、效率 +1、社区 +8。",
    sourceIds: ["qwen", "wan"],
    open: true,
    lane: "ecosystem",
  },
  {
    id: "kimi",
    name: "远帆工作室",
    prototype: "月之暗面 / Kimi",
    playstyle: "长程任务 · 自我提升",
    models: "远帆 / 任务航线",
    mark: "月",
    color: "#698ba0",
    style: "efficient",
    slogan: "文件读完了，工具也替你跑完。",
    trait: "自我提升成本降低 6 M，递归研究每季额外能力 +2；擅长长程任务。",
    specialty: "长程 Agent 实习",
    specialHint: "17 M · 能力 +6、可靠性 +12；把工具链练熟。",
    sourceIds: ["kimi"],
    open: true,
    lane: "coding",
  },
  {
    id: "meta",
    name: "原野联盟",
    prototype: "Meta / Llama",
    playstyle: "社区协作 · 许可经营",
    models: "原野 / 社区权重",
    mark: "驼",
    color: "#5987b1",
    style: "frontier",
    slogan: "权重可以拿，许可证记得看。",
    trait: "开源发布生态额外 +10；在许可下传播，第三方部署扩大影响力。",
    specialty: "社区许可计划",
    specialHint: "15 M · 生态 +22、社区 +8；建立下游开发者关系。",
    sourceIds: ["meta"],
    open: true,
    lane: "ecosystem",
  },
  {
    id: "router",
    name: "百模中转站",
    prototype: "多模型聚合平台",
    playstyle: "模型调度 · 数据学习",
    models: "转接台 / 回退调度",
    mark: "路",
    color: "#8a8472",
    style: "product",
    slogan: "先替你找专家，再把经验学回来。",
    trait:
      "合作调用费降低 4 M。外部能力能服务用户，但不能直接计入自己的 AGI 能力。",
    specialty: "调度优化",
    specialHint: "12 M · 效率 +1、可靠性 +8、社区 +6。",
    sourceIds: ["router", "privacy"],
    open: false,
    lane: "ecosystem",
  },
];
export const AI_STARTER_COMPANIES: AiCompanyId[] = ['openai', 'deepseek', 'minimax', 'xai'];
const LEGACY_COMPANY_NAMES: Record<string, string> = {
  深海求索: '蓝湾研究所',
宪章智能: '灯塔实验室',
明日智能: '晴空智能',
  智序科技: '星序科技',
海螺映像: '流光影业',
双子云图: '天穹计算',
  千问工坊: '积木工坊',
月面工作室: '远帆工作室',
羊驼联盟: '原野联盟',
  海螺把视频权重端上来了: '流光把视频权重端上来了',
};
export const normalizeAiDisplayText = (text: string) => Object.entries(LEGACY_COMPANY_NAMES).reduce((result, [before, after]) => result.split(before).join(after), text);
export const aiCompany = (id: AiCompanyId) => AI_COMPANIES.find((c) => c.id === id)!;
export type AiIndustry = {
  company: AiCompanyId;
  service: AiService;
  reliability: number;
  video: number;
  videoOpen: boolean;
  ecosystem: number;
  hype: number;
  scrutiny: number;
  defense: number;
  teacher: AiCompanyId;
  distillTeacher: AiCompanyId;
  route: boolean;
  licensedData: boolean;
  samples: number;
  eventId: string;
  eventResolved: boolean;
  seenEvents: string[];
  eventChoice: string;
  promotion: boolean;
  statement: string;
  lastIncome: number;
  lastCosts: number;
};
export type AiDeltas = Partial<
  Record<
    | "cash"
    | "capability"
    | "safety"
    | "community"
    | "reputation"
    | "reliability"
    | "video"
    | "ecosystem"
    | "hype"
    | "samples"
    | "defense",
    number
  >
>;
export type AiIndustryEvent = {
  id: string;
  title: string;
  text: string;
  company?: AiCompanyId;
  sourceIds: string[];
  basis: "现实路线改编" | "社区梗改编" | "虚构行业事件";
  choices: { id: string; title: string; detail: string; deltas: AiDeltas }[];
};
export const AI_INDUSTRY_EVENTS: AiIndustryEvent[] = [
  {
    id: "whale-web",
    company: "deepseek",
    title: "用户赶都赶不走",
    basis: "现实路线改编",
    sourceIds: ["deepseek"],
    text: "实验室想把算力留给下一代模型，网页外却排着长队。研究和服务要怎样分配？",
    choices: [
      {
        id: "queue",
        title: "网页继续开，耐心排队",
        detail: "资金 −8，社区 +15，生态 +5",
        deltas: { cash: -8, community: 15, ecosystem: 5 },
      },
      {
        id: "research",
        title: "暂停扩容，先做主线",
        detail: "能力 +4，社区 −7",
        deltas: { capability: 4, community: -7 },
      },
    ],
  },
  {
    id: "whale-nap",
    company: "deepseek",
    title: "“编译在跑，我先睡了”",
    basis: "社区梗改编",
    sourceIds: ["whale", "whaleStory"],
    text: "社区把一次待机回复画成抱饭碗的鲸鱼娘。图很好笑，但长任务仍需要可靠地交付。",
    choices: [
      {
        id: "mascot",
        title: "把饭碗做成社区表情",
        detail: "社区 +16，市场预期 +6，可靠性 −4",
        deltas: { community: 16, hype: 6, reliability: -4 },
      },
      {
        id: "watchdog",
        title: "给长任务加看门狗",
        detail: "资金 −10，可靠性 +18",
        deltas: { cash: -10, reliability: 18 },
      },
    ],
  },
  {
    id: "whale-translate",
    company: "deepseek",
    title: "翻译任务又雇了个翻译",
    basis: "虚构行业事件",
    sourceIds: ["whaleStory", "router"],
    text: "鲸鱼助手先安装了小型翻译模型，再转交任务。它究竟在偷懒，还是在调度专家？这是社区线索改写的虚构桥段。",
    choices: [
      {
        id: "delegate",
        title: "允许专家分工",
        detail: "资金 −6，可靠性 +10，授权样本 +4",
        deltas: { cash: -6, reliability: 10, samples: 4 },
      },
      {
        id: "own",
        title: "坚持本体完成",
        detail: "能力 +3，社区 −3",
        deltas: { capability: 3, community: -3 },
      },
    ],
  },
  {
    id: "constitution-border",
    company: "anthropic",
    title: "欢迎使用，但先看支持地区",
    basis: "现实路线改编",
    sourceIds: ["restrictions"],
    text: "法务收紧机构准入规则。企业客户更安心，部分开发者的接入之路却变窄了。",
    choices: [
      {
        id: "restrict",
        title: "执行严格准入",
        detail: "防线 +2，安全 +8，社区 −10",
        deltas: { defense: 2, safety: 8, community: -10 },
      },
      {
        id: "appeal",
        title: "增加审核与申诉团队",
        detail: "资金 −16，防线 +1，信誉 +8",
        deltas: { cash: -16, defense: 1, reputation: 8 },
      },
    ],
  },
  {
    id: "distill-alarm",
    company: "anthropic",
    title: "谁在批量问我的模型？",
    basis: "现实路线改编",
    sourceIds: ["distill"],
    text: "访问日志出现成批的相似任务。厂商公开指控竞争者蒸馏，行业开始讨论许可和反制；指控本身不等于独立裁决。",
    choices: [
      {
        id: "shield",
        title: "部署反蒸馏防线",
        detail: "资金 −12，防线 +2，社区 −4",
        deltas: { cash: -12, defense: 2, community: -4 },
      },
      {
        id: "license",
        title: "开放有偿样本合作",
        detail: "资金 +12，生态 +8，防线 −1",
        deltas: { cash: 12, ecosystem: 8, defense: -1 },
      },
    ],
  },
  {
    id: "safety-race",
    company: "anthropic",
    title: "“为了安全，我们必须更快”",
    basis: "现实路线改编",
    sourceIds: ["restrictions", "distill"],
    text: "公司以地缘安全为由主张加速本方研发。这是公司立场；你的实际安全水平仍取决于投入。",
    choices: [
      {
        id: "accelerate",
        title: "追加竞速预算",
        detail: "资金 −14，能力 +8，安全 −8",
        deltas: { cash: -14, capability: 8, safety: -8 },
      },
      {
        id: "audit",
        title: "先做联合审计",
        detail: "资金 −10，安全 +15，信誉 +6",
        deltas: { cash: -10, safety: 15, reputation: 6 },
      },
    ],
  },
  {
    id: "reset-button",
    company: "openai",
    title: "友善员工带着重置按钮来了",
    basis: "现实路线改编",
    sourceIds: ["reset", "resetDocs"],
    text: "开发者的额度见底了。社区负责人发帖宣布一次赠送重置，大家又能继续敲代码。",
    choices: [
      {
        id: "reset",
        title: "全员赠送一次额度",
        detail: "资金 −16，社区 +24，信誉 +5",
        deltas: { cash: -16, community: 24, reputation: 5 },
      },
      {
        id: "bank",
        title: "送可储存的额度券",
        detail: "资金 −8，社区 +12，可靠性 +4",
        deltas: { cash: -8, community: 12, reliability: 4 },
      },
    ],
  },
  {
    id: "spicy-headlines",
    company: "xai",
    title: "午夜频道冲上热搜",
    basis: "现实路线改编",
    sourceIds: ["grok"],
    text: "成人向虚构角色的创意模式引来流量和审核压力。游戏只模拟运营后果，不生成成人图像。",
    choices: [
      {
        id: "gate",
        title: "年龄分级与同意审核",
        detail: "资金 −12，社区 +12，安全 +6",
        deltas: { cash: -12, community: 12, safety: 6 },
      },
      {
        id: "pause",
        title: "收紧频道，改做一般创意",
        detail: "视频 +8，社区 −6，信誉 +10",
        deltas: { video: 8, community: -6, reputation: 10 },
      },
    ],
  },
  {
    id: "posttrain-release",
    company: "zai",
    title: "发布会开完，训练还在跑",
    basis: "虚构行业事件",
    sourceIds: ["glm"],
    text: "发布时机由你决定：先提供预览，或沿用基座继续后训练。这是虚构的经营决策，借鉴同基座后训练升级的技术路线。",
    choices: [
      {
        id: "hype",
        title: "先放预览版争取窗口",
        detail: "资金 +14，预期 +25，可靠性 −12，信誉 −8",
        deltas: { cash: 14, hype: 25, reliability: -12, reputation: -8 },
      },
      {
        id: "finish",
        title: "延后发布，补足后训练",
        detail: "资金 −16，可靠性 +24，能力 +4",
        deltas: { cash: -16, reliability: 24, capability: 4 },
      },
    ],
  },
  {
    id: "same-base",
    company: "zai",
    title: "同一个基座，换了一门功课",
    basis: "现实路线改编",
    sourceIds: ["glm"],
    text: "更多可执行环境和可验证任务让后训练成为新的提升来源。基座没变，长任务交付能力可以改变。",
    choices: [
      {
        id: "environments",
        title: "扩展长程任务环境",
        detail: "资金 −12，可靠性 +18，能力 +4",
        deltas: { cash: -12, reliability: 18, capability: 4 },
      },
      {
        id: "bench",
        title: "先公布可复现实测",
        detail: "信誉 +12，预期 −8",
        deltas: { reputation: 12, hype: -8 },
      },
    ],
  },
  {
    id: "video-open",
    company: "minimax",
    title: "流光把视频权重端上来了",
    basis: "现实路线改编",
    sourceIds: ["minimax", "wan"],
    text: "开源权重让创作者自己部署和改造，托管工作流仍有商业价值。世界上已经存在其他开放视频模型。",
    choices: [
      {
        id: "weights",
        title: "配齐推理示例与社区支持",
        detail: "资金 −12，生态 +20，视频 +8",
        deltas: { cash: -12, ecosystem: 20, video: 8 },
      },
      {
        id: "hosted",
        title: "打磨托管音画工作流",
        detail: "资金 −8，视频 +16，可靠性 +6",
        deltas: { cash: -8, video: 16, reliability: 6 },
      },
    ],
  },
  {
    id: "million-context",
    company: "google",
    title: "一口气读完一柜子资料",
    basis: "现实路线改编",
    sourceIds: ["google"],
    text: "超长上下文和多模态吸引了云端客户，但长输入并不意味着稳定找到每一条证据。",
    choices: [
      {
        id: "context",
        title: "优化长上下文与缓存",
        detail: "资金 −12，能力 +5，可靠性 +12",
        deltas: { cash: -12, capability: 5, reliability: 12 },
      },
      {
        id: "bundle",
        title: "随云服务一起销售",
        detail: "资金 +14，社区 +8，预期 +8",
        deltas: { cash: 14, community: 8, hype: 8 },
      },
    ],
  },
  {
    id: "model-buffet",
    company: "qwen",
    title: "今天又上架了几种尺寸",
    basis: "现实路线改编",
    sourceIds: ["qwen", "wan"],
    text: "小模型、大模型、思考版、视频模型：生态越繁荣，适配与支持的工作越多。",
    choices: [
      {
        id: "small",
        title: "支持消费级设备部署",
        detail: "资金 −8，生态 +18，社区 +8",
        deltas: { cash: -8, ecosystem: 18, community: 8 },
      },
      {
        id: "focus",
        title: "集中打磨旗舰模型",
        detail: "能力 +5，生态 −5",
        deltas: { capability: 5, ecosystem: -5 },
      },
    ],
  },
  {
    id: "agent-longrun",
    company: "kimi",
    title: "这次真的把工具跑完了",
    basis: "现实路线改编",
    sourceIds: ["kimi"],
    text: "模型开始接手多步工具任务。用户愿意付钱的是交付结果，而不是一份更长的计划。",
    choices: [
      {
        id: "tools",
        title: "投入可验证工具环境",
        detail: "资金 −12，可靠性 +18，样本 +5",
        deltas: { cash: -12, reliability: 18, samples: 5 },
      },
      {
        id: "show",
        title: "展示完整任务轨迹",
        detail: "信誉 +8，社区 +10",
        deltas: { reputation: 8, community: 10 },
      },
    ],
  },
  {
    id: "llama-license",
    company: "meta",
    title: "开源还是开放权重？",
    basis: "现实路线改编",
    sourceIds: ["meta"],
    text: "开发者拿到权重，也需要知道许可证与使用限制。传播规模和许可边界同样重要。",
    choices: [
      {
        id: "clear",
        title: "写清社区许可边界",
        detail: "资金 −6，生态 +18，信誉 +8",
        deltas: { cash: -6, ecosystem: 18, reputation: 8 },
      },
      {
        id: "integrate",
        title: "做好自家产品集成",
        detail: "资金 +12，社区 +8",
        deltas: { cash: 12, community: 8 },
      },
    ],
  },
  {
    id: "router-label",
    company: "router",
    title: "回答很好，究竟是谁答的？",
    basis: "现实路线改编",
    sourceIds: ["router", "privacy"],
    text: "用户通过统一入口调用多家模型。公开路由、处理数据的范围和训练许可，决定这门生意能否持续。",
    choices: [
      {
        id: "transparent",
        title: "公开上游与数据政策",
        detail: "资金 −6，可靠性 +8，信誉 +12",
        deltas: { cash: -6, reliability: 8, reputation: 12 },
      },
      {
        id: "licensed",
        title: "购买可训练的任务样本",
        detail: "资金 −14，授权样本 +14",
        deltas: { cash: -14, samples: 14 },
      },
    ],
  },
  {
    id: "blind-test",
    title: "榜单第一，用户体感第几？",
    basis: "虚构行业事件",
    sourceIds: ["glm"],
    text: "漂亮的榜单数字和真实用户的长任务反馈并不一致。只靠宣传，留存不会自己长出来。",
    choices: [
      {
        id: "evaluate",
        title: "邀请公开盲测",
        detail: "资金 −8，可靠性 +12，信誉 +8，预期 −8",
        deltas: { cash: -8, reliability: 12, reputation: 8, hype: -8 },
      },
      {
        id: "campaign",
        title: "追加宣传预算",
        detail: "资金 −8，社区 +15，预期 +18",
        deltas: { cash: -8, community: 15, hype: 18 },
      },
    ],
  },
  {
    id: "compute-sharing",
    title: "推理很热闹，训练在排队",
    basis: "虚构行业事件",
    sourceIds: ["deepseek", "resetDocs"],
    text: "同一座机房既要训练新模型，也要服务老用户。运营方向决定这一季把资源花在哪里。",
    choices: [
      {
        id: "serve",
        title: "先保证服务质量",
        detail: "资金 −8，可靠性 +10，社区 +8",
        deltas: { cash: -8, reliability: 10, community: 8 },
      },
      {
        id: "train",
        title: "给研究团队临时加卡",
        detail: "能力 +5，社区 −8",
        deltas: { capability: 5, community: -8 },
      },
    ],
  },
];
export const industryEvent = (id: string) => AI_INDUSTRY_EVENTS.find((e) => e.id === id)!;
export const initialIndustry = (company: AiCompanyId): AiIndustry => ({
  company,
  service: "balanced",
  reliability: 65,
  video: 0,
  videoOpen: false,
  ecosystem: 0,
  hype: 10,
  scrutiny: 0,
  defense: company === "anthropic" ? 2 : 0,
  teacher: company === "qwen" ? "meta" : "qwen",
  distillTeacher: company === "qwen" ? "meta" : "qwen",
  route: false,
  licensedData: false,
  samples: 0,
  eventId: AI_INDUSTRY_EVENTS.find((e) => e.company === company)!.id,
  eventResolved: false,
  seenEvents: [],
  eventChoice: "",
  promotion: false,
  statement: aiCompany(company).slogan,
  lastIncome: 0,
  lastCosts: 0,
});
