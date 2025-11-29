// src/components/wuxia/logic/battle.ts

import { Person, MartialArt, StoryLine } from './types';
import { getSectById, rand } from './utils';
import { gameOverSnippets } from '../snippets/gameOver';
import { getArtByName } from './skills';

// 战斗配置接口
interface BattleOptions {
  rounds?: number;
  canChooseOutcome?: boolean; // 是否允许玩家选择战胜后的结果（Feature 3）
}

// 战斗系统：多回合战斗（支持同伴参与、挡刀、兜底）
export const generateBattle = (
  hero: Person,
  enemy: Person,
  heroArt: MartialArt,
  enemyArt: MartialArt | null,
  options: number | BattleOptions = 5, // 兼容旧调用方式
  world?: any,
): StoryLine[] => {
  // 解析参数
  const rounds = typeof options === 'number' ? options : (options.rounds || 5);
  const canChooseOutcome = typeof options === 'number' ? false : (options.canChooseOutcome || false);

  const lines: StoryLine[] = [];
  const heroMoves = heroArt.moves;
  const enemyMoves = enemyArt?.moves || ['一刀砍来', '横劈', '直刺', '横扫', '当头一刀'];

  // ==========================================
  // 📜 战斗描述词库 (完整保留)
  // ==========================================
  const battleDescriptions = {
    heroAttack: [
      '只见你身形一闪，',
      '你眼中精光一闪，',
      '你深吸一口气，',
      '你脚下步法一变，',
      '你大喝一声，',
    ],
    enemyAttack: [
      '对方见状，',
      '敌人冷笑一声，',
      '对手目光一寒，',
      '对方不慌不忙，',
      '敌人眼中闪过一丝凶光，',
    ],
    damage: [
      '只见{}身形一晃，显然受了内伤',
      '{}闷哼一声，嘴角渗出一丝鲜血',
      '{}踉跄后退数步，脸色苍白',
      '{}身形不稳，显然受了不轻的伤',
      '{}勉强稳住身形，但气息已乱',
    ],
    critical: [
      '这一击势如破竹，{}顿时口吐鲜血！',
      '招式凌厉，{}顿时被震退数丈！',
      '这一招精妙绝伦，{}完全无法招架！',
      '{}被这突如其来的攻击打得措手不及！',
    ],
    dodge: [
      '但{}身形一闪，轻松避过',
      '{}却如鬼魅般闪到一旁',
      '不料{}早有准备，侧身让过',
      '{}不慌不忙，举重若轻地化解了这招',
    ],
    dialogue: {
      start: [
        `'今日就让你见识见识我【${enemy.name}】的厉害！'`,
        `'哈哈哈，就凭你也配与我一战？'`,
        `'在下【${enemy.name}】，请指教！'`,
        `'小子，看招！'`,
      ],
      during: [
        `'有两下子，不过还差得远呢！'`,
        `'好功夫！但别想轻易胜我！'`,
        `'哼，就这点本事也敢出来丢人现眼？'`,
        `'不错，值得我认真对待！'`,
      ],
      lowHealth: [
        `'可恶...没想到你竟有如此实力...'`,
        `'哼，今日算我【${enemy.name}】看走眼了！'`,
        `'好...好强的内力...'`,
        `'看来...我小看你了...'`,
      ],
      victory: [
        `'今日就饶你一命，咱们后会有期！'`,
        `'哼，算你走运！'`,
        `'青山不改，绿水长流，咱们走着瞧！'`,
        `'今日之耻，他日必当加倍奉还！'`,
      ],
      defeat: [
        `'哼，不堪一击！'`,
        `'就这点本事也敢出来闯荡江湖？'`,
        `'下辈子记得擦亮眼睛！'`,
      ],
    },
    // 🆕 新增：同伴互动描述
    companion: {
      join: [
        `【{name}】拔出武器，坚定地站在你身旁："我也来帮忙！"`,
        `"想动我的朋友？先问问我手中的兵刃！"【{name}】喝道。`,
        `【{name}】与你并肩而立，"我们一起上！"`,
      ],
      protect: [
        `千钧一发之际，【{name}】冲过来替你挡下了这一击！`,
        `"小心！"【{name}】一把推开你，自己却受了伤。`,
      ],
      save: [
        `"休想伤他！"【{name}】爆发出一股惊人的气势，拼死拦住了敌人。`,
        `【{name}】不仅没有退缩，反而更加勇猛，为你争取了宝贵的喘息机会。`
      ]
    }
  };

  // ==========================================
  // 🛠️ 战斗准备
  // ==========================================

  // 1. 获取所有队友
  // 🆕 从 world.party 获取所有队友对象
  const companions = (world?.party || [])
    .map((id: string) => world.npcs.find((n: Person) => n.id === id))
    .filter((n: Person | undefined) => n !== undefined) as Person[];
  const companionOneMan = companions.length > 0 ? companions[0] : null;
  // 获取同伴（如果有）
  const companion = companionOneMan;
  let companionArt: MartialArt | null = null;
  if (companion && companion.arts.length > 0) {
    const art = getArtByName(companion.arts[0]);
    if (art) companionArt = art;
  }

  // 战斗开始
  lines.push({
    text: `【${enemy.name}】${rand(battleDescriptions.dialogue.start)}`,
    type: 'dialogue',
    speaker: enemy.name
  });
  lines.push({
    text: `战斗开始！【${enemy.name}】摆开架势，气势逼人。`,
    type: 'narrative'
  });

  // 🆕 Feature 2: 同伴加入战斗
  if (companion) {
    const joinText = rand(battleDescriptions.companion.join).replace('{name}', companion.name);
    lines.push({
      text: joinText,
      type: 'dialogue',
      speaker: companion.name
    });
  }

  // 战斗属性初始化
  let heroHp = 100;
  let enemyHp = 100;
  let companionHp = companion ? 100 : 0;
  let heroChi = 100;
  let enemyChi = 100;
  let companionChi = 100;
  let roundCount = 0;

  // 内功加成计算
  const getInnerBonus = (p: Person) => {
    if (!p) return 0;
    const inner = p.arts.find(a => getArtByName(a)?.type === 'inner');
    return inner ? 15 : 0;
  };
  const heroInnerBonus = getInnerBonus(hero);
  const enemyInnerBonus = getInnerBonus(enemy);
  const companionInnerBonus = companion ? getInnerBonus(companion) : 0;

  // ==========================================
  // ⚔️ 战斗主循环
  // ==========================================
  // 只要主角活着，或者同伴还活着（可以兜底），战斗就继续
  while (roundCount < rounds && enemyHp > 0 && (heroHp > 0 || (companion && companionHp > 0))) {
    roundCount++;
    const heroMove = rand(heroMoves);
    const enemyMove = rand(enemyMoves);
    const isCritical = Math.random() < 0.2;
    const isDodge = Math.random() < 0.15;

    // 回气
    if (roundCount % 3 === 0) {
      heroChi = Math.min(100, heroChi + 10 + heroInnerBonus);
      enemyChi = Math.min(100, enemyChi + 10 + enemyInnerBonus);
      if (companion) companionChi = Math.min(100, companionChi + 10 + companionInnerBonus);
    }

    // 随机战斗对话
    if (Math.random() < 0.2) {
      const speaker = Math.random() > 0.5 ? enemy.name : (companion && Math.random() > 0.5 ? companion.name : '你');
      lines.push({
        text: rand(battleDescriptions.dialogue.during),
        type: 'dialogue',
        speaker
      });
    }

    // --- 1. 玩家行动 ---
    if (heroHp > 0) {
      const moveDescription = rand(battleDescriptions.heroAttack);
      lines.push({
        text: `${moveDescription}你使出【${heroArt.name}】中的"${heroMove}"！`,
        type: 'action'
      });

      let baseDamage = 10 + Math.floor(Math.random() * 15) + Math.floor(heroChi * 0.1);
      if (isCritical) {
        baseDamage = Math.floor(baseDamage * 1.5);
        lines.push({ text: '会心一击！', type: 'action' });
      }

      const totalDamage = baseDamage + heroInnerBonus;

      if (isDodge) {
        lines.push({
          text: rand(battleDescriptions.dodge).replace('{}', `【${enemy.name}】`),
          type: 'narrative'
        });
      } else {
        enemyHp = Math.max(0, enemyHp - totalDamage);
        heroChi = Math.max(0, heroChi - 5);
        const damageText = isCritical
          ? rand(battleDescriptions.critical).replace('{}', `【${enemy.name}】`)
          : rand(battleDescriptions.damage).replace('{}', `【${enemy.name}】`);
        lines.push({ text: `${damageText}（-${totalDamage}）`, type: 'narrative' });
      }
    }

    if (enemyHp <= 0) break;

    // --- 2. 🆕 同伴行动 (Feature 2) ---
    if (companion && companionHp > 0) {
      // 同伴有几率攻击或助威
      const companionAction = Math.random();

      if (companionAction < 0.6) { // 60% 攻击
        const cMove = companionArt ? rand(companionArt.moves) : '猛击';
        const cArtName = companionArt ? companionArt.name : '基础拳脚';

        lines.push({
          text: `【${companion.name}】寻找破绽，使出【${cArtName}】中的"${cMove}"夹击敌人！`,
          type: 'action'
        });

        const cDamage = 8 + Math.floor(Math.random() * 12) + Math.floor(companionChi * 0.08) + companionInnerBonus;
        enemyHp = Math.max(0, enemyHp - cDamage);
        companionChi = Math.max(0, companionChi - 4);

        lines.push({
          text: `【${enemy.name}】腹背受敌，被击退数步（-${cDamage}）`,
          type: 'narrative'
        });
      } else { // 40% 助威/恢复
        lines.push({
          text: `【${companion.name}】在一旁喊道："打得好！就是这样！"`,
          type: 'dialogue',
          speaker: companion.name
        });
        // 助威稍微恢复一点内力
        heroChi = Math.min(100, heroChi + 10);
      }
    }

    if (enemyHp <= 0) break;

    // --- 3. 敌人行动 ---
    if (enemyHp > 0) {
      // 确定目标：如果主角倒了，必定打同伴；否则70%打主角
      let target = 'hero';
      if (heroHp <= 0) target = 'companion';
      else if (companion && companionHp > 0 && Math.random() > 0.7) target = 'companion';

      const enemyMoveDesc = rand(battleDescriptions.enemyAttack);
      const enemyDmgBase = 10 + Math.floor(Math.random() * 20) + Math.floor(enemyChi * 0.12);

      if (target === 'hero') {
        // 🆕 Feature 2: 同伴挡刀逻辑
        // 触发条件：有同伴，同伴血量健康(>30)，主角血量危急(<30) 或 随机概率(10%)
        const shouldBlock = companion && companionHp > 30 && (heroHp < 30 || Math.random() < 0.1);

        if (shouldBlock) {
          const protectText = rand(battleDescriptions.companion.protect).replace('{name}', companion.name);
          lines.push({ text: `【${enemy.name}】使出"${enemyMove}"直取你要害！`, type: 'action' });
          lines.push({ text: protectText, type: 'action' });

          companionHp = Math.max(0, companionHp - enemyDmgBase);
          lines.push({ text: `【${companion.name}】替你承受了重击，嘴角溢出鲜血（-${enemyDmgBase}）。`, type: 'narrative' });
        } else {
          // 正常攻击主角
          lines.push({ text: `${enemyMoveDesc}【${enemy.name}】对你使出"${enemyMove}"！`, type: 'action' });
          heroHp = Math.max(0, heroHp - enemyDmgBase);
          enemyChi = Math.max(0, enemyChi - 5);

          if (heroHp > 0) {
            lines.push({
              text: `你${rand(['急忙招架', '侧身闪避', '运功抵挡'])}，${rand(['但仍被劲气所伤', '却还是被擦中', '被震得连退数步'])}（-${enemyDmgBase}）`,
              type: 'narrative'
            });
          } else {
            lines.push({ text: `你只觉胸口一痛，眼前一黑，支撑不住倒了下去...`, type: 'narrative' });
          }
        }
      } else if (companion) {
        // 攻击同伴
        lines.push({ text: `${enemyMoveDesc}【${enemy.name}】转身攻向【${companion.name}】！`, type: 'action' });
        companionHp = Math.max(0, companionHp - enemyDmgBase);

        if (companionHp > 0) {
          lines.push({ text: `【${companion.name}】勉强挡下这一击，显得有些吃力（-${enemyDmgBase}）。`, type: 'narrative' });
        } else {
          lines.push({ text: `【${companion.name}】惨叫一声，被击飞出去，不知生死！`, type: 'narrative' });
        }
      }
    }
  } // 循环结束

  // ==========================================
  // 🏁 战斗结算
  // ==========================================

  // 🆕 Feature 2: 兜底环节 (主角倒下，同伴还活着)
  if (heroHp <= 0 && enemyHp > 0 && companion && companionHp > 20) {
    const saveText = rand(battleDescriptions.companion.save).replace('{name}', companion.name);
    lines.push({ text: saveText, type: 'action' });
    lines.push({
      text: `"${hero.name}！快走！别管我！"`,
      type: 'dialogue',
      speaker: companion.name
    });
    lines.push({ text: `趁着【${companion.name}】拼死拖住敌人的瞬间，你被推入草丛，勉强逃离了战场...`, type: 'narrative' });
    // 这里并没有判死，视为一种特殊的"逃跑"
    return lines;
  }

  // 胜利
  if (enemyHp <= 0) {
    lines.push({ text: `【${enemy.name}】${rand(['口吐鲜血', '双目圆睁'])}，倒在地上动弹不得。`, type: 'narrative' });

    if (companion && companionHp > 0) {
      lines.push({
        text: `【${companion.name}】${rand(['擦了擦汗', '收起武器'])}："好险，我们赢了！"`,
        type: 'dialogue',
        speaker: companion.name
      });
    }

    // 🆕 Feature 3: 如果允许选择结果，则不自动生成击杀/逃跑文案，直接返回
    if (canChooseOutcome) {
      lines.push({ text: `【${enemy.name}】已无力再战，任由你发落。`, type: 'narrative' });
      return lines;
    }

    // 默认的自动结算逻辑 (兼容旧代码)
    const victoryType = Math.random();
    if (victoryType < 0.3) {
      lines.push({ text: `你上前补了一刀，彻底了结了祸患。`, type: 'action' });
      if (world) {
        if (!world.flags) world.flags = {};
        world.flags[`killed_${enemy.id}`] = true;
      }
    } else {
      lines.push({
        text: `【${enemy.name}】见势不妙，${rand(['虚晃一招', '丢下一颗烟幕弹'])}，狼狈逃窜。`,
        type: 'narrative'
      });
    }
  } else if (heroHp <= 0) {
    // 失败 (且无同伴兜底)
    lines.push({
      text: `【${enemy.name}】${rand(['居高临下地看着你', '轻蔑地哼了一声'])}："${rand(battleDescriptions.dialogue.defeat)}"`,
      type: 'dialogue',
      speaker: enemy.name
    });

    // 标记玩家为死亡状态
    hero.status = 'dead';

    // 触发濒死体验事件
    const nearDeathSnippet = gameOverSnippets.find((s: { id: string }) => s.id === 'near_death_experience');
    if (nearDeathSnippet) {
      const result = nearDeathSnippet.run(hero, world);
      lines.push(...result.lines);

      if (result.endGame && world) {
        if (!world.flags) world.flags = {};
        world.flags.gameOver = true;
      }
    }
  } else {
    // 平局/超时
    lines.push({
      text: `双方久战力竭，【${enemy.name}】见奈何不了你，${rand(['虚晃一招', '冷哼一声'])}，跳出战圈离去。`,
      type: 'narrative'
    });
  }

  // 记录敌人招式
  if (enemy) enemy.lastUsedMove = enemyMoves[Math.floor(Math.random() * enemyMoves.length)];

  return lines;
};
