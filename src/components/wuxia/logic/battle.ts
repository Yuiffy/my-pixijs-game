import { Person, MartialArt, StoryLine } from './types';
import { getSectById, rand } from './utils';
import { getArtByName } from './skills'; // 注意这里可能需要根据实际导出调整

// 战斗系统：多回合战斗（支持同伴参与和内外功配合）
// 返回战斗过程的剧情线数组
export const generateBattle = (
  hero: Person,
  enemy: Person,
  heroArt: MartialArt,
  enemyArt: MartialArt | null,
  rounds: number = 5, // 增加默认回合数以支持更丰富的战斗描写
  world?: any,
): StoryLine[] => {
  const lines: StoryLine[] = [];
  const heroMoves = heroArt.moves;
  const enemyMoves = enemyArt?.moves || ['一刀砍来', '横劈', '直刺', '横扫', '当头一刀'];

  // 战斗描述词库
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
    counter: [
      '随即反手一掌，',
      '紧接着一个回马枪，',
      '趁势欺身而上，',
      '身形一转，反手就是一拳，',
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
  };

  // 获取同伴（如果有）
  const companion = world?.companionId ? world.npcs.find((n: Person) => n.id === world.companionId) : null;
  let companionArt: MartialArt | null = null;
  if (companion && companion.arts.length > 0) {
    const art = getArtByName(companion.arts[0]);
    if (art) {
      companionArt = art;
    }
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

  // 记录战斗开始时间
  const battleStartTime = Date.now();

  // 同伴加入战斗
  if (companion) {
    const companionSect = world?.sects ?
      getSectById(companion.sectId, world.sects) :
      getSectById(companion.sectId);
    const sectName = companionSect?.name || '无门无派';

    lines.push({
      text: `【${companion.name}】大喝一声：\"${companion.gender === 'female' ? '小女子' : '在下'}【${companion.name}】，${getSectById(companion.sectId, world?.sects)?.name || '无门无派'}弟子，特来助阵！\"`,
      type: 'dialogue',
      speaker: companion.name
    });
  }

  // 战斗属性
  let heroHp = 100;
  let enemyHp = 100;
  let companionHp = companion ? 100 : 0;
  let heroChi = 100; // 内力值
  let enemyChi = 100;
  let companionChi = 100;
  let roundCount = 0;

  // 获取内功加成
  const heroInnerArt = hero.arts.find((art: string) => {
    const artObj = getArtByName(art);
    return artObj?.type === 'inner';
  });
  const heroInnerBonus = heroInnerArt ? 15 : 0;

  const enemyInnerArt = enemy.arts.find((art: string) => {
    const artObj = getArtByName(art);
    return artObj?.type === 'inner';
  });
  const enemyInnerBonus = enemyInnerArt ? 15 : 0;

  const companionInnerArt = companion?.arts.find((art: string) => {
    const artObj = getArtByName(art);
    return artObj?.type === 'inner';
  });
  const companionInnerBonus = companionInnerArt ? 10 : 0;

  // 战斗主循环
  while (roundCount < rounds && enemyHp > 0 && (heroHp > 0 || (companion && companionHp > 0))) {
    roundCount++;
    const heroMove = rand(heroMoves);
    const enemyMove = rand(enemyMoves);
    const isCritical = Math.random() < 0.2; // 20% 暴击几率
    const isDodge = Math.random() < 0.15; // 15% 闪避几率

    // 每3回合恢复一些内力
    if (roundCount % 3 === 0) {
      heroChi = Math.min(100, heroChi + 10 + heroInnerBonus);
      enemyChi = Math.min(100, enemyChi + 10 + enemyInnerBonus);
      if (companion) companionChi = Math.min(100, companionChi + 10 + companionInnerBonus);
    }

    // 随机添加战斗对话（20%几率）
    if (Math.random() < 0.2) {
      lines.push({
        text: rand(battleDescriptions.dialogue.during),
        type: 'dialogue',
        speaker: Math.random() > 0.5 ? enemy.name : (companion && Math.random() > 0.5 ? companion.name : '你')
      });
    }

    // 玩家行动
    if (heroHp > 0) {
      const moveDescription = rand(battleDescriptions.heroAttack);
      lines.push({
        text: `${moveDescription}你使出【${heroArt.name}】中的"${heroMove}"！`,
        type: 'action'
      });

      // 计算伤害（基础伤害 + 内功加成 + 暴击）
      let baseDamage = 10 + Math.floor(Math.random() * 15) + Math.floor(heroChi * 0.1);
      if (isCritical) {
        baseDamage = Math.floor(baseDamage * 1.5);
        lines.push({ text: '会心一击！', type: 'action' });
      }

      const totalDamage = baseDamage + heroInnerBonus;
      enemyHp = Math.max(0, enemyHp - totalDamage);
      heroChi = Math.max(0, heroChi - 5); // 消耗内力

      // 伤害描述
      if (isDodge) {
        lines.push({
          text: rand(battleDescriptions.dodge).replace('{}', `【${enemy.name}】`),
          type: 'narrative'
        });
      } else {
        const damageText = isCritical
          ? rand(battleDescriptions.critical).replace('{}', `【${enemy.name}】`)
          : rand(battleDescriptions.damage).replace('{}', `【${enemy.name}】`);

        lines.push({
          text: `${damageText}（-${totalDamage}）`,
          type: 'narrative'
        });

        // 敌人血量低时可能触发特殊对话
        if (enemyHp < 30 && enemyHp + totalDamage >= 30) {
          lines.push({
            text: rand(battleDescriptions.dialogue.lowHealth),
            type: 'dialogue',
            speaker: enemy.name
          });
        }
      }
    }

    // 检查敌人是否被击败
    if (enemyHp <= 0) break;

    // 同伴行动
    if (companion && companionHp > 0 && enemyHp > 0) {
      if (companionArt) {
        const companionMove = rand(companionArt.moves);
        lines.push({
          text: `【${companion.name}】身形一转，使出【${companionArt.name}】中的"${companionMove}"！`,
          type: 'action'
        });

        // 同伴造成伤害
        const companionDamage = 8 + Math.floor(Math.random() * 12) +
          Math.floor(companionChi * 0.08) + companionInnerBonus;
        enemyHp = Math.max(0, enemyHp - companionDamage);
        companionChi = Math.max(0, companionChi - 4);

        lines.push({
          text: `【${enemy.name}】被逼退数步，${rand(['气息微乱', '脸色一变', '闷哼一声'])}（-${companionDamage}）`,
          type: 'narrative'
        });
      }
    }

    // 检查敌人是否被击败
    if (enemyHp <= 0) break;

    // 敌人行动
    if (enemyHp > 0) {
      // 敌人选择攻击目标（玩家或同伴）
      const attackCompanion = companion && companionHp > 0 &&
        (heroHp <= 0 || (companionHp < 50 && Math.random() > 0.3) || Math.random() > 0.6);

      if (attackCompanion && companion) {
        // 攻击同伴
        const enemyMoveDesc = rand(battleDescriptions.enemyAttack);
        lines.push({
          text: `${enemyMoveDesc}【${enemy.name}】对【${companion.name}】使出"${enemyMove}"！`,
          type: 'action'
        });

        const enemyDamage = 10 + Math.floor(Math.random() * 15) + Math.floor(enemyChi * 0.1);
        companionHp = Math.max(0, companionHp - enemyDamage);
        enemyChi = Math.max(0, enemyChi - 5);

        if (companionHp > 0) {
          lines.push({
            text: `【${companion.name}】${rand(['勉强招架', '急忙闪避', '仓促格挡'])}，${rand(['但依然受了些轻伤', '却还是被劲气所伤', '被震得连退数步'])}（-${enemyDamage}）`,
            type: 'narrative'
          });
        } else {
          lines.push({
            text: `【${companion.name}】不敌重击，${rand(['口吐鲜血', '闷哼一声', '眼前一黑'])}，倒在地上不省人事！`,
            type: 'narrative'
          });
        }
      } else if (heroHp > 0) {
        // 攻击玩家
        const enemyMoveDesc = rand(battleDescriptions.enemyAttack);
        lines.push({
          text: `${enemyMoveDesc}【${enemy.name}】对你使出"${enemyMove}"！`,
          type: 'action'
        });

        const enemyDamage = 10 + Math.floor(Math.random() * 20) + Math.floor(enemyChi * 0.12);
        heroHp = Math.max(0, heroHp - enemyDamage);
        enemyChi = Math.max(0, enemyChi - 5);

        if (heroHp > 0) {
          lines.push({
            text: `你${rand(['急忙招架', '侧身闪避', '运功抵挡'])}，${rand(['但仍被劲气所伤', '却还是被擦中', '被震得连退数步'])}（-${enemyDamage}）`,
            type: 'narrative'
          });
        } else {
          lines.push({
            text: `你${rand(['只觉胸口一痛', '感到一阵天旋地转', '再也支撑不住'])}，眼前一黑，昏死过去...`,
            type: 'narrative'
          });
        }
      }
    }
  }

  // 计算战斗持续时间（秒）
  const battleDuration = Math.floor((Date.now() - battleStartTime) / 1000);

  // 战斗结果
  if (enemyHp <= 0) {
    // 敌人被击败
    const victoryType = Math.random();

    if (victoryType < 0.3) {
      // 30% 击杀
      lines.push({
        text: `【${enemy.name}】${rand(['口吐鲜血', '双目圆睁', '发出一声不甘的怒吼'])}，${rand(['轰然倒地', '气绝身亡', '当场毙命'])}！`,
        type: 'narrative'
      });
      lines.push({
        text: `经过${roundCount}个回合的激战，你${companion && companionHp > 0 ? `与【${companion.name}】合力` : ''}击杀了【${enemy.name}】！`,
        type: 'narrative'
      });

      // 添加击杀标记
      if (world) {
        if (!world.flags) world.flags = {};
        world.flags[`killed_${enemy.id}`] = true;
        world.flags[`defeated_${enemy.id}`] = true;
      }
    } else if (victoryType < 0.8) {
      // 50% 击败
      const escapeLine = rand([
        `【${enemy.name}】见势不妙，${rand(['虚晃一招', '丢下一颗烟幕弹', '突然转身'])}，${rand(['仓皇逃窜', '迅速离去', '消失在山林间'])}`,
        `【${enemy.name}】${rand(['强撑着身体', '捂着伤口'])}，${rand(['咬牙切齿地说道', '狠狠瞪了你一眼'])}："${rand(battleDescriptions.dialogue.victory)}"`,
        `【${enemy.name}】${rand(['单膝跪地', '连退数步'])}，${rand(['吐出一口鲜血', '脸色苍白'])}："${rand(battleDescriptions.dialogue.victory)}"`
      ]);

      lines.push({
        text: escapeLine,
        type: 'narrative'
      });

      // 添加击败标记
      if (world) {
        if (!world.flags) world.flags = {};
        world.flags[`defeated_${enemy.id}`] = true;
      }
    } else {
      // 20% 投降
      lines.push({
        text: `【${enemy.name}】突然收招后退，单膝跪地："${rand(['少侠武功高强', '在下心服口服', '是在下有眼不识泰山'])}，${rand(['请饶在下一命', '甘拜下风', '愿听差遣'])}！"`,
        type: 'dialogue',
        speaker: enemy.name
      });

      // 添加投降标记
      if (world) {
        if (!world.flags) world.flags = {};
        world.flags[`surrendered_${enemy.id}`] = true;
        world.flags[`defeated_${enemy.id}`] = true;
      }
    }

    // 增加与同伴的关系（如果参与战斗）
    if (companion && companionHp > 0) {
      lines.push({
        text: `【${companion.name}】${rand(['微微一笑', '收起武器', '松了一口气'])}："${rand(['配合得不错！', '干得漂亮！', '我们赢了！'])}"`,
        type: 'dialogue',
        speaker: companion.name
      });
    }

  } else if (heroHp <= 0 && (!companion || companionHp <= 0)) {
    // 玩家战败
    const defeatType = Math.random();

    if (defeatType < 0.7) {
      // 70% 敌人嘲讽后离开
      lines.push({
        text: `【${enemy.name}】${rand(['居高临下地看着你', '轻蔑地哼了一声'])}："${rand(battleDescriptions.dialogue.defeat)}"`,
        type: 'dialogue',
        speaker: enemy.name
      });
      lines.push({
        text: `【${enemy.name}】${rand(['转身离去', '扬长而去', '消失在夜色中'])}，留下${companion ? '你们' : '你'}不省人事地倒在地上...`,
        type: 'narrative'
      });
    } else {
      // 30% 被俘虏或其它结局
      lines.push({
        text: `【${enemy.name}】${rand(['一把抓起你', '命令手下'])}："${rand(['带回去！', '把他们绑起来！', '关进地牢！'])}"`,
        type: 'dialogue',
        speaker: enemy.name
      });
      lines.push({
        text: '你的意识逐渐模糊，最后看到的是一片黑暗...',
        type: 'narrative'
      });

      // 添加被俘标记
      if (world) {
        if (!world.flags) world.flags = {};
        world.flags[`captured_by_${enemy.id}`] = true;
      }
    }
  } else {
    // 战斗超时或其它情况
    lines.push({
      text: `【${enemy.name}】见久战不下，${rand(['虚晃一招', '突然收招'])}："${rand(['今日就到此为止', '改日再战', '后会有期'])}！"`,
      type: 'dialogue',
      speaker: enemy.name
    });
    lines.push({
      text: `【${enemy.name}】${rand(['纵身一跃', '施展轻功', '转身离去'])}，${rand(['消失在夜色中', '转眼不见踪影', '迅速离开'])}。`,
      type: 'narrative'
    });
  }

  // 记录敌人最后使用的招式
  if (enemy) {
    enemy.lastUsedMove = enemyMoves[Math.floor(Math.random() * enemyMoves.length)];
  }

  // 添加战斗总结
  lines.push({
    text: `\n战斗结束，共进行了${roundCount}个回合。`,
    type: 'narrative'
  });

  return lines;
};
