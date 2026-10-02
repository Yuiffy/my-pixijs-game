import { ACTIVITIES } from "../activities";
import { hashKey } from "../inbox";
import type { MarriageGameState } from "../types";
import type { MessageSpec } from "./chatScripts";

// A seeded deck, not a reroll on render. Every entry is visited before repeating.
export function dailyPick<T>(pool: readonly T[], seed: number, turn: number, key: string): T {
  const deck = pool.map((value, index) => ({ value, order: hashKey(seed, key, index) }))
    .sort((a, b) => a.order - b.order);
  return deck[(Math.max(1, turn) - 1) % deck.length].value;
}

export interface DailyStory {
  id: string;
  incoming: string[];
  picture?: string;
  reply: string;
  answer: string;
  question: string;
  detail: string;
  followup: string;
}

export const DAILY_STORIES: readonly DailyStory[] = [
  { id: "lunch", incoming: ["今天食堂居然有红烧肉", "我排到最后一份，运气用在这儿了"], picture: "午饭 · 红烧肉", reply: "这份看着真不错，我刚才差点忙忘了吃饭。", answer: "先去吃！工作又不会自己跑掉。", question: "你平时也喜欢找好吃的吗？", detail: "会记一些小店，但收藏夹总比真的去过的多。一个人点菜也有点难。", followup: "那下次挑一家，我们一人点一道，踩雷也一起承担。" },
  { id: "cat", incoming: ["楼下的猫又占着门禁不让人进", "保安给它让了个座，现在像在上班"], picture: "楼下值班的橘猫", reply: "它才是这栋楼真正的领导吧。今天值班辛苦了。", answer: "而且它不用写周报，真的羡慕。", question: "你后来进去了吗，还是被猫扣下了？", detail: "蹲着陪它待了五分钟。很奇怪，刚才还觉得烦的事，好像就没那么大了。", followup: "有这种小小的喘气时间挺好的。下次帮我也跟它打个招呼。" },
  { id: "music", incoming: ["耳机随机放到以前常听的歌", "突然想起刚毕业那年坐末班车的路"], reply: "歌名发我？我下班路上也听听。", answer: "发你了。别开太大声，路上还是看着车。", question: "那时候的你在想什么？", detail: "想着等工作稳定就去旅行。结果稳定这两个字，一等就等到了现在。", followup: "也许不用等一个特别完美的时间，先从附近的地方开始。" },
  { id: "bakery", incoming: ["路过一家面包店，出炉的味道太香了", "本来只想买一个，出来拎了一袋"], picture: "刚出炉的面包", reply: "懂，空着肚子路过面包店根本没有胜算。", answer: "现在我负责给办公室分赃。", question: "最后最好吃的是哪个？", detail: "最普通的盐面包。热的时候很香，复杂的那些反倒没记住。", followup: "记住了，简单但刚刚好的那种。" },
  { id: "commute", incoming: ["今天提前一站下了车", "发现路边有条以前没走过的小巷"], picture: "下班路上的小巷", reply: "像给重复的一天偷偷开了个支线。", answer: "对！虽然只是多走了十分钟。", question: "小巷里有什么？", detail: "有家修鞋摊，老板一边听收音机一边干活。突然觉得不用什么都赶着来。", followup: "下次散步你带路吧，我也想看看。" },
  { id: "meeting", incoming: ["开完会了，脑袋还是嗡嗡的", "刚把水倒进杯子，才发现杯子里还有咖啡"], reply: "今天消耗太大了。先喝口新的，我听着。", answer: "谢谢，能吐槽一句就舒服多了。", question: "是方案又改了，还是大家意见太多？", detail: "每个人都说随便，做完又都说不是这个意思。有时候真不知道该听谁的。", followup: "听起来累的不是做事，是一直猜别人想要什么。" },
  { id: "book", incoming: ["在旧书里翻到一张好久以前的车票", "看书没看进去，回忆倒跑出来一堆"], reply: "这种小东西比照片还容易让人想起当时。", answer: "是，连那天买的难吃饭团都想起来了。", question: "那张车票是去哪儿的？", detail: "一个人去邻市看展。出发前纠结很久，到了以后反而特别自在。", followup: "听起来是一次属于你自己的小冒险。" },
  { id: "plant", incoming: ["窗台那盆快被我养死的植物发新芽了", "看来它比我乐观"], picture: "窗台的新芽", reply: "它在用自己的方式说，还可以再试试。", answer: "明天给它转个能晒太阳的位置。", question: "你养它多久了？", detail: "搬家时买的。住在租来的房子里，也想留一点慢慢变好的东西。", followup: "我喜欢这个想法。家也许就是这样一点点长出来的。" },
  { id: "cooking", incoming: ["按教程做了个菜", "教程二十分钟，我把厨房收拾完已经一小时了"], picture: "第一次做的晚饭", reply: "做饭五分钟，收拾半辈子。味道怎么样？", answer: "卖相一般，但热乎的，总比凑合吃强。", question: "你做饭是为了省钱还是放松？", detail: "主要是想有一件事能自己决定，从切菜到最后吃完都算数。", followup: "那下次你掌勺，我负责洗碗，这部分我可以决定。" },
  { id: "weekend", incoming: ["同事问我周末安排", "我差点把睡到自然醒说成一个重大项目"], reply: "这项目值得立项，还得保护好排期。", answer: "对，拒绝一切临时加需求。", question: "如果真有一整天自己的时间，你想怎么过？", detail: "先好好睡，再找个有阳光的地方坐坐。不做攻略也不打卡。", followup: "那见面也不用安排太满，找个舒服的地方就够了。" },
  { id: "umbrella", incoming: ["出门还晴着，回来就下雨了", "跟两个陌生人在屋檐下互相看天"], reply: "先别急着跑，找个不被风吹到的地方。", answer: "已经躲进便利店了，顺便买了瓶热饮。", question: "后来雨停了吗？", detail: "小了些。店员借了把伞，说下次路过再还就好。被这种小事照顾到，挺暖的。", followup: "下次还伞的时候，也可以跟店员说一句今天这句话。" },
  { id: "photo", incoming: ["今天的晚霞很好看", "拍出来又变得普通了，只好用眼睛存档"], picture: "下班时的晚霞", reply: "我这边也能看到一点。算是远程一起看了。", answer: "这样说还挺好的，两个人各有一个窗口。", question: "你喜欢特地出去看风景吗？", detail: "喜欢，但不一定要去很远。能有人一起慢下来看看就行。", followup: "下次见面我们留一点没有安排的时间。" },
  { id: "delivery", incoming: ["快递到了，拆开是自己上周买的袜子", "竟然有一点收到礼物的快乐"], reply: "过去的你给今天的你准备了一个小惊喜。", answer: "这个解释我接受了，虽然只有三双袜子。", question: "最近还做了什么让自己开心的小事？", detail: "换了床单，清空了一个抽屉。没解决人生问题，但睡觉的时候舒服了。", followup: "不用每件事都解决人生问题，舒服一点就很值得。" },
  { id: "bus", incoming: ["公交司机看见有人跑着来，多等了十秒", "车里没人催，突然觉得今天也不算太坏"], reply: "有时候被等一下，真的会松一口气。", answer: "嗯，尤其是已经很努力在赶路的时候。", question: "你平时是总怕迟到的那种人吗？", detail: "是，连回消息晚一点都会先解释半天。其实有时只是想放空一下。", followup: "那在我这儿可以不用每次都解释，想歇就歇一会儿。" },
  { id: "coffee", incoming: ["点咖啡忘了说少糖", "现在精神和血糖一起起飞"], reply: "喝一半留一半？今天也不用什么都硬撑着喝完。", answer: "好，已经去接白水了。", question: "你平时喜欢喝什么？", detail: "其实更喜欢茶，点咖啡是办公室大家都点。偶尔也想别总跟着别人选。", followup: "下次见面你挑地方吧，喝茶也很好。" },
  { id: "repair", incoming: ["坏了很久的小台灯终于修好了", "比买新的还开心，不知道为什么"], reply: "可能因为这次没有直接放弃它吧。", answer: "是哦，而且陪我搬过两次家了。", question: "它对你有什么特别的吗？", detail: "第一份工资买的。东西不贵，但一开灯，就觉得这块地方是自己的。", followup: "我懂了，是那种让人安心的小东西。" },
];

