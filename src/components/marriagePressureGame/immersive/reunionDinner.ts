import { hashKey } from "../inbox";
import type { MarriageGameState } from "../types";

// 年夜饭连环问：纯演出层，回答只影响台词，不改任何数值
export type ReunionTone = "honest" | "deflect" | "joke" | "silent";

export interface ReunionAnswer {
  id: Exclude<ReunionTone, "silent">;
  label: string;
  reply: string;
}

export interface ReunionQuestion {
  id: string;
  asker: string;
  text: string;
  answers: ReunionAnswer[];
  silence: string;
}

export const RELATIVES = ["大姨", "二舅", "表姐", "奶奶", "三姑", "姑父"] as const;

// 每道题的作答时间（毫秒）；开启“减少动态”时不计时
export const REUNION_SECONDS = 8;

type Pool = "single" | "dating" | "married" | "parenthood" | "parent" | "any";

interface QuestionSeed {
  pool: Pool;
  id: string;
  text: string;
  answers: [string, string, string];
  replies: [string, string, string];
  silence: string;
}

const SEEDS: QuestionSeed[] = [
  {
    pool: "single",
    id: "partner",
    text: "今年过年还是一个人回来的？有没有谈着呢？",
    answers: ["还没有，不急", "在接触，还早", "有啊，我和工作谈着呢"],
    replies: ["“女大不中留、男大不能等啊。”大家互相看了一眼。", "“那就好那就好，明年带回来看看。”", "桌上笑了一阵，话题暂时绕开了。"],
    silence: "你夹了一筷子菜。大姨替你答：“肯定在谈，不好意思说。”",
  },
  {
    pool: "single",
    id: "intro",
    text: "我单位有个小伙子/姑娘条件可好了，加个微信？",
    answers: ["谢谢，我先按自己的节奏", "那先加着，聊聊看", "您先把照片发群里我审一审"],
    replies: ["对方愣了一下，“行行行，你们年轻人有主意。”", "手机里多了一张名片，妈妈在旁边笑了。", "满桌人起哄，照片最后也没发出来。"],
    silence: "二维码已经怼到你面前，你只好先扫了。",
  },
  {
    pool: "dating",
    id: "when",
    text: "听说你谈了？什么时候办事啊？",
    answers: ["我们还在互相了解", "有计划了会第一个告诉你们", "等我中了彩票就办"],
    replies: ["“了解什么，处着处着就了解了。”妈妈替你打了个圆场。", "“那可说好了，红包我都准备好了。”", "大家笑着骂你没正形，话题跳去了房价。"],
    silence: "筷子停在半空，爸爸咳嗽一声，把鱼转到了你面前。",
  },
  {
    pool: "dating",
    id: "house",
    text: "对方家里是做什么的？有房吗？",
    answers: ["我更在意我们俩合不合得来", "在一个城市打拼，房子一起想办法", "有啊，他们家有一套乐高城堡"],
    replies: ["奶奶点点头：“两个人好好的比什么都强。”", "“一起打拼好，现在的年轻人不容易。”", "表弟笑喷了汤，二舅也没再追问。"],
    silence: "二舅自问自答地讲起了自家孩子的首付。",
  },
  {
    pool: "married",
    id: "baby",
    text: "结婚也有一阵了，什么时候要个孩子？",
    answers: ["这是我们俩商量的事", "条件准备好了再说", "先把猫养好再说"],
    replies: ["桌上安静了两秒，奶奶说：“对，你们自己定。”", "“别拖太久哦。”三姑还是补了一句。", "“猫又不能养老！”大家笑了，气氛没那么紧。"],
    silence: "伴侣在桌下轻轻碰了碰你的手，转头给奶奶夹菜。",
  },
  {
    pool: "married",
    id: "money",
    text: "你们俩一个月能攒多少？房贷压力大不大？",
    answers: ["够用，也在学着记账", "还在想办法，慢慢来", "攒的都是回忆"],
    replies: ["“会过日子就好。”姑父端起了酒杯。", "妈妈说：“需要帮忙就开口。”", "表姐笑着说这句话她要抄走发朋友圈。"],
    silence: "你低头剥虾，爸爸把话题拉到了今年的春晚。",
  },
  {
    pool: "parenthood",
    id: "school",
    text: "孩子报了几个班？我们家那个已经在学奥数了。",
    answers: ["先让孩子睡够觉", "报了一个，孩子自己喜欢的", "报了个干饭班，成绩很好"],
    replies: ["三姑撇撇嘴，奶奶却说：“孩子开心最重要。”", "“喜欢就好，别逼太紧。”", "孩子在旁边举手：“我干饭第一名！”全桌都笑了。"],
    silence: "孩子自己抢答：“我不想学奥数。”大人们都乐了。",
  },
  {
    pool: "parenthood",
    id: "second",
    text: "一个太孤单了，什么时候要老二？",
    answers: ["一个就挺好", "看我们的精力和收入吧", "等您帮我们带我就生"],
    replies: ["“也是，现在养一个都不容易。”", "大家点点头，没再追问。", "三姑一口酒呛住了，话题就此打住。"],
    silence: "你给孩子盛了碗汤，假装没听见。",
  },
  {
    pool: "parent",
    id: "child-partner",
    text: "你家孩子还没对象？我们家那个都二胎了。",
    answers: ["孩子有自己的节奏", "在接触了，别给孩子压力", "我们家那个在谈事业"],
    replies: ["三姑有点意外：“你现在倒是想得开。”", "“那就好，年轻人别催太紧。”", "桌上笑了一阵，你也跟着笑了。"],
    silence: "你喝了口茶，心里却把“二胎”记了下来。",
  },
  {
    pool: "parent",
    id: "child-money",
    text: "孩子在大城市一个月挣多少？给家里打钱吗？",
    answers: ["够孩子自己生活就好", "孩子挺努力的", "挣得比我多，花得比我快"],
    replies: ["奶奶说：“这话说得对。”", "“努力就好，身体要紧。”", "姑父拍着大腿笑：“我们家也一样！”"],
    silence: "你转开话题，问起了姑父的血压。",
  },
  {
    pool: "any",
    id: "salary",
    text: "今年年终奖发了多少？",
    answers: ["够过个好年", "今年大环境一般", "发了一箱橙子"],
    replies: ["“那就好。”二舅不再追问。", "大家叹了口气，开始讨论各自单位。", "奶奶认真地问：“橙子甜不甜？”"],
    silence: "你起身去厨房端饺子，顺利躲过这一题。",
  },
  {
    pool: "any",
    id: "hometown",
    text: "在外面那么辛苦，要不要考虑回老家考个编？",
    answers: ["我在那边过得还行", "考虑过，也在比较", "等我先考过驾照"],
    replies: ["“行，你自己觉得好就行。”", "爸爸说：“回来也好，爸妈在。”", "表姐笑出了声，大家都没再劝。"],
    silence: "妈妈替你说：“孩子有自己的打算。”",
  },
];

