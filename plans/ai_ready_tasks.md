# AI友好的具体开发任务

## 概述
本文档为AI助手（如Cline/Roo Code）提供具体、可执行的开发任务。每个任务都设计为：
- **独立可完成**：不需要理解整个项目
- **具体明确**：有清晰的输入和输出
- **可测试**：有明确的验收标准
- **小步渐进**：每个任务1-4小时工作量

## 任务分类

### A类：视觉改进任务（优先级：高）

#### A1：创建图片资源目录结构
**目标**：为自走棋游戏创建规范的图片资源目录
**文件**：`public/images/autochess/` 目录
**任务**：
1. 创建以下目录结构：
   ```
   public/images/autochess/
   ├── units/           # 单位图片 (64x64 PNG)
   ├── effects/         # 特效图片 (32x32 PNG)
   └── ui/              # UI图片 (按需尺寸)
   ```
2. 在`units/`目录中创建占位文件：
   - `sui_warrior.png` (可以使用现有素材：`public/images/materials/bird/岁己_小鸟跳静态图.png`的缩略版)
   - `placeholder_unit.png` (简单的彩色圆形，用于测试)
3. 更新`.gitignore`确保这些目录被正确跟踪

**验收标准**：
- [ ] 目录结构存在
- [ ] 至少2个占位图片文件
- [ ] 可以通过`http://localhost:3000/images/autochess/units/sui_warrior.png`访问

---

#### A2：修改Unit.ts支持图片加载回退
**目标**：更新Unit类，优先加载PNG图片，失败时回退到emoji
**文件**：`src/components/autoChessGame/objects/Unit.ts`
**任务**：
1. 修改`createTexture`方法（第88-128行）：
   - 首先尝试加载`images/autochess/units/{textureKey}.png`
   - 如果加载失败，回退到现有的emoji创建方式
2. 添加日志输出，显示使用的是图片还是emoji
3. 确保现有游戏功能不受影响

**代码示例**：
```typescript
static createTexture(scene: Phaser.Scene, config: any, isEnemy = false) {
  const imagePath = `images/autochess/units/${config.textureKey}.png`;

  // 尝试预加载图片
  if (!scene.textures.exists(config.textureKey)) {
    try {
      scene.load.image(config.textureKey, imagePath);
      // 设置加载完成回调
    } catch (error) {
      console.log(`图片加载失败，使用emoji回退: ${config.textureKey}`);
      this.createFallbackTexture(scene, config, isEnemy);
    }
  }
}
```

**验收标准**：
- [ ] 游戏仍然可以正常启动
- [ ] 控制台显示正确的纹理加载日志
- [ ] 回退机制工作正常（删除图片文件后显示emoji）

---

#### A3：为岁己战士添加攻击动画
**目标**：为"sui_warrior"单位添加简单的扭曲跳跃攻击动画
**文件**：`src/components/autoChessGame/objects/Unit.ts`
**任务**：
1. 在Unit类中添加`playAttackAnimation()`方法
2. 实现`playTwistJumpAnimation()`方法，包含：
   - 轻微下蹲（scaleY: 0.8）
   - 小幅度跳跃（y: -15）
   - 轻微旋转（rotation: 0.2）
3. 在`tryAttack()`方法中调用动画（第236行附近）
4. 确保动画不影响游戏逻辑（伤害计算等）

**代码位置**：
```typescript
// 在Unit类中添加
private playAttackAnimation(): void {
  if (this.config.textureKey === 'sui_warrior') {
    this.playTwistJumpAnimation();
  }
}

private playTwistJumpAnimation(): void {
  // 实现动画逻辑
}
```

**验收标准**：
- [ ] 岁己战士攻击时有动画效果
- [ ] 动画不影响攻击伤害和时机
- [ ] 动画完成后单位恢复正常状态

---

### B类：游戏系统改进任务（优先级：中）

#### B1：经济系统 - 添加利息计算
**目标**：为经济系统添加10%利息机制
**文件**：`src/components/autoChessGame/systems/EconomyManager.ts`
**任务**：
1. 在`EconomyManager`类中添加利息计算逻辑
2. 每回合开始时，玩家获得当前金币10%的利息（最多5金币）
3. 在UI中显示利息收入（可以简单console.log）
4. 更新`addGold`方法，确保利息正确计算

**计算公式**：
```typescript
calculateInterest(): number {
  const interestRate = 0.1; // 10%
  const maxInterestGold = 50; // 最多计算50金币的利息
  const applicableGold = Math.min(this.gold, maxInterestGold);
  return Math.floor(applicableGold * interestRate);
}
```

**验收标准**：
- [ ] 每回合开始时自动计算利息
- [ ] 利息上限为5金币（当有50+金币时）
- [ ] 控制台显示利息收入信息

---

#### B2：等级系统 - 基础实现
**目标**：添加简单的玩家等级系统
**文件**：`src/components/autoChessGame/systems/LevelSystem.ts`（新建）
**任务**：
1. 创建`LevelSystem.ts`文件
2. 实现基础等级系统：
   - 属性：currentLevel, currentExp, expToNextLevel
   - 方法：addExp(amount), checkLevelUp()
3. 经验获取规则：
   - 胜利：3经验
   - 失败：1经验
4. 升级所需经验：每级需要 当前等级×5 经验

**接口设计**：
```typescript
export class LevelSystem {
  private level: number = 1;
  private exp: number = 0;

  addExp(amount: number, isWin: boolean): void {
    const multiplier = isWin ? 1.5 : 1.0;
    this.exp += Math.floor(amount * multiplier);
    this.checkLevelUp();
  }

  private checkLevelUp(): void {
    const needed = this.level * 5;
    while (this.exp >= needed) {
      this.exp -= needed;
      this.level++;
      console.log(`🎉 升级到 ${this.level} 级！`);
    }
  }
}
```

