import type { VenueId } from "../activities";

// 场馆小互动：只影响气氛台词和合照说明，不改任何数值
export interface MiniOption {
  id: string;
  label: string;
  mood: "warm" | "fun" | "awkward" | "calm";
  line: string;
}

export interface VenueMini {
  prompt: string;
  greeting: string;
  options: MiniOption[];
  photo: string;
}

const warm = (id: string, label: string, line: string): MiniOption => ({ id, label, mood: "warm", line });
const fun = (id: string, label: string, line: string): MiniOption => ({ id, label, mood: "fun", line });
const awkward = (id: string, label: string, line: string): MiniOption => ({ id, label, mood: "awkward", line });
const calm = (id: string, label: string, line: string): MiniOption => ({ id, label, mood: "calm", line });

export const VENUE_MINIS: Record<VenueId, VenueMini> = {
  restaurant: { greeting: "“这家的小炒很地道，你看看想吃什么？”", prompt: "服务员递来菜单。", photo: "一桌家常菜", options: [warm("share", "点几个菜一起分着吃", "你们把最后一块排骨让来让去。"), calm("ask", "先问对方有没有忌口", "对方愣了一下，笑着说谢谢你问。"), awkward("expensive", "直接点店里最贵的招牌", "上菜后两个人都有点不自在。")] },
  hotpot: { greeting: "“鸳鸯锅？还是全红？”", prompt: "锅底要怎么点？", photo: "冒着热气的锅", options: [warm("yuanyang", "鸳鸯锅，各取所需", "一边清汤一边红油，谁也不用迁就谁。"), fun("spicy", "全红！挑战一下", "辣得两个人一直在喝豆奶。"), calm("follow", "听对方的", "对方认真地给你讲毛肚该涮几秒。")] },
  western: { greeting: "“这里好安静，感觉说话都要小声。”", prompt: "侍者来问要不要开一瓶酒。", photo: "烛光下的两杯饮料", options: [calm("water", "来两杯气泡水就好", "少了点仪式感，多了点轻松。"), warm("candle", "请侍者把蜡烛点上", "烛光里，你们聊到了小时候。"), awkward("steak", "研究了半天刀叉顺序", "两个人对着刀叉笑了出来。")] },
  cafe: { greeting: "“我先到啦，给你占了靠窗的位置。”", prompt: "要喝点什么？", photo: "两杯拉花咖啡", options: [calm("latte", "拿铁，和对方一样", "“原来你也喜欢这个。”"), fun("special", "点一杯没喝过的特调", "味道很奇怪，但成了今天的话题。"), warm("cake", "再加一块蛋糕分着吃", "对方把草莓留给了你。")] },
  riverside: { greeting: "“今天风好舒服。”", prompt: "沿着江边往哪边走？", photo: "江边的晚霞", options: [warm("sunset", "往西走，看晚霞", "晚霞烧了半边天，你们都没说话。"), calm("bridge", "走到桥下坐一会儿", "桥洞里有人在弹吉他。"), fun("snack", "先去买两根烤肠", "边走边吃，聊得更随意了。")] },
  museum: { greeting: "“这个特展我想看好久了。”", prompt: "从哪个展厅开始？", photo: "展厅里的背影", options: [calm("guide", "租一个语音导览", "你们一人一只耳机，一起听讲解。"), warm("follow", "跟着对方的节奏走", "对方在一幅画前站了很久，给你讲了它的故事。"), fun("guess", "互相猜展品是干嘛用的", "猜错得离谱，保安都笑了。")] },
  mall: { greeting: "“我想买件外套，帮我看看？”", prompt: "对方在试衣间里问你意见。", photo: "商场里的自拍", options: [warm("honest", "认真地给意见", "对方说你眼光还不错。"), fun("silly", "拿了一顶奇怪的帽子", "两个人在镜子前笑得直不起腰。"), awkward("pay", "抢着去付钱", "对方有点为难：“我自己来就好。”")] },
  boardgame: { greeting: "“这局《农场主》，规则有点多哦。”", prompt: "第一轮，你选择——", photo: "摆满木块的桌面", options: [fun("rush", "激进扩张，抢关键行动格", "对方被你抢了位置，发誓下一轮要报仇。"), warm("coop", "边玩边给对方讲规则", "对方很快就上手了，最后只差你两分。"), calm("slow", "稳扎稳打，慢慢攒资源", "你们在算分时一起发现了一个规则漏洞。")] },
  cinema: { greeting: "“爆米花要甜的还是咸的？”", prompt: "选哪部片？", photo: "两张电影票根", options: [fun("comedy", "喜剧片", "笑点一致，这很重要。"), warm("romance", "文艺片", "散场后你们聊了很久结局。"), awkward("horror", "恐怖片", "对方全程捂着眼睛，出来后有点生气。")] },
  nightmarket: { greeting: "“好香！先吃哪个？”", prompt: "夜市人很多。", photo: "夜市的灯串", options: [fun("try", "每家都买一点尝尝", "吃到最后都撑了。"), warm("hand", "人多，走近一点别走散", "你们挨着走完了整条街。"), calm("sit", "找个小摊坐下慢慢吃", "老板多送了一碗糖水。")] },
  catcafe: { greeting: "“你看那只橘猫！”", prompt: "一只猫跳到了桌上。", photo: "猫和你们两个", options: [warm("pet", "轻轻摸摸它", "猫在对方腿上睡着了。"), fun("toy", "拿逗猫棒逗它", "猫把逗猫棒叼走了。"), calm("watch", "安静地看它", "你们聊起了各自小时候养过的动物。")] },
  mountain: { greeting: "“说好了，谁先喊累谁请喝水。”", prompt: "山路有点陡。", photo: "山顶的风景", options: [warm("wait", "放慢，等等对方", "你们一起在半山腰歇了好久。"), fun("race", "比一比谁先到亭子", "到了亭子两个人都喘得说不出话。"), calm("chat", "边走边聊", "爬到山顶时，你们已经聊到了各自的家。")] },
  karting: { greeting: "“我可是会漂移的。”", prompt: "发车灯亮了！", photo: "终点线前的合影", options: [fun("race", "全力冲刺", "你们在最后一个弯道并排冲线。"), warm("follow", "跟在对方后面", "对方回头冲你比了个耶。"), awkward("crash", "太激动撞上了轮胎墙", "工作人员过来把你推了出来，对方笑了一路。")] },
  archery: { greeting: "“教练说，先别急着松手。”", prompt: "瞄准，放箭——", photo: "插满箭的靶子", options: [calm("focus", "慢慢瞄准", "正中黄心！对方给你鼓掌。"), warm("teach", "帮对方调整姿势", "对方下一箭射中了红圈。"), fun("rapid", "连射三箭", "三箭都在靶上，就是不太靠近中间。")] },
  comicon: { greeting: "“我今天一定要买到那本本子！”", prompt: "人山人海。", photo: "漫展的战利品", options: [fun("queue", "陪对方排限定周边", "排了四十分钟，终于买到了。"), warm("cos", "一起和喜欢的 Coser 合影", "对方开心得在原地转圈。"), awkward("lost", "被人流冲散了", "找到彼此时，你们都松了口气。")] },
  livehouse: { greeting: "“这支乐队现场特别燃！”", prompt: "音乐响起。", photo: "舞台前的荧光", options: [fun("jump", "跟着人群跳", "散场后耳朵嗡嗡的，心里很痛快。"), warm("back", "站在后面，护着对方", "对方回头冲你笑了一下。"), calm("bar", "去吧台喝杯东西聊聊", "隔着音乐，你们只能靠得很近说话。")] },
  kitchen: { greeting: "“今天我掌勺，你打下手！”", prompt: "要做什么菜？", photo: "两个人做的一桌菜", options: [warm("home", "做对方家乡的菜", "对方尝了一口，眼睛亮了。"), fun("new", "挑战一道没做过的", "失败了，于是改成了番茄炒蛋。"), calm("easy", "简单的三菜一汤", "吃完一起洗碗，像已经在一起很久了。")] },
  trip: { greeting: "“海边的民宿，推开窗就能看到海。”", prompt: "第一天怎么安排？", photo: "海边的日落", options: [calm("slow", "什么都不做，在海边发呆", "你们在沙滩上坐到天黑。"), fun("explore", "租电动车环岛", "迷了两次路，也看到了不在攻略上的小海湾。"), warm("plan", "按对方做的攻略走", "攻略做得很细，你看出对方很用心。")] },
};

