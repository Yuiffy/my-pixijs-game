export type InputSource = 'mouse' | 'gamepad' | 'touch';
export type PadFamily = 'xbox' | 'playstation' | 'nintendo';
export type HintAction = 'confirm' | 'back' | 'interact' | 'heal' | 'parry' | 'dodge' | 'light' | 'heavy' | 'jump' | 'lock' | 'map' | 'companion' | 'journal' | 'pause';
const KEYS: Record<HintAction, string> = { confirm: 'Enter', back: 'Esc', interact: 'E', heal: 'R', parry: 'F', dodge: 'Shift', light: 'J', heavy: 'K', jump: '空格', lock: 'Q', map: 'M', companion: 'C', journal: 'N', pause: 'Esc' };
const PAD: Record<PadFamily, Record<HintAction, string>> = {
  xbox: { confirm: 'A', back: 'B', interact: 'Y', heal: 'X', parry: 'LB', dodge: 'B', light: 'RB', heavy: 'RT', jump: 'A', lock: 'R3', map: 'View', companion: 'LT', journal: '十字键→', pause: 'Menu' },
  playstation: { confirm: '✕', back: '○', interact: '△', heal: '□', parry: 'L1', dodge: '○', light: 'R1', heavy: 'R2', jump: '✕', lock: 'R3', map: 'Share / Create', companion: 'L2', journal: '十字键→', pause: 'Options' },
  nintendo: { confirm: 'B', back: 'A', interact: 'X', heal: 'Y', parry: 'L', dodge: 'A', light: 'R', heavy: 'ZR', jump: 'B', lock: 'R3', map: '−', companion: 'ZL', journal: '十字键→', pause: '+' },
};
const TOUCH: Record<HintAction, string> = { confirm: '确认', back: '返回', interact: '交互', heal: '喝水', parry: '弹反 / 防御', dodge: '闪避 / 跑', light: '轻击', heavy: '重击 / 蓄力', jump: '跳跃', lock: '锁定', map: '地图', companion: '精灵', journal: '手记', pause: '暂停' };
export function padFamily(id: string): PadFamily {
  if (/sony|054c|dualshock|dualsense|wireless controller/i.test(id)) return 'playstation';
  if (/nintendo|057e|switch|pro controller/i.test(id)) return 'nintendo';
  return 'xbox';
}
export function inputHint(action: HintAction, source: InputSource = 'mouse', family: PadFamily = 'xbox') { return source === 'gamepad' ? PAD[family][action] : source === 'touch' ? TOUCH[action] : KEYS[action]; }
/** Scripted dialogue stays device neutral in saves; display and narration resolve hints here. */
export function hintText(text: string, source: InputSource = 'mouse', family: PadFamily = 'xbox') {
  const bindings: Record<string, HintAction> = { E: 'interact', C: 'companion', N: 'journal', R: 'heal', Q: 'lock' };
  return text.replace(/(按 )?([ECNRQ])(?=\s|[，。])/g, (_, prefix: string, key: string) => (source === 'touch' ? `点“${inputHint(bindings[key], source, family)}”` : `${prefix ?? ''}${inputHint(bindings[key], source, family)}`)).replace('R／手柄X喝药', source === 'touch' ? '点“喝水”喝药' : `${inputHint('heal', source, family)} 喝药`);
}
