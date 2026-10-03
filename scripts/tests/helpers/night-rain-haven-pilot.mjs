// Public movement/combat, ordinary interactions and dialogue choices only.
// Chapter-two fixture was recorded from a completed Chrome playthrough.
export const HAVEN_HUB_ROUTE = [
  { travel: 'courtyard' },
  { id: 'haven-sign' },
  { id: 'haven-lamp', rest: true, capture: '01-haven' },
  { id: 'haven-keeper', choice: 'deposit', talkCapture: '02-keeper', capture: '03-savings' },
  { id: 'haven-keeper', choice: 'withdraw' },
];
export const HAVEN_SCRIBE_ROUTE = [
  { id: 'names-register', capture: '04-study' },
  { id: 'scribe-field', choice: 'invite-scribe', talkCapture: '05-scribe-invitation' },
  { id: 'names-gate', capture: '06-study-shortcut' },
  { id: 'courtyard', rest: true },
];
export const HAVEN_BOATWRIGHT_ROUTE = [
  { travel: 'village-lamp' },
  { id: 'boatwright-field', talkCapture: '07-boatyard' },
  { id: 'keel-rubbing', capture: '08-loft' },
  { id: 'boatwright-field', choice: 'invite-boatwright', talkCapture: '09-boatwright-invitation' },
  { id: 'boatyard-ferry', capture: '10-ferry-home' },
  { id: 'haven-lamp', rest: true },
];
export const HAVEN_PUZZLE_ROUTE = [
  { id: 'haven-scribe', talkCapture: '11-scribe-home' },
  { id: 'haven-boatwright', talkCapture: '12-boatwright-home' },
  { id: 'haven-bell' }, { id: 'haven-name', capture: '13-puzzle-reset' },
  { id: 'haven-bell' }, { id: 'haven-water' }, { id: 'haven-name', capture: '14-three-echoes' },
  { id: 'haven-lamp', rest: true },
  { id: 'well-door', capture: '15-unsealed' },
  { id: 'well-testimony', capture: '16-testimony' },
  { x: -9, y: 0, z: 137, capture: '17-guardian-cleared' },
  { id: 'well-choice', talkCapture: '18-last-lantern' },
];
export const HAVEN_RETURN_ROUTE = [
  { id: 'well-return', capture: '20-return-stairs' },
  { id: 'haven-keeper', talkCapture: '21-keeper-ending' },
  { id: 'haven-scribe', talkCapture: '22-scribe-ending' },
  { id: 'haven-lamp', capture: '23-home-ending' },
];
export const HAVEN_ROUTE = [...HAVEN_HUB_ROUTE, ...HAVEN_SCRIBE_ROUTE, ...HAVEN_BOATWRIGHT_ROUTE, ...HAVEN_PUZZLE_ROUTE];
