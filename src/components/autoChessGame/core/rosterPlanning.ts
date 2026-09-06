import { TRAITS, UNIT_DEFS, traitLevelForCount, type TraitId, type UnitId } from "./gameData";
import type { OwnedUnit } from "./gameTypes";

export const previewTraitAddition = (
  board: Array<OwnedUnit | null>,
  unitId: UnitId,
  boardCap: number,
) => {
  const ids = new Set(board.filter((unit): unit is OwnedUnit => Boolean(unit)).map(unit => unit.id));
  const alreadyDeployed = ids.has(unitId);
  const deploysImmediately = board.filter(Boolean).length < boardCap && board.includes(null);
  return UNIT_DEFS[unitId].traits.map((id: TraitId) => {
    const count = Array.from(ids).filter(member => UNIT_DEFS[member].traits.includes(id)).length;
    const level = traitLevelForCount(TRAITS[id], count);
    const nextCount = count + (alreadyDeployed ? 0 : 1);
    const nextLevel = traitLevelForCount(TRAITS[id], nextCount);
    return { id, count, level, nextCount, nextLevel, advances: nextLevel > level, deploysImmediately };
  });
};
