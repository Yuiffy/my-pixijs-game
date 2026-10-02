import type { BubbleKind } from "./dialogueTypes";

// 手机里真正“发出来”的消息：一条消息事件拆成多个气泡，群聊带发言人
// 文本里的占位符：{name} 玩家名字，{partner} 对象名字，{child} 孩子称呼
export interface MessageSpec {
  kind: BubbleKind;
  text: string;
  meta?: string;
  speaker?: string;
}

const t = (text: string, speaker?: string): MessageSpec => ({ kind: "text", text, speaker });
const sticker = (text: string, speaker?: string): MessageSpec => ({ kind: "sticker", text, speaker });
const image = (meta: string, speaker?: string): MessageSpec => ({ kind: "image", text: "", meta, speaker });
const link = (meta: string, speaker?: string): MessageSpec => ({ kind: "link", text: "", meta, speaker });
const voice = (seconds: number, text: string): MessageSpec => ({ kind: "voice", text, meta: `${seconds}″` });
const call = (meta: string): MessageSpec => ({ kind: "call", text: "", meta });
const system = (text: string): MessageSpec => ({ kind: "system", text });
const card = (): MessageSpec => ({ kind: "card", text: "" });
const transfer = (meta: string): MessageSpec => ({ kind: "transfer", text: "", meta });
const moment = (meta: string): MessageSpec => ({ kind: "moment", text: "", meta });

