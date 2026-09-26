export const SKINS = [
  { id: "host", name: "主播酱", description: "暖棕长发 · 玫瑰毛衣", hair: "#64464a", eyes: "#4f4344", outfit: "#bf8e91", accent: "#e0ccb5", dark: "#6a625e", backdrop: "#626d88" },
  { id: "sui", name: "岁己", description: "银色双马尾 · 猫耳帽", hair: "#d8d4ed", eyes: "#d95a68", outfit: "#ae8fd1", accent: "#cfb8ef", dark: "#373245", backdrop: "#655581" },
  { id: "nana7mi", name: "七海", description: "棕发金瞳 · 鲨鱼外套", hair: "#725047", eyes: "#dc9e32", outfit: "#424957", accent: "#75b6d5", dark: "#303743", backdrop: "#496c82" },
] as const;
export type SkinId = (typeof SKINS)[number]["id"];
export type Skin = (typeof SKINS)[number];
export const skinOf = (id: unknown): Skin => SKINS.find((skin) => skin.id === id) ?? SKINS[0];