export function candidateStory(state: Pick<MarriageGameState, "seed" | "turn" | "candidateId">) {
  return dailyPick(DAILY_STORIES, state.seed, state.turn, `candidate-${state.candidateId}`);
}

export function storyIncoming(state: Pick<MarriageGameState, "seed" | "turn" | "candidateId">): MessageSpec[] {
  const story = candidateStory(state);
  return [...(story.picture ? [{ kind: "image" as const, text: "", meta: story.picture }] : []), ...story.incoming.map(text => ({ kind: "text" as const, text }))];
}

export const MOMENT_POOLS = {
  classmate: ["第一次独立带项目，紧张得午饭没吃下。晚上补一碗面。", "婚礼照片收到了。最好笑的是两家人在停车场找车的那张。", "搬家最后一箱终于拆完。决定三个月内不再买杯子。", "今天请假陪爸妈做体检。小时候他们等我，现在换我等。", "养猫以后，所有闹钟都失去了意义。", "换了工作，重新开始认同事的脸。", "和老朋友打了两个小时电话，什么结论也没有，但很开心。", "周末一个人去看电影。片尾字幕亮着的时候多坐了一会儿。", "第一次跑完五公里，最后一公里全靠路边早餐店的香味。", "降薪换了离家近的岗位。还不知道对不对，先试着过。", "冰箱贴又添一块。旅行回来最难的是重新开始上班。", "下雨天整理相册，发现最怀念的都是当时嫌普通的日子。"],
  coworker: ["改了七版，最后采用第一版。下班。", "请大家不要在我端着饭的时候问一个简单的问题。", "准时下班这件事，今天做到了。", "同事给工位植物贴了个名字：需求永不枯萎。", "发版顺利。现在最想听见的提示音是微波炉叮一声。", "年假申请通过！光是看着日历就开心。", "出差酒店的窗外和办公室很像，一时没分清自己在哪。", "今天学会说：我手头还有一件事，你帮我排一下优先级。", "团建回来，比上班还累，明天申请静音。", "楼下新开的小店有热汤，冬天的午休有救了。", "带新人想起自己刚来的时候，也问过一样的问题。", "电脑关上了，脑子还没下班。出去走十分钟。"],
  aunt: ["广场舞换了新队形，前三遍把自己转晕了。", "做了一锅卤味，谁周末路过来拿一点。", "年轻人忙归忙，也要好好吃饭。", "学会手机挂号了，下次不用麻烦孩子。", "老姐妹说给孩子介绍对象，聊着聊着变成我们约旅游。", "今天的花开得好，拍给大家看看。", "菜市场老板送了把葱，说最近没看见我。", "看别人家热热闹闹的，也希望自家孩子过得舒心。", "翻到以前的合照，我们年轻的时候也挺时髦。", "换了副眼镜，原来手机字能这么清楚。", "和老伴去公园走了三圈，中途吵了两句，回来一起买菜。", "孩子说不用寄吃的，还是装了一小箱。"],
};

