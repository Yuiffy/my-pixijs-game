import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  host,
  hudRoot,
  hudShared,
  hudBattleTraits,
  hudEnemyFormation,
  hudShop,
  hudMobileSheets,
  hudCss,
  sceneRoot,
  fighterView,
  projectileView,
  effectView,
  summonView,
  bridge,
  assets,
  config,
  layout,
  theme,
  engineBarrel,
  engineCore,
  engineCombatSetup,
  engineCombatResolution,
  engineProjectiles,
  engineAbilities,
  engineTextState,
  gameTypes,
  healingEffects,
] = await Promise.all([
  readFile(
    new URL(
      "../../src/components/autoChessGame/PhaserGame.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL("../../src/components/autoChessGame/RiftHud.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/hud/shared.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/hud/BattleTraits.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/hud/EnemyFormationOverlay.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL("../../src/components/autoChessGame/hud/Shop.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/hud/MobileSheets.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL("../../src/components/autoChessGame/RiftHud.css", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/phaser/RiftLineScene.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/phaser/battle/FighterView.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/phaser/battle/ProjectileView.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/phaser/battle/EffectView.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/phaser/battle/SummonView.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/phaser/EngineBridge.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/phaser/assets.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/phaser/gameConfig.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/phaser/layout.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/phaser/theme.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/core/gameEngine.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/core/engine/AutoChessEngine.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/core/engine/combatSetup.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/core/engine/combatResolution.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/core/engine/projectiles.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/core/engine/abilities/AbilitySystem.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/core/engine/textState.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/core/gameTypes.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../../src/components/autoChessGame/phaser/healingEffects.ts",
      import.meta.url,
    ),
    "utf8",
  ),
]);

const hud = [
  hudRoot,
  hudShared,
  hudBattleTraits,
  hudEnemyFormation,
  hudShop,
  hudMobileSheets,
].join("\n");
const scene = [
  sceneRoot,
  fighterView,
  projectileView,
  effectView,
  summonView,
].join("\n");
const engine = [
  engineCore,
  engineCombatSetup,
  engineCombatResolution,
  engineProjectiles,
  engineAbilities,
  engineTextState,
].join("\n");

test("Phaser 宿主保留浏览器验证画布和确定性时间接口", () => {
  assert.match(host, /data-game-canvas", "rift-line"/);
  assert.match(host, /window\.render_game_to_text/);
  assert.match(host, /window\.advanceTime/);
  assert.match(host, /gameRef\.current\?\.destroy\(true\)/);
  assert.match(host, /await import\("phaser"\)/);
  assert.doesNotMatch(host, /DomTooltip|onTooltip|tooltip=/);
});

test("游戏配置保持 1120×720 逻辑世界并由宿主管理高 DPI 缩放", () => {
  assert.match(config, /width: WORLD_WIDTH/);
  assert.match(config, /height: WORLD_HEIGHT/);
  assert.match(config, /target: 60/);
  assert.match(config, /limit: 60/);
  assert.match(config, /mode: Phaser\.Scale\.NONE/);
  assert.match(config, /autoCenter: Phaser\.Scale\.CENTER_BOTH/);
  assert.match(layout, /WORLD_WIDTH = 1120/);
  assert.match(layout, /WORLD_HEIGHT = 720/);
  assert.match(layout, /MIN_CARD_SCALE = 0\.72/);
  assert.match(layout, /MAX_CARD_SCALE = 1\.25/);
  assert.match(layout, /viewportScaleFor/);
  assert.match(scene, /viewportScaleFor\(width, height\)/);
  assert.match(
    scene,
    /const zoom = fitScale \* \(battle \? this\.battleViewZoom : 1\)/,
  );
  assert.match(scene, /setZoom\(zoom\)/);
  assert.match(layout, /MAX_TEXT_RESOLUTION = 2/);
});

test("引擎桥接只派发公开规则命令并使用固定步长测试推进", () => {
  assert.match(bridge, /new AutoChessEngine/);
  assert.match(bridge, /engine\.moveUnit/);
  assert.match(bridge, /engine\.sellUnit/);
  assert.match(bridge, /engine\.update\(1 \/ 60\)/);
  assert.match(bridge, /Math\.min\(0\.05/);
  assert.doesNotMatch(bridge, /state\.selected\s*=/);
});

test("Phaser 场景与 DOM HUD 按所有权覆盖全部游戏阶段", () => {
  assert.match(scene, /drawPreparation\(\)/);
  assert.match(scene, /drawBattle\(\)/);
  assert.match(scene, /drawResult\(\)/);
  assert.match(scene, /drawAugments\(\)/);
  assert.doesNotMatch(scene, /drawTitle\(\)/);
  assert.doesNotMatch(scene, /drawGameOver\(\)/);
  assert.match(hud, /state\.phase === "title"/);
  assert.match(hud, /state\.phase === "gameover"/);
  assert.match(hud, /type: "starter", id/);
  assert.match(hud, /type: "restart"/);
  assert.match(
    scene,
    /if \(!this\.phaseLayer \|\| !this\.entityLayer \|\| !this\.effectsLayer\) return/,
  );
});

test("终局战报展示关卡阵容羁绊场均榜与当前网址", () => {
  assert.match(hud, /到达战线/);
  assert.match(hud, /最终阵容/);
  assert.match(hud, /最终羁绊/);
  assert.match(hud, /场均输出/);
  assert.match(hud, /场均治疗 \/ 护盾/);
  assert.match(hud, /场均承伤/);
  assert.match(hud, /window\.location\.origin/);
  assert.doesNotMatch(hud, /核心 <b>\{state\.hp\}/);
  assert.match(hudShared, /state\.phase === "title" \|\| state\.phase === "gameover"/);
});

test("备战画布与 DOM 操作层共享引擎动作并提供紧凑 profile", () => {
  assert.match(hud, /type: "shop"/);
  assert.match(hud, /type: "buyXp"/);
  assert.match(hud, /type: "lock"/);
  assert.match(hud, /type: "reroll"/);
  assert.match(hud, /type: "battle"/);
  assert.match(hud, /type: "sell"/);
  assert.match(scene, /compactBoardSlot/);
  assert.match(scene, /drawMobilePreparation/);
  assert.doesNotMatch(scene, /drawCompactShop/);
  assert.match(layout, /profileFor/);
  assert.match(layout, /"compact"/);
});

test("战斗视图由引擎 fighter 状态同步，并支持完整动作、状态和能量反馈", () => {
  assert.match(scene, /fighter\.jumpTime/);
  assert.match(scene, /fighter\.jumpArcHeight/);
  assert.match(scene, /const \{ abilityMotion \} = fighter/);
  assert.match(scene, /abilityMotion\?\.kind === "jump"/);
  assert.match(scene, /fighter\.attackPulse/);
  assert.match(scene, /fighter\.hitPulse/);
  assert.match(scene, /fighter\.shield/);
  assert.match(scene, /fighter\.burnTime/);
  assert.match(scene, /fighter\.stun/);
  assert.match(scene, /fighter\.facingX < 0/);
  assert.match(scene, /fighter\.energy \/ fighter\.maxEnergy/);
  assert.match(scene, /ENERGY_PROFILES\[fighter\.energyStyle\]\.color/);
  assert.match(scene, /this\.fighterViews\.get\(fighter\.fid\)/);
  assert.match(scene, /setDepth\(DEPTH\.entities \+ visualY\)/);
});

test("突进、跃击与击退由引擎运动状态推进，仅保留明确设计的猫拳闪现", () => {
  assert.match(gameTypes, /kind: "dash" \| "jump" \| "push"/);
  assert.match(engine, /private updateAbilityMotion/);
  assert.match(engine, /private sweepGuangyiDash/);
  assert.match(engine, /motion\.hitFids\.includes/);
  ["sui_bird", "guangyi", "biscuit_sui", "youyi", "akirinco", "mumu"].forEach(
    (unitId) => {
      const marker = `case "${unitId}":`;
      let searchFrom = 0;
      let usesMotion = false;
      while (!usesMotion) {
        const branchStart = engine.indexOf(marker, searchFrom);
        if (branchStart < 0) break;
        const nextCase = engine.indexOf(
          '\n      case "',
          branchStart + marker.length,
        );
        const branch = engine.slice(
          branchStart,
          nextCase < 0 ? engine.length : nextCase,
        );
        usesMotion = /startAbilityMotion|startSuiBirdElbowDash/.test(branch);
        searchFrom = branchStart + marker.length;
      }
      assert.ok(usesMotion, `${unitId} 不应再直接瞬移`);
    },
  );
  const relocationCalls = engine.match(/this\.relocateFighter\(/g) || [];
  assert.equal(
    relocationCalls.length,
    1,
    "只允许有完整出发、落点与推进表现的猫拳保留瞬移",
  );
});

test("头像生成圆形缓存纹理并保留精灵分支与朝向翻转", () => {
  assert.match(assets, /createCircularPortraitTextures/);
  assert.match(assets, /context\.arc/);
  assert.match(assets, /context\.clip/);
  assert.match(scene, /circularTextureKeyForUnit/);
  assert.match(scene, /portraitStyle === "sprite"/);
  assert.match(scene, /const spriteDiameter = radius \* 2\.45/);
  assert.match(scene, /portraitImage\.setFlipX/);
  assert.match(hudShop, /portraitStyle === "sprite" \? "is-sprite"/);
  assert.match(hudCss, /\.rift-dom-portrait\.is-sprite \{ width: 50px; height: 50px;/);
});

test("全身精灵寻路时使用轻量弹跳摆动并避开技能运动", () => {
  assert.match(fighterView, /movedDistance > 0\.05/);
  assert.match(fighterView, /portraitStyle === "sprite"/);
  assert.match(fighterView, /!jumping/);
  assert.match(fighterView, /!groundMotion/);
  assert.match(fighterView, /Math\.abs\(walkStep\) \* 2\.4/);
  assert.match(fighterView, /walkStep \* 4/);
  assert.match(fighterView, /switchJitterY - walkBounce/);
  assert.match(fighterView, /walkShadowScale/);
});

test("战斗同步覆盖投射物、技能效果与机械兔召唤物", () => {
  assert.match(scene, /battle\.projectiles/);
  assert.match(scene, /battle\.effects/);
  assert.match(scene, /battle\.pets/);
  assert.match(scene, /battle\.chronospheres/);
  assert.match(scene, /projectile\.style === "shark"/);
  assert.match(scene, /projectile\.style === "carrot"/);
  assert.match(scene, /projectile\.style === "lollipop"/);
  assert.match(scene, /projectile\.style === "aoe_orb"/);
  assert.match(scene, /projectile\.style === "laugh"/);
  assert.match(scene, /projectile\.style === "cigarette"/);
  assert.match(engine, /style: "laugh"/);
  assert.match(engine, /style: "cigarette"/);
  assert.match(engine, /style: "pickaxe"/);
  assert.match(engine, /kind: "emoji_burst"/);
  assert.match(scene, /effect\.kind === "emoji_burst"/);
  assert.match(scene, /\.setScale\(0\.62 \+ progress \* 1\.48\)/);
  assert.match(scene, /effect\.text === "⛏️"/);
  assert.match(scene, /\.setRotation\(-0\.72 \+ progress \* 2\.8\)/);
  assert.match(scene, /effect\.kind === "line"/);
  assert.match(scene, /effect\.kind === "ring"/);
  assert.match(scene, /effect\.kind === "burst"/);
  assert.match(scene, /effect\.kind === "rebirth"/);
  assert.match(scene, /effect\.kind === "chronosphere"/);
  assert.match(scene, /effect\.kind === "hotpot"/);
  assert.match(scene, /mechanicalRabbitMuzzle/);
});

test("花礼迎客松与大吧唧使用独立自绘战场效果", () => {
  assert.match(gameTypes, /"harei_pine"/);
  assert.match(gameTypes, /"harei_badge"/);
  assert.match(engine, /kind: "harei_pine"/);
  assert.match(engine, /kind: "harei_badge"/);
  assert.match(effectView, /effect\.kind === "harei_pine"/);
  assert.match(effectView, /effect\.kind === "harei_badge"/);
  assert.match(effectView, /needleLight = 0x70d67d/);
  assert.match(effectView, /\.setText\(effect\.text \|\| "欢迎光临"\)/);
  assert.match(effectView, /\.setText\(effect\.text \|\| "75mm\\n大吧唧"\)/);
  assert.doesNotMatch(scene, /"🌲"/);
});

test("浣熊开关反震与犬绒饼干使用独立战场效果", () => {
  assert.match(gameTypes, /"switch_on"/);
  assert.match(gameTypes, /"switch_shock"/);
  assert.match(gameTypes, /"biscuit_share"/);
  assert.match(engine, /kind: "switch_on"/);
  assert.match(engine, /kind: "switch_shock"/);
  assert.match(engine, /kind: "biscuit_share"/);
  assert.match(engine, /text: hasShield \? "choco" : "soda"/);
  assert.match(fighterView, /switchJitterX/);
  assert.match(fighterView, /fighter\.raccoonSwitchTime > 0/);
  assert.match(effectView, /effect\.kind === "switch_on"/);
  assert.match(effectView, /\.setText\(effect\.text \|\| "ON"\)/);
  assert.match(effectView, /effect\.kind === "switch_shock"/);
  assert.match(effectView, /\.setText\("麻"\)/);
  assert.match(effectView, /effect\.kind === "biscuit_share"/);
  assert.match(effectView, /effect\.text === "choco"/);
  assert.match(effectView, /fillRoundedRect\(biscuitX - 13/);
});

test("沐霂救场使用甩带、套住与弧线抛援的独立表现", () => {
  assert.match(gameTypes, /"mumu_whip"/);
  assert.match(engineAbilities, /kind: "mumu_whip"/);
  assert.match(engineAbilities, /mumuWhipControlPoint/);
  assert.match(effectView, /effect\.kind === "mumu_whip"/);
  assert.match(effectView, /const catchProgress = Math\.min/);
  assert.match(effectView, /strokeCircle\(ropeEnd\.x, ropeEnd\.y/);
  assert.match(fighterView, /mumuWhipPullProgress/);
  assert.match(fighterView, /mumuPulling \? 14 : 7/);
});

test("技能只保留名称提示，范围与连线效果提供范围染色和飞行脉冲", () => {
  assert.doesNotMatch(gameTypes, /kind: "cast"/);
  assert.doesNotMatch(engine, /kind: "cast"/);
  assert.doesNotMatch(scene, /effect\.kind === "cast"/);
  assert.match(engine, /text: def\.abilityName/);
  assert.match(scene, /const travel = Math\.min\(1, progress \* 1\.35\)/);
  assert.match(scene, /fillCircle\(0, 0, fieldRadius\)/);
  assert.match(engine, /visualEffects:/);
  assert.match(engine, /projectiles: battle\.projectiles\.map/);
});

test("帕可治疗区使用小型恢复脉冲和淡色范围标识", () => {
  const pakoAbility = engine.slice(
    engine.indexOf('case "pako":'),
    engine.indexOf('case "lian":'),
  );
  const healingZoneUpdate = engine.slice(
    engine.indexOf("private updateHealingZones"),
    engine.indexOf("private updateBattle"),
  );
  assert.match(gameTypes, /"healing_field"/);
  assert.match(gameTypes, /"healing_pulse"/);
  assert.match(pakoAbility, /kind: "healing_field"/);
  assert.match(pakoAbility, /kind: "healing_pulse"/);
  assert.doesNotMatch(pakoAbility, /kind: "ring"/);
  assert.match(healingZoneUpdate, /kind: "healing_pulse"/);
  assert.doesNotMatch(healingZoneUpdate, /kind: "ring"/);
  assert.match(
    scene,
    /drawHealingFieldEffect\(graphics, burstGradient, color, progress, effect\.size\)/,
  );
  assert.match(
    scene,
    /drawHealingPulseEffect\(graphics, burstGradient, color, progress, effect\.size\)/,
  );
  assert.match(healingEffects, /const markerDistance = radius \* 0\.7/);
  assert.match(
    healingEffects,
    /const radius = \(size \|\| 64\) \* \(0\.34 \+ progress \* 0\.3\)/,
  );
  assert.match(healingEffects, /HEALING_HIGHLIGHT/);
});

test("贴身护盾按当前值相对峰值降低透明强度", () => {
  assert.match(engine, /shieldPeak: Math\.round\(fighter\.shieldPeak\)/);
  assert.match(scene, /fighter\.shield \/ Math\.max\(fighter\.shieldPeak, 1\)/);
  assert.match(scene, /0\.06 \+ shieldStrength \* 0\.14/);
  assert.match(scene, /0\.24 \+ shieldStrength \* 0\.66/);
  assert.match(scene, /\.setAlpha\(fighter\.shield > 0 \? 1 : 0\)/);
});

test("技能盾与普通护盾使用独立资源和紫色战场环", () => {
  assert.match(gameTypes, /abilityShield: number/);
  assert.match(engine, /abilityShield: Math\.round\(fighter\.abilityShield\)/);
  assert.match(engine, /damageKind === "ability"/);
  assert.match(scene, /setName\("abilityShield"\)/);
  assert.match(
    scene,
    /fighter\.abilityShield \/ Math\.max\(fighter\.abilityShieldPeak, 1\)/,
  );
  assert.match(scene, /fighter\.abilityShield > 0 \? "术" : ""/);
  assert.match(scene, /abilityMotion\?\.kind === "pull" \? "援" : ""/);
  assert.match(scene, /技能盾.*abilityShieldTime/);
});

test("机械兔耳浮游炮以原版分层轮廓绘制，并与共享炮口对齐", () => {
  assert.match(summonView, /CLOCK_GUNNER_EAR_REST_Y_RATIO = 1\.5/);
  assert.match(fighterView, /createClockGunnerEarRig/);
  assert.match(fighterView, /pet\.ownerFid === fighter\.fid/);
  assert.match(fighterView, /setVisible\(!rabbitEarsLaunched\)/);
  assert.match(fighterView, /setScale\(fighter\.facingX, 1\)/);
  assert.match(summonView, /createMechanicalRabbitVisual/);
  assert.match(summonView, /clockGunnerLeftEar/);
  assert.match(summonView, /clockGunnerRightEar/);
  assert.match(scene, /drawRabbitBody\(/);
  assert.match(scene, /drawRabbitCannon\(/);
  assert.match(
    scene,
    /fillGradientStyle\(0x111a27, 0x728998, 0x3b4f60, 0x728998, 1\)/,
  );
  assert.match(scene, /lineStyle\(1\.2, 0xb8ccd8\)/);
  assert.match(scene, /fillStyle\(0x1b2938\)/);
  assert.match(scene, /fillStyle\(0xf4f0f2\)/);
  assert.match(scene, /fillStyle\(0xefc8d1\)/);
  assert.match(scene, /lineStyle\(1\.4, 0x92d7ff\)/);
  assert.match(scene, /lineTo\(muzzleDistance, 0\)/);
  assert.match(scene, /flash\s*\.setX\(muzzleDistance\)/);
  assert.match(scene, /1 \+ \(pet\.attackPulse \/ 0\.16\) \* 0\.75/);
  assert.match(
    scene,
    /setRotation\(-angle\)\s*\.setY\(pet\.radius \* 0\.88 - bob\)/,
  );
});

test("投射物按互斥分支绘制 Emoji 与光弹", () => {
  assert.match(scene, /const projectileEmoji = \(projectile: Projectile\)/);
  assert.match(scene, /if \(projectile\.emoji\) return projectile\.emoji/);
  assert.match(scene, /if \(emoji\)/);
  assert.match(scene, /Math\.max\(12, projectile\.size\)/);
  assert.match(scene, /Math\.max\(14, projectile\.size\)/);
  assert.match(scene, /trail\.clear\(\)\.setVisible\(false\)/);
  assert.match(scene, /core\.setVisible\(false\)/);
  assert.match(scene, /setBlendMode\(Phaser\.BlendModes\.SCREEN\)/);
  assert.match(
    scene,
    /drawProjectileTrail\(trail, tailX, tailY, projectile\.size \+ 3, projectileColor\)/,
  );
  assert.match(
    scene,
    /fillCircle\(tailX, tailY, capRadius\)\.fillCircle\(0, 0, capRadius\)/,
  );
});

test("远端 AOE 投送弹幕以缩小范围圈和主题符号绘制", () => {
  assert.match(scene, /if \(projectile\.style === "aoe_orb"\)/);
  assert.match(scene, /strokeCircle\(0, 0, 11\)/);
  assert.match(scene, /strokeCircle\(0, 0, 6\)/);
});

test("投射物命中使用可复用的径向渐变爆裂", () => {
  assert.match(scene, /BURST_GRADIENT_TEXTURE/);
  assert.match(scene, /createBurstGradientTexture\(\)/);
  assert.match(
    scene,
    /textures\.createCanvas\(BURST_GRADIENT_TEXTURE, 128, 128\)/,
  );
  assert.match(scene, /context\.createRadialGradient/);
  assert.match(scene, /texture\.refresh\(\)/);
  assert.match(scene, /setName\("burstGradient"\)/);
  assert.match(scene, /effect\.kind === "burst"/);
  assert.match(
    scene,
    /\(effect\.size \|\| 40\) \* \(0\.35 \+ progress \* 0\.65\)/,
  );
  assert.match(
    scene,
    /burstGradient[\s\S]*?\.setTint\(color\)[\s\S]*?\.setDisplaySize\(radius \* 2, radius \* 2\)[\s\S]*?\.setVisible\(true\)/,
  );
});

test("战斗热路径复用短命视图并缓存棋子子节点", () => {
  assert.match(scene, /fighterViewParts\s*=\s*new WeakMap/);
  assert.match(scene, /this\.fighterViewParts\.set\(container/);
  assert.match(scene, /this\.fighterViewParts\.get\(view\)!/);
  assert.match(scene, /projectileViewPool/);
  assert.match(scene, /effectViewPool/);
  assert.match(scene, /public recycle\(view: Phaser\.GameObjects\.Container\)/);
  assert.match(scene, /private takePooledView\(\)/);
  assert.match(scene, /this\.projectileViewPool\.length >= 48/);
  assert.match(scene, /this\.effectViewPool\.length >= 96/);
  assert.match(scene, /MOBILE_TEXT_EFFECT_LIMIT = 18/);
  assert.match(scene, /visibleCombatEffects\(battle\.effects\)/);
  assert.match(scene, /this\.suppressedEffectViews\.add\(effect\)/);
  assert.match(scene, /if \(urgent !== this\.battleTimerUrgent\)/);
});

test("多个持续时停领域各自渲染，并与短命特效对象池使用独立生命周期", () => {
  assert.match(
    scene,
    /private chronosphereViews = new Map<string, Phaser\.GameObjects\.Container>\(\)/,
  );
  assert.match(scene, /new Set\(zones\.map\(\(zone\) => zone\.sourceFid\)\)/);
  assert.match(scene, /this\.chronosphereViews\.forEach\(\(view, sourceFid\)/);
  assert.match(scene, /zones\.forEach\(\(zone\)/);
  assert.match(scene, /this\.chronosphereViews\.get\(zone\.sourceFid\)/);
  assert.match(scene, /this\.chronosphereViews\.set\(zone\.sourceFid, view\)/);
  assert.match(scene, /this\.chronosphereViews\.delete\(sourceFid\)/);
  assert.doesNotMatch(scene, /const zone = zones\[0\]/);
  assert.doesNotMatch(scene, /rift-chronosphere/);
  assert.doesNotMatch(scene, /as unknown as BattleEffect/);
});

test("文字、圆形头像和宿主 Canvas 根据真实视口同步高 DPI 渲染", () => {
  assert.match(layout, /MAX_RENDER_PIXELS/);
  assert.match(layout, /MAX_DEVICE_PIXEL_RATIO = 2/);
  assert.match(layout, /MAX_MOBILE_DEVICE_PIXEL_RATIO = 1\.5/);
  assert.match(layout, /MAX_MOBILE_TEXT_RESOLUTION = 1\.5/);
  assert.match(layout, /mobileSized/);
  assert.match(layout, /logicalSizeFor/);
  assert.match(layout, /renderSizeFor/);
  assert.match(layout, /uiScaleFor/);
  assert.match(layout, /MAX_UI_SCALE = 1\.25/);
  assert.match(layout, /viewportScaleFor/);
  assert.match(layout, /tooltipLayoutFor/);
  assert.match(layout, /scale: 1 \/ fitScale/);
  assert.match(layout, /TOOLTIP_TYPOGRAPHY/);
  assert.match(
    layout,
    /width: Math\.max\(1, Math\.round\(displayWidth \* density\)\)/,
  );
  assert.match(host, /ResizeObserver/);
  assert.match(host, /scale\.setParentSize/);
  assert.match(host, /scale\.resize\(target\.width, target\.height\)/);
  assert.doesNotMatch(host, /scale\.setGameSize/);
  assert.match(host, /baseSize\.width !== target\.width/);
  assert.match(host, /RiftHud/);
  assert.match(host, /data-ui-scale/);
  assert.match(host, /transform: `scale\(\$\{uiScale\}\)`/);
  assert.match(host, /dataset\.devicePixelRatio/);
  assert.match(host, /dataset\.renderScale/);
  assert.match(host, /dataset\.layoutProfile/);
  assert.match(host, /document\.fonts\?\.load/);
  assert.match(scene, /scale\.parentSize/);
  assert.match(scene, /logicalSizeFor\(\)/);
  assert.match(scene, /setViewport/);
  assert.match(scene, /setZoom\(zoom\)/);
  assert.match(scene, /centerOn\(center\.x, center\.y\)/);
  assert.match(scene, /adjustBattleView/);
  assert.match(scene, /battleViewPointers/);
  assert.match(scene, /positionToCamera\(this\.cameras\.main\)/);
  assert.match(
    scene,
    /maximumResolution = this\.isMobileSizedViewport\(\) \? MAX_MOBILE_TEXT_RESOLUTION : MAX_TEXT_RESOLUTION/,
  );
  assert.match(
    scene,
    /Math\.min\(maximumResolution, Math\.ceil\(devicePixelRatio\)\)/,
  );
  assert.match(scene, /resolution: this\.textResolution/);
  assert.match(scene, /tooltipLayoutFor\(/);
  assert.match(
    scene,
    /container = this\.add\.container\(x, y\)\.setScale\(scale\)/,
  );
  assert.match(scene, /width \* scale, height \* scale/);
  assert.match(
    scene,
    /const offset = TOOLTIP_TYPOGRAPHY\.pointerOffset \* scale/,
  );
  assert.match(
    scene,
    /scale\.off\(Phaser\.Scale\.Events\.RESIZE, this\.handleResize, this\)/,
  );
});

test("整备页用逻辑坐标羁绊视口、分区面板和受限文本还原 Canvas 层级", () => {
  assert.match(scene, /createGeometryMask\(\)/);
  assert.match(scene, /content\.setMask\(/);
  assert.match(
    scene,
    /content\.enableFilters\(\)\.filters!\.external\.addMask\(maskGraphics, false, this\.cameras\.main, "world"\)/,
  );
  assert.match(scene, /this\.renderer\.type === Phaser\.CANVAS/);
  assert.match(scene, /this\.children\.remove\(maskGraphics\)/);
  assert.match(scene, /traitMinimumOffset/);
  assert.match(scene, /traitBaseOffset/);
  assert.match(scene, /updateTraitViewport\(\)/);
  assert.doesNotMatch(scene, /drawWrappedTraits\(strip\)/);
  assert.doesNotMatch(scene, /viewport\.draw\(source/);
  assert.match(scene, /PREPARATION_BOARD_PANEL/);
  assert.match(scene, /PREPARATION_BENCH_PANEL/);
  assert.match(scene, /PREPARATION_SHOP_PANEL/);
  assert.match(scene, /boundedText\(/);
  assert.match(scene, /probe\.getWrappedText\(value\)/);
  assert.match(scene, /wordWrap: \{ width: maxWidth, useAdvancedWrap: true \}/);
  assert.match(scene, /abilityTitle\.height/);
  assert.match(scene, /detailText\.height/);
  assert.match(scene, /traitX \+ tagWidth > contentWidth/);
  assert.match(scene, /TOOLTIP_TYPOGRAPHY/);
  assert.match(scene, /const \{ padding, title, body/);
  assert.match(scene, /boundedText\(trait\.description/);
  assert.match(scene, /const inset = TOOLTIP_TYPOGRAPHY\.edgeInset \* scale/);
  assert.match(
    scene,
    /const xMin = Math\.min\(inset, Math\.max\(0, WORLD_WIDTH - width\)\)/,
  );
  assert.match(
    scene,
    /const yMax = Math\.max\(yMin, WORLD_HEIGHT - height - inset\)/,
  );
  assert.match(scene, /truncateText\(/);
  assert.match(scene, /occupiedSlotLayout/);
  assert.match(scene, /"★"\.repeat\(unit\.star\)/);
  assert.match(scene, /const starColor = unit\.star === 3/);
  assert.match(
    scene,
    /showUnitTooltip\(unit\.id, pointer, unit\.star, undefined, unit\)/,
  );
  assert.match(scene, /getPlayerCombatStats\(owned\)/);
  assert.match(scene, /部署生命 \$\{Math\.round\(combatStats\.maxHp\)\}/);
  assert.match(scene, /def\.traits\.forEach/);
  assert.match(scene, /getTraitStatus\(traitId\)/);
  assert.match(scene, /drawTalentHistory\(compact\)/);
  assert.match(scene, /setName\(`starter-history-\$\{starter\.id\}`\)/);
  assert.match(scene, /showStarterTooltip\(starter, pointer\)/);
  assert.match(scene, /setName\(`augment-history-\$\{augment\.id\}`\)/);
  assert.match(scene, /augment\.tier === "major"/);
  assert.match(scene, /showAugmentTooltip\(entry, pointer\)/);
  assert.match(scene, /已叠加 \$\{rounds\.length\} 次/);
  assert.doesNotMatch(scene, /compact \? 708 : 748/);
  assert.doesNotMatch(scene, /const labelBackplate = this\.add\.graphics\(\)/);
  assert.doesNotMatch(scene, /const traitDots =/);
  assert.match(layout, /WIDE_TRAIT_STRIP/);
  assert.match(
    layout,
    /WIDE_TRAIT_STRIP = \{ x: 48, y: 190, width: 700, height: 25 \}/,
  );
  assert.match(layout, /y: 232 \+ Math\.floor\(index \/ 6\) \* 68/);
  assert.match(layout, /COMPACT_TRAIT_STRIP = \{ x: 48, y: 194/);
  assert.match(layout, /portraitY/);
  assert.match(layout, /starY/);
  assert.match(layout, /nameY/);
  assert.match(
    scene,
    /POINTER_MOVE, \(pointer: Phaser\.Input\.Pointer\) => \{\n      if \(!this\.traitDrag\?\.moved\) this\.updateTraitTooltip\(pointer\);/,
  );
});

test("标题页由响应式 DOM 协议卡与 Phaser 缓存氛围光共同呈现", () => {
  assert.match(hud, /rift-dom-title-body/);
  assert.match(hud, /rift-title-choice-panel/);
  assert.match(hud, /state\.starterChoices\.map/);
  assert.match(hud, /starter\.description/);
  assert.match(hud, /接入协议/);
  assert.match(hud, /type: "starter", id/);
  assert.match(hudCss, /\.rift-dom-title-body/);
  assert.match(hudCss, /\.rift-dom-choice-grid/);
  assert.match(scene, /createTitleGlowTexture\(\)/);
  assert.match(scene, /TITLE_GLOW_TEXTURE/);
  assert.match(scene, /this\.tweens\.add/);
});

test("DOM 负责阶段命令，Phaser 保留羁绊、战场与拖拽交互", () => {
  assert.match(hud, /type: "starter", id/);
  assert.match(scene, /type: "augment", index/);
  assert.match(scene, /if \(this\.phase === "result"\)/);
  assert.match(scene, /this\.drawResult\(\)/);
  assert.match(
    scene,
    /if \(this\.phase === "augment"\) this\.drawAugments\(\)/,
  );
  assert.doesNotMatch(bridge, /onTooltip|DomTooltip/);
  assert.match(hud, /disabled=\{!engine\.boardCount\}/);
  assert.match(
    hud,
    /disabled=\{!state\.freeRerollCharges && state\.gold < 1\}/,
  );
  assert.match(scene, /traitOffset/);
  assert.doesNotMatch(scene, /filter\(\(\[, count\]\) => count > 0\)\.slice/);
  assert.match(scene, /0x142735/);
  assert.match(scene, /lineBetween\(560, 104, 560, 680\)/);
  assert.doesNotMatch(scene, /field\.fillGradientStyle/);
  assert.match(scene, /createDragGhost/);
  assert.match(scene, /handlePointerMove/);
  assert.match(scene, /POINTER_UP_OUTSIDE/);
  assert.match(scene, /type: "move", from: drag\.origin, to: target/);
  assert.match(scene, /drawResultRow/);
  assert.match(scene, /\+\$\{result\.income\} 金币/);
  assert.match(scene, /drawEnemyTraitPreview\(currentWave\.units\)/);
  assert.match(scene, /setName\(`enemy-trait-\$\{id\}`\)/);
  assert.match(scene, /showEnemyTraitTooltip\(id, count, level, pointer\)/);
  assert.match(hud, /enemyTraitActivations\(wave\.units\)/);
  assert.match(hud, /敌方羁绊：/);
});

test("紧凑桌面备战区的槽位绘制与拖拽命中共用布局 profile", () => {
  assert.match(
    scene,
    /const compact = this\.isCompact\(\);[\s\S]*?state\.board\.forEach\(\(unit, index\) => this\.drawSlot\("board", index, unit, compact\)\);[\s\S]*?state\.bench\.forEach\(\(unit, index\) => this\.drawSlot\("bench", index, unit, compact\)\);/,
  );
  assert.doesNotMatch(scene, /drawSlot\("board", index, unit, false\)/);
  assert.doesNotMatch(scene, /drawSlot\("bench", index, unit, false\)/);
});

test("场上满员时 DOM 商店仍预测待激活羁绊", () => {
  assert.match(hud, /const canStore = engine\.canStoreUnit\(def\.id\)/);
  const domPrediction = hud.match(
    /const traitTags = def\.traits\.map[\s\S]*?return \{ id, trait, status, willActivate \};\n  \}\);/,
  )?.[0];
  assert.ok(domPrediction);
  assert.doesNotMatch(scene, /private traitActivatesAfterPurchase/);
  assert.doesNotMatch(domPrediction, /boardCount|boardCap/);
  assert.match(domPrediction, /status\.count \+ 1 >= nextThreshold/);
  assert.match(domPrediction, /!engine\.state\.board\.some/);
});

test("桌面商店下半区详情向上展开并保持箭头贴近卡片", () => {
  assert.match(
    hudCss,
    /\.rift-dom-shop-desktop \.rift-shop-card-wrap:nth-child\(n \+ 3\) \.rift-shop-card-detail \{ top: auto; bottom: -5px; \}/,
  );
  assert.match(
    hudCss,
    /\.rift-dom-shop-desktop \.rift-shop-card-wrap:nth-child\(n \+ 3\) \.rift-shop-card-detail::after \{ top: auto; bottom: 19px; \}/,
  );
});

test("战斗统计和结算层保留稳定交互、模态拦截与阵容提示", () => {
  assert.match(scene, /buildBattleOverlay/);
  assert.match(scene, /rankingStateKey/);
  assert.doesNotMatch(
    scene,
    /private syncBattleOverlay\(\)[\s\S]*buttonViews\.forEach/,
  );
  assert.match(scene, /createInputBlocker/);
  assert.match(
    scene,
    /showUnitTooltip\(fighter\.unitId, pointer, fighter\.star, fighter\)/,
  );
  assert.match(scene, /damageTaken/);
  assert.match(scene, /resultContinueLabel/);
  assert.match(scene, /继续 · 进入整备/);
  assert.match(scene, /DEPTH\.overlay \+ 3/);
  assert.match(scene, /this\.overlayLayer\.add\(\[graphics, label, zone\]\)/);
  assert.match(scene, /this\.overlayLayer\.add\(zone\)/);
});

test("备战界面可从桌面和移动端查看双方真实部署且详情高度稳定", () => {
  assert.match(scene, /enemy-formation-trigger-desktop/);
  assert.match(scene, /enemy-formation-trigger-mobile/);
  assert.match(scene, /setEnemyFormationOpen\(true\)/);
  assert.match(
    host,
    /state\.phase === "preparation" && event\.code === "Space"/,
  );
  assert.match(host, /action = \{ type: "battle" \}/);
  assert.match(bridge, /enemyFormationOpen = false/);
  assert.match(bridge, /interface:\s*\{\s*enemyFormationOpen:/);
  assert.match(hud, /function EnemyFormationOverlay/);
  assert.match(hud, /playerFormationPosition\(index\)/);
  assert.match(hud, /enemyFormationPosition\(index, wave\.units\.length\)/);
  assert.match(hud, /data-team=\{unit\.team\}/);
  assert.match(hud, /role="dialog" aria-modal="true"/);
  assert.match(hud, /rift-enemy-formation-unit/);
  assert.match(hud, /onPointerEnter=\{\(\) => setActiveKey\(unit\.key\)\}/);
  assert.match(
    hud,
    /abilityDescriptionForStar\(activeDefinition, activeUnit\.star\)/,
  );
  assert.match(hudCss, /\.rift-enemy-formation-backdrop/);
  assert.match(hudCss, /\.rift-enemy-formation-layout/);
  assert.match(hudCss, /height: min\(596px, calc\(100% - 12px\)\)/);
  assert.match(hudCss, /grid-template-rows: auto auto 54px minmax\(0, 1fr\)/);
  assert.match(hudCss, /grid-template-rows: minmax\(210px, 42vh\) auto/);
});

test("战斗顶部展示双方羁绊、完整说明并支持小屏收起", () => {
  assert.match(hud, /function BattleTraitBar/);
  assert.match(hud, /playerBattleTraits/);
  assert.match(hud, /enemyBattleTraits/);
  assert.match(hud, /当前效果：/);
  assert.match(hud, /展开双方羁绊/);
  assert.match(hud, /setBattleTraitsCollapsed\(isMobile\)/);
  assert.match(hudCss, /\.rift-battle-traits/);
  assert.match(hudCss, /\.rift-battle-trait-detail/);
  assert.match(hudCss, /\.rift-battle-traits\.is-collapsed/);
  assert.match(hudCss, /orientation: portrait/);
  assert.match(hudCss, /orientation: landscape/);
});

test("结算报告保持固定可读行高并让完整阵容独立滚动", () => {
  assert.match(theme, /Noto Sans CJK SC/);
  assert.match(theme, /resultReward: "#ffd166"/);
  assert.match(scene, /truncateText\(result\.headline, 920/);
  assert.match(scene, /boundedText\(result\.detail, 860, 2/);
  assert.match(scene, /drawResultMetricTab/);
  assert.match(
    scene,
    /this\.isCompact\(\) \? COMPACT_RESULT_LAYOUT : WIDE_RESULT_LAYOUT/,
  );
  assert.match(scene, /const RESULT_VISIBLE_ROWS = 6/);
  assert.match(scene, /height: 48/);
  assert.match(scene, /rows\.slice\(offset, offset \+ RESULT_VISIBLE_ROWS\)/);
  assert.match(scene, /drawResultScrollbar/);
  assert.match(scene, /resultScrollOffsets: Record<Team, number>/);
  assert.match(scene, /resultRow-\$\{fighter\.team\}-\$\{rank\}/);
  assert.doesNotMatch(scene, /const height = Math\.min\(52/);
  assert.match(layout, /WIDE_RESULT_LAYOUT/);
  assert.match(layout, /COMPACT_RESULT_LAYOUT/);
});

test("DOM 商店与 Phaser 备战棋盘共同覆盖经济、敌情和快捷回收", () => {
  assert.match(hud, /tierOddsForLevel/);
  assert.match(hud, /engine\.upgradeCost/);
  assert.match(scene, /getActiveTraits\(\)/);
  assert.match(scene, /currentWave\.units/);
  assert.match(scene, /敌军 \$\{currentWave\.units\.length\}/);
  assert.match(scene, /currentWave\.tag === "elite"/);
  assert.match(scene, /rightButtonDown\(\)/);
  assert.match(scene, /preventContextMenu/);
  assert.match(scene, /松开出售 \+\$\{refund\} 金币/);
  assert.match(scene, /setName\("preparation-sell-zone"\)/);
  assert.match(scene, /点击出售 \+\$\{refund\} 金币/);
  assert.match(scene, /if \(this\.dragState\) return;/);
  assert.match(scene, /this\.dispatch\(\{ type: "sell" \}\)/);
});

test("经济信息只在商店出现，并提供利息规则与清晰的备战价值", () => {
  assert.doesNotMatch(hud, /rift-header-gold/);
  assert.match(hud, /function InterestInfo/);
  assert.match(hud, /每 5 金币提供 1 利息/);
  assert.match(hud, /理财Ⅱ：每 4 金币提供 1 利息/);
  assert.match(hud, /rift-bench-value/);
  assert.match(engine, /public getUnitSellValue/);
  assert.match(scene, /getUnitSellValue\(unit\)/);
  assert.match(scene, /const priceLabel = `\$\{def\.cost\} 费`/);
  assert.match(scene, /priceBackplate/);
});

test("场景预加载单位头像并保留缺图降级纹理", () => {
  assert.match(assets, /Object\.values\(UNIT_DEFS\)/);
  assert.match(assets, /scene\.load\.image/);
  assert.match(assets, /rift-fallback-unit/);
  assert.match(scene, /textureKeyForUnit/);
  assert.match(scene, /this\.textures\.exists\(key\)/);
});

test("React 宿主默认填满网页视口并保留工具栏与安全区支撑", () => {
  assert.match(host, /width: fullscreen \? "100vw" : "100%"/);
  assert.match(host, /height: fullscreen \? "100dvh" : "100%"/);
  assert.match(host, /flex: "1 1 auto"/);
  assert.doesNotMatch(host, /min\(\$\{WORLD_WIDTH\}px/);
  assert.doesNotMatch(host, /aspectRatio:/);
  assert.match(host, /Codex/);
  assert.match(host, /AutoChessAudio/);
  assert.match(host, /全屏游玩/);
  assert.match(host, /safe-area-inset-bottom/);
  assert.match(host, /aria-live="polite"/);
});
