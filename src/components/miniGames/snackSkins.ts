export type SnackSkin = "original" | "sui";

export const SNACK_SKINS: ReadonlyArray<{
  id: SnackSkin;
  name: string;
  detail: string;
}> = [
  { id: "original", name: "原创主播", detail: "可可长发 · 薄荷小衫" },
  { id: "sui", name: "岁己 SUI", detail: "小猫帽 · 银色双马尾 · 紫色外套" },
];

export const SNACK_SKIN_STORAGE_KEY = "mini-snack-skin-v1";