**验收标准**：
- [ ] 可以创建LevelSystem实例
- [ ] 添加经验后正确升级
- [ ] 控制台显示升级信息

---

#### B3：单位合成系统 - 基础检测
**目标**：检测场上是否有3个相同单位
**文件**：`src/components/autoChessGame/systems/UnitMergeSystem.ts`（新建）
**任务**：
1. 创建`UnitMergeSystem.ts`文件
2. 实现`checkForMerge()`方法，检测玩家兵营中是否有3个相同单位
3. 按单位类型分组计数
4. 当发现3个相同单位时，在控制台输出提示信息

**逻辑示例**：
```typescript
checkForMerge(barracks: Barracks[]): void {
  const countMap = new Map<string, number>();

  barracks.forEach(barrack => {
    const count = countMap.get(barrack.unitKey) || 0;
    countMap.set(barrack.unitKey, count + 1);
  });

  countMap.forEach((count, unitKey) => {
    if (count >= 3) {
      console.log(`可以合成：${unitKey} ×3`);
    }
  });
}
```

**验收标准**：
- [ ] 系统能正确检测3个相同单位
- [ ] 控制台输出正确的合成提示
- [ ] 不影响现有游戏功能

---

### C类：UI/UX改进任务（优先级：低）

#### C1：改进伤害数字显示
**目标**：让伤害数字更明显、更有动感
**文件**：`src/components/autoChessGame/scenes/MainScene.ts`
**任务**：
1. 找到现有的伤害显示代码（可能在Unit.ts的takeDamage方法中）
2. 创建新的`showDamageText()`方法，包含：
   - 更大的字体（24px）
   - 颜色根据伤害值变化（小伤害黄色，大伤害红色）
   - 向上飘动动画
   - 渐隐效果
3. 替换现有的伤害显示方式

**动画效果**：
```typescript
showDamageText(x: number, y: number, damage: number): void {
  const color = damage > 20 ? '#ff0000' : '#ffff00';
  const text = this.add.text(x, y, damage.toString(), {
    fontSize: '24px',
    color,
    fontStyle: 'bold'
  }).setOrigin(0.5).setDepth(100);

  this.tweens.add({
    targets: text,
    y: y - 50,
    alpha: 0,
    duration: 1000,
    onComplete: () => text.destroy()
  });
}
```

**验收标准**：
- [ ] 伤害数字明显可见
- [ ] 有向上飘动和渐隐效果
- [ ] 颜色根据伤害值变化

---

#### C2：添加游戏内提示
**目标**：为新手玩家添加简单的游戏提示
**文件**：`src/components/autoChessGame/GameUI.tsx`
**任务**：
1. 在游戏UI中添加提示区域
2. 显示当前回合的提示信息，例如：
   - "第1回合：购买你的第一个单位"
   - "提示：3个相同单位可以合成更强大的2星单位"
   - "经济提示：保留金币可以获得利息"
3. 提示信息根据游戏进度变化
4. 添加"隐藏提示"按钮

**实现建议**：
- 使用React状态管理当前提示
- 根据游戏事件更新提示内容
- 保持提示简洁明了

**验收标准**：
- [ ] 游戏中有提示显示区域
- [ ] 提示内容根据游戏状态变化
- [ ] 可以隐藏/显示提示

---

## 任务执行指南

### 对于AI助手：
1. **先理解任务**：仔细阅读任务描述和验收标准
2. **查看相关代码**：阅读提到的文件，理解现有实现
3. **小步实现**：先实现核心功能，再完善细节
4. **测试验证**：完成每个任务后立即测试
5. **文档更新**：如有必要，更新相关注释或文档

### 任务选择建议：
- **新手开始**：从A1、A2开始，熟悉项目结构
- **视觉优先**：A类任务能快速改善游戏外观
- **系统深度**：B类任务增加游戏策略性
- **体验优化**：C类任务改善玩家体验

### 遇到问题时的处理：
1. **编译错误**：仔细阅读错误信息，检查TypeScript类型
2. **运行时错误**：使用浏览器开发者工具调试
3. **逻辑问题**：添加console.log调试，理解数据流
4. **性能问题**：检查是否有内存泄漏或频繁重绘

### 代码质量要求：
1. **TypeScript严格类型**：避免使用`any`类型
2. **中文注释**：重要逻辑添加中文注释
3. **错误处理**：考虑边界情况和错误情况
4. **代码复用**：提取公共逻辑到工具函数
5. **性能意识**：避免不必要的计算和渲染

## 任务完成标准

### 技术完成：
- [ ] 代码编译通过，无TypeScript错误
- [ ] 游戏可以正常启动和运行
- [ ] 新功能按预期工作
- [ ] 没有破坏现有功能

### 质量完成：
- [ ] 代码符合项目规范（TypeScript严格类型，中文注释）
- [ ] 有适当的错误处理和边界检查
- [ ] 代码结构清晰，易于理解和维护
- [ ] 性能影响在可接受范围内

### 文档完成：
- [ ] 重要变更添加了中文注释
- [ ] 如有必要，更新了相关文档
- [ ] 提交信息清晰描述变更内容

## 下一步建议

完成这些具体任务后，自走棋游戏将会有明显改善：

1. **视觉上**：单位有真实图片和动画，不再是简单的emoji
2. **系统上**：有经济利息、等级成长、单位合成等深度系统
3. **体验上**：伤害反馈更明显，有新手提示

根据这些改进的效果和反馈，可以进一步规划：
- 更多单位类型和技能
- 多人对战功能
- 成就和排行榜系统
- 移动端优化

记住：**小步快跑，快速验证**。每个任务完成后都测试游戏，确保改进方向正确，玩家体验提升。
