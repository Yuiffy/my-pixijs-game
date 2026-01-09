export const GameConfig = {
  width: 1000,
  height: 600,
  gravity: { x: 0, y: 0.3 },
  initialGold: 10,
  initialHp: 100,
  barracksPositions: [
    { x: 150, y: 150 }, { x: 300, y: 150 }, { x: 450, y: 150 }, { x: 600, y: 150 },
    { x: 150, y: 350 }, { x: 300, y: 350 }, { x: 450, y: 350 }, { x: 600, y: 350 }
  ],
  waveDelay: 8000,
  baseStats: {
    player: { x: 50, y: 300, color: 0x00ff00, label: 'BASE_PLAYER' },
    enemy: { x: 950, y: 300, color: 0xff0000, label: 'BASE_ENEMY' }
  },
  sellZone: {
    x: 900,
    y: 150,
    width: 100,
    height: 100
  }
};