// 时机小游戏：按下时指针落在目标区即算命中；命中数只决定台词
export interface SkillRound {
  label: string;
  hint: string;
}

export interface SkillMini {
  title: string;
  rounds: SkillRound[];
  // 依次对应：几乎没中、中了一部分、全中
  results: [MiniOption, MiniOption, MiniOption];
}

export const VENUE_SKILLS: Partial<Record<VenueId, SkillMini>> = {
  karting: {
    title: "三个弯道",
    rounds: [
      { label: "第一个弯：发卡弯", hint: "指针进入绿区时刹车入弯" },
      { label: "第二个弯：连续 S 弯", hint: "这次节奏更快" },
      { label: "最后一个弯：冲线前", hint: "出弯就是终点" },
    ],
    results: [
      awkward("skill-spin", "连着两个弯都冲出了赛道", "你在轮胎墙边转了一圈，对方在终点笑得直拍方向盘。"),
      fun("skill-close", "有惊无险地跑完三个弯", "最后一个弯你们几乎并排，谁先冲线只有计时器知道。"),
      warm("skill-clean", "三个弯都切得干净利落", "摘下头盔，对方说：“下次换你教我走线。”"),
    ],
  },
  archery: {
    title: "瞄准、风向、松弦",
    rounds: [
      { label: "瞄准", hint: "把准星稳在黄心" },
      { label: "看风向", hint: "旗子往右飘，稍微往左修正" },
      { label: "松弦", hint: "呼气，在最稳的那一刻松手" },
    ],
    results: [
      awkward("skill-miss", "箭擦着靶边飞了出去", "教练过来帮你重新调姿势，对方在旁边偷偷录了像。"),
      fun("skill-red", "射中了红圈", "不算完美，但对方说你拉弓的样子挺像回事。"),
      warm("skill-gold", "正中黄心", "隔壁道的人都回头看，对方比你还激动。"),
    ],
  },
};

