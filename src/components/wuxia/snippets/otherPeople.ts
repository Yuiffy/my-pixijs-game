import { generateBattle } from "../logic/battle";
import { MERCHANT_ITEMS } from "../logic/constants";
import { getArtByName, getSectArts, SECT_ARTS } from "../logic/skills";
import { StorySnippet, StoryStage, Person, Sect, RelationType, MartialArt, StoryLine, LocationInfo } from "../logic/types";
import { rand, genName, genPersonality, genAppearance, describeAppearanceChange, describeAppearance, getBattleOutcomeChoices, getCompanionNamesList } from "../logic/utils";

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
                      addToParty: newNpc.id,
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
  // 🆕 Feature 1: 查看队伍信息 (支持多人队伍)
  {
    id: 'check_party_status',
    tags: ['city_daily', 'wild_daily'],
    weight: 10,
    req: (hero, world) => !!world.party,
    run: (hero, world) => {
      // 获取所有队友信息
      const partyMembers = (world.party || [])
        .map((id: string) => world.npcs.find((n: Person) => n.id === id))
        .filter((n: Person | undefined) => n !== undefined) as Person[];

      // 如果没有队友
      if (partyMembers.length === 0) {
        return {
          lines: [
            { text: '你环顾四周，发现自己形单影只，只有影子与你为伴。', type: 'narrative' }
          ]
        };
      }

      // 生成队友名字列表（带称号）
      const memberNames = partyMembers.map(member => {
        const title = member.role === 'disciple' ? '师弟' :
          member.role === 'hero' ? '前辈' : '少侠';
        return `${member.name}${title}`;
      });

      // 不同的描述方式
      const variations = [
        `你环顾四周，${memberNames.join('、')}正与你并肩而行。`,
        `山风拂面，${memberNames.slice(0, -1).join('、')}${memberNames.length > 1 ? `和${memberNames[memberNames.length - 1]}` : memberNames[0]}的身影在侧，让人心中安定。`,
        `林间小路上，${memberNames.join('、')}与你同行，脚步声在寂静中格外清晰。`,
        `回望来路，${memberNames.join('、')}正不紧不慢地跟随着你。`,
        `阳光透过树叶洒下斑驳光影，${memberNames.join('、')}的身影在光晕中若隐若现。`
      ];

      const selectedText = variations[Math.floor(Math.random() * variations.length)];

      return {
        lines: [
          { text: '你停下脚步，环顾四周。', type: 'action' },
          { text: selectedText, type: 'narrative' }
        ]
      };
    }
  },

  // 🆕 Feature 4: 野外遭遇双人对战 (选择帮谁 + 外貌描述)
  {
    id: 'wild_duel_intervention',
    tags: ['wild_daily'],
    weight: 40,
    req: (hero) => hero.locationId.startsWith('wild_'),
    run: (hero, world) => {
    // 生成两名NPC
      const gender1 = Math.random() > 0.5 ? 'male' : 'female';
      const npc1: Person = {
        id: `npc_duel_1_${Date.now()}`,
        name: genName(gender1),
        sectId: 'none',
        role: 'hero',
        gender: gender1,
        age: 25,
        status: 'alive',
        relations: [],
        locationId: hero.locationId,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: [],
        appearance: genAppearance(gender1, 'hero')
      };
      const gender2 = Math.random() > 0.5 ? 'male' : 'female';
      const npc2: Person = {
        id: `npc_duel_2_${Date.now()}`,
        name: genName(gender2),
        sectId: 'none',
        role: 'bandit',
        gender: gender2,
        age: 30,
        status: 'alive',
        relations: [],
        locationId: hero.locationId,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: [],
        appearance: genAppearance(gender2, 'bandit')
      };

      const desc1 = describeAppearance(npc1);
      const desc2 = describeAppearance(npc2);

      return {
        lines: [
          { text: '前方传来兵刃相交之声，你悄悄靠近查看。', type: 'action' },
          { text: '只见两人正在激烈缠斗。', type: 'narrative' },
          { text: `左边一人，${desc1}。`, type: 'narrative' }, // 先描述外貌
          { text: `右边一人，${desc2}。`, type: 'narrative' },
          { text: '两人似乎都已挂彩，战况焦灼。', type: 'narrative' }
        ],
        choices: [
          {
            text: `帮助【${npc1.name}】`,
            result: {
              lines: [
                { text: `你大喝一声，拔剑助阵【${npc1.name}】！`, type: 'action' },
                // 战斗逻辑：你打 npc2
                ...generateBattle(hero, npc2, getArtByName(hero.arts[0] || '太祖长拳'), null, { rounds: 3, canChooseOutcome: true }, world)
              ],
              addNpc: [npc1, npc2],
              // 如果战斗胜利，提供战后选择 (Feature 3)
              // 注意：这里简化处理，假设帮忙就会导致胜利并进入处置阶段
              choices: getBattleOutcomeChoices(npc2, hero, world, -20)
            }
          },
          {
            text: `帮助【${npc2.name}】`,
            result: {
              lines: [
                { text: `你居然选择了帮助那个看着像恶人的【${npc2.name}】！`, type: 'action' },
                ...generateBattle(hero, npc1, getArtByName(hero.arts[0] || '太祖长拳'), null, { rounds: 3, canChooseOutcome: true }, world)
              ],
              addNpc: [npc1, npc2],
              choices: getBattleOutcomeChoices(npc1, hero, world, -20)
            }
          },
          {
            text: '静观其变',
            result: {
              lines: [{ text: '你决定不插手江湖恩怨，悄然离去。', type: 'narrative' }]
            }
          }
        ]
      };
    }
  },

  // 🆕 修改：在路上遇到山贼 (集成 Feature 3: 打败后选择)
  {
    id: 'travel_bandits_advanced',
    tags: ['wild_daily'],
    weight: 35,
    req: (hero) => hero.locationId.startsWith('wild_'),
    run: (hero, world) => {
      // 随机生成山贼性别和名字
      const banditGender = Math.random() > 0.7 ? 'female' : 'male';
      const banditName = genName(banditGender);

      // 随机选择门派（包括无门派）
      const sects = ['none', 'wudang', 'shaolin', 'emei', 'kunlun', 'huashan', 'gaibang', 'mingjiao'];
      const sectId = rand(sects);

      // 随机武器
      const weapons = ['单刀', '双刀', '长剑', '短剑', '长枪', '长棍', '双钩', '软鞭', '判官笔', '铁扇'];
      const weapon = rand(weapons);

      // 随机外貌特征
      const appearances = [
        '脸上有一道狰狞的刀疤',
        '眼神阴鸷',
        '满脸横肉',
        '身形魁梧',
        '目光如炬',
        '面带煞气',
        '身形瘦削',
        '步履轻盈'
      ];
      const appearance = rand(appearances);

      // 随机出场方式
      const entrances = [
        `路旁树影中缓缓走出一人，${appearance}，手中${weapon}寒光闪闪`,
        `前方山石后转出一人，${appearance}，${weapon}横在胸前`,
        `头顶树梢一阵轻响，一人飘然落下，${appearance}，${weapon}直指你面门`,
        `道旁草丛中突然窜出一人，${appearance}，${weapon}在阳光下泛着冷光`
      ];

      // 随机台词
      const dialogues = [
        `"此路是我开，此树是我栽，要想从此过，留下买路财！"`,
        `"看你这身打扮，定是富家子弟，把值钱的东西都交出来！"`,
        `"哼，今日遇到我${banditName}，算你倒霉！"`,
        `"识相的把钱财留下，否则休怪${banditGender === 'male' ? '大爷' : '姑奶奶'}不客气！"`,
        `"嘿嘿，好久没开张了，今天总算等到只肥羊！"`
      ];

      // 根据门派调整描述
      let sectInfo = '';
      if (sectId !== 'none') {
        const sectNames: Record<string, string> = {
          wudang: '武当',
          shaolin: '少林',
          emei: '峨眉',
          kunlun: '昆仑',
          huashan: '华山',
          gaibang: '丐帮',
          mingjiao: '明教'
        };
        sectInfo = `，看其招数似是${sectNames[sectId]}派的路数`;
      }

      const banditNpc: Person = {
        id: `npc_bandit_${Date.now()}`,
        name: banditName,
        sectId,
        role: 'bandit',
        gender: banditGender,
        age: 25 + Math.floor(Math.random() * 20), // 25-45岁
        status: 'alive',
        relations: [],
        locationId: hero.locationId,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: [],
        appearance: genAppearance(banditGender, 'bandit')
      };

      const bestArt = hero.arts.length > 0 ? getArtByName(hero.arts[0]) : getArtByName('太祖长拳');
      const battleLines = generateBattle(hero, banditNpc, bestArt, null, { rounds: 5, canChooseOutcome: true }, world);
      const isVictory = !battleLines.some(l => l.text.includes('昏死过去') || l.text.includes('逃离'));

      return {
        lines: [
          { text: `${rand(entrances)}。`, type: 'action' },
          { text: `【${banditName}】: ${rand(dialogues)}`, type: 'dialogue', speaker: banditName },
          { text: `对方手持${weapon}，${appearance}${sectInfo}。`, type: 'narrative' },
        ],
        choices: [
          {
            text: '动手！',
            result: {
              lines: battleLines,
              addNpc: banditNpc,
              // 只有胜利了才显示处置选项
              choices: isVictory ? getBattleOutcomeChoices(banditNpc, hero, world) : []
            }
          },
          {
            text: '破财消灾',
            result: {
              lines: [{ text: '你丢下一些银两，趁对方捡钱时离开了。', type: 'action' }],
              removeItem: '银两'
            }
          }
        ]
      };
    }
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
