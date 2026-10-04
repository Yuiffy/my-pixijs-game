import type { GameState } from './types';
import { HAVEN_FERRIES } from './haven';
import { FERRY_DESTINATIONS } from './valley';

export const FERRY_ROUTES = { ...FERRY_DESTINATIONS, ...HAVEN_FERRIES };
export function ferryStatus(s: GameState, id: string) {
  if (!Object.hasOwn(FERRY_ROUTES, id)) return null;
  if (Object.hasOwn(HAVEN_FERRIES, id)) {
    if (!s.haven.recruits.includes('boatwright')) {
      const missingRubbing = !s.collected.includes('keel-rubbing');
      const missingCable = !s.collected.includes('ferry-winch');
      return {
        ready: false,
        label: '航线未开通',
        message: missingRubbing ? '渡船尚未出坞 · 先取船坞高棚的龙骨拓片。' : missingCable ? '渡船尚未出坞 · 先修好水车院的系缆绞盘。' : '渡船尚未出坞 · 请邀请船坞的温叔前往归灯庭。',
        hint: missingRubbing ? '沿船坞西侧支架登上高棚，取下龙骨拓片；修好水车院系缆后，与船坞的温叔交谈，邀请他前往归灯庭。' : missingCable ? '先去水车院东侧渡埠修好系缆，再回船坞邀请温叔前往归灯庭。' : '拓片与系缆已经齐了。与船坞北侧的温叔交谈，选择邀请他前往归灯庭，即可开通往返航线。',
      };
    }
    if (!s.litLamps.includes('haven-lamp')) return {
      ready: false,
      label: '等待庭灯',
      message: '船已备好 · 点亮归灯庭的雨灯，即可往返。',
      hint: '从旅馆南桥进入归灯庭，点亮庭中的雨灯，就能乘温叔的船往返船坞。',
    };
  } else if (!s.collected.includes('ferry-winch')) return {
    ready: false,
    label: '系缆未修复',
    message: '渡船系缆还未修复 · 先到水车院东侧转动系缆绞盘。',
    hint: '从王寺后山进入雾河，击败西岸的花礼，在水车院东侧渡埠转动系缆绞盘。',
  };
  return { ready: true, label: '航线已开通', message: '', hint: '' };
}