// 分步选择小互动：桌游放工人、爬山选配速、做饭分工；选项分“体贴/竞争”两种取向，只影响台词
export interface StepChoice {
  id: string;
  label: string;
  style: "care" | "push";
  line: string;
}

export interface StepMini {
  title: string;
  steps: { prompt: string; choices: [StepChoice, StepChoice] }[];
  // 体贴占多数 / 竞争占多数 / 各半
  results: { care: MiniOption; push: MiniOption; mixed: MiniOption };
}

const care = (id: string, label: string, line: string): StepChoice => ({ id, label, style: "care", line });
const push = (id: string, label: string, line: string): StepChoice => ({ id, label, style: "push", line });

export const VENUE_STEPS: Partial<Record<VenueId, StepMini>> = {
  boardgame: {
    title: "工人放置：三轮",
    steps: [
      { prompt: "第一轮：木材和石料只剩一个行动格。", choices: [care("wood-share", "把木材格让给对方", "对方眼睛一亮：“那我欠你一轮。”"), push("wood-take", "抢下木材格", "对方“啧”了一声，把工人往桌边推了推。")] },
      { prompt: "第二轮：对方的农田快满了，你可以帮忙或截胡。", choices: [care("farm-help", "交换资源，帮对方补上", "两个人的农场同时扩张，谁也不亏。"), push("farm-block", "截胡最后一块田", "对方笑着说：“记仇了啊。”")] },
      { prompt: "第三轮：结算前，你手上多了一张分数牌。", choices: [care("score-coop", "把规则漏洞告诉对方", "对方哈哈大笑：“你这人太老实了。”"), push("score-hide", "自己悄悄收着", "结算时你赢了一分，对方直呼下次不让你了。")] },
    ],
    results: {
      care: warm("steps-care", "合作打完这局", "收牌的时候，对方说：“和你玩不用算计，挺轻松的。”"),
      push: fun("steps-push", "全程竞争到底", "对方输得心服口服，还立刻约了下一局复仇。"),
      mixed: calm("steps-mixed", "有让有抢", "一局下来，你们都摸清了彼此的牌风。"),
    },
  },
  mountain: {
    title: "山路配速：三段",
    steps: [
      { prompt: "上山口：对方拿着登山杖，还在系鞋带。", choices: [care("pace-wait", "等对方一起出发", "对方说：“你先走也行，我追得上。”你还是等了。"), push("pace-go", "先冲一段热身", "你在前面回头喊，对方笑着追了上来。")] },
      { prompt: "半山腰：坡变陡，对方明显慢了下来。", choices: [care("pace-slow", "放慢半步，陪着走", "对方悄悄松了口气。"), push("pace-keep", "保持速度，边走边鼓励", "你喊着口号，对方喘着气回了你一句“闭嘴”。")] },
      { prompt: "最后一段台阶：山顶就在头顶。", choices: [care("pace-hand", "伸手拉一把", "对方犹豫了一下，握住了你的手。"), push("pace-race", "比谁先到亭子", "对方发力反超，最后你们同时喊出“我赢了”。")] },
    ],
    results: {
      care: warm("steps-care", "陪着对方走完全程", "山顶的风很大，对方靠在栏杆上说：“今天很舒服。”"),
      push: fun("steps-push", "一路较着劲上了山", "两个人瘫在亭子里，谁也不肯先认输。"),
      mixed: calm("steps-mixed", "快慢交替，节奏刚好", "下山时你们已经很默契，谁都不用再等谁。"),
    },
  },
  kitchen: {
    title: "厨房分工：三道菜",
    steps: [
      { prompt: "切菜：土豆丝和葱花，只有一块砧板。", choices: [care("cut-teach", "教对方怎么握刀", "对方切出来的土豆丝粗细不一，但很有成就感。"), push("cut-fast", "自己包揽，速度快", "你三分钟切完，对方站在一旁看得入神。")] },
      { prompt: "炒菜：火候需要有人盯着。", choices: [care("cook-swap", "轮流掌勺", "锅铲传来传去，谁也没糊。"), push("cook-boss", "我掌勺，你别插手", "对方在旁边递盘子，被你嘱咐了三次“小心烫”。")] },
      { prompt: "收尾：还剩一堆锅碗。", choices: [care("wash-both", "一起洗，边洗边聊", "泡沫溅到对方脸上，两个人都笑了。"), push("wash-rock", "石头剪刀布决定谁洗", "你输了，对方得意地擦着手。")] },
    ],
    results: {
      care: warm("steps-care", "全程一起动手", "饭菜的味道一般，气氛却很好。"),
      push: fun("steps-push", "各管一摊，效率极高", "四十分钟出了三菜一汤，对方直夸你专业。"),
      mixed: calm("steps-mixed", "有配合也有磨合", "厨房里有点乱，但饭很香。"),
    },
  },
};

