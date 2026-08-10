import { getLiverConfig } from './index';
import type { LiverInfo } from './types';

export interface LiverDirectoryGroup {
  id: string;
  name: string;
  note: string;
  accent: string;
  members: readonly string[];
}

export interface LiverDirectoryMember {
  liver: LiverInfo;
  displayName: string;
  portraitSrc?: string;
  fallbackSrc?: string;
}

export const LIVER_DIRECTORY_GROUPS: readonly LiverDirectoryGroup[] = [
  {
    id: 'circle',
    name: '环岁圈',
    note: '岁己、栞栞、米米、弥月、瑞娅、悠亚等',
    accent: '#7de0d0',
    members: ['sui', 'shiori', 'nagisa', 'mizuki', 'rhea', 'yua'],
  },
  {
    id: 'gen28',
    name: '28期',
    note: 'VirtuaReal 新成员',
    accent: '#e7b75f',
    members: ['chu2u', 'sumire', 'viridis', 'komichi'],
  },
  {
    id: 'vrpsp',
    name: 'VRPSP',
    note: 'VirtuaReal / PSPLive',
    accent: '#aab4c2',
    members: [
      'azi',
      'nana7mi',
      'joi',
      'nightin',
      'mingqian-nailv',
      'michiya',
      'mofu',
      'harei',
      'mitsuri',
    ],
  },
  {
    id: 'gen27',
    name: '27期',
    note: 'VirtuaReal 第二十七期生',
    accent: '#c0a0f2',
    members: ['hazel', 'liko', 'kloa', 'izayoi'],
  },
] as const;

export const LIVER_DIRECTORY_DISPLAY_NAMES: Record<string, string> = {
  sui: '岁己',
  shiori: '栞栞',
  nagisa: '米米',
  mizuki: '弥月',
  hazel: '灰泽满',
  liko: '莉蔻',
  kloa: '克罗雅',
  izayoi: '十六萤',
  azi: '阿梓',
  nana7mi: '七海',
  joi: '轴伊',
  yua: '悠亚',
  rhea: '瑞娅',
  nightin: '南町',
  'mingqian-nailv': '明前奶绿',
  michiya: '未知夜',
  mofu: '犬绒',
  harei: '花礼',
  mitsuri: '三理',
  chu2u: '羽啾',
  sumire: '枝堇',
  viridis: '小松绿',
  komichi: '四时小路',
};

// The minimal set uses the same transparent, small-format character art as the autochess shop.
export const LIVER_DIRECTORY_PORTRAITS: Record<string, string> = {
  sui: '/images/autochess/portraits/minimal/sui.png',
  shiori: '/images/autochess/portraits/minimal/shiori.png',
  nagisa: '/images/autochess/portraits/minimal/nagisa.png',
  mizuki: '/images/autochess/portraits/minimal/clock-gunner.png',
  hazel: '/images/autochess/portraits/minimal/sun-guard.png',
  liko: '/images/autochess/portraits/minimal/ember-blade.png',
  kloa: '/images/autochess/portraits/minimal/rift-brawler-head.png',
  izayoi: '/images/autochess/portraits/minimal/raccoon-archer.png',
  azi: '/images/autochess/portraits/minimal/cinder_ram.png',
  nana7mi: '/images/autochess/portraits/minimal/grove_mender.png',
  joi: '/images/autochess/portraits/minimal/cog-scribe.png',
  yua: '/images/autochess/portraits/minimal/yua.png',
  rhea: '/images/autochess/portraits/minimal/spark-mage.png',
  nightin: '/images/autochess/portraits/minimal/nightin.png',
  michiya: '/images/autochess/portraits/minimal/rift-stalker-head.png',
  mofu: '/images/autochess/portraits/minimal/mossback.png',
  harei: '/images/autochess/portraits/minimal/dawn_duelist.png',
  mitsuri: '/images/autochess/portraits/minimal/mitsuri.png',
  komichi: '/images/autochess/portraits/minimal/komichi.png',
};

export function getLiverDirectoryMember(liverId: string): LiverDirectoryMember | null {
  const liver = getLiverConfig(liverId);
  if (!liver) return null;

  return {
    liver,
    displayName: LIVER_DIRECTORY_DISPLAY_NAMES[liverId] || liver.name,
    portraitSrc: LIVER_DIRECTORY_PORTRAITS[liverId] || liver.avatarSrc,
    fallbackSrc: LIVER_DIRECTORY_PORTRAITS[liverId] ? liver.avatarSrc : undefined,
  };
}
