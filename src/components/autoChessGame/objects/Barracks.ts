// src/components/autoChessGame/objects/Barracks.ts
import * as Phaser from 'phaser';
import Unit from './Unit';

// 继承 Sprite 而不是 GameObjects.Sprite
export default class Barracks extends Phaser.Physics.Matter.Sprite {
  unitKey: string;

  unitData: any;

  spawnTimer: Phaser.Time.TimerEvent;

  indicator: Phaser.GameObjects.Text;

  scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number, unitKey: string, unitData: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Barracks.ts:constructor', message: 'Barracks constructor called', data: { unitKey, x, y, unitData }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial-debug', hypothesisId: 'A4' }) }).catch(() => {});
    // #endregion

    // 创建兵营纹理
    const barracksTextureKey = `barracks_${unitKey}`;
    if (!scene.textures.exists(barracksTextureKey)) {
      const graphics = scene.add.graphics();
      graphics.fillStyle(0xffd700); // 金色填充，更容易看到
      graphics.fillCircle(0, 0, 35);
      graphics.lineStyle(3, 0x000000); // 黑色描边
      graphics.strokeCircle(0, 0, 35);
      graphics.generateTexture(barracksTextureKey, 70, 70);
      graphics.destroy();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Barracks.ts:constructor', message: 'Barracks texture created', data: { barracksTextureKey }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial-debug', hypothesisId: 'A5' }) }).catch(() => {});
      // #endregion
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Barracks.ts:constructor', message: 'Barracks texture already exists', data: { barracksTextureKey }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial-debug', hypothesisId: 'A5' }) }).catch(() => {});
      // #endregion
    }

    super(scene.matter.world, x, y, barracksTextureKey);

    this.scene = scene;
    this.unitKey = unitKey;
    this.unitData = unitData;

    // 简化的纹理检查
    const textureExists = scene.textures.exists(barracksTextureKey);
    console.log(`Barracks texture '${barracksTextureKey}' exists: ${textureExists}`);

    this.setStatic(true);
    this.setSensor(true);

    // 视觉调整：看起来像底座
    this.setDisplaySize(70, 70);
    this.setAlpha(1.0); // 设置为完全不透明

    // 注意：Matter Sprite 已自动添加到场景
    this.setDepth(100); // 设置非常高的深度，确保在所有元素之上显示

    // 检查位置是否在可见区域内
    const sceneWidth = scene.sys.game.config.width as number;
    const sceneHeight = scene.sys.game.config.height as number;
    const inBounds = x >= 0 && x <= sceneWidth && y >= 0 && y <= sceneHeight;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Barracks.ts:constructor', message: 'Position bounds check', data: { position: { x, y }, sceneSize: { width: sceneWidth, height: sceneHeight }, inBounds }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'extended-debug', hypothesisId: 'A10' }) }).catch(() => {});
    // #endregion

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Barracks.ts:constructor', message: 'Barracks sprite setup complete', data: { visible: this.visible, alpha: this.alpha, depth: this.depth, displaySize: { width: this.displayWidth, height: this.displayHeight } }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial-debug', hypothesisId: 'A4' }) }).catch(() => {});
    // #endregion

    // 标识 - 使用更明显的标识
    this.indicator = scene.add.text(x, y + 40, '🏰', { fontSize: '30px' }).setOrigin(0.5).setDepth(101);

    // 添加一个明显的红色调试方块
    const debugRect = scene.add.rectangle(x, y, 100, 100, 0xff0000, 1.0).setDepth(1000);
    debugRect.setStrokeStyle(5, 0x000000);
    console.log(`Added large red debug rectangle at (${x}, ${y}) for ${unitKey} in scene: ${scene.scene.key}`);

    // 也添加Barracks本身的一些调试
    console.log(`Barracks sprite added to scene: ${scene.scene.key}, Barracks visible: ${this.visible}`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Barracks.ts:constructor', message: 'Indicator text added', data: { indicatorText: '🏠', indicatorX: x, indicatorY: y + 40 }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial-debug', hypothesisId: 'A4' }) }).catch(() => {});
    // #endregion

    // 出兵 - 延迟初始生成，避免立即碰撞
    scene.time.delayedCall(500, () => {
      this.spawnUnit();
    });

    this.spawnTimer = scene.time.addEvent({
      delay: unitData.spawnInterval || 4000,
      callback: this.spawnUnit,
      callbackScope: this,
      loop: true
    });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Barracks.ts:constructor', message: 'Barracks initialization complete', data: { spawnInterval: unitData.spawnInterval || 4000, inScene: !!this.scene, visible: this.visible, active: this.active }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'extended-debug', hypothesisId: 'A4' }) }).catch(() => {});
    // #endregion
  }

  spawnUnit() {
    console.log(`Barracks spawning ${this.unitData.name} at (${this.x}, ${this.y})`);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Barracks.ts:spawnUnit', message: 'spawnUnit called', data: { unitName: this.unitData.name, barracksPosition: { x: this.x, y: this.y } }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial-debug', hypothesisId: 'A6' }) }).catch(() => {});
    // #endregion

    // 随机偏移位置，避免单位重叠碰撞
    const offsetX = (Math.random() - 0.5) * 40; // -20 到 +20
    const offsetY = (Math.random() - 0.5) * 40; // -20 到 +20

    const spawnX = this.x + offsetX;
    const spawnY = this.y + offsetY;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Barracks.ts:spawnUnit', message: 'Calculated spawn position', data: { spawnX, spawnY, offsetX, offsetY }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial-debug', hypothesisId: 'A6' }) }).catch(() => {});
    // #endregion

    const unit = new Unit(this.scene, spawnX, spawnY, this.unitData, false);
    const mainScene = this.scene as any;
    if (mainScene.playerUnits) {
      mainScene.playerUnits.add(unit);
      console.log(`✅ Unit added to playerUnits group at (${spawnX.toFixed(1)}, ${spawnY.toFixed(1)}). Total units: ${mainScene.playerUnits.children.size}`);

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Barracks.ts:spawnUnit', message: 'Unit successfully added to group', data: { unitName: this.unitData.name, spawnPosition: { x: spawnX, y: spawnY }, totalUnits: mainScene.playerUnits.children.size, unitVisible: unit.visible, unitExists: !!unit }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial-debug', hypothesisId: 'A6' }) }).catch(() => {});
      // #endregion
    } else {
      console.error(`❌ mainScene.playerUnits is undefined!`);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Barracks.ts:spawnUnit', message: 'playerUnits group is undefined', data: { sceneType: typeof mainScene }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'initial-debug', hypothesisId: 'A6' }) }).catch(() => {});
      // #endregion
    }
  }

  update() {
    // Barracks update method - currently empty but called by MainScene
    console.log(`Barracks ${this.unitKey} at (${this.x}, ${this.y}) visible: ${this.visible}, alpha: ${this.alpha}, depth: ${this.depth}, texture: ${this.texture.key}, scale: ${this.scale}, rotation: ${this.rotation}`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'Barracks.ts:update', message: 'Barracks update called', data: { unitKey: this.unitKey, position: { x: this.x, y: this.y }, visible: this.visible, alpha: this.alpha, depth: this.depth, texture: this.texture.key, scale: this.scale, rotation: this.rotation }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'extended-debug', hypothesisId: 'A7' }) }).catch(() => {});
    // #endregion
  }

  destroy(fromScene?: boolean) {
    if (this.spawnTimer) this.spawnTimer.remove();
    if (this.indicator) this.indicator.destroy();
    super.destroy(fromScene);
  }
}
