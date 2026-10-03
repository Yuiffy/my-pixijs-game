import type { GameState } from './types';
import { HAVEN_GATES, HAVEN_LANDMARKS, havenAvailable } from './haven';

type Choice = { id: string; label: string; detail?: string; disabled?: boolean };
export type Conversation = { speaker: string; title: string; lines: string[]; choices: Choice[] };
export function conversation(s: GameState, id: string): Conversation {
  const recruited = s.haven.recruits;
  if (id === 'haven-keeper') return {
    speaker: '阿莲 · 留灯人',
title: s.haven.ending ? '给回来的人留座' : '雨里总要有个回去的地方',
    lines: s.haven.ending === 'remember' ? ['名字已经写上庭灯。今后每一盏灯下，都有人可以被叫出来。', '弥音不再刮去旧字，温叔也给渡船留了空位。你累了，就回这儿坐坐。'] : s.haven.ending === 'release' ? ['灯顺水走了，院里仍留着他们来过的位置。', '让人离开，并不是说他们从没来过。今后我们等的是新的归人。'] : [
      '王寺的钟只告诉人天亮，却不说谁没有回来。我在这里留了几张空椅，等愿意说话的人。',
      recruited.length === 2 ? '弥音带回名字，温叔带回水路。若雾河的归水灯已放出，就按名册的顺序唤醒庭里的三声。' : '残钟雨寺西边有间弃铃书房；雾河旧盐仓背后还有船坞。路上若见着抄名人和补船人，替我带句话：炉子还热着。',
      `寄存的钱不会随死亡遗落，目前替你收着 ${s.haven.savings} 枚。随时可以取回，整备仍使用随身的钱。`,
    ],
choices: [
      { id: 'deposit', label: `寄存随身的 ${s.rice} 枚夜市钱`, disabled: s.rice === 0 || s.haven.savings >= 1000000 },
      { id: 'withdraw', label: `取回寄存的 ${s.haven.savings} 枚夜市钱`, disabled: s.haven.savings === 0 || s.rice >= 1000000 },
    ],
  };
  if (id === 'scribe-field') return {
    speaker: '弥音 · 抄名人',
title: '被擦掉的一页',
    lines: ['他们说抄漏几个名字不要紧。可那是人，不是墨点。', s.collected.includes('names-register') ? '你把刮掉的那页找回来了……钟、水、名字，这是以前送归人的顺序。归灯庭若还有一张桌子，我想把它重新写完。' : '书房西北角还压着一本名册。先替我找到它，我不能把最后一页也丢在这里。'],
    choices: [{ id: 'invite-scribe', label: '邀请弥音前往归灯庭', detail: '她会在书廊整理两关的线索。', disabled: !s.collected.includes('names-register') }],
  };
  if (id === 'boatwright-field') return {
    speaker: '温叔 · 补船人',
title: '船底刻着谁的名字',
    lines: ['河上的灯不怕水，怕的是再没人记得送灯的人。', !s.collected.includes('keel-rubbing') ? '高棚里有龙骨拓片。沿船坞西侧支架上去，别让看棚的人烧了它。' : !s.collected.includes('ferry-winch') ? '拓片还在，真好。但水车院的系缆没接上，我这条船出不了坞。先去修好它。' : '拓片和系缆都齐了。我把船停到归灯庭，日后你来船坞，我送你回去。'],
    choices: [{ id: 'invite-boatwright', label: '邀请温叔前往归灯庭', detail: '开通归灯庭与船坞的双向渡船；先点亮庭中雨灯。', disabled: !s.collected.includes('keel-rubbing') || !s.collected.includes('ferry-winch') }],
  };
  if (id === 'haven-scribe') return { speaker: '弥音 · 抄名人', title: '让故事有名字', lines: [s.haven.ending === 'remember' ? '我把他们的名字刻进庭灯了。以后不用再说“那些人”。' : s.haven.ending === 'release' ? '名册我留着，灯让它们走。记得和不肯放手，原来不是同一件事。' : '城里敲钟，河上放灯，最后才叫人的名字。有人把最后一步删了，长夜才迟迟不肯过去。', s.haven.ending ? '守簿人的那一页也留着。我们不会再替没有回来的人说一切都好。' : s.collected.includes('well-testimony') ? '守簿人也被抹去名字了。你可以把名字刻回灯上，也可以让这些灯终于离开。两种选择都不该再替别人说谎。' : '庭南潮阶下面藏着旧灯库。两位归人落座、雾河灯归水后，再让钟、水、呼名依次响起。'], choices: [] };
  if (id === 'haven-boatwright') return { speaker: '温叔 · 补船人', title: '往返也是一段旅程', lines: [s.haven.ending ? '这回船上有灯，也有人。等风小一点，我们再去看河。' : '雨冠把灯留在城里，千流把愿留在水里。守灯簿却说人人都回了家。别急着信它。', '我的渡船停在东南的小渡。它只送你换个地方，不替你补药，也不改原先的归灯。'], choices: [] };
  return { speaker: '最后一盏无名灯',
title: s.haven.ending ? '你的回答已经留下' : '你愿意怎样记住他们',
lines: s.haven.ending ? [s.haven.ending === 'remember' ? '庭灯有名，归路有声。' : '愿灯远行，空椅留温。', '回到归灯庭，听听大家想说的话。'] : ['灯里没有索取火种的神，只有没来得及说出口的名字。', '记名，让后来者知道他们曾在这里；放灯，让未尽的愿望离开长夜。决定之后，归灯庭与同伴的回应会随之改变。'],
choices: s.haven.ending ? [] : [
    { id: 'remember', label: '把名字刻回庭灯', detail: '获得「记名结」：最大体力 +15；庭院亮起金色名灯。' },
    { id: 'release', label: '让愿灯顺水远行', detail: '获得「归水结」：每瓶恢复 +15；庭院点起青色归灯。' },
  ] };
}

