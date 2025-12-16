// src/components/autoChessGame/objects/Barracks.ts
import * as Phaser from 'phaser';
import Unit from './Unit';

// 继承 Sprite 而不是 GameObjects.Sprite
export default class Barracks extends Phaser.Physics.Matter.Sprite {
  unitKey: string;

  unitData: any;

  spawnTimer!: Phaser.Time.TimerEvent | null;

  indicator!: Phaser.GameObjects.Text;

  scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number, unitKey: string, unitData: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'Barracks.ts:constructor',
        message: 'Barracks constructor called',
        data: { unitKey, x, y, unitData },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'initial-debug',
        hypothesisId: 'A4'
      })
    }).catch(() => {});
    // #endregion

    // 创建兵营纹理 - 房子底座 + 兵种 emoji
    const barracksTextureKey = `barracks_${unitKey}`;
    if (!scene.textures.exists(barracksTextureKey)) {
      const canvas = document.createElement('canvas');
      canvas.width = 70;
      canvas.height = 70;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        // 清空canvas
        ctx.clearRect(0, 0, 70, 70);

        // 绘制底座（房子主体）
        ctx.fillStyle = '#8B4513'; // 褐色底座
        ctx.fillRect(10, 35, 50, 25); // 房子主体

        // 房子屋顶
        ctx.fillStyle = '#654321'; // 深褐色屋顶
        ctx.beginPath();
        ctx.moveTo(5, 35);
        ctx.lineTo(35, 15);
        ctx.lineTo(65, 35);
        ctx.closePath();
        ctx.fill();

        // 屋顶描边
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 房子主体描边
        ctx.strokeRect(10, 35, 50, 25);

        // 在房子顶部绘制兵种emoji
        ctx.font =
          '32px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Android Emoji", "EmojiSymbols", "EmojiOne Mozilla", "Twemoji Mozilla", "Segoe UI Symbol", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000000';
        ctx.fillText(unitData.emoji || '🏠', 35, 22);

        // 添加到Phaser纹理
        scene.textures.addCanvas(barracksTextureKey, canvas);
      } else {
        // 降级方案：使用简单的graphics
        const graphics = scene.add.graphics();
        graphics.fillStyle(0xffd700);
        graphics.fillCircle(0, 0, 35);
        graphics.lineStyle(3, 0x000000);
        graphics.strokeCircle(0, 0, 35);
        graphics.generateTexture(barracksTextureKey, 70, 70);
        graphics.destroy();
      }

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'Barracks.ts:constructor',
          message: 'Barracks texture created',
          data: { barracksTextureKey },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'initial-debug',
          hypothesisId: 'A5'
        })
      }).catch(() => {});
      // #endregion
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'Barracks.ts:constructor',
          message: 'Barracks texture already exists',
          data: { barracksTextureKey },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'initial-debug',
          hypothesisId: 'A5'
        })
      }).catch(() => {});
      // #endregion
    }

    super(scene.matter.world, x, y, barracksTextureKey);

    this.scene = scene;
    this.unitKey = unitKey;
    this.unitData = unitData;
    this.spawnTimer = null;

    // 简化的纹理检查
    const textureExists = scene.textures.exists(barracksTextureKey);
    console.log(`Barracks texture '${barracksTextureKey}' exists: ${textureExists}`);

    // 确保body正确初始化
    if (this.body) {
      // 先设置sensor，然后设置static
      this.setSensor(true);
      this.setStatic(true);
    } else {
      console.error(`Barracks body not created properly for ${unitKey}`);
    }

    // 视觉调整：看起来像底座
    this.setDisplaySize(70, 70);
    this.setAlpha(1.0); // 设置为完全不透明

    // Matter Sprite 已自动添加到场景
    this.setDepth(100); // 在单位之上

    // 添加拖动功能 - 只有在游戏开始前才能拖动
    this.setInteractive();
    this.scene.input.setDraggable(this);

    this.on('drag', (pointer: any, dragX: number, dragY: number) => {
      // 限制拖动范围，避免拖出边界
      const clampedX = Phaser.Math.Clamp(dragX, 80, 920);
      const clampedY = Phaser.Math.Clamp(dragY, 80, 480);

      this.setPosition(clampedX, clampedY);

      // 更新标识位置
      if (this.indicator) {
        this.indicator.setPosition(clampedX, clampedY + 40);
      }
    });

    // 位置可见性检查
    const sceneWidth = scene.sys.game.config.width as number;
    const sceneHeight = scene.sys.game.config.height as number;
    const inBounds = x >= 0 && x <= sceneWidth && y >= 0 && y <= sceneHeight;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'Barracks.ts:constructor',
        message: 'Position bounds check',
        data: { position: { x, y }, sceneSize: { width: sceneWidth, height: sceneHeight }, inBounds },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'extended-debug',
        hypothesisId: 'A10'
      })
    }).catch(() => {});
    // #endregion

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'Barracks.ts:constructor',
        message: 'Barracks sprite setup complete',
        data: {
          visible: this.visible,
          alpha: this.alpha,
          depth: this.depth,
          displaySize: { width: this.displayWidth, height: this.displayHeight }
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'initial-debug',
        hypothesisId: 'A4'
      })
    }).catch(() => {});
    // #endregion

    // 标识 - 在兵营下方显示一个小房子或兵种 emoji
    this.indicator = scene
      .add.text(x, y + 40, unitData.emoji || '🏠', { fontSize: '20px' })
      .setOrigin(0.5)
      .setDepth(101);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'Barracks.ts:constructor',
        message: 'Indicator text added',
        data: { indicatorText: unitData.emoji || '🏠', indicatorX: x, indicatorY: y + 40 },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'initial-debug',
        hypothesisId: 'A4'
      })
    }).catch(() => {});
    // #endregion

    // 出兵逻辑将在游戏开始后启动（由 MainScene.startGame 调用 startSpawning）
    // 暂时不启动 spawnTimer
  }

  startSpawning() {
    // 游戏开始后启动出兵
    // 延迟初始生成，避免立即碰撞
    this.scene.time.delayedCall(500, () => {
      this.spawnUnit();
    });

    this.spawnTimer = this.scene.time.addEvent({
      delay: this.unitData.spawnInterval || 4000,
      callback: this.spawnUnit,
      callbackScope: this,
      loop: true
    });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'Barracks.ts:startSpawning',
        message: 'Barracks startSpawning called',
        data: { spawnInterval: this.unitData.spawnInterval || 4000 },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'extended-debug',
        hypothesisId: 'A4'
      })
    }).catch(() => {});
    // #endregion
  }

  spawnUnit() {
    console.log(`Barracks spawning ${this.unitData.name} at (${this.x}, ${this.y})`);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'Barracks.ts:spawnUnit',
        message: 'spawnUnit called',
        data: { unitName: this.unitData.name, barracksPosition: { x: this.x, y: this.y } },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'initial-debug',
        hypothesisId: 'A6'
      })
    }).catch(() => {});
    // #endregion

    // 随机偏移位置，避免单位重叠碰撞
    const offsetX = (Math.random() - 0.5) * 40; // -20 到 +20
    const offsetY = (Math.random() - 0.5) * 40; // -20 到 +20

    const spawnX = this.x + offsetX;
    const spawnY = this.y + offsetY;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'Barracks.ts:spawnUnit',
        message: 'Calculated spawn position',
        data: { spawnX, spawnY, offsetX, offsetY },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'initial-debug',
        hypothesisId: 'A6'
      })
    }).catch(() => {});
    // #endregion

    const unit = new Unit(this.scene, spawnX, spawnY, this.unitData, false);
    const mainScene = this.scene as any;
    if (mainScene.playerUnits) {
      mainScene.playerUnits.add(unit);
      console.log(
        `✅ Unit added to playerUnits group at (${spawnX.toFixed(1)}, ${spawnY.toFixed(1)}). Total units: ${mainScene.playerUnits.children.size}`
      );

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'Barracks.ts:spawnUnit',
          message: 'Unit successfully added to group',
          data: {
            unitName: this.unitData.name,
            spawnPosition: { x: spawnX, y: spawnY },
            totalUnits: mainScene.playerUnits.children.size,
            unitVisible: unit.visible,
            unitExists: !!unit
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'initial-debug',
          hypothesisId: 'A6'
        })
      }).catch(() => {});
      // #endregion
    } else {
      console.error(`❌ mainScene.playerUnits is undefined!`);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e0c29ed0-d46a-4623-8c34-0a2630dfe77f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'Barracks.ts:spawnUnit',
          message: 'playerUnits group is undefined',
          data: { sceneType: typeof mainScene },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'initial-debug',
          hypothesisId: 'A6'
        })
      }).catch(() => {});
      // #endregion
    }
  }

  update() {
    // Barracks update method - 检查body状态
    if (!this.body && this.active) {
      console.error(`Barracks ${this.unitKey} has no body but is still active!`);
    }
  }

  disableDragging() {
    // 移除拖动功能
    if (this.scene.input) {
      this.scene.input.setDraggable(this, false);
    }
    // 移除拖动事件监听器
    this.off('drag');
    this.off('dragstart');
    this.off('dragend');
  }

  destroy(fromScene?: boolean) {
    // 停止所有相关的tween动画
    if (this.scene && this.scene.tweens) {
      this.scene.tweens.killTweensOf(this);
    }

    if (this.spawnTimer) {
      this.spawnTimer.remove();
      this.spawnTimer = null;
    }
    if (this.indicator) this.indicator.destroy();
    super.destroy(fromScene);
  }
}


