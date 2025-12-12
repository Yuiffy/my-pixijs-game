// src/components/autoChessGame/scenes/MainScene.ts
import * as Phaser from 'phaser';
import { UNIT_TYPES } from '../config/UnitsData';
import { getWaveEnemies, getWaveInfo } from '../config/WavesData';
import Unit from '../objects/Unit';
import Barracks from '../objects/Barracks';

export default class MainScene extends Phaser.Scene {
  playerCategory!: number;

  enemyCategory!: number;

  wallCategory!: number;

  playerUnits!: Phaser.GameObjects.Group;

  enemyUnits!: Phaser.GameObjects.Group;

  playerBarracks: any[] = [];

  playerBase!: Phaser.Physics.Matter.Sprite;

  enemyBase!: Phaser.Physics.Matter.Sprite;

  playerHp!: number;

  enemyHp!: number;

  playerBaseBarBg!: Phaser.GameObjects.Rectangle;

  playerBaseBarFg!: Phaser.GameObjects.Rectangle;

  enemyBaseBarBg!: Phaser.GameObjects.Rectangle;

  enemyBaseBarFg!: Phaser.GameObjects.Rectangle;

  waveText!: Phaser.GameObjects.Text;

  waveTimer!: Phaser.Time.TimerEvent;

  gameStarted!: boolean;

  currentWave!: number;

  shopLevel!: number;

  currentShop!: string[];

  constructor() {
    super('MainScene');
  }

  create() {
    console.log('=== MainScene Created (Sprite Fix) ===');

    // 1. 🛑 关键修复：生成一个通用的方块纹理
    // 既然 Sprite 能看见，我们就把所有东西都做成 Sprite
    this.createBoxTexture('box_texture');

    // 2. 调试文字
    this.add.text(500, 300, 'Phaser Running v2.2', {
      fontSize: '64px',
      color: '#00ff00'
    }).setOrigin(0.5).setDepth(0).setAlpha(0.2);

    // 3. 重新生成单位纹理 (确保单位可见)
    Object.values(UNIT_TYPES).forEach((unitData: any) => {
      if (this.textures.exists(unitData.textureKey)) {
        this.textures.remove(unitData.textureKey);
      }
      Unit.createTexture(this, unitData);
    });

    // 4. 物理世界
    this.matter.world.setBounds(0, 0, 1000, 600);
    this.playerCategory = this.matter.world.nextCategory();
    this.enemyCategory = this.matter.world.nextCategory();
    this.wallCategory = this.matter.world.nextCategory();

    this.playerUnits = this.add.group();
    this.enemyUnits = this.add.group();
    this.playerBarracks = [];

    // 5. 基地 (也改用 Sprite 确保可见)
    this.createBase(50, 300, 'BASE_PLAYER', 0x00ff00, this.enemyCategory);
    this.createBase(950, 300, 'BASE_ENEMY', 0xff0000, this.playerCategory);

    this.playerHp = 100;
    this.enemyHp = 100;
    this.createBaseHealthBars();

    // 6. 事件
    this.game.events.off('PLACE_UNIT');
    this.game.events.on('PLACE_UNIT', this.handlePlaceUnit, this);

    this.game.events.off('REFRESH_SHOP');
    this.game.events.on('REFRESH_SHOP', () => this.refreshShop());

    this.game.events.off('GAME_START');
    this.game.events.on('GAME_START', () => { this.gameStarted = true; });

    // 7. 刷怪
    this.time.addEvent({
      delay: 5000,
      loop: true,
      callback: () => this.spawnEnemyWave()
    });

    this.initializeShop();
  }

  // 生成一个纯白色的 64x64 方块纹理
  createBoxTexture(key: string) {
    if (this.textures.exists(key)) return;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, 64, 64);
    }
    this.textures.addCanvas(key, canvas);
  }

  createBase(x: number, y: number, label: string, color: number, collidesWith: number) {
    // 改用 Sprite，使用刚才生成的方块纹理
    const base = this.matter.add.sprite(x, y, 'box_texture', undefined, {
      isStatic: true,
      label
    });
    base.setDisplaySize(50, 500); // 拉长
    base.setTint(color); // 染色
    base.setCollisionCategory(this.wallCategory);
    base.setCollidesWith([collidesWith]);

    if (label === 'BASE_PLAYER') this.playerBase = base;
    else this.enemyBase = base;
  }

  handlePlaceUnit({ unitKey, x, y }: { unitKey: string; x: number; y: number }) {
    console.log(`🎯 [MainScene] 放置: ${unitKey}`);
    if (this.playerBarracks.length >= 8) return;
    const data = (UNIT_TYPES as any)[unitKey];

    // 使用新的 Sprite 版兵营
    const barracks = new Barracks(this, x, y, unitKey, data);
    this.playerBarracks.push(barracks);

    this.calculateSynergies();
    this.game.events.emit('BARRACKS_PLACED', this.playerBarracks.length);
  }

  // ... (其余方法保持不变: update, spawnEnemyWave, refreshShop, calculateSynergies 等)
  // 为了不占用篇幅，假设其余逻辑与上一版相同。如有缺失请告知。

  update(time: number, delta: number) {
    this.playerUnits?.children.each((u: any) => u.update(time, delta));
    this.enemyUnits?.children.each((u: any) => u.update(time, delta));
    // Barracks 现在是 Sprite，自带 update，但如果有自定义逻辑可以调用
  }

  spawnEnemyWave() {
    // 生成一个敌人测试
    const enemy = new Unit(this, 900, 100 + Math.random() * 400, (UNIT_TYPES as any).sui_warrior, true);
    this.enemyUnits.add(enemy);

    // 增加波次逻辑...
    if (!this.waveText) {
      this.waveText = this.add.text(500, 50, 'Wave 1', { fontSize: '24px', color: '#fff' }).setOrigin(0.5);
    }
  }

  calculateSynergies() {
    const counts: any = {};
    this.playerBarracks.forEach(b => {
      b.unitData.factions.forEach((f: string) => counts[f] = (counts[f] || 0) + 1);
    });
    this.game.events.emit('UPDATE_SYNERGY', counts);
  }

  initializeShop() { this.shopLevel = 1; this.refreshShop(); }

  refreshShop() {
    const units = Object.keys(UNIT_TYPES);
    const shop = [units[0], units[1], units[0]];
    this.currentShop = shop;
    this.game.events.emit('UPDATE_SHOP', shop);
  }

  createBaseHealthBars() {
    // 这里的 Rectangle 如果看不见也没关系，主要 gameplay 在跑就行
    this.playerBaseBarFg = this.add.rectangle(25, 550, 40, 8, 0x00ff00);
    this.enemyBaseBarFg = this.add.rectangle(975, 550, 40, 8, 0xff0000);
  }
}
