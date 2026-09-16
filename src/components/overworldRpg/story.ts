import { ENTITIES, INTERIORS } from './content';
import type { QuestEntry, RpgState, StoryState, WorldEntity } from './types';

export const QUEST_IDS = ['sui_lamp', 'shiori_letter'];
export const STORY_FLAGS = ['sui_started', 'sui_lantern_found', 'sui_done', 'town_lamp_lit', 'shiori_started', 'shiori_inscription_read', 'shiori_letter_found', 'shiori_done', 'memory_shortcut_open', 'inn_lore', 'archive_lore', 'forge_lore', 'passage_lore'];
export const JOURNAL_TEXT: Record<string, string> = {
  arrival: '你在回音镇醒来，决定循着熟悉的声音寻找回家的路。',
  sui_started: '客栈掌柜请你与岁己找回晚风泽的旧灯。岁己说，总要有人替晚归的人留一点光。',
  sui_lantern_found: '在芦湾找到了尚有余温的灯芯。岁己想起：等待与同行，都是不让人孤单的方式。',
  sui_restore: '你与岁己把旧灯留在回音镇。客栈重新为晚归者亮灯，全队获得「守灯」：治疗效果提高 22%。',
  sui_carry: '你与岁己把灯带上旅途。掌柜把灯罩系在行囊上，全队获得「同行」：气血上限增加 32。',
  shiori_started: '守书人请栞栞找回观星台的一封信。栞栞想知道，一个故事应该被珍藏，还是应该被听见。',
  shiori_inscription_read: '观星台碑记解释了守望者的执念：他把信保管得太久，忘了信本应抵达另一个人。',
  shiori_letter_found: '执信守望者终于放手。栞栞读到信的最后一句：「告诉下一个人，今天也可以从头开始。」',
  shiori_preserve: '你与栞栞把信留在青笺书院，供后来者慢慢阅读。全队获得「珍藏」：防御增加 3。',
  shiori_deliver: '你与栞栞请守书人把信念给来往的旅人。故事终于抵达了听众，全队获得「传信」：攻击增加 4。',
  memory_shortcut_open: '执信守望者安息后，通往青笺书院的记忆旧道重新打开。',
  passage_used: '你循着记忆旧道，从旧城观星台抵达青笺书院。',
  inn_lore: '客栈留言簿说：灯不是为了赶走黑夜，是为了告诉人，这里有人等。',
  archive_lore: '失名目录提醒你：保存一段记忆，与让它抵达一个人，并不总是同一件事。',
  forge_lore: '听钟铁匠提起一条连接观星台与书院的秘道；只有被解开的记忆才能打开它。',
  passage_lore: '你读懂了旧道拓片，记下观星台中的地脉入口。',
};
ENTITIES.filter((e) => e.kind === 'npc' && e.characterId && !e.area).forEach((e) => { JOURNAL_TEXT[`recruit_${e.id}`] = `${e.name}加入队伍。你们约定，一起把这条归途走完。`; });
ENTITIES.filter((e) => e.kind === 'encounter').forEach((e) => { JOURNAL_TEXT[`win_${e.id}`] = `你与伙伴平息了「${e.name}」${e.shard ? '，获得一枚归途碎片' : ''}。`; });
Object.values(INTERIORS).forEach((room) => { JOURNAL_TEXT[`visit_${room.id}`] = `你第一次走进${room.name}。${room.subtitle}。`; });

export function createStory(): StoryState { return { flags: [], choices: {}, bonds: {}, journal: [], tracked: null }; }
export function recordEvent(state: RpgState, id: string): void {
  const text = JOURNAL_TEXT[id];
  if (text && !state.story.journal.includes(text)) state.story.journal.push(text);
}
export function setStoryFlag(state: RpgState, flag: string): void {
  if (STORY_FLAGS.includes(flag) && !state.story.flags.includes(flag)) state.story.flags.push(flag);
  recordEvent(state, flag);
}
const has = (state: RpgState, flag: string) => state.story.flags.includes(flag);
const recruited = (state: RpgState, id: string) => state.party.some((p) => p.id === id);

export function storyBonuses(state: RpgState): { hp: number; attack: number; defense: number; healing: number } {
  return { hp: state.story.choices.sui_lamp === 'carry' ? 32 : 0, attack: state.story.choices.shiori_letter === 'deliver' ? 4 : 0, defense: state.story.choices.shiori_letter === 'preserve' ? 3 : 0, healing: state.story.choices.sui_lamp === 'restore' ? 0.22 : 0 };
}