// 根据每步的取向统计出结果
export function summarizeSteps(mini: StepMini, styles: Array<"care" | "push">): MiniOption {
  const cares = styles.filter(style => style === "care").length;
  const pushes = styles.length - cares;
  if (cares > pushes) return mini.results.care;
  if (pushes > cares) return mini.results.push;
  return mini.results.mixed;
}

// 吃饭类场馆：知道对方的忌口之后，点菜时多一个选项
const FOOD_VENUES = new Set<VenueId>(["restaurant", "hotpot", "western", "nightmarket", "kitchen"]);
const BOLD_TAGS = ["行动派", "目标清晰", "高压工作", "童心未泯"];
const GENTLE_TAGS = ["慢热", "情绪敏感", "理性沟通"];

// 根据已知信息和对方性格标签，调整场馆小互动的选项与台词
export function getVenueOptions(venue: VenueId, context: { knowsDislikes: boolean; tags: string[] }): MiniOption[] {
  const base = VENUE_MINIS[venue].options;
  if (venue === "boardgame") {
    const bold = context.tags.some(tag => BOLD_TAGS.includes(tag));
    const gentle = context.tags.some(tag => GENTLE_TAGS.includes(tag));
    return base.map(option => {
      if (option.id !== "rush") return option;
      if (bold) return fun("rush", option.label, "对方反而来了兴致：“这才有意思！”下一轮直接抢了你的位置。");
      if (gentle) return awkward("rush", option.label, "对方被抢了三次位置，嘴上说没事，出牌却慢了下来。");
      return option;
    });
  }
  if (FOOD_VENUES.has(venue) && context.knowsDislikes) {
    return [warm("remember", "点菜时避开对方提过不吃的东西", "对方看了一眼菜单，小声说：“你还记得啊。”"), ...base];
  }
  return base;
}

export const TOPIC_PROMPTS: Record<"everyday" | "listen" | "plans", { title: string; detail: string }> = {
  everyday: { title: "互相分享平时的生活", detail: "说说兴趣、工作和周末安排，看看聊不聊得来。" },
  listen: { title: "先听对方说最近怎么样", detail: "了解更多，气氛更轻松；也要给对方认识你的机会。" },
  plans: { title: "谈谈城市与婚育预期", detail: "认真确认未来有没有交集；了解太少时显得太急。" },
};
