import { MartialArt } from './types';

// 武功数据 (带武器类型)
export const SECT_ARTS: Record<string, MartialArt[]> = {
  青云门: [
    {
      id: 'qy_sword', name: '神剑御雷真诀', type: 'outer', weapon: 'sword', desc: '引九天玄雷，剑势刚猛无俦', moves: ['平地惊雷', '雷动九天', '电闪雷鸣'],
    },
    {
      id: 'qy_inner', name: '太极玄清道', type: 'inner', weapon: 'fist', desc: '道法自然，生生不息', moves: ['固本培元', '清心寡欲'],
    },
  ],
  血刀堂: [
    {
      id: 'xd_blade', name: '血魔刀法', type: 'outer', weapon: 'blade', desc: '刀刀见血，诡异莫测', moves: ['血流成河', '嗜血如命', '魔刀降世'],
    },
    {
      id: 'xd_inner', name: '修罗阴煞功', type: 'inner', weapon: 'fist', desc: '寒气逼人，阴毒无比', moves: ['阴风怒号', '煞气护体'],
    },
  ],
  丐帮: [
    {
      id: 'gb_palm', name: '降龙十八掌', type: 'outer', weapon: 'fist', desc: '天下第一阳刚掌法', moves: ['亢龙有悔', '飞龙在天', '见龙在田', '神龙摆尾'],
    },
    {
      id: 'gb_stick', name: '打狗棒法', type: 'outer', weapon: 'stick', desc: '变化精微，招式奥妙', moves: ['天下无狗', '棒打双犬', '恶犬拦路'],
    },
  ],
  少林: [
    {
      id: 'sl_fist', name: '罗汉拳', type: 'outer', weapon: 'fist', desc: '佛门正宗，中正平和', moves: ['黑虎掏心', '双峰贯耳'],
    },
    {
      id: 'sl_inner', name: '易筋经', type: 'inner', weapon: 'fist', desc: '脱胎换骨，内力无穷', moves: ['洗髓伐毛', '金刚不坏'],
    },
  ],
  武当: [
    {
      id: 'wd_sword', name: '太极剑', type: 'outer', weapon: 'sword', desc: '以柔克刚，连绵不绝', moves: ['揽雀尾', '单鞭', '白鹤亮翅'],
    },
    {
      id: 'wd_inner', name: '纯阳无极功', type: 'inner', weapon: 'fist', desc: '纯阳紫气，百毒不侵', moves: ['紫气东来', '三花聚顶'],
    },
  ],
  华山: [
    {
      id: 'hs_sword', name: '独孤九剑', type: 'outer', weapon: 'sword', desc: '破尽天下招式，只攻不守', moves: ['破剑式', '破刀式', '总决式'],
    },
    {
      id: 'hs_inner', name: '紫霞神功', type: 'inner', weapon: 'fist', desc: '面若紫霞，绵里藏针', moves: ['紫气东来', '霞光万丈'],
    },
  ],
  飞鸟派: [
    {
      id: 'fn_fist', name: '飞鸟拳法', type: 'outer', weapon: 'fist', desc: '模仿百鸟形态的拳法，轻灵飘逸，变化多端', moves: ['啄己羽毛', '饼干拳法', '小推车小推车', '火烧云', '闪购闪购', '小鸟归巢', '嘉嘉剑法', '小猫拳'],
    },
    {
      id: 'fn_inner', name: '百鸟朝凤心法', type: 'inner', weapon: 'fist', desc: '飞鸟派镇派内功，修炼者体内真气如百鸟归巢，生生不息。修至大成时，可如凤凰涅槃，获得短暂飞行能力。', moves: ['小岁小岁', '大家在吗', '张飞眉毛'],
    },
  ],
  default: [
    {
      id: 'basic_fist', name: '太祖长拳', type: 'outer', weapon: 'fist', desc: '江湖流传最广的拳法', moves: ['冲拳', '劈掌'],
    },
    {
      id: 'basic_inner', name: '吐纳法', type: 'inner', weapon: 'fist', desc: '基础呼吸吐纳之术', moves: ['气沉丹田'],
    },
  ],
};

// 辅助函数：获取某门派的武功
export const getSectArts = (sectName: string) => {
  const keys = Object.keys(SECT_ARTS);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (sectName.includes(key)) return SECT_ARTS[key];
  }
  return SECT_ARTS.default;
};

// 辅助函数：根据名称获取武功对象
export const getArtByName = (artName: string) => {
  const keys = Object.keys(SECT_ARTS);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const found = SECT_ARTS[key].find((a) => a.name === artName);
    if (found) return found;
  }
  return SECT_ARTS.default[0];
};
