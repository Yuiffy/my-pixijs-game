type ArchPoint = { t: number; h: number; side: number };
export type BridgeAppearanceBeam = { a: ArchPoint; b: ArchPoint; width: number; depth: number; color: string; kind: "arch" | "hanger" | "backstay" };

// CREC's 2011/2014 project reports give 63 + 2×210 + 63 m and three V
// frames. Guangxi News' 2022 report identifies the white twin seagull arches.
// The source axis/deck stays in guangya.ts. Rise, section and hanger spacing
// below are visual estimates, not engineering elevations or paint samples.
export const GUANGYA_APPEARANCE = {
  paint: "#f0f1eb",
steel: "#c7d0cd",
spans: [63, 210, 210, 63],
  estimatedRiseAboveDeck: 30,
estimatedSpringBelowDeck: 12,
ribWidth: 2.2,
};
export const GUANGYA_PIER_FRACTIONS = [63 / 546, 273 / 546, 483 / 546];

export function buildGuangyaAppearance(offset: number): BridgeAppearanceBeam[] {
  const result: BridgeAppearanceBeam[] = [];
  const { paint, steel, estimatedRiseAboveDeck: rise, estimatedSpringBelowDeck: drop, ribWidth } = GUANGYA_APPEARANCE;
  for (const side of [-offset, offset]) {
    for (let span = 0; span < 2; span++) {
      const start = GUANGYA_PIER_FRACTIONS[span]; const end = GUANGYA_PIER_FRACTIONS[span + 1];
      const point = (u: number): ArchPoint => ({ t: start + (end - start) * u, h: -drop + (rise + drop) * Math.sin(Math.PI * u), side });
      for (let j = 0; j < 40; j++) {
        const u = (j + 0.5) / 40;
        result.push({ a: point(j / 40), b: point((j + 1) / 40), width: ribWidth, depth: 2.5 + 2 * (1 - Math.sin(Math.PI * u)), color: paint, kind: "arch" });
      }
      for (let j = 1; j < 19; j++) {
        const top = point(j / 19);
        if (top.h <= 0.8) continue;
        result.push({ a: { ...top, h: 0.15 }, b: top, width: 0.22, depth: 0.22, color: steel, kind: "hanger" });
      }
    }
    // The side shoulders complete the outer V frames. No overhead cross
    // bracing is added between the two independently visible arch planes.
    result.push({ a: { t: 0, h: -0.6, side }, b: { t: GUANGYA_PIER_FRACTIONS[0], h: -drop, side }, width: ribWidth, depth: 3.8, color: paint, kind: "backstay" });
    result.push({ a: { t: GUANGYA_PIER_FRACTIONS[2], h: -drop, side }, b: { t: 1, h: -0.6, side }, width: ribWidth, depth: 3.8, color: paint, kind: "backstay" });
  }
  return result;
}