// Daily alternatives keep the same underlying decision, with different social contexts.
const DAILY_INCOMING: Record<string, MessageSpec[][]> = {
  "boss-ping": [
    [t("客户刚补了两条意见", "王总"), t("先别关电脑，看看今晚能不能改完", "王总")],
    [t("演示时间提前到明早了", "王总"), t("@{name} 麻烦把你那部分再过一遍", "王总")],
    [t("我知道快下班了", "王总"), t("但这张表今晚要发出去，谁能顶一下？", "王总")],
    [link("验收问题清单.xlsx", "王总"), t("标黄的几项今天收一下尾", "王总")],
    [t("刚才会上说的方向有变化", "王总"), t("先做个简单版，明早给客户看", "王总")],
    [t("线上出了个小问题", "同事小林"), t("@{name} 你方便帮我一起看看吗？", "同事小林")],
    [t("这周大家都辛苦了", "王总"), t("最后再补一页总结，今晚能给到吗？", "王总")],
  ],
  "mom-meet": [
    [card(), t("今天买菜碰见刘阿姨，聊起她家亲戚"), t("你先加上，别有压力")],
    [t("我知道你最近忙"), card(), t("就当认识个朋友，有空回一下")],
    [card(), t("人家也喜欢在家做饭"), t("这不是跟你挺聊得来嘛")],
    [t("周末是不是休息？"), card(), t("你爸让我先问问你，别直接替你答应")],
    [card(), t("条件是其次，我听着人挺实在"), t("你自己聊聊看")],
  ],
  "mom-compare": [
    [t("小区里又办喜事啦", "大姨"), image("婚礼合照", "大姨"), t("喜糖给你留了一包", "妈妈")],
    [t("你表哥周末要带人回家", "妈妈"), t("@{name} 你那边怎么样了", "二舅")],
    [t("同事的孩子跟你同岁，刚领证", "爸爸"), t("大家节奏不一样，先吃饭", "妈妈")],
    [t("过年这桌都快坐不下啦", "三姑"), t("就差你带个人回来", "三姑")],
    [t("小周的喜帖寄到了", "妈妈"), t("有空你给人家回个话", "爸爸")],
  ],
  "mom-encourage": [
    [t("妈不是催你"), t("但你总说忙，什么时候才不忙呢")],
    [t("上次聊天感觉怎么样？"), t("不要光回嗯嗯，问问人家")],
    [t("我看天气不错"), t("不然约出来走走？总对着手机也不行")],
    [t("你爸说让我别老问"), t("我就问一句，你们还在联系吗")],
    [t("人家也有工作，不回消息可能是在忙"), t("但你有空也主动说一句")],
  ],
  "mom-marriage": [
    [t("今年回家你们一起回来吗？"), t("亲戚都在问，我不知道怎么说"), call("对方已取消")],
    [t("你爸嘴上不说，其实也惦记"), voice(26, "不是一定要你现在结婚，就是想知道你们有没有好好商量过")],
    [t("隔壁在订婚宴，我想起你们了"), t("你有空给我回个电话")],
    [voice(32, "你们的事你们决定，但总得有个打算吧，妈不想一直猜"), t("忙完给妈回个电话")],
    [t("我已经跟阿姨说别再介绍了"), t("你们这边是认真的吧？")],
  ],
  "mom-listen": [
    [t("刚才看天气预报，说你那边降温"), t("带外套了没？")],
    [t("中午做了你爱吃的菜"), image("家里的饭菜"), t("你今天吃的什么")],
    [t("最近电话里听你声音没什么精神"), t("有事不用一个人扛")],
    [t("没别的事"), t("就是看到你小时候的照片，想听听你声音")],
    [voice(18, "忙就晚点回，妈今天学会用手机买菜了，想跟你说一声")],
  ],
  "candidate-home": [
    [t("我已经到家了，烧了壶水"), t("你走到哪儿了？")],
    [t("你那边雨还大吗？"), t("到家再回我也行")],
    [t("今天是不是又拖到很晚"), t("回去记得吃点热的")],
    [t("路上看到一家亮着灯的小店，想起你说的那家"), t("你下班了吗？")],
    [t("晚上想跟你说件小事"), t("你到家了叫我，不着急")],
  ],
  "partner-dinner": [
    [t("我能比你早到家十分钟"), t("一起做，还是点外卖？")],
    [t("冰箱还有昨天买的菜"), t("你今天累不累？")],
    [t("下班了没，我还在车上"), t("晚饭我们怎么解决")],
    [image("冰箱里的菜"), t("今天的库存。要不要一起做？")],
  ],
  "partner-kid": [
    [t("老师说孩子有点发烧"), t("你能先去接一下吗？我这边走不开")],
    [t("学校刚打电话，说不太舒服"), t("我们怎么分一下，谁去接谁买药？")],
    [t("孩子在保健室等着"), t("别着急，老师陪着。我们谁先过去？")],
  ],
  "mom-baby": [
    [t("我把以前的小衣服整理出来了"), t("你们什么时候能用上呀")],
    [t("你爸最近身体还行"), t("趁我们还能帮忙，你们考虑考虑")],
    [t("妈知道养孩子费心"), t("你们有什么顾虑，也可以跟我们说")],
  ],
  "child-update": [
    [t("今晚又要晚点了"), t("你们先吃，不用等我电话")],
    [t("最近事情有点多"), t("周末我找时间回去")],
    [t("今天总算下班早一点"), t("你们最近身体怎么样？")],
  ],
};

