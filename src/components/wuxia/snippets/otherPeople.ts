import { generateBattle } from "../logic/battle";
import { MERCHANT_ITEMS } from "../logic/constants";
import { getArtByName, getSectArts, SECT_ARTS } from "../logic/skills";
import { StorySnippet, StoryStage, Person, Sect, RelationType, MartialArt, StoryLine, LocationInfo } from "../logic/types";
import { rand, genName, genPersonality, genAppearance, describeAppearanceChange, describeAppearance } from "../logic/utils";

export const otherPeopleSnippets: StorySnippet[] = [

  // ===================================
  // 👥 角色互动系列
  // ===================================

  // 与同门切磋
  {
    id: 'sect_spar',
    tags: ['sect_daily'],
    weight: 15,
    stageMax: StoryStage.CRISIS,
    req: (hero, world) => {
      const disciples = world.npcs.filter((n: Person) => n.sectId === hero.sectId && n.role === 'disciple' && n.id !== hero.id);
      return disciples.length > 0;
    },
    run: (hero, world) => {
      const disciples = world.npcs.filter((n: Person) => n.sectId === hero.sectId && n.role === 'disciple' && n.id !== hero.id);
      const partner = rand(disciples) as Person;
      const artName = hero.arts.length > 0 ? hero.arts[0] : '太祖长拳';
      const art = getArtByName(artName);
      const move = rand(art.moves);

      return {
        lines: [
          { text: `你与同门【${partner.name}】在演武场切磋。`, type: 'action' },
          { text: `'看招！'你使出一招'${move}'，${partner.name}连忙招架。`, type: 'action' },
          { text: '几个回合下来，你们都有所收获。', type: 'narrative' },
        ],
        addRelation: {
          targetId: partner.id,
          type: 'friend',
          value: (hero.relations.find((r) => r.targetId === partner.id)?.value || 0) + 10,
        },
      };
    },
  },

  // 与师父请教
  {
    id: 'sect_ask_master',
    tags: ['sect_daily'],
    weight: 20,
    stageMax: StoryStage.CRISIS,
    req: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice'));
      return !!master && hero.locationId.startsWith('sect_');
    },
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const arts = getSectArts(sectName);
      const randomArt = rand(arts);

      return {
        lines: [
          { text: `你向${master.name}请教武学。`, type: 'action' },
          { text: `“徒儿，${randomArt.desc}，你要牢记在心。”`, type: 'dialogue', speaker: master.name },
          { text: '你认真聆听，感觉对武学的理解更深了一层。', type: 'inner' },
        ],
        addRelation: {
          targetId: master.id,
          type: 'master',
          value: hero.relations.find((r) => r.targetId === master.id)?.value || 50 + 5,
        },
      };
    },
  },

  // 在城中遇到商人
  {
    id: 'city_merchant',
    tags: ['city_daily'],
    weight: 20,
    req: (hero, world) => {
      if (world.locations.find((l: LocationInfo) => l.id === hero.locationId)?.type !== 'city') return false;
      // 检查是否已经有商人，如果有，检查冷却时间
      const merchant = world.npcs.find((n: Person) => n.role === 'merchant' && n.locationId === hero.locationId);
      if (merchant) {
        const merchantRel = hero.relations.find((r) => r.targetId === merchant.id);
        const meetCount = merchantRel ? Math.floor((merchantRel.value || 0) / 10) : 0;
        // 如果刚见过（value < 10），需要冷却
        if (meetCount === 0 && merchantRel && merchantRel.value > 0) return false;
      }
      return true;
    },
    run: (hero, world) => {
      const currentCityId = hero.locationId;
      const merchant = world.npcs.find((n: Person) => n.role === 'merchant' && n.locationId === hero.locationId);
      let newMerchant: Person | undefined;
      if (!merchant) {
        const gender = Math.random() > 0.5 ? 'male' : 'female';
        newMerchant = {
          id: `npc_merchant_${Date.now()}`,
          name: genName(gender),
          sectId: 'none',
          role: 'merchant',
          gender,
          age: 40,
          status: 'alive',
          relations: [],
          locationId: currentCityId,
          inventory: [],
          flags: {},
          arts: [],
          knowledge: [],
        };
      }
      const actualMerchant = merchant || newMerchant;
      if (!actualMerchant) return { lines: [{ text: '无事发生', type: 'narrative' }] };
      const merchantName = actualMerchant.name;
      const merchantRel = hero.relations.find((r) => r.targetId === actualMerchant.id);
      const meetCount = merchantRel ? Math.floor((merchantRel.value || 0) / 10) : 0;
      const isFirstMeet = meetCount === 0;

      // 根据见面次数生成不同剧情
      if (isFirstMeet) {
        // 第一次见面：只是介绍，不送东西
        return {
          lines: [
            { text: `你在集市上遇到了一位${actualMerchant.gender === 'female' ? '女' : ''}商人【${merchantName}】。`, type: 'narrative' },
            { text: `'少侠，我是${merchantName}，在这集市上做点小买卖。'`, type: 'dialogue', speaker: merchantName },
            { text: '\'我这里有些江湖上常用的物品，以后有需要可以来找我。\'', type: 'dialogue', speaker: merchantName },
          ],
          addNpc: newMerchant,
          addRelation: {
            targetId: actualMerchant.id,
            type: 'acquaintance',
            value: 5,
          },
        };
      }

      if (meetCount === 1) {
        // 第二次见面：可以买东西或送小礼物
        const randomItem = rand(MERCHANT_ITEMS);
        return {
          lines: [
            { text: `你在集市上又遇到了【${merchantName}】。`, type: 'narrative' },
            { text: '\'少侠，又见面了！今天我这里进了些新货。\'', type: 'dialogue', speaker: merchantName },
          ],
          choices: [
            {
              text: '看看有什么好东西',
              result: {
                lines: [
                  { text: '你看了看商人的货物，发现了一些有趣的物品。', type: 'action' },
                  { text: `'这个【${randomItem}】不错，送给你了，交个朋友！'`, type: 'dialogue', speaker: merchantName },
                ],
                addItem: randomItem,
                addRelation: {
                  targetId: actualMerchant.id,
                  type: 'acquaintance',
                  value: (merchantRel?.value || 5) + 15,
                },
              },
            },
            {
              text: '礼貌地拒绝',
              result: {
                lines: [{ text: '你礼貌地拒绝了，商人也不强求。', type: 'narrative' }],
                addRelation: {
                  targetId: actualMerchant.id,
                  type: 'acquaintance',
                  value: (merchantRel?.value || 5) + 5,
                },
              },
            },
          ],
        };
      }

      // 第三次及以后：老朋友的感觉
      const randomItem = rand(MERCHANT_ITEMS);
      const dialogues = [
        '\'少侠，又来了！今天想买点什么？\'',
        '\'老朋友，最近江湖上可有什么新鲜事？\'',
        '\'少侠，我这里刚到了一批好货，要不要看看？\'',
        '\'哈哈，又见面了！今天心情不错，给你打个折。\'',
      ];
      const randomDialogue = rand(dialogues);

      return {
        lines: [
          { text: `你在集市上遇到了老朋友【${merchantName}】。`, type: 'narrative' },
          { text: randomDialogue, type: 'dialogue', speaker: merchantName },
        ],
        choices: [
          {
            text: '看看有什么好东西',
            result: {
              lines: [
                { text: '你看了看商人的货物。', type: 'action' },
                { text: `'这个【${randomItem}】送给你了，老朋友了！'`, type: 'dialogue', speaker: merchantName },
              ],
              addItem: randomItem,
              addRelation: {
                targetId: actualMerchant.id,
                type: 'friend',
                value: (merchantRel?.value || 20) + 10,
              },
            },
          },
          {
            text: '闲聊几句',
            result: {
              lines: [
                { text: '你们闲聊了几句江湖上的趣事。', type: 'narrative' },
                { text: '你感觉心情舒畅了不少。', type: 'inner' },
              ],
              addRelation: {
                targetId: actualMerchant.id,
                type: merchantRel?.type === 'friend' ? 'friend' : 'acquaintance',
                value: (merchantRel?.value || 20) + 5,
              },
            },
          },
          {
            text: '告辞离开',
            result: {
              lines: [{ text: '你与商人告别，继续在集市上闲逛。', type: 'narrative' }],
            },
          },
        ],
      };
    },
  },

  // 在野外遇到江湖人士
  {
    id: 'wild_meet_wanderer',
    tags: ['wild_daily'],
    weight: 25,
    req: (hero) => hero.locationId.startsWith('wild_'),
    run: (hero, world) => {
      const gender = Math.random() > 0.5 ? 'male' : 'female';
      const wandererName = genName(gender);
      const newNpc: Person = {
        id: `npc_wanderer_${Date.now()}`,
        name: wandererName,
        sectId: 'none',
        role: 'hero',
        gender,
        age: hero.age + Math.floor(Math.random() * 10) - 5,
        status: 'alive',
        relations: [],
        locationId: hero.locationId,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: [],
        personality: genPersonality(),
        appearance: genAppearance(gender, 'hero'),
        meetCount: 0,
      };

      const scenarios = [
        {
          text: `你在山路上遇到了一位独行的${gender === 'female' ? '女' : '男'}侠【${wandererName}】。`,
          dialogue: '\'少侠也是独行江湖？不如结伴而行？\'',
          relation: 'friend' as RelationType,
          value: 30,
          hasBandits: false,
        },
        {
          text: `你看到一位${gender === 'female' ? '女子' : '男子'}【${wandererName}】正在与山贼对峙。`,
          dialogue: '\'少侠来得正好，助我一臂之力！\'',
          relation: 'friend' as RelationType,
          value: 40,
          hasBandits: true, // 标记有山贼需要战斗
        },
        {
          text: `你与一位路过的${gender === 'female' ? '女' : '男'}侠【${wandererName}】在茶摊相遇。`,
          dialogue: '\'江湖路远，能在此相遇也是缘分。\'',
          relation: 'acquaintance' as RelationType,
          value: 20,
          hasBandits: false,
        },
      ];

      const scenario = rand(scenarios);

      // 如果有山贼，生成山贼NPC
      let banditNpc: Person | undefined;
      let banditName = '';
      if (scenario.hasBandits) {
        const banditGender = Math.random() > 0.7 ? 'female' : 'male'; // 30%概率是女山贼
        banditName = genName(banditGender);
        banditNpc = {
          id: `npc_bandit_${Date.now()}`,
          name: banditName,
          sectId: 'none',
          role: 'bandit',
          gender: banditGender,
          age: 25,
          status: 'alive',
          relations: [],
          locationId: hero.locationId,
          inventory: [],
          flags: {},
          arts: [],
          knowledge: [],
          personality: genPersonality(),
          appearance: genAppearance(banditGender, 'bandit'),
          meetCount: 0,
        };
      }

      // 如果有山贼，提供战斗选项
      if (scenario.hasBandits && banditNpc) {
        // 选择最厉害的武功
        const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
        const sectArts = getSectArts(sectName);
        const learnedSectArts = sectArts.filter((a) => hero.arts.includes(a.name));
        let bestArt: MartialArt;
        if (learnedSectArts.length > 0) {
          const outerArts = learnedSectArts.filter((a) => a.type === 'outer');
          bestArt = outerArts.length > 0 ? outerArts[0] : learnedSectArts[0];
        } else if (hero.arts.length > 0) {
          bestArt = getArtByName(hero.arts[0]);
        } else {
          bestArt = getArtByName('太祖长拳');
        }
        const move = rand(bestArt.moves);

        // 🆕 添加外表描述
        const appearanceDesc = newNpc.meetCount && newNpc.meetCount > 1
          ? describeAppearanceChange(newNpc)
          : describeAppearance(newNpc);

        const lines: StoryLine[] = [
          { text: scenario.text, type: 'narrative' },
        ];
        if (appearanceDesc) {
          lines.push({ text: appearanceDesc, type: 'narrative' });
        }
        lines.push(
          { text: `'此路是我开！'为首的【${banditName}】大声喝道。`, type: 'dialogue', speaker: banditName },
          { text: scenario.dialogue, type: 'dialogue', speaker: wandererName },
        );

        return {
          lines,
          choices: [
            {
              text: `使出【${bestArt.name}】助战`,
              result: {
                lines: [
                  ...generateBattle(hero, banditNpc, bestArt, null, 3),
                  { text: `'多谢少侠相助！'【${wandererName}】感激地说道。`, type: 'dialogue', speaker: wandererName },
                  { text: '\'少侠武功高强，不如我们结伴而行？\'', type: 'dialogue', speaker: wandererName },
                ],
                addNpc: [newNpc, banditNpc],
                addRelation: {
                  targetId: newNpc.id,
                  type: 'friend',
                  value: 50,
                },
                choices: [
                  {
                    text: '同意结伴',
                    result: {
                      lines: [
                        { text: '\'好，那我们就一起走吧。\'你点了点头。', type: 'dialogue', speaker: '你' },
                        { text: `【${wandererName}】露出了笑容，你们一起踏上了旅程。`, type: 'narrative' },
                      ],
                      setCompanion: newNpc.id,
                    },
                  },
                  {
                    text: '婉言拒绝',
                    result: {
                      lines: [
                        { text: '\'抱歉，我还有要事在身。\'你礼貌地拒绝了。', type: 'dialogue', speaker: '你' },
                        { text: `【${wandererName}】虽然有些失望，但还是礼貌地告别了。`, type: 'narrative' },
                      ],
                    },
                  },
                ],
              },
            },
            {
              text: '坐山观虎斗',
              result: {
                lines: [
                  { text: '你选择在一旁观察，看看情况。', type: 'action' },
                  { text: `【${wandererName}】虽然武功不弱，但面对多个山贼，渐渐落入下风。`, type: 'narrative' },
                  { text: `你最终还是出手相助，但【${wandererName}】对你的态度冷淡了许多。`, type: 'narrative' },
                ],
                addNpc: [newNpc, banditNpc],
                addRelation: {
                  targetId: newNpc.id,
                  type: 'acquaintance',
                  value: 20,
                },
              },
            },
          ],
        };
      }

      // 没有山贼的普通场景
      // 🆕 添加外表描述
      const appearanceDesc = newNpc.meetCount && newNpc.meetCount > 1
        ? describeAppearanceChange(newNpc)
        : describeAppearance(newNpc);

      const lines: StoryLine[] = [
        { text: scenario.text, type: 'narrative' },
      ];
      if (appearanceDesc) {
        lines.push({ text: appearanceDesc, type: 'narrative' });
      }
      lines.push({ text: scenario.dialogue, type: 'dialogue', speaker: wandererName });

      return {
        lines,
        choices: [
          {
            text: '同意结伴',
            result: {
              lines: [
                { text: '\'好，那我们就一起走吧。\'你点了点头。', type: 'dialogue', speaker: '你' },
                { text: `【${wandererName}】露出了笑容，你们一起踏上了旅程。`, type: 'narrative' },
              ],
              addNpc: newNpc,
              addRelation: {
                targetId: newNpc.id,
                type: scenario.relation,
                value: scenario.value,
              },
              setCompanion: newNpc.id,
            },
          },
          {
            text: '婉言拒绝',
            result: {
              lines: [
                { text: '\'抱歉，我还有要事在身。\'你礼貌地拒绝了。', type: 'dialogue', speaker: '你' },
                { text: `【${wandererName}】也不强求，你们就此别过。`, type: 'narrative' },
              ],
              addNpc: newNpc,
              addRelation: {
                targetId: newNpc.id,
                type: 'acquaintance',
                value: 10,
              },
            },
          },
        ],
      };
    },
  },

  // 与敌人再次相遇
  {
    id: 'meet_enemy_again',
    tags: ['city_daily', 'wild_daily'],
    weight: 30,
    stageMin: StoryStage.RISING,
    req: (hero) => {
      const hasEnemy = hero.relations.some((r) => r.type === 'enemy');
      return hasEnemy;
    },
    run: (hero, world) => {
      const enemyRel = hero.relations.find((r) => r.type === 'enemy');
      if (!enemyRel) return { lines: [{ text: '无事发生', type: 'narrative' }] };
      const enemy = world.npcs.find((n: Person) => n.id === enemyRel.targetId);
      if (!enemy) return { lines: [{ text: '无事发生', type: 'narrative' }] };

      return {
        lines: [
          { text: `冤家路窄！你竟然又遇到了【${enemy.name}】！`, type: 'action' },
          { text: '\'又是你！上次让你跑了，这次可没那么容易！\'', type: 'dialogue', speaker: enemy.name },
        ],
        choices: [
          {
            text: '拔剑相向',
            result: {
              lines: [
                { text: '你们再次交手，这次你更加谨慎。', type: 'action' },
                { text: '几个回合后，对方见占不到便宜，冷哼一声离开了。', type: 'narrative' },
              ],
              addRelation: {
                targetId: enemy.id,
                type: 'enemy',
                value: enemyRel.value - 10,
              },
            },
          },
          {
            text: '暂时退避',
            result: {
              lines: [{ text: '你选择暂时退避，君子报仇十年不晚。', type: 'narrative' }],
            },
          },
        ],
      };
    },
  },

  // ===================================
  // 🚶 移动中的遭遇
  // ===================================

  // 在路上遇到山贼
  {
    id: 'travel_bandits',
    tags: ['wild_daily'],
    weight: 30,
    req: (hero) => hero.locationId.startsWith('wild_'),
    run: (hero, world) => {
      // 🆕 山贼有名字和性别
      const banditGender = Math.random() > 0.7 ? 'female' : 'male'; // 30%概率是女山贼
      const banditName = genName(banditGender);
      const banditNpc: Person = {
        id: `npc_bandit_${Date.now()}`,
        name: banditName,
        sectId: 'none',
        role: 'bandit',
        gender: banditGender,
        age: 25,
        status: 'alive',
        relations: [],
        locationId: hero.locationId,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: [],
      };

      // 🆕 选择最厉害的武功用于战斗
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const sectArts = getSectArts(sectName);
      const learnedSectArts = sectArts.filter((a) => hero.arts.includes(a.name));
      let bestArt: MartialArt;
      if (learnedSectArts.length > 0) {
        const outerArts = learnedSectArts.filter((a) => a.type === 'outer');
        bestArt = outerArts.length > 0 ? outerArts[0] : learnedSectArts[0];
      } else if (hero.arts.length > 0) {
        bestArt = getArtByName(hero.arts[0]);
      } else {
        bestArt = getArtByName('太祖长拳');
      }
      const move = rand(bestArt.moves);

      return {
        lines: [
          { text: '你正在赶路，突然从树林中跳出几个山贼！', type: 'action' },
          { text: `'此路是我开，此树是我栽！要想从此过，留下买路财！'为首的【${banditName}】大声喝道。`, type: 'dialogue', speaker: banditName },
        ],
        choices: [
          {
            text: `使出【${bestArt.name}】迎战`,
            result: {
              lines: generateBattle(hero, banditNpc, bestArt, null, 3),
              addItem: '银两',
              addNpc: banditNpc,
            },
          },
          {
            text: '智取',
            result: {
              lines: [
                { text: '你灵机一动，假装是某个大门派的弟子。', type: 'action' },
              ],
              choices: [
                {
                  text: '继续',
                  result: (() => {
                    const success = Math.random() > 0.3; // 70%成功率
                    if (success) {
                      return {
                        lines: [
                          { text: '山贼们被你的气势吓到，不敢动手，让你通过了。', type: 'narrative' },
                        ],
                        addNpc: banditNpc,
                      };
                    }
                    // 失败的情况，需要战斗或逃跑
                    return {
                      lines: [
                        { text: `但山贼头目【${banditName}】见多识广，识破了你的伎俩。`, type: 'narrative' },
                        { text: `'敢骗我？找死！'【${banditName}】大怒，拔刀就上。`, type: 'dialogue', speaker: banditName },
                      ],
                      addNpc: banditNpc,
                      choices: [
                        {
                          text: `使出【${bestArt.name}】迎战`,
                          result: {
                            lines: [
                              { text: `你使出【${bestArt.name}】中的"${move}"，与山贼激战。`, type: 'action' },
                              { text: '一番激战后，你击退了山贼，但自己也受了些轻伤。', type: 'narrative' },
                            ],
                            addItem: '银两',
                          },
                        },
                        {
                          text: '逃跑',
                          result: {
                            lines: [
                              { text: '你见势不妙，转身就逃。', type: 'action' },
                              { text: '山贼紧追不舍，你拼尽全力才逃脱。', type: 'narrative' },
                            ],
                          },
                        },
                      ],
                    };
                  })(),
                },
              ],
            },
          },
          {
            text: '给钱消灾',
            result: {
              lines: [
                { text: '你不想节外生枝，给了山贼一些银两。', type: 'action' },
                { text: `'算你识相！'【${banditName}】满意地离开了。`, type: 'dialogue', speaker: banditName },
              ],
              addNpc: banditNpc,
            },
          },
        ],
      };
    },
  },

  // 在路上发现秘籍
  {
    id: 'travel_find_manual',
    tags: ['wild_daily'],
    weight: 15,
    req: (hero) => hero.locationId.startsWith('wild_') && !hero.flags.found_manual,
    run: (hero) => {
      const manualNames = ['无名剑谱', '残破心法', '古旧拳经', '内功要诀'];
      const manualName = rand(manualNames);

      return {
        lines: [
          { text: '你在赶路时，无意中发现了一个隐蔽的山洞。', type: 'narrative' },
          { text: '你好奇地走进去，发现里面有一具枯骨，旁边放着一本秘籍。', type: 'action' },
          { text: `你拿起一看，竟然是【${manualName}】！`, type: 'action' },
        ],
        choices: [
          {
            text: '学习这本秘籍',
            result: {
              lines: [
                { text: '你仔细研读这本秘籍，虽然有些残缺，但仍有不少收获。', type: 'action' },
                { text: '你感觉自己的武功有所提升。', type: 'inner' },
              ],
              addFlag: 'found_manual',
              addArt: manualName,
            },
          },
          {
            text: '收起来以后再看',
            result: {
              lines: [{ text: '你将秘籍收好，准备找个安全的地方再仔细研读。', type: 'action' }],
              addItem: manualName,
              addFlag: 'found_manual',
            },
          },
        ],
      };
    },
  },

  // 在路上遇到前辈高人
  {
    id: 'travel_meet_master',
    tags: ['wild_daily'],
    weight: 10,
    req: (hero) => hero.locationId.startsWith('wild_') && !hero.flags.met_wandering_master,
    run: (hero, world) => {
      const masterName = genName(Math.random() > 0.5 ? 'male' : 'female');
      const newNpc: Person = {
        id: `npc_master_${Date.now()}`,
        name: masterName,
        sectId: 'none',
        role: 'mystery',
        gender: Math.random() > 0.5 ? 'male' : 'female',
        age: 60,
        status: 'alive',
        relations: [],
        locationId: hero.locationId,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: [],
      };

      // 🆕 修复：排除已学会的武功，优先选择门派武功或高级武功
      const allArts: MartialArt[] = [];
      Object.values(SECT_ARTS).forEach((sectArts) => {
        sectArts.forEach((art) => {
          if (!allArts.find((a) => a.name === art.name)) {
            allArts.push(art);
          }
        });
      });
      const unlearnedArts = allArts.filter((a) => !hero.arts.includes(a.name));

      if (unlearnedArts.length === 0) {
        // 如果所有武功都学会了，就不触发这个事件
        return {
          lines: [{ text: '无事发生', type: 'narrative' }],
        };
      }

      // 优先选择门派武功，如果没有则随机
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const sectArts = getSectArts(sectName);
      const unlearnedSectArts = sectArts.filter((a) => !hero.arts.includes(a.name));
      const randomArt = unlearnedSectArts.length > 0
        ? rand(unlearnedSectArts)
        : rand(unlearnedArts);

      return {
        lines: [
          { text: '你在山间小路上遇到一位仙风道骨的老者，正在演练武功。', type: 'narrative' },
          { text: '你被他的招式吸引，忍不住驻足观看。', type: 'action' },
          { text: '老者察觉到你，停下动作，微笑道：\'年轻人，我看你骨骼清奇，是个练武的好苗子。\'', type: 'dialogue', speaker: masterName },
          { text: `'你刚才看的这招【${randomArt.name}】，想学吗？'`, type: 'dialogue', speaker: masterName },
        ],
        choices: [
          {
            text: '恭敬地接受',
            result: {
              lines: [
                { text: '你恭敬地行礼，表示愿意学习。', type: 'action' },
                { text: `老者点了点头，开始详细讲解【${randomArt.name}】的要诀。`, type: 'narrative' },
                { text: `${randomArt.desc}，你听得如痴如醉。`, type: 'inner' },
                { text: '\'好孩子，记住，武功虽重要，但更重要的是武德。\'', type: 'dialogue', speaker: masterName },
                { text: '老者说完，飘然而去，你连他的身影都看不清。', type: 'narrative' },
              ],
              addArt: randomArt.name,
              addNpc: newNpc,
              addRelation: {
                targetId: newNpc.id,
                type: 'master',
                value: 80,
              },
              addFlag: 'met_wandering_master',
            },
          },
          {
            text: '谦虚地推辞',
            result: {
              lines: [
                { text: '你谦虚地表示自己资质不够，不敢接受。', type: 'action' },
                { text: '\'好，好，不骄不躁，是个好苗子。\'老者满意地点点头。', type: 'dialogue', speaker: masterName },
                { text: `'不过，我看你确实有天赋，这本【${randomArt.name}】的秘籍，就留给你吧。'`, type: 'dialogue', speaker: masterName },
                { text: '老者将秘籍放在你面前，然后飘然而去。', type: 'narrative' },
              ],
              addArt: randomArt.name,
              addNpc: newNpc,
              addRelation: {
                targetId: newNpc.id,
                type: 'master',
                value: 90,
              },
              addFlag: 'met_wandering_master',
            },
          },
        ],
      };
    },
  },

  // ===================================
  // 📚 学习/提升武功系列
  // ===================================

  // 在门派中学习新武功
  {
    id: 'sect_learn_new_art',
    tags: ['sect_daily'],
    weight: 25,
    stageMax: StoryStage.CRISIS,
    req: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice'));
      if (!master) return false;
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const arts = getSectArts(sectName);
      const unlearnedArts = arts.filter((a) => !hero.arts.includes(a.name));
      // 🆕 修复：必须有未学会的武功才触发
      return unlearnedArts.length > 0 && hero.locationId.startsWith('sect_');
    },
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const arts = getSectArts(sectName);
      const unlearnedArts = arts.filter((a) => !hero.arts.includes(a.name));

      if (unlearnedArts.length === 0) {
        return {
          lines: [
            { text: `你向${master.name}请求学习新的武功。`, type: 'action' },
            { text: `'徒儿，本门的武功你已经学得差不多了。'${master.name}欣慰地说道。`, type: 'dialogue', speaker: master.name },
            { text: '\'剩下的，就要靠你自己在江湖中历练了。\'', type: 'dialogue', speaker: master.name },
          ],
        };
      }

      const newArt = rand(unlearnedArts);
      const artType = newArt.type === 'inner' ? '内功' : '外功';

      return {
        lines: [
          { text: `你向${master.name}请求学习新的武功。`, type: 'action' },
          { text: `'好！'${master.name}点了点头，'你最近表现不错，今日为师就传你本门${artType}【${newArt.name}】。'`, type: 'dialogue', speaker: master.name },
          { text: `${master.name}开始详细讲解${newArt.desc}的要诀。`, type: 'narrative' },
          { text: '你认真聆听，将每一句话都牢记在心。', type: 'inner' },
          { text: `'记住，${newArt.desc}，你要勤加练习，不可懈怠。'`, type: 'dialogue', speaker: master.name },
          { text: '你深深一拜，表示定不负师恩。', type: 'action' },
        ],
        addArt: newArt.name,
        addRelation: {
          targetId: master.id,
          type: 'master',
          value: (hero.relations.find((r) => r.targetId === master.id)?.value || 50) + 10,
        },
      };
    },
  },

  // 在野外独自修炼
  {
    id: 'wild_solo_training',
    tags: ['wild_daily'],
    weight: 20,
    req: (hero) => hero.locationId.startsWith('wild_') && hero.arts.length > 0,
    run: (hero) => {
      const artName = hero.arts[0];
      const art = getArtByName(artName);
      const move = rand(art.moves);

      return {
        lines: [
          { text: '你在野外找到一处僻静之地，开始独自修炼。', type: 'narrative' },
          { text: `你一遍遍地演练【${art.name}】中的“${move}”。`, type: 'action' },
          { text: '日复一日的苦练，让你对这门武功的理解更加深刻。', type: 'inner' },
        ],
      };
    },
  },

  // 与朋友切磋提升
  {
    id: 'spar_with_friend',
    tags: ['city_daily', 'wild_daily'],
    weight: 20,
    req: (hero) => {
      const friends = hero.relations.filter((r) => r.type === 'friend' && r.value > 30);
      return friends.length > 0;
    },
    run: (hero, world) => {
      const friends = hero.relations.filter((r) => r.type === 'friend' && r.value > 30);
      const friendRel = rand(friends);
      const friend = world.npcs.find((n: Person) => n.id === friendRel.targetId);
      if (!friend) return { lines: [{ text: '无事发生', type: 'narrative' }] };

      const artName = hero.arts.length > 0 ? hero.arts[0] : '太祖长拳';
      const art = getArtByName(artName);
      const move = rand(art.moves);

      return {
        lines: [
          { text: `你与好友【${friend.name}】相约切磋。`, type: 'action' },
          { text: `'看招！'你使出一招'${move}'，${friend.name}也认真应对。`, type: 'action' },
          { text: '你们互相切磋，都有所收获。', type: 'narrative' },
        ],
        addRelation: {
          targetId: friend.id,
          type: 'friend',
          value: friendRel.value + 5,
        },
      };
    },
  },

  // 在城中遇到武馆
  {
    id: 'city_martial_school',
    tags: ['city_daily'],
    weight: 15,
    req: (hero) => hero.locationId.startsWith('city_') && !hero.flags.visited_martial_school,
    run: (hero) => {
      const basicArts = SECT_ARTS.default;
      const unlearnedArts = basicArts.filter((a) => !hero.arts.includes(a.name));

      if (unlearnedArts.length === 0) {
        // 如果基础武功都学会了，就不触发
        return {
          lines: [{ text: '无事发生', type: 'narrative' }],
        };
      }

      const newArt = rand(unlearnedArts);

      return {
        lines: [
          { text: '你在城中发现了一家武馆，里面传来练武的呼喝声。', type: 'narrative' },
          { text: '你好奇地走进去，武馆师傅见你是个练武之人，主动迎了上来。', type: 'action' },
          { text: `'少侠，我看你步履稳健，应该也是练家子。'武馆师傅打量着你，'我这里有一套【${newArt.name}】，虽然不算高深，但胜在实用，要不要学？'`, type: 'dialogue', speaker: '武馆师傅' },
        ],
        choices: [
          {
            text: '学习这套武功',
            result: {
              lines: [
                { text: '你交了学费，在武馆学习了一段时间。', type: 'action' },
                { text: `武馆师傅手把手教你【${newArt.name}】的招式，你学得很认真。`, type: 'narrative' },
                { text: '虽然这套武功不算高深，但你也算是多了一门技艺。', type: 'inner' },
              ],
              addArt: newArt.name,
              addFlag: 'visited_martial_school',
            },
          },
          {
            text: '礼貌地离开',
            result: {
              lines: [{ text: '你礼貌地谢绝了，离开了武馆。', type: 'narrative' }],
            },
          },
        ],
      };
    },
  }
];
