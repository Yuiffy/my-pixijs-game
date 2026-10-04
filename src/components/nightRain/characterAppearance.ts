/** Reviewed against the original character images in public/images/livers. */
export type CharacterAppearance = {
  name: string; reference: string; hair: string; coat: string; trim: string;
  eye: string; rightEye?: string; boots: string; leg: string; skin: string; accent: string;
};
export const CHARACTER_APPEARANCES = {
  sui: { name: '岁己', reference: '/images/livers/sui.png', hair: '#d9dbe8', coat: '#a28ac7', trim: '#34303e', eye: '#e95839', boots: '#282330', leg: '#7c7183', skin: '#f0d7c8', accent: '#c8a3e8' },
  shiori: { name: '栞栞', reference: '/images/livers/shiori.png', hair: '#eee0c1', coat: '#e7d5ae', trim: '#705438', eye: '#6a9fd9', boots: '#594134', leg: '#584a4b', skin: '#f4dccd', accent: '#fff8e8' },
  nagisa: { name: '米汀', reference: '/images/livers/nagisa.png', hair: '#bcc9d8', coat: '#eee7dd', trim: '#343643', eye: '#7a9bb0', boots: '#242936', leg: '#edcdb8', skin: '#f4dccd', accent: '#b9a078' },
  mizuki: { name: '弥月', reference: '/images/livers/mizuki.png', hair: '#efe3c2', coat: '#292f37', trim: '#d1b77c', eye: '#a986db', rightEye: '#dd9cbc', boots: '#30323e', leg: '#4c4c5c', skin: '#f4d9cb', accent: '#eee9dd' },
  harei: { name: '花礼', reference: '/images/livers/harei.png', hair: '#30323e', coat: '#3c3c51', trim: '#eeedf2', eye: '#52cbed', boots: '#292b37', leg: '#454356', skin: '#f6dfd7', accent: '#a9b5c7' },
  rhea: { name: '瑞娅', reference: '/images/livers/rhea.png', hair: '#eeeef5', coat: '#eeeef3', trim: '#c9a562', eye: '#867dcc', boots: '#e6e3ed', leg: '#e7e4ed', skin: '#f5dccb', accent: '#515364' },
  yua: { name: '悠亚', reference: '/images/livers/yua.png', hair: '#c6d6df', coat: '#d5e7f5', trim: '#7ca6d2', eye: '#83a9b9', boots: '#d9e6f1', leg: '#374254', skin: '#efd7cc', accent: '#d78450' },
  sumi: { name: '礼墨', reference: '/images/livers/sumi.jpg', hair: '#34302f', coat: '#373741', trim: '#f0e8dd', eye: '#bd99d1', boots: '#34333c', leg: '#47434b', skin: '#f1d4c5', accent: '#dca044' },
  rutice: { name: '露缇', reference: '/images/livers/rutice.jpg', hair: '#b49acb', coat: '#e8e2e9', trim: '#c4ad71', eye: '#b997d5', boots: '#d1c9dc', leg: '#ded5e8', skin: '#f0dacb', accent: '#f5efd7' },
  nana: { name: '七海', reference: '/images/livers/nana7mi.png', hair: '#79544f', coat: '#303b49', trim: '#ede9e4', eye: '#e5b855', boots: '#30343e', leg: '#434149', skin: '#f1d5c2', accent: '#699cc5' },
  azi: { name: '阿梓', reference: '/images/livers/azi.webp', hair: '#7663bb', coat: '#91a269', trim: '#ddd393', eye: '#e5b855', boots: '#586852', leg: '#efd7cf', skin: '#f1d5c2', accent: '#bccc79' },
} satisfies Record<string, CharacterAppearance>;
export type CharacterId = keyof typeof CHARACTER_APPEARANCES;
export function characterAppearance(id: CharacterId): CharacterAppearance { return CHARACTER_APPEARANCES[id]; }
