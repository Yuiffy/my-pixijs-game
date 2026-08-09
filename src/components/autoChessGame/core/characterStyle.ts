import { useSyncExternalStore } from "react";
import { UNIT_DEFS, type UnitId } from "./gameData";

export const CHARACTER_STYLES = ["minimal", "detail", "classic"] as const;

export type CharacterStyle = (typeof CHARACTER_STYLES)[number];
export type ResolvedUnitPortrait = {
  portrait: string;
  portraitFocus?: "center" | "top";
  portraitStyle: "round" | "sprite";
};

const STORAGE_KEY = "rift-line-character-style";
const listeners = new Set<() => void>();
let activeStyle: CharacterStyle = "minimal";
let storageRead = false;

const CLASSIC_OVERRIDES: Partial<Record<UnitId, ResolvedUnitPortrait>> = {
  sun_guard: { portrait: "/images/livers/hazel.png", portraitFocus: "top", portraitStyle: "round" },
  ember_blade: { portrait: "/images/livers/liko.png", portraitFocus: "top", portraitStyle: "round" },
  gale_archer: { portrait: "/images/livers/izayoi.png", portraitFocus: "top", portraitStyle: "round" },
  cog_scribe: { portrait: "/images/livers/joi.png", portraitFocus: "top", portraitStyle: "round" },
  mossback: { portrait: "/images/livers/mofu.jpg", portraitFocus: "top", portraitStyle: "round" },
  sui: { portrait: "/images/materials/red/1d5ad005aff0b4b648a0f1ef6b8d0cd71954091502.png", portraitFocus: "top", portraitStyle: "round" },
  spark_mage: { portrait: "/images/livers/rhea.png", portraitFocus: "top", portraitStyle: "round" },
  clock_gunner: { portrait: "/images/livers/mizuki.png", portraitFocus: "top", portraitStyle: "round" },
  dawn_duelist: { portrait: "/images/livers/harei.png", portraitFocus: "top", portraitStyle: "round" },
  grove_mender: { portrait: "/images/livers/nana7mi.png", portraitFocus: "top", portraitStyle: "round" },
  cinder_ram: { portrait: "/images/livers/azi.webp", portraitFocus: "top", portraitStyle: "round" },
  sui_blue: { portrait: "/images/materials/blue/5a2bcc519c33a2213134bdc196799d041954091502.png", portraitFocus: "top", portraitStyle: "round" },
  shiori: { portrait: "/images/livers/shiori.png", portraitFocus: "top", portraitStyle: "round" },
  sui_bird: { portrait: "/images/materials/bird/岁己_小鸟跳静态图.png", portraitStyle: "round" },
  sui_flower: { portrait: "/images/materials/flower/622764c8178eb3f6411da20a917cc0321954091502.png", portraitFocus: "top", portraitStyle: "round" },
  yua: { portrait: "/images/livers/yua.png", portraitFocus: "top", portraitStyle: "round" },
  seki_boar_king: { portrait: "/images/livers/seki.webp", portraitFocus: "top", portraitStyle: "round" },
  sumi: { portrait: "/images/livers/sumi.jpg", portraitFocus: "top", portraitStyle: "round" },
  mitsuri: { portrait: "/images/livers/mitsuri.jpg", portraitFocus: "top", portraitStyle: "round" },
  guangyi: { portrait: "/images/livers/guangyi.jpg", portraitFocus: "top", portraitStyle: "round" },
  sui_cat: { portrait: "/images/materials/岁己SUI小猫帽带饼干岁紫色外套双马尾.png", portraitFocus: "top", portraitStyle: "round" },
  nagisa: { portrait: "/images/livers/nagisa.png", portraitFocus: "top", portraitStyle: "round" },
  tower_god: { portrait: "/images/livers/shengge.jpg", portraitFocus: "top", portraitStyle: "round" },
  biscuit_sui: { portrait: "/images/materials/biscuit/饼干岁2.png", portraitFocus: "top", portraitStyle: "round" },
  nori: { portrait: "/images/livers/nori.jpg", portraitFocus: "top", portraitStyle: "round" },
  meme: { portrait: "/images/livers/meme.jpg", portraitFocus: "top", portraitStyle: "round" },
  zeyin: { portrait: "/images/livers/zeyin.jpg", portraitFocus: "top", portraitStyle: "round" },
  kioi: { portrait: "/images/livers/kioi.jpg", portraitFocus: "top", portraitStyle: "round" },
  nightin: { portrait: "/images/livers/nightin.jpg", portraitFocus: "top", portraitStyle: "round" },
  tiandou: { portrait: "/images/livers/tiandou.jpg", portraitFocus: "top", portraitStyle: "round" },
  youyi: { portrait: "/images/livers/youyi.jpg", portraitFocus: "top", portraitStyle: "round" },
  akirinco: { portrait: "/images/livers/akirinco.jpg", portraitFocus: "top", portraitStyle: "round" },
  lovely: { portrait: "/images/livers/lovely.webp", portraitFocus: "top", portraitStyle: "round" },
  mumu: { portrait: "/images/livers/mumu.webp", portraitFocus: "top", portraitStyle: "round" },
  yukisyo: { portrait: "/images/livers/yukisyo.png", portraitFocus: "top", portraitStyle: "round" },
  xuehui: { portrait: "/images/livers/xuehui.jpg", portraitFocus: "top", portraitStyle: "round" },
  rei: { portrait: "/images/livers/rei.jpg", portraitFocus: "top", portraitStyle: "round" },
  rutice: { portrait: "/images/livers/rutice.jpg", portraitFocus: "top", portraitStyle: "round" },
  lian: { portrait: "/images/livers/lian.jpg", portraitFocus: "top", portraitStyle: "round" },
  pako: { portrait: "/images/livers/pako.jpg", portraitFocus: "top", portraitStyle: "round" },
  miki_guest: { portrait: "/images/autochess/enemy-guests/miki.jpg", portraitFocus: "center", portraitStyle: "round" },
  hatsuse_guest: { portrait: "/images/autochess/enemy-guests/hatsuse.jpg", portraitFocus: "center", portraitStyle: "round" },
};

