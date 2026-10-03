export const SAVE_ROOT = 'night-rain-v1';
export const SLOT_COUNT = 5;
export function slotKey(slot: number) { return `${SAVE_ROOT}-slot-${Math.max(1, Math.min(SLOT_COUNT, Math.trunc(slot)))}`; }
/** Copy a legacy save only into an empty first slot; never replace another traveller. */
export function migrateLegacy(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  const legacy = storage.getItem(SAVE_ROOT);
  if (legacy && !storage.getItem(slotKey(1))) storage.setItem(slotKey(1), legacy);
}
export function selectedSlot(storage: Pick<Storage, 'getItem'>) { const slot = Number(storage.getItem(`${SAVE_ROOT}-active-slot`) ?? 1); return Number.isInteger(slot) && slot >= 1 && slot <= SLOT_COUNT ? slot : 1; }
