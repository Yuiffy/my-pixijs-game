// Landmarks and combat positions only. The same route drives the simulation
// and Chrome using normal input; no state, HP, keys or progression are injected.
export const VALLEY_ENTRY_ROUTE = [
  { id: 'valley-entry', capture: '01-postern' },
  { id: 'valley-note', capture: '02-overlook' },
  { id: 'village-lamp', rest: true, upgrade: true, capture: '03-village' },
  { id: 'village-note' },
];
export const VALLEY_WEST_ROUTE = [
  { x: -165, y: 2, z: -343, capture: '04-firefly-walk' },
  { id: 'salt-cache', capture: '05-salt-store' },
  { x: -202, y: 2, z: -401, capture: '06-warden-cleared' },
  { id: 'mill-sluice', capture: '07-west-sluice' },
  { id: 'ferry-winch', capture: '08-ferry-repaired' },
];
export const VALLEY_FERRY_ROUTE = [
  { id: 'ferry-mill', capture: '09-ferry-village' },
  { id: 'ferry-village-city', capture: '10-ferry-old-city' },
  { id: 'ferry-city', capture: '11-ferry-back' },
  { id: 'village-lamp', rest: true, upgrade: true },
];
export const VALLEY_EAST_ROUTE = [
  { id: 'bamboo-note', capture: '12-bamboo-pass' },
  { id: 'bamboo-dew', capture: '13-bamboo-garden' },
  { id: 'cliff-gate', capture: '14-cliff-shortcut' },
  { id: 'village-lamp', rest: true, upgrade: true },
  { id: 'monastery-lamp', rest: true, upgrade: true, capture: '15-monastery' },
  { x: -96, y: 18, z: -414, capture: '16-abbot-court' },
  { id: 'monastery-sluice', capture: '17-east-sluice' },
  { id: 'monastery-cache' },
];
export const VALLEY_FINISH_ROUTE = [
  { id: 'valley-flask', capture: '18-lotus-pavilion' },
  { id: 'confluence-lamp', rest: true, upgrade: true, capture: '19-confluence' },
  { id: 'reed-gate', capture: '20-reed-shortcut' },
  { id: 'village-lamp', rest: true, upgrade: true },
  { id: 'confluence-lamp', rest: true, upgrade: true },
  { id: 'river-note' },
  { id: 'river-door', capture: '21-double-lock' },
  { x: -150, y: 8, z: -508, capture: '22-serpent-cleared' },
  { id: 'river-heart', capture: '23-valley-ending' },
];
export const VALLEY_ROUTE = [...VALLEY_ENTRY_ROUTE, ...VALLEY_WEST_ROUTE, ...VALLEY_FERRY_ROUTE, ...VALLEY_EAST_ROUTE, ...VALLEY_FINISH_ROUTE];