const keepOriginalInMinimal = (unitId: UnitId) => (
  unitId === "rift_tyrant"
);

const isCharacterStyle = (value: unknown): value is CharacterStyle => (
  typeof value === "string" && CHARACTER_STYLES.includes(value as CharacterStyle)
);

const readStoredStyle = () => {
  if (storageRead || typeof window === "undefined") return;
  storageRead = true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isCharacterStyle(stored)) activeStyle = stored;
};

export const getCharacterStyle = (): CharacterStyle => {
  readStoredStyle();
  return activeStyle;
};

export const setCharacterStyle = (style: CharacterStyle) => {
  readStoredStyle();
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, style);
  if (activeStyle === style) return;
  activeStyle = style;
  listeners.forEach((listener) => listener());
};

const subscribeCharacterStyle = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useCharacterStyle = (): CharacterStyle => useSyncExternalStore<CharacterStyle>(
  subscribeCharacterStyle,
  getCharacterStyle,
  () => "minimal",
);

export const resolveUnitPortrait = (
  unitId: UnitId,
  style: CharacterStyle = getCharacterStyle(),
): ResolvedUnitPortrait => {
  const definition = UNIT_DEFS[unitId];
  const base: ResolvedUnitPortrait = {
    portrait: definition.portrait || "",
    portraitFocus: definition.portraitFocus,
    portraitStyle: definition.portraitStyle || "round",
  };
  if (!base.portrait) return base;
  if (style === "classic") {
    const classicOverride = CLASSIC_OVERRIDES[unitId];
    if (classicOverride) return classicOverride;
    const filename = base.portrait.slice(base.portrait.lastIndexOf("/") + 1);
    return {
      ...base,
      portrait: `/images/autochess/portraits/classic/${filename}`,
    };
  }
  if (style === "minimal" && keepOriginalInMinimal(unitId)) return base;

  const filename = base.portrait.slice(base.portrait.lastIndexOf("/") + 1);
  return {
    portrait: `/images/autochess/portraits/${style}/${filename}`,
    portraitStyle: "sprite",
  };
};