/** Only the engine calls this after checking proximity, visible NPC and safety. */
export function applyConversation(s: GameState, choice: string): string | null {
  const id = s.haven.talking;
  if (!id || !conversation(s, id).choices.some(c => c.id === choice && !c.disabled)) return null;
  if (choice === 'deposit') { const amount = Math.min(s.rice, 1000000 - s.haven.savings); s.rice -= amount; s.haven.savings += amount; return `阿莲收好了 ${amount} 枚夜市钱。`; }
  if (choice === 'withdraw') { const amount = Math.min(s.haven.savings, 1000000 - s.rice); s.haven.savings -= amount; s.rice += amount; return `取回 ${amount} 枚夜市钱。`; }
  if (choice === 'invite-scribe' || choice === 'invite-boatwright') {
    const recruit = choice === 'invite-scribe' ? 'scribe' : 'boatwright';
    if (s.haven.recruits.includes(recruit)) return null;
    s.haven.recruits.push(recruit); s.haven.talking = null; s.paused = false;
    return recruit === 'scribe' ? '弥音前往归灯庭 · 书廊有人候你归来' : '温叔前往归灯庭 · 船坞与庭院的渡船已相连';
  }
  if ((choice === 'remember' || choice === 'release') && !s.haven.ending && s.defeatedGuests.includes('last-lamplighter')) {
    s.haven.ending = choice; s.haven.talking = null; s.paused = false; s.mode = 'ending';
    return choice === 'remember' ? '灯下有名 · 记名结已系上' : '愿灯远行 · 归水结已系上';
  }
  return null;
}

export function validHaven(s: GameState): boolean {
  const h = s.haven;
  if (!h || !Array.isArray(h.recruits) || h.recruits.some(id => !['scribe', 'boatwright'].includes(id)) || new Set(h.recruits).size !== h.recruits.length) return false;
  if (!Array.isArray(h.gates) || h.gates.some(id => !HAVEN_GATES.some(g => g.id === id)) || new Set(h.gates).size !== h.gates.length) return false;
  if (!Number.isInteger(h.echoes) || h.echoes < 0 || h.echoes > 3 || !Number.isInteger(h.savings) || h.savings < 0 || h.savings > 1000000 || ![null, 'remember', 'release'].includes(h.ending)) return false;
  if (h.talking !== null && !HAVEN_LANDMARKS.some(l => l.kind === 'npc' && l.id === h.talking && havenAvailable(s, l.id))) return false;
  if (h.recruits.includes('scribe') && !s.collected.includes('names-register')) return false;
  if (h.recruits.includes('boatwright') && (!s.collected.includes('keel-rubbing') || !s.collected.includes('ferry-winch'))) return false;
  if (h.echoes > 0 && (h.recruits.length !== 2 || !s.valleyComplete)) return false;
  if (h.gates.includes('well-door') && h.echoes !== 3) return false;
  if ((h.gates.includes('well-return') || s.defeatedGuests.includes('last-lamplighter') || s.collected.includes('well-testimony')) && !h.gates.includes('well-door')) return false;
  if (h.ending && !s.defeatedGuests.includes('last-lamplighter')) return false;
  return true;
}

export function havenJournal(s: GameState) {
  return [
    { title: '归灯庭 · 留一张空椅', text: '旅馆南桥通向据点。阿莲照看寄存的钱；雨灯负责休息与整备。', id: 'haven-lamp', done: s.litLamps.includes('haven-lamp') },
    { title: '被擦掉的名字', text: s.haven.recruits.includes('scribe') ? '弥音已在听雨书廊重新誊写名册。' : '残钟雨寺西侧的小桥通往弃铃书房。找到名册，再与弥音交谈。', id: s.collected.includes('names-register') ? 'scribe-field' : 'names-register', done: s.haven.recruits.includes('scribe') },
    { title: '船底的来人', text: s.haven.recruits.includes('boatwright') ? '温叔已到归灯小渡，可往返沉灯船坞。' : '雾河旧盐仓背桥通往船坞。取下高棚的龙骨拓片，修好水车院系缆，再邀请温叔。', id: !s.collected.includes('keel-rubbing') ? 'keel-rubbing' : !s.collected.includes('ferry-winch') ? 'ferry-winch' : 'boatwright-field', done: s.haven.recruits.includes('boatwright') },
    { title: '钟、水与名字', text: s.haven.echoes === 3 ? '三声已齐，庭南的封门可以打开。' : '两位归人落座、雾河灯归水后，按名册里的顺序回应庭南三座灯台。', id: 'haven-bell', done: s.haven.echoes === 3 },
    { title: '灯下无名', text: s.haven.ending ? s.haven.ending === 'remember' ? '你选择记名。记名结：最大体力 +15。回庭听听大家的回应。' : '你选择放灯。归水结：每瓶恢复 +15。回庭听听大家的回应。' : '打开三声封门，寻访无名灯库中的最后一页。', id: s.haven.gates.includes('well-door') ? 'well-choice' : 'well-door', done: !!s.haven.ending },
  ];
}
