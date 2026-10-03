import type { Enemy } from './types';

export type EnemyRole = 'skirmisher' | 'bulwark' | 'blade' | 'pike' | 'reaper' | 'staff' | 'crossbow' | 'slinger' | 'boss';
// Authored assignments reuse validated posts and sightlines. No random spawning.
export const RANGED_POSTS: Record<string, 'crossbow' | 'slinger'> = {
  'canal-guard': 'crossbow', // First ranged lesson: a lone sentry, long retreat, a turning side route.
  'wall-duelist': 'crossbow', // Wall approach: cover along battlements, isolated from the gate captain.
  'archive-duelist': 'crossbow', // Pike holds the court; this rear post punishes frontal fixation.
  'aqueduct-reaver': 'slinger', // Water bridge: telegraphed stones, retreat to the waterwheel fork.
  'garden-monk': 'slinger', // Optional golden reward; open garden leaves room to close the gap.
  'crypt-bow': 'crossbow', // Pillars and the west loop give two ways past its firing lane.
  'cave-slinger': 'slinger', // Optional side reward; the entry pike cannot see around this bend.
};
export function isBoss(e: Pick<Enemy, 'kind'>) { return ['boss', 'nana', 'azi', 'captain', 'regent', 'warden', 'abbot', 'serpent', 'elegist', 'colossus', 'sentinel'].includes(e.kind); }
export function enemyRole(e: Pick<Enemy, 'id' | 'kind'>): EnemyRole {
  if (isBoss(e)) return 'boss';
  if (RANGED_POSTS[e.id]) return RANGED_POSTS[e.id];
  return ({ prowler: 'skirmisher', guard: 'bulwark', duelist: 'blade', lancer: 'pike', reaver: 'reaper', monk: 'staff' } as const)[e.kind as 'prowler'] ?? 'skirmisher';
}
export const ROLE_NAMES: Record<EnemyRole, string> = { skirmisher: '游击短棍', bulwark: '架盾重棍', blade: '拔刀突进', pike: '拒马长枪', reaper: '钩镰拖步', staff: '竹杖扫堂', crossbow: '守路弩手', slinger: '投石行者', boss: '守路人' };
