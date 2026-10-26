export type Chapter = 0 | 1 | 2;
export type ObjectId = 'letter' | 'table' | 'clock' | 'desk' | 'cradle' | 'portrait' | 'door' | 'window';
export type Ending = 'air' | 'seat' | null;
export interface Memory { chapter: Chapter; object: ObjectId; title: string; text: string }
export interface GameState { version: 1; chapter: Chapter; interacted: ObjectId[]; memories: Memory[]; ending: Ending }
export interface Choice { id: string; label: string }
export interface Inspection { object: ObjectId; eyebrow: string; title: string; text: string[]; choices: Choice[] }

export const SAVE_KEY = 'remaining-seat-v1';
export const OBJECT_NAMES: Record<ObjectId, string> = {
  letter: '门边的家书',
table: '多出来的碗',
clock: '停住的挂钟',
desk: '亮着的工位',
  cradle: '红线摇篮',
portrait: '墙上的合照',
door: '里屋的门',
window: '蒙住的窗',
};
export const CHAPTERS = [
  { name: '留一双筷子', time: '廿九 · 23:47', line: '饭还温着。你的位置，一直留着。', required: ['letter', 'portrait', 'table'] },
  { name: '再等一个明天', time: '廿九 · 23:47', line: '有人替你热了饭。也替你排好了明天。', required: ['desk', 'clock', 'table'] },
  { name: '空着也可以', time: '廿九 · 23:47', line: '屋里并没有人哭。只有木头在轻轻摇。', required: ['cradle', 'portrait', 'letter'] },
] as const;

export function newGame(): GameState {
  return { version: 1, chapter: 0, interacted: [], memories: [], ending: null };
}

export function ready(state: GameState): boolean {
  return CHAPTERS[state.chapter].required.every(id => state.interacted.includes(id));
}

export function objective(state: GameState): string {
  if (state.ending) return '这一晚，结束了。';
  if (ready(state)) return state.chapter === 2 ? '窗边有风。桌边还有一个位置。' : '里屋的门闩，松开了。';
  const next = CHAPTERS[state.chapter].required.find(id => !state.interacted.includes(id));
  const hints: Partial<Record<ObjectId, string>> = {
    letter: state.chapter === 2 ? '门边那封信，露出了背面。' : '门边矮柜上，压着一封信。',
    portrait: '右边墙上的合照，好像少了什么。',
    table: '看看饭桌上，多出来的那只碗。',
    desk: '左边的工位，还亮着一盏灯。',
    clock: '左边墙上的挂钟，一直没有走。',
    cradle: '里屋右侧，红线一直绷着。',
  };
  return hints[next as ObjectId] || '慢慢走。看看屋里的东西。';
}

const read = [{ id: 'keep', label: '记住这件事' }];

