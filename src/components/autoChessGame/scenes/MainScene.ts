// src/components/autoChessGame/scenes/MainScene.ts
import * as Phaser from 'phaser';
import { UNIT_TYPES } from '../config/UnitsData';
import Unit from '../objects/Unit';
import Barracks from '../objects/Barracks';

// 预设的 8 个兵营位置 (2行4列，在左侧区域)
const BARRACKS_POSITIONS = [
  { x: 150, y: 150 }, { x: 250, y: 150 }, { x: 350, y: 150 }, { x: 450, y: 150 },
  { x: 150, y: 350 }, { x: 250, y: 350 }, { x: 350, y: 350 }, { x: 450, y: 350 }
];

export default class MainScene extends Phaser.Scene {
  playerUnits: any;

  enemyUnits: any;

  playerBarracks: any[] = [];

  playerBase: any;

  enemyBase: any;

  playerCategory: any;

  enemyCategory: any;

  wallCategory: any;

  playerHp = 100;

  enemyHp = 100;

  playerBaseBarFg: any;

  enemyBaseBarFg: any;

  constructor() {
    super('MainScene');
  }

  create() {
    console.log('=== MainScene v4.0 (Auto Placement) ===');

    // 1. 资源准备
    this.createBoxTexture('box_texture');
    Object.values(UNIT_TYPES).forEach((unitData: any) => {
      if (this.textures.exists(unitData.textureKey)) this.textures.remove(unitData.textureKey);
      Unit.createTexture(this, unitData);
    });

    // 2. 物理世界
    this.matter.world.setBounds(0, 0, 1000, 600);
    this.playerCategory = this.matter.world.nextCategory();
    this.enemyCategory = this.matter.world.nextCategory();
    this.wallCategory = this.matter.world.nextCategory();

    this.playerUnits = this.add.group();
    this.enemyUnits = this.add.group();
    this.playerBarracks = [];

    // 3. 基地
    this.createBase(50, 300, 'BASE_PLAYER', 0x00ff00, this.enemyCategory);
    this.createBase(950, 300, 'BASE_ENEMY', 0xff0000, this.playerCategory);
    this.createBaseHealthBars();

    // 4. 事件监听 (修改了购买事件)
    this.game.events.off('AUTO_BUY_UNIT');
    this.game.events.on('AUTO_BUY_UNIT', this.handleAutoBuyUnit, this);

    this.game.events.off('REFRESH_SHOP');
    this.game.events.on('REFRESH_SHOP', () => this.refreshShop());

    this.game.events.off('GAME_START');
    this.game.events.on('GAME_START', () => this.spawnEnemyWave()); // 开始才刷怪

    // 自动刷怪 Loop
    this.time.addEvent({ delay: 8000, loop: true, callback: () => this.spawnEnemyWave() });

    this.initializeShop();
  }

  // 自动放置逻辑
  handleAutoBuyUnit({ unitKey }: { unitKey: string }) {
    if (this.playerBarracks.length >= 8) return;

    // 获取下一个空位的坐标
    const posIndex = this.playerBarracks.length;
    const pos = BARRACKS_POSITIONS[posIndex];

    console.log(`🎯 自动放置兵营: ${unitKey} at [${posIndex}] (${pos.x}, ${pos.y})`);

    const data = (UNIT_TYPES as any)[unitKey];
    const barracks = new Barracks(this, pos.x, pos.y, unitKey, data);
    this.playerBarracks.push(barracks);

    this.calculateSynergies();
    this.game.events.emit('BARRACKS_PLACED', this.playerBarracks.length);
  }

  // ... (其他辅助方法) ...
  createBoxTexture(key: string) {
    if (this.textures.exists(key)) return;
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 64, 64); ctx.strokeRect(0, 0, 64, 64); }
    this.textures.addCanvas(key, canvas);
  }

  createBase(x: number, y: number, label: string, color: number, collidesWith: number) {
    const base = this.matter.add.sprite(x, y, 'box_texture', undefined, { isStatic: true, label });
    base.setDisplaySize(50, 500);
    base.setTint(color);
    base.setCollisionCategory(this.wallCategory);
    base.setCollidesWith([collidesWith]);
    if (label === 'BASE_PLAYER') this.playerBase = base; else this.enemyBase = base;
  }

  spawnEnemyWave() {
    // 简单刷怪
    for (let i = 0; i < 3; i++) {
      const enemy = new Unit(this, 900, 100 + i * 100, (UNIT_TYPES as any).sui_warrior, true);
      this.enemyUnits.add(enemy);
    }
  }

  refreshShop() {
    const keys = Object.keys(UNIT_TYPES);
    // 随机三个
    const shop = [
      keys[Math.floor(Math.random() * keys.length)],
      keys[Math.floor(Math.random() * keys.length)],
      keys[Math.floor(Math.random() * keys.length)]
    ];
    this.game.events.emit('UPDATE_SHOP', shop);
  }

  initializeShop() { this.refreshShop(); }

  calculateSynergies() {
    const counts: any = {};
    this.playerBarracks.forEach(b => b.unitData.factions.forEach((f:string) => counts[f] = (counts[f] || 0) + 1));
    this.game.events.emit('UPDATE_SYNERGY', counts);
  }

  update(t:number, d:number) {
    this.playerUnits?.children.each((u:any) => u.update(t, d));
    this.enemyUnits?.children.each((u:any) => u.update(t, d));
  }

  createBaseHealthBars() {
    this.playerBaseBarFg = this.add.rectangle(25, 550, 40, 8, 0x00ff00);
    this.enemyBaseBarFg = this.add.rectangle(975, 550, 40, 8, 0xff0000);
  }
}