export function questEntries(state: RpgState): QuestEntry[] {
  const sui: QuestEntry = { id: 'sui_lamp', title: '留一盏灯', companion: 'sui', status: 'unknown', text: '先与岁己结伴，再去回音客栈拜访掌柜。', location: '回音镇 · 岁己', targetId: 'sui' };
  if (recruited(state, 'sui')) Object.assign(sui, { status: 'available', text: '客栈掌柜在等一位熟悉晚风的人。走进客栈，听听旧灯的故事。', location: '回音客栈 · 掌柜', targetId: 'inn_keeper' });
  if (has(state, 'sui_started')) Object.assign(sui, { status: 'active', text: '与岁己寻找晚风泽的芦湾旧灯，带回尚有余温的灯芯。', location: '晚风泽 · 芦湾旧灯', targetId: 'grove_lantern' });
  if (has(state, 'sui_lantern_found')) Object.assign(sui, { text: '回到客栈，与岁己决定旧灯的去处。灯可以留下守候，也可以随你们同行。', location: '回音客栈 · 掌柜', targetId: 'inn_keeper' });
  if (has(state, 'sui_done')) Object.assign(sui, { status: 'complete', text: state.story.choices.sui_lamp === 'restore' ? '旧灯留在回音镇，照亮每一个晚归的人。全队治疗 +22%。' : '旧灯系在行囊上，陪你们继续远行。全队气血上限 +32。', location: '与你们同行的灯', targetId: 'inn_keeper' });
  const shiori: QuestEntry = { id: 'shiori_letter', title: '未写完的信', companion: 'shiori', status: 'unknown', text: '先找回青笺林的书页，邀请栞栞同行，再走进书院。', location: '青笺林 · 栞栞', targetId: 'shiori' };
  if (recruited(state, 'shiori')) Object.assign(shiori, { status: 'available', text: '书院的守书人保管着一只空信封，他也许知道它在等什么。', location: '青笺书院 · 守书人', targetId: 'archive_curator' });
  if (has(state, 'shiori_started')) Object.assign(shiori, { status: 'active', text: '前往星陨旧城观星台，调查碑记中那封没有结尾的信。', location: '旧城观星台 · 碑记', targetId: 'observatory_ledger' });
  if (has(state, 'shiori_inscription_read')) Object.assign(shiori, { text: '让执信守望者放下执念。先休整队伍，再决定是否迎战。', location: '旧城观星台 · 执信守望者', targetId: 'memory_warden' });
  if (state.completed.includes('memory_warden')) Object.assign(shiori, { text: '守望者已经放手，取走它身后的信。通往书院的旧道也已打开。', location: '旧城观星台 · 未写完的信', targetId: 'final_letter' });
  if (has(state, 'shiori_letter_found')) Object.assign(shiori, { text: '回到书院，与栞栞决定：让信被珍藏，还是让信抵达每个旅人。', location: '青笺书院 · 守书人', targetId: 'archive_curator' });
  if (has(state, 'shiori_done')) Object.assign(shiori, { status: 'complete', text: state.story.choices.shiori_letter === 'preserve' ? '信被收入书院，每位后来者都能读到它。全队防御 +3。' : '信被念给来往的旅人，故事终于抵达了听众。全队攻击 +4。', location: '青笺书院 · 信的结尾', targetId: 'archive_curator' });
  return [sui, shiori];
}

export function storyEpilogue(state: RpgState): string[] {
  const lines: string[] = [];
  if (state.story.choices.sui_lamp === 'restore') lines.push('回音镇的灯整夜亮着。岁己在告别时说：「以后路过的时候，就知道还有人记得你。」');
  if (state.story.choices.sui_lamp === 'carry') lines.push('你醒来时，手边的饼干旁多了一点温暖的灯光。岁己说的那句「一起走吧」，留在了漫长的白天里。');
  if (state.story.choices.shiori_letter === 'preserve') lines.push('青笺书院为那封信留了一页空白。栞栞说，故事不必一次写完，下次来时还可以继续。');
  if (state.story.choices.shiori_letter === 'deliver') lines.push('观星台的信被念给了许多旅人。你在现实世界的留言里认出它的最后一句：今天也可以从头开始。');
  if (!lines.length) lines.push('回音客栈的旧灯与青笺书院的信仍在等人。你知道，这片山河里还有未说完的故事。');
  return lines;
}

function dialogue(state: RpgState, entity: WorldEntity, text: string, choices: { id: string; label: string }[] = []): void {
  state.dialogue = { entityId: entity.id, speaker: entity.name, text, choices: [...choices, { id: 'leave', label: '再看看' }] };
}

