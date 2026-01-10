# 自走棋阶段切换实现计划

## 概述
将当前的自走棋游戏从连续波次模式改为手动触发阶段切换模式：
1. 购买阶段（准备阶段）：玩家可以购买、放置、调整单位
2. 战斗阶段：点击"开始战斗"后进入，自动进行一波战斗
3. 结算阶段：战斗结束后计算伤害、发工资，自动进入下一回合

## 核心修改点

### 1. 游戏阶段定义（新增文件）
**文件：** `src/components/autoChessGame/types/GamePhase.ts`
```typescript
export enum GamePhase {
  PREPARATION = 'preparation',     // 购买阶段
  BATTLE = 'battle',               // 战斗阶段
  RESOLUTION = 'resolution',       // 结算阶段
  GAME_OVER = 'game_over'          // 游戏结束
}
```

### 2. 配置修改
**文件：** `src/components/autoChessGame/config/GameConfig.ts`
```typescript
export const GameConfig = {
  // ... 现有配置
  initialHp: 100, // 改为：playerInitialHp: 40, enemyInitialHp: 999
  waveDelay: 8000, // 改为：battleDuration: 15000 (战斗持续时间15秒)

  // 新增配置
  playerInitialHp: 40,
  enemyInitialHp: 999,
  baseGoldPerRound: 5, // 每回合基础金币
  interestRate: 0.1, // 利息率10%
  maxInterestGold: 50, // 最多计算50金币的利息
};
```

### 3. MainScene.ts 主要修改
**关键修改点：**
1. 将 `gameStarted: boolean` 改为 `currentPhase: GamePhase`
2. 添加阶段切换方法：
   - `switchToPreparationPhase()`: 进入购买阶段
   - `switchToBattlePhase()`: 进入战斗阶段
   - `switchToResolutionPhase()`: 进入结算阶段
3. 修改 `startGame()` 为 `startBattlePhase()`
4. 添加回合计数：`currentRound: number`
5. 修改血量初始化：玩家40，敌方999

### 4. WaveManager.ts 修改
**关键修改点：**
1. 当前：游戏开始后连续波次
2. 修改为：只在战斗阶段生成**一波**敌人
3. 添加战斗结束检测：当所有单位死亡或时间到
4. 添加 `startBattle()` 和 `endBattle()` 方法

### 5. EconomyManager.ts 修改
**关键修改点：**
1. 添加发工资方法：`giveSalary()`
2. 实现利息系统：每10金币获得1金币利息（最多5金币）
3. 添加回合开始事件处理

### 6. GameUI.tsx 修改
**关键修改点：**
1. "开始战斗"按钮只在购买阶段显示
2. 添加阶段状态显示
3. 战斗阶段显示"战斗中..."，禁用所有操作
4. 结算阶段显示"结算中..."
5. 添加回合计数显示

### 7. 伤害计算机制
**实现逻辑：**
1. 战斗结束后统计双方存活单位数量
2. 获胜方存活数量 = n
3. 失败方受到 n 点伤害
4. 如果平局，双方都受到伤害

### 8. 发工资系统
**实现逻辑：**
1. 每回合开始时（进入购买阶段）发工资
2. 基础工资：5金币
3. 利息：每10金币获得1金币利息（最多5金币）
4. 公式：总工资 = 基础工资 + min(当前金币/10, 5)

## 详细实施步骤

### 步骤1：创建类型定义和修改配置
1. 创建 `GamePhase.ts` 文件
2. 修改 `GameConfig.ts` 中的血量配置
3. 添加新的经济配置

### 步骤2：修改 MainScene.ts
1. 导入 GamePhase 类型
2. 替换 `gameStarted` 为 `currentPhase`
3. 实现阶段切换方法
4. 修改血量初始化逻辑
5. 添加回合计数

### 步骤3：修改 WaveManager.ts
1. 修改 `start()` 方法为单波战斗
2. 添加战斗结束检测
3. 修改波次生成逻辑

### 步骤4：修改 EconomyManager.ts
1. 添加发工资方法
2. 实现利息计算
3. 添加回合开始事件监听

### 步骤5：修改 GameUI.tsx
1. 添加阶段状态显示
2. 修改按钮逻辑
3. 添加回合显示

### 步骤6：实现伤害计算
1. 在 MainScene 中添加存活单位统计
2. 实现伤害计算逻辑
3. 添加伤害显示效果

### 步骤7：测试和调试
1. 测试阶段切换流程
2. 测试伤害计算
3. 测试发工资系统
4. 修复发现的问题

## 代码修改示例

