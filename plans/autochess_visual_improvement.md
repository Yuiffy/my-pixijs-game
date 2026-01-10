# 自走棋游戏视觉改进规划

## 当前视觉状态分析

### 现有问题
1. **单位形象简陋**: 使用emoji和纯色圆形，缺乏真实感
2. **动画效果简单**: 只有基础移动和碰撞，缺乏攻击动画
3. **视觉反馈不足**: 攻击、技能、伤害等反馈不明显
4. **美术风格不统一**: emoji、纯色、简单图形混合

### 当前实现方式
```typescript
// 当前单位纹理创建方式（Unit.ts第88-128行）
static createTexture(scene: Phaser.Scene, config: any, isEnemy = false) {
  // 创建40x40的canvas
  // 绘制纯色圆形背景
  // 在中心绘制emoji
  // 添加到Phaser纹理
}
```

## 视觉改进目标

### 核心目标：用一张PNG/SVG图片 + 动画效果，让游戏"活起来"

### 1. 单位形象升级方案

#### 方案A：使用现有素材（快速实现）
- 利用`public/images/materials/`目录中的岁己相关图片
- 创建角色化的单位形象
- 示例：岁己战士 -> 使用岁己小鸟跳静态图

#### 方案B：创建简约风格角色（中等工作量）
- 设计5-8个基础角色模板
- 使用SVG或简单PNG
- 通过颜色变化区分不同阵营

#### 方案C：完整角色设计（长期目标）
- 为每个单位类型设计独特形象
- 包含攻击、受伤、死亡等不同状态
- 考虑角色动画序列

### 2. 动画效果实现方案

#### 2.1 基础动画效果
```typescript
// 攻击动画示例：扭曲+跳跃效果
class AttackAnimation {
  static playTwistJump(unit: Unit, target: Unit) {
    // 1. 预备动作：轻微下蹲
    unit.scene.tweens.add({
      targets: unit,
      scaleY: 0.8,
      duration: 100,
      yoyo: true,
      onComplete: () => {
        // 2. 跳跃：向目标跳跃
        const jumpHeight = 30;
        unit.scene.tweens.add({
          targets: unit,
          y: unit.y - jumpHeight,
          duration: 150,
          yoyo: true,
          onComplete: () => {
            // 3. 扭曲旋转：攻击瞬间
            unit.scene.tweens.add({
              targets: unit,
              rotation: Math.PI / 4,
              duration: 50,
              yoyo: true
            });
          }
        });
      }
    });
  }
}
```

#### 2.2 具体动画类型
1. **近战攻击**: 扭曲跳跃 + 武器挥动效果
2. **远程攻击**: 弹道轨迹 + 命中特效
3. **技能释放**: 粒子效果 + 屏幕震动
4. **受伤反馈**: 闪烁 + 后退效果
5. **死亡动画**: 消失/爆炸效果

### 3. 具体实施步骤

#### 第一阶段：基础图片替换（1-2天）
1. **创建图片资源目录**
   ```
   public/images/autochess/
   ├── units/
   │   ├── sui_warrior.png      # 岁己战士
   │   ├── chili_mage.png       # 悠亚Yua（魔法师）
   │   ├── cyber_gunner.png     # 赛博枪手
   │   └── ...
   └── effects/
       ├── attack_twist.png     # 攻击扭曲效果
       ├── projectile.png       # 弹道效果
       └── hit_effect.png       # 命中效果
   ```

2. **修改Unit.ts的纹理创建**
   ```typescript
   static createTexture(scene: Phaser.Scene, config: any, isEnemy = false) {
     // 检查是否有自定义图片
     const imagePath = `images/autochess/units/${config.textureKey}.png`;

     if (scene.textures.exists(config.textureKey)) {
       return; // 纹理已存在
     }

     // 尝试加载图片
     scene.load.image(config.textureKey, imagePath);
     scene.load.once(`filecomplete-image-${config.textureKey}`, () => {
       console.log(`Loaded texture: ${config.textureKey}`);
     });

     // 如果加载失败，回退到emoji版本
     if (!scene.textures.exists(config.textureKey)) {
       this.createFallbackTexture(scene, config, isEnemy);
     }
   }
   ```

#### 第二阶段：基础动画添加（2-3天）
1. **攻击动画系统**
   ```typescript
   // 在Unit.ts的tryAttack方法中添加
   tryAttack(time: number) {
     if (!this.target || time - this.lastAttackTime < this.attackCooldown) return;

     const dist = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
     const attackRange = this.config.attackRange || 60;

     if (dist < attackRange) {
       this.lastAttackTime = time;

       // 播放攻击动画
       this.playAttackAnimation();

       // 造成伤害
       this.target.takeDamage(this.damage * this.damageMultiplier);
     }
   }

   playAttackAnimation() {
     // 根据单位类型播放不同动画
     switch(this.config.skill) {
       case 'basic_bump':
         this.playTwistJumpAnimation();
         break;
       case 'shoot':
         this.playShootAnimation();
         break;
       case 'charge':
         this.playChargeAnimation();
         break;
       default:
         this.playDefaultAttackAnimation();
     }
   }
   ```