// 收到的消息：每类有几种写法，按局面哈希挑一种
export const INCOMING: Record<string, MessageSpec[][]> = {
  "mom-meet": [
    [card(), t("看看"), t("看看"), t("看看")],
    [t("在吗"), card(), t("王阿姨介绍的，人家条件不错"), t("周六见一面？就喝杯咖啡")],
    [card(), t("这个你看看，照片挺精神的"), t("周末有空吗")],
  ],
  "mom-compare": [
    [image("满月酒现场", "大姨"), t("@{name} 什么时候让我们也喝上你的喜酒呀", "大姨"), sticker("[呲牙]", "表姐")],
    [link("《三十岁前必须想清楚的五件事》", "二舅"), t("都看看，写得挺好", "妈妈")],
    [t("隔壁王阿姨家的闺女，二胎都上幼儿园了", "大姨"), t("@{name} 你呢？", "大姨")],
  ],
  "mom-encourage": [
    [t("人家回你消息了没？"), t("你多给人家发发消息"), t("主动点！别端着")],
    [t("年轻人要主动"), t("别老等人家找你")],
  ],
  "mom-next": [
    [t("那个不行"), t("妈再给你找，王阿姨那边还有好几个")],
    [t("这个我看算了"), t("下周妈再帮你问问")],
  ],
  "mom-marriage": [
    [call("对方已取消"), call("对方已取消"), t("接电话！")],
    [voice(47, "你们谈了这么久，到底什么时候定下来？你爸也在问"), call("对方已取消")],
  ],
  "mom-baby": [
    [t("我和你爸还能帮你们带"), t("再过几年我们就带不动了")],
    [t("楼下刘阿姨的外孙都会走路了"), t("你们有没有打算？")],
  ],
  "mom-education": [
    [image("奥数班报名表"), t("楼下的孩子都报了"), t("要不要给孩子也报一个？")],
    [link("《小学三年级是分水岭》"), t("你看看，妈觉得说得对")],
  ],
  "mom-support": [
    [t("妈给你转了点钱"), transfer("转账给你"), t("别省着")],
    [transfer("转账给你"), t("收下，家里不缺这点")],
  ],
  "mom-listen": [
    [voice(12, "没事，就是想问问你最近累不累")],
    [t("最近累不累？"), t("吃饭了没？")],
    [t("天冷了，记得穿厚点"), t("最近还好吗")],
  ],
  "boss-ping": [
    [t("@{name} 客户那边又改了", "王总"), t("今天能出一版吗？", "王总")],
    [link("需求变更 v7.docx", "王总"), t("@{name} 这个今天能加一下吗", "王总")],
    [t("@{name} 下午有空来会议室一下", "王总")],
  ],
  "family-care": [
    [t("外婆住院了，今天下午复查", "舅舅"), image("检查单", "舅舅"), t("大家别太担心，医生说问题不大", "妈妈")],
  ],
  landlord: [
    [t("你好，下季度租金要调整一下哈"), t("周边都涨了，我这边涨得不多")],
  ],
  "candidate-share": [
    [image("午饭"), t("今天食堂居然有红烧肉")],
    [t("今天地铁上看到一只超胖的猫"), image("一只橘猫")],
    [link("分享单曲 ·《晴天》"), t("这首最近单曲循环")],
  ],
  "candidate-moments": [
    [moment("{partner} 更新了朋友圈 · 9 张照片")],
  ],
  "candidate-home": [
    [t("下班了吗？"), t("到家说一声")],
    [t("今天降温"), t("路上小心"), sticker("[抱抱]")],
  ],
  "partner-dinner": [
    [t("今晚吃什么？"), t("谁做饭"), sticker("[疑问]")],
    [image("冰箱里只剩两个鸡蛋"), t("怎么办")],
  ],
  "partner-kid": [
    [t("学校刚打电话"), t("说孩子有点发烧"), t("你那边能走开吗？")],
  ],
  "sisters-brag": [
    [image("小视频 0:15", "张姐"), t("我家孙子会叫奶奶了！", "张姐"), sticker("[强]", "李姐")],
    [t("我家闺女下个月办酒，大家都来啊！", "李姐"), sticker("[玫瑰]", "张姐")],
  ],
  matchmaker: [
    [t("那边家里问你家孩子的情况"), t("工作、收入、有没有房，方便说说吗？")],
  ],
  "child-update": [
    [t("这周有点忙"), t("晚点回你")],
  ],
};

export interface ReplyScript {
  mine: MessageSpec[];
  answer: MessageSpec[];
}

const r = (mine: MessageSpec[], answer: MessageSpec[] = []): ReplyScript => ({ mine, answer });