export function dailyMoments(state: MarriageGameState, candidate: { name: string; image: string; id: string } | null) {
  const story = candidateStory(state);
  const previousDate = [...state.dateLog].reverse().find(date => date.candidateId === state.candidateId && date.turn < state.turn);
  const remembered = previousDate && state.turn === previousDate.turn + 1;
  const memory = previousDate?.mood === "warm" ? "你还记得我随口说的小习惯。" : previousDate?.mood === "calm" ? "不赶行程的感觉真好。" : "";
  const candidateText = remembered
    ? `翻到上次一起${ACTIVITIES[previousDate.activity].title}的照片。${previousDate.liked ? "那天很开心，有些地方想再去一次。" : "记住的倒不是地方，是一起慢慢聊的那一会儿。"}${memory}`
    : story.incoming.join("。 ").replace(/。。/g, "。");
  const names = { classmate: "大学同学小周", coworker: "隔壁组的阿杰", aunt: "三姑" };
  return [
    ...(candidate && !state.matchClosed ? [{ id: "candidate", name: candidate.name, image: candidate.image, text: candidateText, picture: remembered ? "一起出门的随拍" : story.picture }] : []),
    ...Object.entries(MOMENT_POOLS).map(([id, pool]) => ({ id, name: names[id as keyof typeof names], image: null, text: dailyPick(pool, state.seed, state.turn, id), picture: undefined })),
  ];
}