export function storyDialogue(state: RpgState, entity: WorldEntity): boolean {
  if (!entity.storyId) return false;
  switch (entity.storyId) {
    case 'sui_quest':
      if (!recruited(state, 'sui')) dialogue(state, entity, '「你也是迷路的人？镇口有位叫岁己的姑娘，认得这盏灯。先和她聊聊，再一起来坐坐。」');
      else if (has(state, 'sui_done')) dialogue(state, entity, state.story.choices.sui_lamp === 'restore' ? '旧灯在窗边安静地亮着。掌柜为刚进门的旅人添了一碗热汤。岁己笑道：「看，有人回家了。」\n守灯的祝福仍在：全队治疗提高 22%。' : '掌柜望着你行囊上的灯罩：「你们把灯带出去，就是替我把远方照亮。」岁己轻轻扶正灯罩。\n同行的祝福仍在：全队气血上限增加 32。');
      else if (has(state, 'sui_lantern_found')) dialogue(state, entity, '灯芯重新亮起。掌柜说：「这盏灯曾替许多晚归的人指路。」\n岁己望向窗外：「留下来等人，或是带着它一起走，都有自己的好。」\n这是不可撤回的选择，两种祝福只能获得一种。', [{ id: 'restore_lamp', label: '留灯守候 · 全队治疗 +22%' }, { id: 'carry_lamp', label: '携灯同行 · 全队气血上限 +32' }]);
      else if (has(state, 'sui_started')) dialogue(state, entity, '「旧灯在晚风泽，驿站西边的芦湾石阶上。」岁己提起行囊：「我们去找找，说不定它还在等人。」');
      else dialogue(state, entity, '掌柜指着旧灯：「晚风泽的灯芯还没送回来。路上的人越来越少，我不想连最后一盏灯也灭了。」\n岁己说：「我记得那片芦苇。我们一起去吧，至少让回来的人有地方可找。」', [{ id: 'accept', label: '和岁己一起寻找旧灯' }]);
      return true;
    case 'sui_lantern':
      if (!has(state, 'sui_started')) dialogue(state, entity, `${entity.description}\n灯座上的记号来自回音客栈。也许掌柜知道它的故事。`);
      else if (has(state, 'sui_lantern_found')) dialogue(state, entity, '灯芯已经收好。石阶仍朝向晚风，像在等待下一个故事。');
      else dialogue(state, entity, `${entity.description}\n岁己蹲下来，轻轻拢住那一点光：「原来不是没有人回来，只是有人忘了自己还可以回来。」`, [{ id: 'collect', label: '收好灯芯，带回客栈' }]);
      return true;
    case 'shiori_quest':
      if (!recruited(state, 'shiori')) dialogue(state, entity, '「这封信也许只有栞栞能读懂。她就在书院外，正为青笺林散落的书页发愁。」');
      else if (has(state, 'shiori_done')) dialogue(state, entity, state.story.choices.shiori_letter === 'preserve' ? '信被平整地放在书架上，旁边留着一支铅笔。栞栞说：「每个人翻开它的时候，故事都会再活一次。」\n珍藏的祝福仍在：全队防御 +3。' : '守书人正把信念给新来的旅人。有人听完后笑了，重新背起行囊。栞栞说：「它终于寄到了。」\n传信的祝福仍在：全队攻击 +4。');
      else if (has(state, 'shiori_letter_found')) dialogue(state, entity, '信的最后一句没有署名。守书人说：「书院能让它留得很久；旅人能把它带得很远。」\n栞栞将信递给你：「我们一起替它选一个抵达的地方。」\n这是不可撤回的选择，两种祝福只能获得一种。', [{ id: 'preserve_archive', label: '珍藏在书院 · 全队防御 +3' }, { id: 'deliver_letter', label: '念给来往旅人 · 全队攻击 +4' }]);
      else if (has(state, 'shiori_started')) dialogue(state, entity, '「信在星陨旧城的观星台。先读碑记，弄清守望者为何不肯放手。」栞栞说，等它能安心，才算真正找回了信。');
      else dialogue(state, entity, '守书人把空信封交给栞栞：「寄信的人不在了，守信的人却不肯离开。能去观星台找回它吗？」\n栞栞翻了翻空白的书页：「有些故事不需要完美的结尾，只需要有人听见。」', [{ id: 'accept', label: '与栞栞寻找未写完的信' }]);
      return true;
    case 'shiori_inscription':
      if (!has(state, 'shiori_started')) dialogue(state, entity, `${entity.description}\n碑角的藏书印来自青笺书院。先去问问守书人，再来解读它。`);
      else dialogue(state, entity, `${entity.description}\n栞栞轻声说：「你已经守得很好了。接下来的路，让我们替你走。」`, has(state, 'shiori_inscription_read') ? [] : [{ id: 'read', label: '读懂碑记，解开守望者的来历' }]);
      return true;
    case 'shiori_letter':
      if (!state.completed.includes('memory_warden')) dialogue(state, entity, '信被执信守望者的记忆锁着。先读懂碑记，再让它放下执念。');
      else if (has(state, 'shiori_letter_found')) dialogue(state, entity, '信已经收入栞栞的书里。回到书院，就能替它找到去处。');
      else dialogue(state, entity, entity.description, [{ id: 'collect', label: '与栞栞收好这封信' }]);
      return true;
    case 'memory_passage':
      dialogue(state, entity, state.completed.includes('memory_warden') ? '守望者放下执念，星光重新照亮旧道。穿过这里就能抵达青笺书院，出口仍会通向青笺林。' : '门后的星光尚未连通。执信守望者的记忆仍将旧道锁住。', state.completed.includes('memory_warden') ? [{ id: 'passage', label: '循记忆旧道前往青笺书院' }] : []);
      return true;
    default:
      dialogue(state, entity, entity.description, has(state, entity.storyId) ? [] : [{ id: 'read', label: entity.kind === 'npc' ? '记下铁匠的嘱咐' : '记下这段见闻' }]);
      return true;
  }
}

