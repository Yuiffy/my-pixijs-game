// src/components/autoChessGame/objects/Barracks.ts
import * as Phaser from 'phaser';
import Unit from './Unit';

// 继承 Sprite 而不是 GameObjects.Sprite
export default class Barracks extends Phaser.Physics.Matter.Sprite {
  unitKey!: string;

  unitData!: any;

  spawnTimer!: Phaser.Time.TimerEvent | null;

  indicator!: Phaser.GameObjects.Text;

  scene!: Phaser.Scene;

  isDragging!: boolean;

  isOverSellZone!: boolean;

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
    // 完全按照Unit的方式创建纹理
    const barracksTextureKey = `barracks_${unitKey}`;
    if (!scene.textures.exists(barracksTextureKey)) {
      console.log(`Creating barracks texture for ${unitKey}: ${barracksTextureKey}`);

      // 使用canvas创建纹理以正确显示emoji（和Unit完全一样的写法）
      const canvas = document.createElement('canvas');
      canvas.width = 70;
      canvas.height = 70;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        console.error('Failed to get canvas context');
        return;
      }

      // 清空canvas（和Unit一样）
      ctx.clearRect(0, 0, 70, 70);

      // 绘制底座（房子主体）- 褐色
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(10, 35, 50, 25);

      // 房子主体描边
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 35, 50, 25);

      // 房子屋顶 - 深褐色三角形
      ctx.fillStyle = '#654321';
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

      // 在房子顶部绘制兵种emoji（和Unit一样的字体设置方式）
      ctx.font = '32px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Android Emoji", "EmojiSymbols", "EmojiOne Mozilla", "Twemoji Mozilla", "Segoe UI Symbol", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000000';
      ctx.fillText(unitData.emoji || '🏠', 35, 22);

      // 添加到Phaser纹理（和Unit完全一样）
      scene.textures.addCanvas(barracksTextureKey, canvas);

      console.log(`Barracks texture created: ${barracksTextureKey} with emoji: ${unitData.emoji}`);

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
      console.log(`ℹ️ Barracks texture '${barracksTextureKey}' already exists`);
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

    // 创建sprite（和Unit完全一样的顺序）
    super(scene.matter.world, x, y, barracksTextureKey);

    this.scene = scene;
    this.unitKey = unitKey;
    this.unitData = unitData;
    this.spawnTimer = null;
    this.isDragging = false;
    this.isOverSellZone = false;

    // 确保body正确初始化
    if (this.body) {
      // 先设置sensor，然后设置static
      this.setSensor(true);
      this.setStatic(true);
    } else {
      console.error(`Barracks body not created properly for ${unitKey}`);
    }

    // 设置深度（在单位之上）
    this.setDepth(100);

    // 显式添加到场景（和Unit一样）
    scene.add.existing(this);

    // 添加拖动功能 - 只有在游戏开始前才能拖动
    this.setInteractive();
    this.scene.input.setDraggable(this);

    // 拖动开始：显示卖掉区域（只在游戏未开始时）
    this.on('dragstart', () => {
      const mainScene = this.scene as any;
      // 如果游戏已开始，不允许拖动
      if (mainScene.gameStarted) {
        return;
      }
      this.isDragging = true;
      if (mainScene.sellZoneBg && mainScene.sellZoneText) {
        mainScene.sellZoneBg.setVisible(true);
        mainScene.sellZoneText.setVisible(true);
      }
    });

    // 拖动中：检测是否在卖掉区域内
    this.on('drag', (pointer: any, dragX: number, dragY: number) => {
      const mainScene = this.scene as any;

      // 如果游戏已开始，不允许拖动
      if (mainScene.gameStarted) {
        return;
      }

      // 检测是否在卖掉区域内
      const inSellZone = mainScene.isInSellZone ? mainScene.isInSellZone(dragX, dragY) : false;

      if (inSellZone !== this.isOverSellZone) {
        this.isOverSellZone = inSellZone;

        // 更新卖掉区域的视觉效果
        if (mainScene.sellZoneBg) {
          if (inSellZone) {
            // 在卖掉区域内：高亮显示
            mainScene.sellZoneBg.setFillStyle(0xff0000, 0.6);
            mainScene.sellZoneBg.setStrokeStyle(4, 0xffffff);
            // 兵营变红表示可以卖掉
            this.setTint(0xff0000);
          } else {
            // 不在卖掉区域内：恢复正常
            mainScene.sellZoneBg.setFillStyle(0xff0000, 0.3);
            mainScene.sellZoneBg.setStrokeStyle(3, 0xff0000);
            this.clearTint();
          }
        }
      }

      // 限制拖动范围，避免拖出边界（但允许拖到卖掉区域）
      let clampedX = dragX;
      let clampedY = dragY;

      // 如果不在卖掉区域内，限制拖动范围
      if (!inSellZone) {
        clampedX = Phaser.Math.Clamp(dragX, 80, 920);
        clampedY = Phaser.Math.Clamp(dragY, 80, 480);
      }

      this.setPosition(clampedX, clampedY);

      // 更新标识位置
      if (this.indicator) {
        this.indicator.setPosition(clampedX, clampedY + 40);
      }
    });

    // 拖动结束：如果拖到卖掉区域则卖掉，否则隐藏卖掉区域
    this.on('dragend', () => {
      const mainScene = this.scene as any;

      // 如果游戏已开始，不允许拖动
      if (mainScene.gameStarted) {
        return;
      }

      if (this.isOverSellZone && mainScene.sellBarracks) {
        // 卖掉兵营
        mainScene.sellBarracks(this);
      } else {
        // 恢复正常状态
        this.clearTint();
      }

      // 隐藏卖掉区域
      if (mainScene.sellZoneBg && mainScene.sellZoneText) {
        mainScene.sellZoneBg.setVisible(false);
        mainScene.sellZoneText.setVisible(false);
        // 恢复默认样式
        mainScene.sellZoneBg.setFillStyle(0xff0000, 0.3);
        mainScene.sellZoneBg.setStrokeStyle(3, 0xff0000);
      }

      this.isDragging = false;
      this.isOverSellZone = false;
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

    // 出兵逻辑将在波次开始时统一触发（由 MainScene.spawnEnemyWave 调用 spawnUnit）
  }

  // 不再使用定时器，改为被动出兵（由波次触发）
  // startSpawning 方法已移除，改为在波次开始时统一调用 spawnUnit

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