// 我的回复（真正发出去的内容）和对方的回应，键为 “消息类型.回复 id”
export const OUTGOING: Record<string, ReplyScript> = {
  "mom-meet.ok": r([t("好，我看看时间")], [sticker("[呲牙]"), t("那我跟王阿姨说了啊")]),
  "mom-meet.emoji": r([sticker("[收到]")], [t("就一个表情？")]),
  "mom-meet.boundary": r([t("妈，见不见我自己安排，你别替我约了")], [t("行行行，妈不管了")]),
  "mom-compare.calm": r([t("各家有各家的节奏，我这边挺好的")], [sticker("[OK]", "大姨")]),
  "mom-compare.mute": r([system("已开启消息免打扰")]),
  "mom-compare.sorry": r([t("知道了知道了")], [t("这就对了", "大姨"), sticker("[强]", "大姨")]),
  "mom-encourage.ok": r([t("嗯，我有分寸")], [sticker("[强]")]),
  "mom-encourage.boundary": r([t("妈，我们的节奏我们自己定")], [t("好，妈不说了")]),
  "mom-next.ok": r([t("行，先看看吧")], [t("这就对了")]),
  "mom-next.boundary": r([t("别急，我想自己认识")], [t("那你抓点紧")]),
  "mom-marriage.answer": r([call("通话时长 06:12")], [t("你自己心里有数就行")]),
  "mom-marriage.text": r([t("现在不方便接，晚点跟你说")], [t("好，到家打给我")]),
  "mom-baby.answer": r([t("谢谢妈，但这是我们俩的决定")], [t("妈就是问问")]),
  "mom-baby.later": r([t("再说吧")], [sticker("[叹气]")]),
  "mom-education.decline": r([t("先让孩子歇一歇吧，最近太累了")], [t("那好吧")]),
  "mom-education.consider": r([t("我问问孩子想不想学")], [t("好，你问问")]),
  "mom-support.accept": r([system("你已收款"), t("谢谢妈，我会好好规划的")], [sticker("[抱抱]")]),
  "mom-support.enough": r([system("你已收款"), t("谢谢妈，以后真的不用再给了，我们够用")], [t("给你你就拿着")]),
  "mom-listen.open": r([call("语音通话 20:35")], [t("别太累了，有事跟妈说")]),
  "mom-listen.fine": r([t("挺好的，别担心")], [sticker("[抱抱]")]),
  "boss-ping.take": r([t("收到，今晚出一版")], [t("辛苦", "王总")]),
  "boss-ping.decline": r([t("今天有安排，明天上午给您可以吗？")], [t("行，明早十点前", "王总")]),
  "family-care.call": r([call("语音通话 08:40")], [t("外婆说没事，让你安心上班", "舅舅")]),
  "family-care.text": r([t("外婆怎么样了？我下班给她打视频")], [t("好，晚上八点", "舅舅")]),
  "landlord.accept": r([t("好的，知道了")], [t("好嘞，谢谢理解")]),
  "landlord.negotiate": r([t("能不能少涨一点？我一直按时交租的")], [t("那就少涨两百吧")]),
  "candidate-share.now": r([image("我的午饭"), t("我这边是黄焖鸡")], [t("哈哈哈看起来也不错")]),
  "candidate-share.later": r([t("刚下班！看到你的照片了，看起来好好吃")], [t("下次带你去那家")]),
  "candidate-moments.look": r([system("你翻看了对方的朋友圈")]),
  "candidate-moments.like": r([system("你赞了对方的朋友圈，还评论了一句")], [t("你也喜欢这个？")]),
  "candidate-home.reply": r([t("刚出地铁，到家跟你说"), t("到啦")], [sticker("[好的]")]),
  "candidate-home.call": r([call("语音通话 10:02")], [t("路上小心，晚安")]),
  "partner-dinner.together": r([t("一起去买菜吧，我下班在菜市场门口等你")], [t("好！")]),
  "partner-dinner.takeout": r([t("都累了，点个外卖吧")], [t("我要那家麻辣烫")]),
  "partner-kid.leave": r([t("我请假去接")], [t("辛苦了，路上慢点")]),
  "partner-kid.split": r([t("你先去，我下班去买药")], [t("好，药店在学校对面")]),
  "sisters-brag.forward": r([system("你把视频转发给了{child}")]),
  "sisters-brag.smile": r([sticker("[强]")]),
  "sisters-brag.own": r([t("各家有各家的日子，我家孩子有自己的安排")], [t("那倒也是", "李姐")]),
  "matchmaker.brag": r([t("我家孩子工作稳定，人也踏实，收入也不错")], [t("那我跟那边说说")]),
  "matchmaker.honest": r([t("成不成让孩子自己决定吧，我们不替他们做主")], [t("也是，现在的年轻人有主意")]),
  "child-update.care": r([t("早点休息，别太累")], [t("嗯嗯，你也是")]),
  "child-update.nag": r([t("那周末见面的事呢？")], [t("……在忙")]),
};