2. **动画效果实现**
   ```typescript
   playTwistJumpAnimation() {
     // 扭曲跳跃动画
     const timeline = this.scene.tweens.createTimeline();

     timeline.add({
       targets: this,
       scaleY: 0.7,
       duration: 80,
       ease: 'Power2'
     });

     timeline.add({
       targets: this,
       y: this.y - 25,
       scaleY: 1.2,
       rotation: 0.3,
       duration: 120,
       ease: 'Back.easeOut'
     });

     timeline.add({
       targets: this,
       y: this.y,
       scaleY: 1,
       rotation: 0,
       duration: 100,
       ease: 'Bounce.easeOut'
     });

     timeline.play();
   }
   ```

#### 第三阶段：高级视觉效果（3-5天）
1. **粒子效果系统**
   - 攻击命中粒子
   - 技能释放粒子
   - 死亡爆炸粒子

2. **屏幕效果**
   - 屏幕震动（重击时）
   - 慢动作效果（致命一击）
   - 颜色滤镜（技能效果）

3. **UI动画**
   - 伤害数字弹出
   - 连击计数显示
   - 技能冷却动画

### 4. 资源准备建议

#### 4.1 图片资源规格
- **单位图片**: 64x64像素，PNG透明背景
- **效果图片**: 32x32或64x64，支持动画序列
- **优化建议**: 使用纹理图集减少HTTP请求

#### 4.2 动画规格
- **帧率**: 60FPS流畅动画
- **时长**: 攻击动画200-300ms，避免影响游戏节奏
- **性能**: 使用Phaser的Tween系统，避免每帧重绘

#### 4.3 现有素材利用
查看`public/images/materials/`目录中的可用素材：
- `sui-bird-jump.png` - 可用于岁己战士
- 各种岁己形象图片 - 可用于不同单位
- 饼干岁等素材 - 可用于特殊单位

### 5. 技术实现细节

#### 5.1 Phaser动画系统优化
```typescript
// 预加载所有动画
preloadAnimations() {
  // 攻击动画
  this.anims.create({
    key: 'attack_twist',
    frames: this.anims.generateFrameNumbers('attack_effect', { start: 0, end: 5 }),
    frameRate: 20,
    repeat: 0
  });

  // 受伤动画
  this.anims.create({
    key: 'hurt_flash',
    frames: [
      { key: 'unit_texture', frame: 0 },
      { key: 'unit_hurt_texture', frame: 0 }
    ],
    frameRate: 10,
    repeat: 3,
    yoyo: true
  });
}
```

#### 5.2 性能优化考虑
1. **对象池**: 重用动画对象
2. **纹理图集**: 合并小图片减少draw call
3. **动画缓存**: 预计算动画数据
4. **LOD系统**: 根据距离简化动画

### 6. 实施优先级

#### 高优先级（立即开始）
1. 替换emoji为简单PNG图片
2. 添加基础攻击动画（扭曲跳跃）
3. 改善伤害反馈（数字弹出+闪烁）

#### 中优先级（第一周完成）
1. 为每个单位类型添加独特动画
2. 实现远程攻击弹道效果
3. 添加技能释放特效

#### 低优先级（后续完善）
1. 高级粒子效果系统
2. 屏幕震动和滤镜效果
3. 完整动画序列（行走、闲置、死亡）

### 7. 预期效果

#### 改进前 vs 改进后
| 方面 | 当前 | 改进后 |
|------|------|--------|
| 单位形象 | Emoji+纯色圆 | 定制PNG角色 |
| 攻击反馈 | 直接扣血 | 动画+特效+音效 |
| 视觉吸引力 | 简单 | 生动有趣 |
| 游戏体验 | 基础 | 沉浸感强 |

#### 技术指标
- **加载时间**: 增加不超过1秒（通过预加载优化）
- **帧率**: 保持60FPS（通过性能优化）
- **内存使用**: 增加不超过50MB
- **兼容性**: 支持所有现代浏览器

### 8. 风险评估与应对

#### 技术风险
- **性能问题**: 实施前进行性能测试，使用对象池优化
- **加载时间**: 使用纹理图集和懒加载
- **兼容性**: 测试不同浏览器和设备

#### 资源风险
- **美术资源不足**: 先使用简约设计，逐步完善
- **开发时间**: 分阶段实施，优先核心功能
- **维护成本**: 建立规范的资源管理流程

### 9. 下一步行动

1. **立即开始**: 创建`public/images/autochess/`目录结构
2. **收集素材**: 从现有素材中挑选适合的图片
3. **修改代码**: 更新Unit.ts的纹理创建逻辑
4. **测试验证**: 确保新系统工作正常
5. **迭代优化**: 根据反馈调整动画效果

通过这个规划，我们可以用相对较小的投入，显著提升游戏的视觉体验，让自走棋游戏真正"活起来"。