function poolFor(state: MarriageGameState): Pool {
  if (state.activeActor === "parent") return "parent";
  if (state.stage === "parenthood") return "parenthood";
  if (state.stage === "married") return "married";
  if (state.stage === "dating" || state.stage === "chatting") return "dating";
  return "single";
}

// 每年固定抽三道题：两道本阶段的，一道通用的，顺序由种子与回合决定
export function getReunionQuestions(state: MarriageGameState): ReunionQuestion[] {
  const pool = poolFor(state);
  const own = SEEDS.filter(seed => seed.pool === pool);
  const common = SEEDS.filter(seed => seed.pool === "any");
  const pick = <T, >(items: T[], ...key: Array<string | number>) => items[hashKey(state.seed, state.turn, ...key) % items.length];
  const first = pick(own, "a");
  const second = own.find(seed => seed !== first) ?? first;
  const third = pick(common, "c");
  const ordered = hashKey(state.seed, state.turn, "order") % 2 === 0 ? [first, third, second] : [first, second, third];
  return ordered.map((seed, index) => ({
    id: seed.id,
    asker: RELATIVES[hashKey(state.seed, state.turn, seed.id, index) % RELATIVES.length],
    text: seed.text,
    silence: seed.silence,
    answers: (["honest", "deflect", "joke"] as const).map((id, answerIndex) => ({ id, label: seed.answers[answerIndex], reply: seed.replies[answerIndex] })),
  }));
}

// 饭后总结：只看回答风格，不看对错
export function reunionSummary(tones: ReunionTone[]) {
  const count = (tone: ReunionTone) => tones.filter(item => item === tone).length;
  if (count("silent") >= 2) return "这顿饭你说得不多。回程的车上，妈妈发来一句：“亲戚就是随口一问，别往心里去。”";
  if (count("honest") >= 2) return "你把自己的想法说清楚了。有人不以为然，但奶奶偷偷塞给你一个红包：“你自己过得好就行。”";
  if (count("joke") >= 2) return "你用玩笑挡了一整晚。饭桌热热闹闹，至于真实的想法，只有你自己知道。";
  return "问题一轮接一轮，你有时认真、有时打哈哈。饺子吃完，这一年也就这样开始了。";
}