export const OUTGOING_VARIANTS: Record<string, ReplyScript[]> = {
  "boss-ping.take": [
    r([t("我先把手头这件收尾，今晚给您更新进度")], [t("好，有卡点及时说", "王总")]),
    r([t("收到，我今晚处理。其他需求麻烦先别再加了")], [t("可以，先把这件做完", "王总")]),
    r([t("我看过了，今晚能给到")], [t("谢谢，明早我们一起过", "王总")]),
  ],
  "boss-ping.decline": [
    r([t("今天下班后有安排，明早我先处理这个")], [t("好，给我一个明确时间", "王总")]),
    r([t("今晚做不完，明早十点前给您，质量会稳一点")], [t("那按这个时间来", "王总")]),
    r([t("我现在得先处理手头这件，明早交可以吗？")], [t("可以，别漏了", "王总")]),
  ],
  "mom-encourage.boundary": [
    r([t("我有在认真认识，你不用每天替我们着急")], [t("好，妈尽量少问")]),
    r([t("有进展会跟你说，现在让我自己慢慢了解吧")], [t("那你别什么都憋着")]),
    r([t("我们自己商量节奏，有消息我会告诉你")], [t("好，我先不问了")]),
  ],
  "mom-meet.boundary": [
    r([t("名片我收到了，但时间请先让我自己约")], [t("行，你别忘了回人家")]),
    r([t("谢谢妈，不过见面之前我想先聊聊")], [t("也好，你自己看看")]),
    r([t("不要先替我答应，好不好？我会认真考虑")], [t("知道了，下次先问你")]),
  ],
  "mom-listen.fine": [
    r([t("有一点累，吃过饭歇会儿就好")], [t("嗯，别熬得太晚")]),
    r([t("我挺好的，你和爸也照顾好自己")], [t("家里都好，你安心")]),
    r([t("看到你的消息舒服多了，没事，别担心")], [t("那就好，有事就说")]),
  ],
  "mom-baby.answer": [
    r([t("知道你是关心，但这件事我们想准备好了再决定")], [t("嗯，你们好好商量")]),
    r([t("谢谢你愿意帮，但生活还是得我们自己承担")], [t("妈就是想帮一点")]),
    r([t("我们会认真考虑，也希望你尊重最后的决定")], [t("好，有什么想法跟我们说")]),
  ],
  "landlord.negotiate": [
    r([t("我一直按时交租，也打算继续住。价格能再商量一下吗？")], [t("老租客了，可以少涨一些")]),
    r([t("这次调整有点超预算，能不能给个长期租的价格？")], [t("行，我们按少一点的算")]),
    r([t("房子我挺爱惜的，能不能别涨这么多？")], [t("那给你让一点")]),
  ],
};

for (const [kind, variants] of Object.entries(DAILY_INCOMING)) INCOMING[kind].push(...variants);

// 没回的消息：对方追问一句（对象、房东不追问），再标一个“已读未回”
export const IGNORED_FOLLOWUP: Record<string, MessageSpec[]> = {
  mom: [t("？"), t("人呢")],
  "family-group": [t("@{name} 在忙吗", "舅舅")],
  boss: [t("@{name} ？", "王总")],
  partner: [t("？")],
  child: [],
  sisters: [],
  matchmaker: [t("在吗？那边还等着回话呢")],
};

// 会话列表里的预览：非文字内容用微信式的方括号标记，群聊带发言人
export function previewOf(spec: MessageSpec) {
  const body = {
    text: spec.text,
    sticker: "[动画表情]",
    image: "[图片]",
    link: `[链接] ${spec.meta ?? ""}`,
    voice: "[语音]",
    call: "[语音通话]",
    system: spec.text,
    card: "[个人名片]",
    transfer: "[转账]",
    moment: "[朋友圈]",
  }[spec.kind];
  return spec.speaker ? `${spec.speaker}：${body}` : body;
}

export function fillNames(text: string, names: { name: string; partner: string; child: string }) {
  return text.replaceAll("{name}", names.name).replaceAll("{partner}", names.partner).replaceAll("{child}", names.child);
}
