import { round } from './core';
import type { Factory } from './fabEngine';

const cents = (value: number) => Math.round(value * 100) / 100 + 0;

export function fabOperatingAccount(
  factory: Pick<Factory, 'inventory' | 'fabs' | 'debt' | 'cash'>,
  produced: number,
  costPerUnit: number,
  quote: number,
  sold: number,
) {
  const endingInventory = factory.inventory + produced - sold;
  const revenue = cents(sold * quote);
  const productionCost = cents(produced * costPerUnit);
  const maintenance = factory.fabs * 6;
  const storage = cents(endingInventory * 0.08);
  const interest = cents(factory.debt * 0.04);
  // Preserve the game's existing one-decimal settlement rule, including its
  // operation order. The ledger separately exposes the small rounding entry.
  const net = round(sold * quote - produced * costPerUnit - maintenance -
    endingInventory * 0.08 - factory.debt * 0.04);
  const rounding = cents(net - (revenue - productionCost - maintenance - storage - interest));
  return {
    startingInventory: factory.inventory,
    produced,
    sold,
    endingInventory,
    quote,
    revenue,
    productionCost,
    maintenance,
    storage,
    interest,
    rounding,
    net,
    cashBefore: factory.cash,
    cashAfter: round(factory.cash + net),
  };
}

export type FabQuarterReport = ReturnType<typeof fabOperatingAccount> & {
  turn: number;
  offered: number;
  demand: number;
  totalOffered: number;
  totalSold: number;
};

// Reports are optional derived history. A damaged report never destroys an
// otherwise playable legacy save; discard it and record the next settlement.
export function readFabQuarterReport(value: unknown, turn: number, ended: boolean): FabQuarterReport | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const r = value as FabQuarterReport;
  const fields: (keyof FabQuarterReport)[] = [
    'turn', 'offered', 'demand', 'totalOffered', 'totalSold', 'startingInventory',
    'produced', 'sold', 'endingInventory', 'quote', 'revenue', 'productionCost',
    'maintenance', 'storage', 'interest', 'rounding', 'net', 'cashBefore', 'cashAfter',
  ];
  if (fields.some(key => typeof r[key] !== 'number' || !Number.isFinite(r[key]) || Math.abs(r[key]) > 1e9)) return undefined;
  const counts = ['turn', 'offered', 'demand', 'totalOffered', 'totalSold', 'startingInventory', 'produced', 'sold', 'endingInventory'] as const;
  if (counts.some(key => !Number.isInteger(r[key]) || r[key] < 0) || r.turn < 1 || r.turn > 24 || r.turn !== turn - (ended ? 0 : 1)) return undefined;
  if (r.offered > r.startingInventory + r.produced || r.sold > r.offered || r.sold > r.totalSold ||
      r.totalSold > Math.min(r.demand, r.totalOffered) || r.offered > r.totalOffered ||
      r.endingInventory !== r.startingInventory + r.produced - r.sold) return undefined;
  if (['quote', 'revenue', 'productionCost', 'maintenance', 'storage', 'interest', 'cashBefore'].some(key => r[key as keyof FabQuarterReport] < 0)) return undefined;
  if (cents(r.revenue) !== cents(r.sold * r.quote) || cents(r.storage) !== cents(r.endingInventory * 0.08) ||
      Math.abs(r.rounding) > 0.051 || cents(r.net) !== cents(r.revenue - r.productionCost - r.maintenance - r.storage - r.interest + r.rounding) ||
      r.cashAfter !== round(r.cashBefore + r.net)) return undefined;
  return Object.fromEntries(fields.map(key => [key, r[key]])) as FabQuarterReport;
}