### MainScene.ts 修改示例
```typescript
// 新增属性
currentPhase: GamePhase = GamePhase.PREPARATION;
currentRound: number = 1;

// 修改 create() 方法中的血量初始化
this.playerHp = GameConfig.playerInitialHp; // 40
this.enemyHp = GameConfig.enemyInitialHp;   // 999

// 阶段切换方法
switchToPreparationPhase() {
  this.currentPhase = GamePhase.PREPARATION;
  // 允许拖动兵营
  this.playerBarracks.forEach(barrack => barrack.enableDragging());
  // 发工资
  this.economyManager.giveSalary();
  // 更新UI
  this.game.events.emit('PHASE_CHANGED', GamePhase.PREPARATION);
}

switchToBattlePhase() {
  this.currentPhase = GamePhase.BATTLE;
  // 禁止拖动兵营
  this.playerBarracks.forEach(barrack => barrack.disableDragging());
  // 开始战斗
  this.waveManager.startBattle();
  // 更新UI
  this.game.events.emit('PHASE_CHANGED', GamePhase.BATTLE);
}

switchToResolutionPhase() {
  this.currentPhase = GamePhase.RESOLUTION;
  // 计算伤害
  this.calculateBattleResult();
  // 更新UI
  this.game.events.emit('PHASE_CHANGED', GamePhase.RESOLUTION);

  // 延迟后进入下一回合购买阶段
  this.time.delayedCall(2000, () => {
    this.currentRound++;
    this.switchToPreparationPhase();
  });
}
```

### 伤害计算示例
```typescript
calculateBattleResult() {
  // 统计存活单位
  const playerSurvivors = this.countSurvivors(this.playerUnits, false);
  const enemySurvivors = this.countSurvivors(this.enemyUnits, true);

  // 判断胜负
  if (playerSurvivors > enemySurvivors) {
    // 玩家获胜，敌方受到伤害
    const damage = playerSurvivors;
    this.enemyHp -= damage;
    console.log(`玩家获胜！敌方受到 ${damage} 点伤害`);
  } else if (enemySurvivors > playerSurvivors) {
    // 敌方获胜，玩家受到伤害
    const damage = enemySurvivors;
    this.playerHp -= damage;
    console.log(`敌方获胜！玩家受到 ${damage} 点伤害`);
  } else {
    // 平局，双方都受到伤害
    const damage = playerSurvivors;
    this.playerHp -= damage;
    this.enemyHp -= damage;
    console.log(`平局！双方各受到 ${damage} 点伤害`);
  }

  // 更新血量显示
  this.updateBaseHealthBars();

  // 检查游戏结束
  if (this.playerHp <= 0 || this.enemyHp <= 0) {
    this.gameOver(this.playerHp > 0);
  }
}

countSurvivors(units: Phaser.GameObjects.Group, isEnemy: boolean): number {
  let count = 0;
  units.children.each((unit: any) => {
    if (unit.isEnemy === isEnemy && unit.active && unit.visible) {
      count++;
    }
  });
  return count;
}
```

## 预期效果

### 游戏流程
1. 游戏开始 → 购买阶段（第1回合）
2. 玩家购买、布置单位
3. 点击"开始战斗" → 战斗阶段（15秒）
4. 战斗结束 → 结算阶段（2秒）
5. 计算伤害、发工资 → 购买阶段（第2回合）
6. 重复直到游戏结束

### 平衡性考虑
1. 玩家血量少（40），需要谨慎防守
2. 敌方血量大（999），需要多回合消耗
3. 每回合发工资，鼓励经济管理
4. 存活单位越多，造成伤害越大，鼓励单位存活

## 风险评估

### 技术风险
1. **阶段切换同步**：确保UI和游戏状态同步
2. **伤害计算准确性**：准确统计存活单位
3. **内存管理**：及时清理战斗结束后的单位

### 游戏性风险
1. **节奏变化**：从连续战斗改为回合制
2. **难度平衡**：玩家40血 vs 敌方999血需要测试
3. **经济平衡**：工资和利息数值需要调整

## 测试计划

### 单元测试
1. 阶段切换逻辑测试
2. 伤害计算测试
3. 发工资计算测试

### 集成测试
1. 完整游戏流程测试
2. UI状态同步测试
3. 性能测试（内存、帧率）

### 平衡性测试
1. 不同策略的胜率测试
2. 经济系统效果测试
3. 游戏时长测试

## 后续优化

### 第一阶段完成后
1. 添加战斗倒计时显示
2. 添加伤害数字显示
3. 添加回合开始提示

### 第二阶段
1. 添加单位合成系统
2. 添加等级系统
3. 添加更多单位类型

### 第三阶段
1. 添加成就系统
2. 添加保存/加载功能
3. 添加多人对战

这个计划提供了完整的实现路线图，可以分阶段实施，确保每个功能都经过充分测试。