export function inspect(state: GameState, object: ObjectId): Inspection {
  const { chapter } = state;
  const base = { object, eyebrow: `${['第一席', '第二席', '第三席'][chapter]} / ${OBJECT_NAMES[object]}` };
  if (object === 'door') {
    return { ...base,
title: ready(state) && chapter < 2 ? '里面又有人摆好了饭' : '门后没有脚步声',
      text: ready(state) && chapter < 2
        ? ['门闩自己退开了一点。', '你记得，这扇门后面应该是一间卧室。可碗筷的声音从里面传来。']
        : [chapter === 2 ? '这次，门后的声音和屋里的声音是同一个声音。' : '你碰了碰把手。里面有人把门轻轻抵住了。', objective(state)],
      choices: ready(state) && chapter < 2 ? [{ id: 'next', label: '推开里屋的门' }] : [{ id: 'close', label: '先回到屋里' }] };
  }
  if (object === 'window') {
    if (chapter === 2 && ready(state)) return { ...base,
title: '留一道缝',
text: [
      '封窗的胶带已经脆了。你只需要轻轻揭起一角。',
      '屋外没有答案。楼下的早点摊还没开，远处有第一班车驶过。',
      '这张桌子，今晚可以不用坐满。',
    ],
choices: [{ id: 'air', label: '打开窗，给自己留一点空气' }, { id: 'close', label: '再看一眼这间屋子' }] };
    return { ...base,
title: '雨停以前',
text: [
      chapter === 0 ? '窗上贴着去年的报纸。招聘栏被水汽洇成一片，看不清日期。' : '隔壁的灯一盏接一盏灭了。玻璃上映着你身后的空椅子。',
      chapter === 2 ? '窗扣上缠着一截红线。先去看看线的另一头。' : '窗扣很紧。你把手放在玻璃上，外面比屋里暖一点。',
    ],
choices: [{ id: 'keep', label: '把手收回来' }] };
  }
  if (object === 'table' && chapter === 2) return { ...base,
title: ready(state) ? '替明天坐下' : '还没到齐',
text: ready(state)
    ? ['每把椅子都朝向你。没有人命令你坐下。', '只要把那只空碗往前推一点，今晚就可以和昨晚一样。']
    : ['碗沿上，有几道很小的指印。没有饭。', '还有一些话，被藏在这间屋子里。'],
choices: ready(state)
    ? [{ id: 'seat', label: '把空碗摆正，坐回去' }, { id: 'close', label: '我再站一会儿' }]
    : [{ id: 'keep', label: '暂时不动它' }] };

  const stories: Record<Exclude<ObjectId, 'door' | 'window'>, { title: string; text: string[]; choices?: Choice[] }[]> = {
    letter: [
      { title: '钥匙还在老地方', text: ['小满：', '回来了就吃一点。汤在锅里，热一下就好。', '今年给你多摆了一副碗筷。带谁回来都行，不带也先放着。', '末尾的“不急”被反复描过，纸背都快破了。'] },
      { title: '另一张通知', text: ['家书背后粘着一张排班表。', '你的名字，填满了每一个空白。最下面印着：调整期间，请共同克服。', '“暂定”两个字，被盖了很多次章。'] },
      { title: '没有寄出的背面', text: ['小满：', '我年轻时想去看海。你外婆说，等这桌人吃完饭。', '后来你来了，我又说，等你大一点。', '我怕你一个人过得苦。有时候，又把自己的怕，说成了你的应该。', '这里没有落款。只有一滴干了很久的油。'] },
    ],
    table: [
      { title: '多留的那一副', text: ['五把椅子，六只碗。', '筷子用红线绑成一双，像怕它们走散。空碗底下，压着一张写着你生辰的红纸。', '电视没有开。你却听见有人轻声说：先放着，总会用上的。'], choices: [{ id: 'keep', label: '解开筷子上的红线' }] },
      { title: '这顿饭要多久', text: ['碗底的花纹变成了一圈又一圈的刻度。', '桌布下面，全是写着日期的收据。最远的一张，远得不像你会活到的年份。', '椅背上贴着工号。和你胸前那个一样。'], choices: [{ id: 'keep', label: '把工牌从椅背上摘下来' }] },
      { title: '', text: [] },
    ],
    clock: [
      { title: '差十三分到明天', text: ['秒针每走一下，分针就往回退一点。', '钟的背面刻着一行小字：好日子，快到了。'] },
      { title: '明天没有空格', text: ['挂钟里塞满了打卡纸。最早一张来自母亲年轻的时候。', '每张纸都把“明天”留在最后一栏，没有一张填过。', '你抽出纸，齿轮终于停下。那一瞬间，你才发现自己一直咬着牙。'], choices: [{ id: 'keep', label: '抽出卡住齿轮的纸' }] },
      { title: '不走，也是一种时间', text: ['你没有再替它上弦。', '窗外的一滴水，慢慢滑到了下一格玻璃。'] },
    ],
    desk: [
      { title: '带回家的工位', text: ['你小时候写作业的桌子上，放着单位的显示器。', '屏幕亮着：正在等待下一项安排。', '桌边的保温杯还是热的，椅子却像很多年没人坐过。'] },
      { title: '下一项安排', text: ['屏幕上只有一行字：请确认你可以长期稳定地承担。', '下面的勾选框，一共有三代人的笔迹。', '抽屉里是你的薪资单。数字淡了，房租那一栏还很清楚。'], choices: [{ id: 'keep', label: '合上写着“自愿”的文件夹' }] },
      { title: '未完成', text: ['屏幕变暗了。', '你没有把所有事做完。屋子也没有因此倒下来。'] },
    ],
    cradle: [
      { title: '先准备着', text: ['摇篮里叠着一件很旧的小衣服。袖口补了又补。', '没有名字的标签上，只有一句：以后总用得着。'] },
      { title: '长大以后', text: ['摇篮的轮廓很像你的办公椅。', '底下压着一本旧册子，写着每个年龄应当完成的事。最后一页没有留白。'] },
      { title: '线的另一头', text: ['红线从摇篮绕过餐桌，穿过挂钟，最后系在一只旧顶针上。', '顶针旁的小纸条写着：我那时也怕。', '你没有听见婴儿的哭声。只有绷紧的木头，在替谁喘气。'], choices: [{ id: 'keep', label: '松开红线，把旧衣服叠好' }] },
    ],
    portrait: [
      { title: '好好坐着', text: ['照片里的人都穿得很整齐。脸却被相框的反光遮住了。', '你找到小时候的自己。大人的手搭在肩上，像扶着，也像按着。', '照片背面：一家人，齐齐整整。'] },
      { title: '谁都没有缺席', text: ['相框里多出了一排椅子。每一把上面都搭着相同的外套。', '站得再近，也看不清谁已经走了，谁还在等。'] },
      { title: '照片以外', text: ['照片背后，夹着母亲年轻时的半张车票。目的地靠海。', '她的字和家书上很像，只是更用力：下次吧。', '你把车票翻过来。背面仍然是空白。'], choices: [{ id: 'keep', label: '把车票放回她的照片旁' }] },
    ],
  };
  return { ...base, ...stories[object][chapter], choices: stories[object][chapter].choices || read };
}