export function chooseStory(state: RpgState, entity: WorldEntity, choiceId: string): boolean {
  if (!entity.storyId) return false;
  const finish = (quest: string, value: string, flag: string, companion: string, event: string) => {
    if (state.story.choices[quest]) return;
    state.story.choices[quest] = value; setStoryFlag(state, flag); state.story.bonds[companion] = 3; recordEvent(state, event);
    if (state.story.tracked === quest) state.story.tracked = null;
    state.message = JOURNAL_TEXT[event];
  };
  if (entity.storyId === 'sui_quest') {
    if (choiceId === 'accept' && recruited(state, 'sui') && !has(state, 'sui_started')) { setStoryFlag(state, 'sui_started'); state.story.bonds.sui = Math.max(1, state.story.bonds.sui ?? 0); state.story.tracked = 'sui_lamp'; state.message = '已记下「留一盏灯」：前往晚风泽寻找芦湾旧灯。'; }
    if (has(state, 'sui_lantern_found') && !state.story.choices.sui_lamp) {
      if (choiceId === 'restore_lamp') { finish('sui_lamp', 'restore', 'sui_done', 'sui', 'sui_restore'); setStoryFlag(state, 'town_lamp_lit'); }
      if (choiceId === 'carry_lamp') { finish('sui_lamp', 'carry', 'sui_done', 'sui', 'sui_carry'); state.party.forEach((p) => { p.hp += 32; }); }
    }
  } else if (entity.storyId === 'sui_lantern' && choiceId === 'collect' && has(state, 'sui_started')) { setStoryFlag(state, 'sui_lantern_found'); state.message = '找回了旧灯的灯芯。回到客栈，与岁己决定它的去处。'; }
  else if (entity.storyId === 'shiori_quest') {
    if (choiceId === 'accept' && recruited(state, 'shiori') && !has(state, 'shiori_started')) { setStoryFlag(state, 'shiori_started'); state.story.bonds.shiori = Math.max(1, state.story.bonds.shiori ?? 0); state.story.tracked = 'shiori_letter'; state.message = '已记下「未写完的信」：前往星陨旧城观星台调查。'; }
    if (has(state, 'shiori_letter_found') && !state.story.choices.shiori_letter) {
      if (choiceId === 'preserve_archive') finish('shiori_letter', 'preserve', 'shiori_done', 'shiori', 'shiori_preserve');
      if (choiceId === 'deliver_letter') finish('shiori_letter', 'deliver', 'shiori_done', 'shiori', 'shiori_deliver');
    }
  } else if (entity.storyId === 'shiori_inscription' && choiceId === 'read' && has(state, 'shiori_started')) { setStoryFlag(state, 'shiori_inscription_read'); state.message = '读懂了守望者的执念。它愿意接受你们的挑战了。'; }
  else if (entity.storyId === 'shiori_letter' && choiceId === 'collect' && state.completed.includes('memory_warden')) { setStoryFlag(state, 'shiori_letter_found'); state.message = '栞栞收好了信。可循记忆旧道返回青笺书院。'; }
  else if (entity.storyId === 'memory_passage' && choiceId === 'passage' && state.completed.includes('memory_warden')) {
    state.area = 'archive'; state.player = { ...INTERIORS.archive.spawn };
    const door = ENTITIES.find((e) => e.id === 'archive_door')!; state.worldReturn = { x: door.x, y: door.y };
    if (!state.visited.includes('archive')) state.visited.push('archive'); recordEvent(state, 'visit_archive'); recordEvent(state, 'passage_used'); state.message = '旧道的另一端，是青笺书院熟悉的书香。';
  } else if (choiceId === 'read' && STORY_FLAGS.includes(entity.storyId)) { setStoryFlag(state, entity.storyId); state.message = '这段见闻已记入行旅手记。'; }
  state.dialogue = null; state.mode = 'explore'; return true;
}