export function choose(state: GameState, object: ObjectId, choice: string): GameState {
  if (state.ending || !inspect(state, object).choices.some(item => item.id === choice)) return state;
  if (choice === 'close') return state;
  if (choice === 'next' && ready(state) && state.chapter < 2) {
    return { ...state, chapter: (state.chapter + 1) as Chapter, interacted: [] };
  }
  if ((choice === 'air' || choice === 'seat') && state.chapter === 2 && ready(state)) {
    return { ...state, ending: choice };
  }
  if (choice !== 'keep' || state.interacted.includes(object)) return state;
  const page = inspect(state, object);
  return { ...state,
interacted: [...state.interacted, object],
memories: [...state.memories,
    { chapter: state.chapter, object, title: page.title, text: page.text.join('\n') }] };
}

export function restoreSave(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const saved = value as GameState;
    const ids = Object.keys(OBJECT_NAMES);
    if (saved.version !== 1 || ![0, 1, 2].includes(saved.chapter)
      || ![null, 'air', 'seat'].includes(saved.ending)
      || !Array.isArray(saved.interacted) || saved.interacted.length > 8
      || !saved.interacted.every(id => ids.includes(id))
      || !Array.isArray(saved.memories) || saved.memories.length > 24
      || !saved.memories.every(m => m && [0, 1, 2].includes(m.chapter) && ids.includes(m.object)
        && typeof m.title === 'string' && typeof m.text === 'string'
        && m.title.length < 200 && m.text.length < 4000)) return null;
    if (saved.ending && (saved.chapter !== 2 || !ready(saved))) return null;
    return { ...saved, interacted: Array.from(new Set(saved.interacted)) };
  } catch { return null; }
}

export const ENDINGS = {
  air: { title: '给明天留白', subtitle: '窗开了一道缝。', text: ['你把空碗收进柜子，给自己盛了半碗汤。', '天还没有亮。工作、账单和那些没说完的话，都还在。', '你写下：今天先睡。海，可以慢慢去。', '这一次，你没有把自己的名字，填进下一个空位。'] },
  seat: { title: '饭还温着', subtitle: '你把椅子往前挪了一点。', text: ['碗筷终于摆得整整齐齐。', '你听见有人松了一口气。声音很像你。', '门边又响起钥匙声。桌上，又多出一只碗。', '差十三分，到明天。'] },
};
