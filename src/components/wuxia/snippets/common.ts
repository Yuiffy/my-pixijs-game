import { SECT_ARTS, getSectArts, getArtByName } from "../logic/skills";
import { MartialArt, Person, StoryChoice, StoryLine, StorySnippet, StoryStage, LocationInfo } from "../logic/types";
import { rand, genName } from "../logic/utils";

// 同行事件：露营
export const generateCompanionCampEvent = (companion: Person): StoryLine[] => {
  const personalityDialogue = {
    gentle: '\'今晚月色真美，不如我们在此休息一晚？\'',
    bold: '\'天色已晚，我们就在这里扎营吧！\'',
    cunning: '\'前面可能有危险，不如先在这里休息。\'',
    righteous: '\'行侠仗义也要注意休息，我们在此过夜吧。\'',
    mysterious: '\'...（默默开始准备露营）',
    playful: '\'好累啊！我们在这里休息吧，我带了干粮！\'',
    serious: '\'按照计划，我们应该在这里休息。\'',
    passionate: '\'今晚我们一起看星星吧！\'',
  } as const;

  // 根据性格生成不同的互动
  const personalityInteractions = {
    gentle: [
      `【${companion.name}】轻轻整理着篝火，火光映照在脸上，显得格外柔和。`,
      `【${companion.name}】从行囊中取出一包茶叶，\'这是我从家乡带来的，要尝尝吗？\'`
    ],
    bold: [
      `【${companion.name}】三下五除二就搭好了帐篷，\'这种粗活交给我就行！\'`,
      `【${companion.name}】警惕地环顾四周，\'你休息吧，我来守夜。\'`
    ],
    cunning: [
      `【${companion.name}】若有所思地看着火堆，\'这附近似乎有些不对劲，我们得小心。\'`,
      `【${companion.name}】从怀中掏出一张地图，\'明天我们可以走这条路...\'`
    ],
    righteous: [
      `【${companion.name}】正襟危坐，\'江湖险恶，我们应当互相照应。\'`,
      `【${companion.name}】将干粮分给你，\'你多吃点，明天还要赶路。\'`
    ],
    mysterious: [
      `【${companion.name}】坐在火堆旁，目光深邃地望着远方，不知在想些什么。`,
      `【${companion.name}】从怀中取出一支竹笛，吹奏起悠扬的曲调。`
    ],
    playful: [
      `【${companion.name}】兴奋地翻着行囊，\'看！我带了肉干和酒！\'`,
      `【${companion.name}】突然从背后拍你一下，\'吓到了吧？哈哈哈！\'`
    ],
    serious: [
      `【${companion.name}】仔细检查着装备，\'明天的路不好走，得做好准备。\'`,
      `【${companion.name}】认真地擦拭着武器，神情专注。`
    ],
    passionate: [
      `【${companion.name}】兴奋地指着星空，\'看，那是北斗七星！\'`,
      `【${companion.name}】突然握住你的手，\'能和你一起闯荡江湖，真好。\'`
    ]
  };

  const defaultDialogue = '\'我们在这里休息一晚吧。\'';
  const dialogue = companion.personality && personalityDialogue[companion.personality as keyof typeof personalityDialogue]
    ? personalityDialogue[companion.personality as keyof typeof personalityDialogue]
    : defaultDialogue;

  // 随机选择互动内容
  const interactions = personalityInteractions[companion.personality as keyof typeof personalityInteractions] ||
    ['你们一起生火做饭，围坐在篝火旁聊天。'];
  const randomInteraction = interactions[Math.floor(Math.random() * interactions.length)];

  return [
    { text: `天色渐晚，【${companion.name}】提议在此露营。`, type: 'narrative' as const },
    { text: dialogue, type: 'dialogue' as const, speaker: companion.name },
    { text: randomInteraction, type: 'action' as const },
    { text: '夜晚的江湖，在篝火的映照下显得格外宁静。', type: 'inner' as const },
  ];
};

// 同行事件：吃饭
export const generateCompanionMealEvent = (companion: Person): StoryLine[] => {
  // 根据性格生成不同的对话
  const personalityDialogue = {
    gentle: '\'少侠，走了这么久，不如我们找个地方用膳？\'',
    bold: '\'走，我请客！听说前面有家酒楼不错！\'',
    cunning: '\'我知道一家小店，虽然不起眼，但味道极佳。\'',
    righteous: '\'行侠仗义也要填饱肚子，我们去吃饭吧。\'',
    mysterious: '\'...（指向一家不起眼的小店）这里。\'',
    playful: '\'我肚子都饿扁啦！我们去吃好吃的吧！\'',
    serious: '\'已到用膳时分，我们去前面的酒楼。\'',
    passionate: '\'啊！我知道一家店的招牌菜特别好吃！你一定要尝尝！\'',
  } as const;

  // 根据性格生成不同的互动
  const personalityInteractions = {
    gentle: [
      `【${companion.name}】细心地为你布菜，\'这个不错，你尝尝看。\'`,
      `【${companion.name}】为你倒了一杯茶，\'这是上好的龙井，可以解腻。\'`
    ],
    bold: [
      `【${companion.name}】豪迈地拍桌，\'小二，把你们这的招牌菜都上一份！\'`,
      `【${companion.name}】举起酒杯，\'来，干了这杯！\'`
    ],
    cunning: [
      `【${companion.name}】环顾四周，压低声音说：\'这家的老板不简单，据说...\'`,
      `【${companion.name}】从怀中掏出一个小包，\'我带了点特制的调料，尝尝看。\'`
    ],
    righteous: [
      `【${companion.name}】看到店外有乞丐，吩咐小二：\'给那位老人家也送一份饭菜。\'`,
      `【${companion.name}】正色道：\'江湖儿女，当以义气为重。\'`
    ],
    mysterious: [
      `【${companion.name}】默默地吃着饭，眼神却时刻注意着周围。`,
      `【${companion.name}】突然停下筷子，\'有人跟踪我们。\'`
    ],
    playful: [
      `【${companion.name}】夹起一块肉，\'啊——张嘴！\'`,
      `【${companion.name}】调皮地抢走你碗里的菜，\'这个归我啦！\'`
    ],
    serious: [
      `【${companion.name}】仔细地品尝每道菜，\'火候刚好，刀工也不错。\'`,
      `【${companion.name}】放下筷子，\'吃完这顿，我们该继续赶路了。\'`
    ],
    passionate: [
      `【${companion.name}】兴奋地介绍，\'这道菜要这样吃才最美味！\'`,
      `【${companion.name}】眼中闪着光，\'能和你一起吃饭，真开心！\'`
    ]
  };

  const defaultDialogue = '\'我们去吃饭吧。\'';
  const dialogue = companion.personality && personalityDialogue[companion.personality as keyof typeof personalityDialogue]
    ? personalityDialogue[companion.personality as keyof typeof personalityDialogue]
    : defaultDialogue;

  // 随机选择互动内容
  const interactions = personalityInteractions[companion.personality as keyof typeof personalityInteractions] ||
    ['你们一边吃饭，一边聊着江湖见闻。'];
  const randomInteraction = interactions[Math.floor(Math.random() * interactions.length)];

  // 随机选择餐馆类型
  const restaurantTypes = [
    '路边小摊', '江湖酒馆', '茶楼', '农家小院', '河边凉亭', '城隍庙前'
  ];
  const restaurant = restaurantTypes[Math.floor(Math.random() * restaurantTypes.length)];

  return [
    { text: `【${companion.name}】提议去吃饭。`, type: 'narrative' as const },
    { text: dialogue, type: 'dialogue' as const, speaker: companion.name },
    { text: `你们在${restaurant}找了个位置坐下。`, type: 'action' as const },
    { text: generateGroupInteraction([companion], randomInteraction), type: 'action' as const },
    { text: '饭菜的香气和同伴的陪伴，让这顿饭格外美味。', type: 'inner' as const },
  ];
};

// 生成队伍描述
export const getPartyDescription = (companions: Person[]): string => {
  if (companions.length === 0) return '';

  const companionNames = companions.map(c => `【${c.name}】`);

  if (companionNames.length === 1) {
    return `你和${companionNames[0]}`;
  } if (companionNames.length === 2) {
    return `你们三人（${companionNames.join('、')}）`;
  }
  return `你们一行人（${companionNames.slice(0, -1).join('、')}和${companionNames[companionNames.length - 1]}）`;

};

// 生成队伍活动描述
export const generateGroupActivity = (companions: Person[], activity: string): string => {
  const groupDesc = getPartyDescription(companions);
  if (!groupDesc) return activity;

  const activities = [
    `${groupDesc}结伴${activity}`,
    `${groupDesc}一起${activity}`,
    `${groupDesc}结伴同行，${activity}`,
    `${groupDesc}结伴而行，${activity}`,
    `${groupDesc}结伴${activity}，有说有笑`,
    `${groupDesc}结伴${activity}，其乐融融`,
    `${groupDesc}结伴${activity}，一路畅谈`,
    `${groupDesc}结伴${activity}，互相照应`,
    `${groupDesc}结伴${activity}，热闹非常`,
    `${groupDesc}结伴${activity}，欢声笑语`
  ];

  return activities[Math.floor(Math.random() * activities.length)];
};

// 生成队伍互动描述
export const generateGroupInteraction = (companions: Person[], interaction: string): string => {
  if (companions.length === 0) return interaction;

  const companion = companions[Math.floor(Math.random() * companions.length)];
  const others = companions.filter(c => c !== companion);
  const othersDesc = others.length > 0 ? `，${others.map(c => c.name).join('、')}也` : '';

  const interactions = [
    `【${companion.name}】${interaction}${othersDesc}加入其中`,
    `【${companion.name}】${interaction}，其他人${others.length > 1 ? '纷纷' : ''}响应`,
    `【${companion.name}】${interaction}，大家${others.length > 1 ? '都' : ''}表示赞同`,
    `【${companion.name}】${interaction}，众人${others.length > 1 ? '齐声' : ''}应和`,
    `【${companion.name}】${interaction}，${others.length > 1 ? '大家' : ''}相视一笑`
  ];

  return interactions[Math.floor(Math.random() * interactions.length)];
};

// 生成队伍旅行事件
export const generateGroupTravelEvent = (companions: Person[]): StoryLine[] => {
  if (companions.length === 0) return [];

  const travelActivities = [
    '欣赏沿途风景',
    '讨论武学心得',
    '分享江湖见闻',
    '切磋武艺',
    '寻找休息之处',
    '采集草药',
    '打猎野味',
    '寻找水源',
    '避开危险地带',
    '规划路线'
  ];

  const activity = travelActivities[Math.floor(Math.random() * travelActivities.length)];

  const lines: StoryLine[] = [
    {
      text: generateGroupActivity(companions, `继续前行，${activity}。`),
      type: 'narrative' as const
    }
  ];

  // 随机添加同伴互动
  if (Math.random() > 0.5) {
    const companion = companions[Math.floor(Math.random() * companions.length)];
    const interactions = [
      `【${companion.name}】主动走在前面探路`,
      `【${companion.name}】分享了一些干粮给大家`,
      `【${companion.name}】讲起了一个有趣的江湖故事`,
      `【${companion.name}】提醒大家注意安全`,
      `【${companion.name}】哼起了小曲`
    ];

    lines.push({
      text: interactions[Math.floor(Math.random() * interactions.length)],
      type: 'action' as const
    });
  }

  return lines;
};

// 同行事件：暧昧对话（好感度高）
export const generateCompanionRomanticEvent = (
  companion: Person,
  relationValue: number,
): StoryLine[] => {
  // 根据好感度分级
  const relationshipLevel = relationValue < 60 ? 'acquaintance' :
    relationValue < 80 ? 'friend' :
      relationValue < 90 ? 'close' : 'intimate';

  if (relationshipLevel === 'acquaintance') return [];

  const genderText = companion.gender === 'female' ? '她' : '他';
  const selfText = genderText === '她' ? '我' : '我';

  // 不同关系等级的基础对话
  const baseDialogue: Record<Personality, Record<string, string>> = {
    gentle: {
      friend: `'少侠，能与你同行，真是${selfText}的荣幸。'`,
      close: `'少侠，${selfText}...其实一直想和你说...'`,
      intimate: `'少侠，${selfText}...${selfText}心悦于你。'`
    },
    bold: {
      friend: `'少侠，咱们真是投缘！'`,
      close: `'喂，少侠，${selfText}觉得你这个人挺不错的！'`,
      intimate: `'少侠！${selfText}喜欢你！就这么简单！'`
    },
    cunning: {
      friend: `'少侠，你知道吗？${selfText}发现你比看起来要有趣得多。'`,
      close: `'少侠，${selfText}观察你很久了...你比那些凡夫俗子强多了。'`,
      intimate: `'少侠，${selfText}这一生从未对任何人动心...直到遇见你。'`
    },
    righteous: {
      friend: `'少侠，江湖路远，能与你这样的侠义之士同行，是${selfText}的福分。'`,
      close: `'少侠，${selfText}觉得，能与你一起行侠仗义，是${selfText}的荣幸。'`,
      intimate: `'少侠，${selfText}愿与你携手江湖，共度余生。'`
    },
    mysterious: {
      friend: `'...（${genderText}若有所思地看着你）'`,
      close: `'少侠...（${genderText}欲言又止）'`,
      intimate: `'...（${genderText}轻轻握住你的手）'`
    },
    playful: {
      friend: `'嘻嘻，少侠，你猜${selfText}现在在想什么？'`,
      close: `'少侠～${selfText}觉得你好像比昨天更帅/漂亮了呢！'`,
      intimate: `'少侠！${selfText}...${selfText}喜欢你！最喜欢了！'`
    },
    serious: {
      friend: `'少侠，${selfText}很欣赏你的为人。'`,
      close: `'少侠，有些话，${selfText}觉得应该告诉你...'`,
      intimate: `'少侠，${selfText}此生非君不嫁/不娶。'`
    },
    passionate: {
      friend: `'少侠！和${selfText}一起闯荡江湖吧！'`,
      close: `'少侠！${selfText}...${selfText}好像...'`,
      intimate: `'少侠！${selfText}爱你！从第一眼见到你就爱上你了！'`
    }
  };

  // 根据关系等级和性格选择对话
  const dialogue = companion.personality
    ? baseDialogue[companion.personality][relationshipLevel]
    : `'少侠，${selfText}...'`;

  // 互动描述
  const interactions = {
    gentle: [
      `${genderText}的脸颊微微泛红，目光温柔。`,
      `${genderText}轻轻整理了一下衣角，显得有些紧张。`
    ],
    bold: [
      `${genderText}爽朗地笑着，用力拍了拍你的肩膀。`,
      `${genderText}目光灼灼地看着你，毫不掩饰自己的感情。`
    ],
    cunning: [
      `${genderText}的眼中闪过一丝狡黠，嘴角微微上扬。`,
      `${genderText}靠近你，压低声音说道。`
    ],
    righteous: [
      `${genderText}正色看着你，神情庄重。`,
      `${genderText}站得笔直，仿佛在宣布一件重要的事情。`
    ],
    mysterious: [
      `${genderText}沉默不语，只是用深邃的目光看着你。`,
      `月光下，${genderText}的侧脸显得格外迷人。`
    ],
    playful: [
      `${genderText}调皮地眨了眨眼，脸上带着狡黠的笑容。`,
      `${genderText}突然凑近你，又迅速退开，咯咯地笑了起来。`
    ],
    serious: [
      `${genderText}的表情异常认真，仿佛在思考什么重要的事情。`,
      `${genderText}深吸一口气，似乎下定了决心。`
    ],
    passionate: [
      `${genderText}的眼中闪烁着炽热的光芒。`,
      `${genderText}激动地握住你的手，心跳声清晰可闻。`
    ]
  };

  const interaction = companion.personality
    ? interactions[companion.personality][Math.floor(Math.random() * 2)]
    : `${genderText}似乎想对你说些什么。`;

  // 根据关系等级决定剧情深度
  if (relationshipLevel === 'friend') {
    return [
      { text: `【${companion.name}】似乎对你很有好感。`, type: 'narrative' as const },
      { text: dialogue, type: 'dialogue' as const, speaker: companion.name },
      { text: interaction, type: 'action' as const },
    ];
  } if (relationshipLevel === 'close') {
    return [
      { text: `【${companion.name}】看着你的眼神中带着一丝特别的情感。`, type: 'narrative' as const },
      { text: dialogue, type: 'dialogue' as const, speaker: companion.name },
      { text: interaction, type: 'action' as const },
      { text: `你感觉自己的心跳似乎漏了一拍。`, type: 'inner' as const },
    ];
  }
  // intimate
  return [
    { text: `【${companion.name}】深情地注视着你，眼中满是柔情。`, type: 'narrative' as const },
    { text: dialogue, type: 'dialogue' as const, speaker: companion.name },
    { text: interaction, type: 'action' as const },
    { text: `${genderText}的呼吸变得有些急促，${genderText}的脸颊染上了一抹红晕。`, type: 'action' as const },
    { text: `你感到一阵悸动，仿佛整个世界都只剩下了你们两人。`, type: 'inner' as const },
  ];

};
export const commonSnippets: StorySnippet[] = [
  {
    id: 'idle_action_menu',
    tags: ['sect_daily', 'city_daily', 'wild_daily'],
    weight: 100, // 🆕 提高权重，确保总是能选择移动
    run: (hero, world) => {
      const choices: StoryChoice[] = [];
      const lastAction = hero.flags.lastAction || 'explore';
      const actionCount = (hero.flags.actionCount || 0) + 1;
      const shouldOfferTraining = actionCount % 3 === 0; // 每3次行动提供一次修炼选项

      // 根据地点和上次行动决定当前行动
      if (hero.locationId.startsWith('city_')) {
        // --- 城市选项 ---
        const cityActivities = [
          {
            text: '去茶馆坐坐',
            desc: '茶馆是打听消息的好地方，江湖人士常在此聚集。',
            result: {
              lines: [
                { text: '你走进一家热闹的茶馆，找了个靠窗的位置坐下。', type: 'action' as const },
                { text: '店小二热情地迎上来：“客官，来点什么茶？”', type: 'dialogue' as const, speaker: '店小二' }
              ],
              addTurn: 1,
              addFlags: { lastAction_tavern: true },
              addKnowledge: `city_${hero.locationId}_tavern_visited`,
            }
          },
          {
            text: '逛集市',
            desc: '集市上人来人往，或许能遇到有趣的事。',
            result: {
              lines: [
                { text: '你在集市上闲逛，叫卖声此起彼伏。', type: 'action' as const },
                { text: '各种小摊贩在兜售着各式各样的物品。', type: 'narrative' as const },
              ],
              addTurn: 1,
              addFlags: { lastAction_market: true },
            }
          }
        ];

        // 添加城市活动选项
        cityActivities.forEach(activity => {
          choices.push({
            text: activity.text,
            desc: activity.desc,
            result: {
              ...activity.result,
              addFlags: {
                [activity.text.replace('去', '').trim()]: true,
                actionCount
              }
            }
          });
        });

      } else if (hero.locationId.startsWith('wild_')) {
        // --- 野外选项 ---
        const exploreTexts = [
          '你沿着山间小径前行，欣赏着周围的风景。',
          '你小心翼翼地穿过一片密林，注意着周围的动静。',
          '你登上一处高地，眺望远方的山峦。',
          '你发现一条清澈的小溪，决定沿着溪流行走。',
        ];

        // 探索选项
        choices.push({
          text: '继续探索',
          desc: '在野外继续寻找机缘。',
          result: {
            lines: [
              { text: rand(exploreTexts), type: 'narrative' },
            ],
            addTurn: 1,
            addFlags: {
              lastAction: 'explore',
              actionCount,
              consecutiveExplores: (hero.flags.consecutiveExplores || 0) + 1
            }
          },
        });

        // 每3次行动提供一次修炼选项
        if (shouldOfferTraining) {
          choices.push({
            text: '找地方静修',
            desc: '在野外寻找一个安静的地方修炼内功。',
            result: {
              lines: [
                { text: '你找到一处僻静的山洞，开始打坐调息。', type: 'action' as const },
                { text: '时间在静修中悄然流逝...', type: 'time-pass' as const },
              ],
              addTurn: 2,
              addFlags: {
                lastAction: 'meditate',
                actionCount: 0, // 重置行动计数
                consecutiveExplores: 0
              },
              // 修炼效果
              addExp: 5,
              addMaxHp: Math.floor(Math.random() * 3) + 1
            },
          });
        }

      } else if (hero.locationId.startsWith('sect_')) {
        // --- 门派选项 ---
        const sectActivities = [
          {
            text: '与同门切磋',
            desc: '找师兄弟切磋武艺，提升实战经验。',
            result: {
              lines: [
                { text: '你找到一位同门师兄，请他指点几招。', type: 'action' as const },
                { text: '经过一番切磋，你觉得自己的武功又精进了些。', type: 'narrative' as const },
              ],
              addTurn: 1,
              addExp: 3,
              addFlags: { lastAction_sparring: true },
            }
          },
          {
            text: '研读武学典籍',
            desc: '在藏经阁中研读武学典籍，提升武学造诣。',
            result: {
              lines: [
                { text: '你在藏经阁中找到一本武学秘籍，开始仔细研读。', type: 'action' as const },
                { text: '书中的武学精要让你茅塞顿开。', type: 'narrative' as const },
              ],
              addTurn: 1,
              addExp: 4,
              addFlags: { lastAction_study: true },
            }
          }
        ];

        // 添加门派活动选项
        sectActivities.forEach(activity => {
          choices.push({
            text: activity.text,
            desc: activity.desc,
            result: {
              ...activity.result,
              addFlags: {
                lastAction: activity.text,
                actionCount
              }
            }
          });
        });

        // 每3次行动提供一次闭关选项
        if (shouldOfferTraining) {
          choices.push({
            text: '闭关修炼',
            desc: '闭关修炼内功心法，大幅提升修为。',
            result: {
              lines: [
                { text: '你向师父禀明要闭关修炼的打算。', type: 'action' as const },
                { text: '师父点点头：“去吧，记住，习武之人，心要静。”', type: 'dialogue' as const, speaker: '师父' },
                { text: '你在静室中潜心修炼，物我两忘...', type: 'time-pass' as const },
              ],
              addTurn: 3,
              addExp: 10,
              addMaxHp: 5,
              addFlags: {
                lastAction: 'seclusion',
                actionCount: 0, // 重置行动计数
                lastSeclusion: world.turn
              }
            },
          });
        }
      }

      // --- 通用移动选项 ---
      if (hero.locationId.startsWith('sect_')) {
        const city = world.locations.find((l: LocationInfo) => l.type === 'city');
        if (city) {
          choices.push({
            text: `下山前往【${city.name}】`,
            result: {
              lines: [{ text: '静极思动，你决定下山看看。', type: 'action' }],
              newLocationId: city.id,
              addTurn: 1,
            },
          });
        }
      }

      if (hero.locationId.startsWith('city_')) {
        const wild = world.locations.find((l: LocationInfo) => l.type === 'wild');
        if (wild) {
          choices.push({
            text: `前往【${wild.name}】探险`,
            result: {
              lines: [{ text: '听说野外有不少机缘，你决定去碰碰运气。', type: 'action' }],
              newLocationId: wild.id,
              addTurn: 2,
            },
          });
        }
        const sect = world.locations.find((l: LocationInfo) => l.type === 'sect');
        if (sect) {
          choices.push({
            text: '返回师门',
            result: {
              lines: [{ text: '外面的世界虽然精彩，但师门才是家。', type: 'action' }],
              newLocationId: sect.id,
              addTurn: 2,
            },
          });
        }
      }

      if (hero.locationId.startsWith('wild_')) {
        const city = world.locations.find((l: LocationInfo) => l.type === 'city');
        if (city) {
          choices.push({
            text: `返回【${city.name}】`,
            result: {
              lines: [{ text: '野外虽然有机缘，但也危险重重。你决定先回城中。', type: 'action' }],
              newLocationId: city.id,
              addTurn: 2,
            },
          });
        }
        const sect = world.locations.find((l: LocationInfo) => l.type === 'sect');
        if (sect) {
          choices.push({
            text: '返回师门',
            result: {
              lines: [{ text: '外面的世界虽然精彩，但师门才是家。', type: 'action' }],
              newLocationId: sect.id,
              addTurn: 3,
            },
          });
        }
      }

      return {
        lines: [{ text: '一时无事，你决定做点什么：', type: 'narrative' }],
        choices,
      };
    },
  },

  // ===================================
  // 🕵️‍♀️ 情报触发事件 (Rumor Events)
  // ===================================
  // 2. 传闻：隐世高手
  {
    id: 'event_rumor_master',
    tags: ['wild_daily'],
    weight: 200,
    req: (hero) => hero.knowledge.includes('rumor_hidden_master') && hero.locationId.startsWith('wild_') && !hero.flags.met_hidden_master,
    run: (hero, world) => {
      const art = rand(SECT_ARTS.default); // 随机给个基础武功
      return {
        lines: [
          { text: '你在野外苦苦搜寻传闻中的高人踪迹。', type: 'action' },
          { text: '忽然一阵琴声传来，你循声而去，见一位老者正在抚琴。', type: 'narrative' },
          { text: '“既然来了，何不现身一见？”老者头也不回地说道。', type: 'dialogue', speaker: '神秘老者' },
          { text: '你上前行礼，老者见你态度诚恳，便指点了你几句。', type: 'narrative' },
        ],
        choices: [
          {
            text: '虚心请教',
            result: {
              lines: [
                { text: `你获益良多，对【${art.name}】有了新的领悟。`, type: 'inner' },
                { text: '再抬头时，老者已不知去向。', type: 'narrative' },
              ],
              addArt: art.name,
              addFlags: { met_hidden_master: true },
            },
          },
        ],
      };
    },
  },

  // ... (保留之前的其他 SNIPPETS) ...
  // ===================================
  // Phase 0: 初出茅庐
  // ===================================
  {
    id: 'intro_quest_start',
    tags: ['sect_daily'],
    weight: 500,
    stageMax: StoryStage.BEGINNING,
    req: (hero, world, turn) => turn >= 1 && !hero.flags.quest_letter_done && !hero.inventory.includes('密信') && !hero.inventory.includes('回信'),
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      const city = world.locations.find((l: LocationInfo) => l.type === 'city') || { name: '附近城市' };
      return {
        lines: [
          { text: '忽然有小童来报，掌门唤你去大殿一叙。', type: 'time-pass' },
          { text: `“徒儿，如今江湖动荡，为师有一件要事。”${master.name}神色凝重。`, type: 'dialogue', speaker: master.name },
          { text: `“我要你去【${city.name}】，送一封密信给当地的大侠。”`, type: 'dialogue', speaker: master.name },
        ],
        choices: [
          {
            text: '弟子领命！',
            result: {
              lines: [{ text: '你接过密信，即刻启程。', type: 'action' }],
              addItem: '密信',
              newLocationId: city.id,
            },
          },
        ],
      };
    },
  },

  {
    id: 'intro_quest_deliver',
    tags: ['city_daily'],
    weight: 200,
    stageMax: StoryStage.RISING,
    req: (hero, world) => hero.inventory.includes('密信') && world.locations.find((l: LocationInfo) => l.id === hero.locationId)?.type === 'city',
    run: (hero, world) => {
      let targetNpc = world.npcs.find((n: Person) => n.locationId === hero.locationId && n.role === 'hero');
      let isNewNpc = false;
      if (!targetNpc) {
        isNewNpc = true;
        const gender = Math.random() > 0.5 ? 'male' : 'female';
        targetNpc = {
          id: `npc_hero_${Date.now()}`, name: genName(gender), sectId: 'none', role: 'hero', gender, age: 30, status: 'alive', relations: [], locationId: hero.locationId, inventory: [], flags: {}, arts: [], knowledge: [],
        };
      }
      return {
        lines: [
          { text: `你几经打听，终于见到了大侠【${targetNpc.name}】，呈上书信。`, type: 'action' },
          { text: '“此事我已知晓，这是给贵派掌门的回信。”', type: 'dialogue', speaker: targetNpc.name },
        ],
        removeItem: '密信',
        addItem: '回信',
        addNpc: isNewNpc ? targetNpc : undefined,
        addRelations: [{ targetId: targetNpc.id, type: 'acquaintance', value: 15 }],
        addTurn: 1,
      };
    },
  },

  {
    id: 'intro_quest_complete',
    tags: ['sect_daily'],
    weight: 200,
    stageMax: StoryStage.RISING,
    req: (hero) => hero.inventory.includes('回信') && hero.locationId.startsWith('sect_'),
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const arts = getSectArts(sectName);
      // 🆕 随机给一个本门派的外功
      const rewardArt = arts.find((a) => a.type === 'outer') || arts[0];

      return {
        lines: [
          { text: `${master.name}看完回信，满意地点了点头。`, type: 'narrative' },
          { text: '“好！这次历练你做得很好。为师决定传你本门绝学！”', type: 'dialogue', speaker: master.name },
          { text: `师父将【${rewardArt.name}】的口诀心法悉数传授于你。`, type: 'action' },
          { text: `（${rewardArt.desc}）`, type: 'inner' },
        ],
        removeItem: '回信',
        addFlags: { quest_letter_done: true },
        addArt: rewardArt.name, // 🆕 学会招式
        advanceStage: true,
        addTurn: 1,
      };
    },
  },

  // ===================================
  // Phase 1: 江湖扬名 (RISING)
  // ===================================

  // 1. 强制结识宿敌
  {
    id: 'force_meet_villain',
    tags: ['sect_daily', 'city_daily', 'wild_daily'],
    weight: 100,
    stageMin: StoryStage.RISING,
    stageMax: StoryStage.RISING,
    req: (hero, world, turn) => !hero.flags.has_villain && turn >= 2,
    run: (hero) => {
      const villainName = genName('male');
      const newNpc: Person = {
        id: `npc_villain_${Date.now()}`,
        name: villainName,
        sectId: 'none',
        role: 'boss',
        gender: 'male',
        age: 40,
        status: 'alive',
        relations: [],
        locationId: hero.locationId,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: [],
      };

      const evilArts = SECT_ARTS['血刀堂'];
      const villainMove = rand(evilArts[0].moves);

      return {
        lines: [
          { text: '你路见不平，出手教训了一个恶霸。', type: 'action' },
          { text: '没想引来了背后的靠山。', type: 'narrative' },
          { text: `“我是【${villainName}】，小子，你活到头了！”`, type: 'dialogue', speaker: villainName },
          { text: `只见${villainName}使出一招【${villainMove}】，阴风阵阵，直扑面门！`, type: 'action' },
          { text: '你与其对拼一掌，勉强逃脱，但梁子算是结下了。', type: 'narrative' },
        ],
        addNpc: newNpc,
        addFlags: { has_villain: true },
        addRelations: [{ targetId: newNpc.id, type: 'enemy', value: -100 }],
      };
    },
  },

  // 3. 强制推进到 CRISIS
  {
    id: 'force_advance_to_crisis',
    tags: ['sect_daily', 'city_daily', 'wild_daily'],
    weight: 200,
    stageMin: StoryStage.RISING,
    stageMax: StoryStage.RISING,
    req: (hero, world, turn) => turn > 8,
    run: () => ({
      lines: [
        { text: '时光飞逝，转眼又是一年。', type: 'time-pass' },
        { text: '江湖表面平静，实则暗流涌动，一场针对你师门的阴谋正在酝酿。', type: 'narrative' },
      ],
      advanceStage: true,
    }),
  },

  // ===================================
  // Phase 2: 阴谋浮现 (CRISIS)
  // ===================================
  {
    id: 'sect_crisis_event',
    tags: ['sect_daily', 'city_daily', 'wild_daily'],
    weight: 500,
    stageMin: StoryStage.CRISIS,
    stageMax: StoryStage.CRISIS,
    req: (hero, world, turn) => turn >= 1,
    run: (hero, world) => {
      // Find the most relevant enemy (most hostile and alive)
      const enemyRelations = hero.relations
        .filter(r => r.type === 'enemy')
        .map(rel => ({
          ...rel,
          npc: world.npcs.find((n: Person) => n.id === rel.targetId)
        }))
        .filter(({ npc }) => npc && npc.status === 'alive')
        .sort((a, b) => a.value - b.value);

      const mainEnemy = enemyRelations[0]?.npc || { name: '神秘人' };

      // Set enemy relationship to minimum
      const enemyRel = hero.relations.find(r => r.targetId === mainEnemy.id) ||
        hero.relations.find(r => r.type === 'enemy');
      if (enemyRel) {
        enemyRel.value = -100; // Minimum relationship value
      }

      // Find master and mark as dead
      const master = world.npcs.find((n: Person) => n.relations.some(r => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      if ('id' in master) {
        master.status = 'dead';
      }

      return {
        lines: [
          { text: '这日，惊天噩耗传来！', type: 'action' },
          { text: `【${mainEnemy.name}】竟然率领大批高手攻打你的师门！`, type: 'narrative' },
          { text: '你赶回救援时，只看到漫天火光。', type: 'narrative' },
          { text: `“${hero.name}，快走！留得青山在！”${master.name}拼死为你挡下致命一击。`, type: 'dialogue', speaker: master.name },
          { text: '你含泪逃入深山，发誓定要报此血海深仇。', type: 'inner' },
        ],
        newLocationId: world.locations.find((l: LocationInfo) => l.type === 'wild')?.id || hero.locationId,
        advanceStage: true,
        addNpcs: [mainEnemy, master],
        addRelations: [{ targetId: mainEnemy.id, type: 'enemy', value: -100 }],
      };
    },
  },

  // ===================================
  // Phase 3: 决战巅峰 (CLIMAX)
  // ===================================

  // 1. 苦练 (必须先练一次)
  {
    id: 'climax_training',
    tags: ['wild_daily'],
    weight: 200,
    stageMin: StoryStage.CLIMAX,
    stageMax: StoryStage.CLIMAX,
    req: (hero) => !hero.flags.ready_for_final,
    run: (hero, world) => {
      // 🆕 核心修复：使用主角已学会的武功
      const artName = hero.arts.length > 0 ? hero.arts[0] : '太祖长拳';
      const art = getArtByName(artName);
      const move = rand(art.moves);

      return {
        lines: [
          { text: '身负血仇，你在深山中日夜苦练。', type: 'narrative' },
          { text: `你默念【${art.name}】心法，${art.desc}。`, type: 'action' },
          { text: `寒来暑往，你一遍遍演练“${move}”。`, type: 'action' },
          { text: '终于，你感觉内力充盈，神功大成！', type: 'inner' },
        ],
        choices: [
          {
            text: '杀回城市，找仇人算账！',
            result: {
              lines: [{ text: '你提着兵刃下山，杀气腾腾。', type: 'action' }],
              addFlags: { ready_for_final: true },
              newLocationId: world.locations.find((l: LocationInfo) => l.type === 'city')?.id || hero.locationId,
            },
          },
        ],
      };
    },
  },

  // 2. 决战
  {
    id: 'final_battle_start',
    tags: ['city_daily'],
    weight: 500,
    stageMin: StoryStage.CLIMAX,
    req: (hero) => !!hero.flags.ready_for_final,
    run: (hero, world) => {
      // Find all enemy relations and map them to their corresponding NPCs
      const enemyRelations = hero.relations
        .filter(r => r.type === 'enemy')
        .map(rel => ({
          ...rel,
          npc: world.npcs.find((n: Person) => n.id === rel.targetId)
        }))
        // Filter out enemies not in the world or already dead
        .filter(({ npc }) => npc && npc.status === 'alive')
        // Sort by most hostile (lowest relation value) first
        .sort((a, b) => a.value - b.value);

      // Get the most relevant enemy, or use default
      const mainEnemy = enemyRelations[0]?.npc;
      const enemyName = mainEnemy?.name || '魔教教主';
      const enemyId = mainEnemy?.id;

      // 🆕 核心修复：选择最厉害的武功（优先门派武功，然后按类型排序）
      let bestArt: MartialArt | null = null;
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const sectArts = getSectArts(sectName);

      // 优先选择已学会的门派武功
      const learnedSectArts = sectArts.filter((a) => hero.arts.includes(a.name));
      if (learnedSectArts.length > 0) {
        // 优先选择外功（攻击力更强）
        const outerArts = learnedSectArts.filter((a) => a.type === 'outer');
        bestArt = outerArts.length > 0 ? outerArts[0] : learnedSectArts[0];
      } else if (hero.arts.length > 0) {
        // 如果没有门派武功，选择第一个学会的
        bestArt = getArtByName(hero.arts[0]);
      } else {
        // 如果什么都没学会，用默认的
        bestArt = getArtByName('太祖长拳');
      }

      const art = bestArt;
      const ultMove = rand(art.moves);

      let weaponAction = '收剑入鞘';
      if (art.weapon === 'blade') weaponAction = '收刀入鞘';
      if (art.weapon === 'fist') weaponAction = '收势调息';
      if (art.weapon === 'stick') weaponAction = '收起棍棒';

      return {
        lines: [
          { text: '月圆之夜，紫禁之巅。', type: 'narrative' },
          { text: `你与仇人【${enemyName}】相对而立，杀气弥漫。`, type: 'narrative' },
          { text: '“天堂有路你不走！”对手狞笑着扑来，掌风凌厉。', type: 'dialogue', speaker: enemyName },
        ],
        choices: [
          {
            text: `使出绝学【${art.name}】`,
            result: {
              lines: [
                { text: `你大喝一声，使出【${art.name}】中的绝杀"${ultMove}"！`, type: 'action' },
                { text: `${art.desc}，凌厉的攻势瞬间贯穿了对手的防御。`, type: 'action' },
                { text: '三百回合后，你一击命中对方要害。', type: 'action' },
                { text: '一切都结束了。', type: 'inner' },
                { text: `你${weaponAction}，看着天边的朝阳，转身没入人海。`, type: 'narrative' },
                { text: '江湖上从此多了一个传说。', type: 'narrative' },
              ],
              choices: [{
                text: '继续',
                result: {
                  lines: [
                    { text: '你的故事被后人传颂，成为武林中不朽的传奇。', type: 'narrative' },
                    { text: '《完》', type: 'narrative' },
                  ],
                  endGame: true,
                  advanceStage: true,
                }
              }]
            },
          },
          {
            text: '使用其他武功（可能不敌）',
            result: {
              lines: [
                { text: '你使出了其他武功，但威力不足。', type: 'action' as const },
                { text: '对手见你招式不够精妙，攻势更加凌厉。', type: 'narrative' as const },
                { text: '你渐渐落入下风，只能勉强招架。', type: 'action' as const },
              ],
              choices: [
                {
                  text: '拼死一搏',
                  result: {
                    lines: [
                      { text: '你拼尽全力，终于找到机会反击。', type: 'action' },
                      { text: '虽然受了重伤，但你也重创了对手。', type: 'narrative' },
                      { text: '你们两败俱伤，各自退去。', type: 'narrative' },
                    ],
                    endGame: true,
                    advanceStage: true,
                  },
                },
                {
                  text: '逃跑',
                  result: {
                    lines: [
                      { text: '你见势不妙，虚晃一招，转身就逃。', type: 'action' },
                      { text: '对手紧追不舍，你拼尽全力才逃脱。', type: 'narrative' },
                      { text: '虽然逃过一劫，但你知道，这场恩怨还没结束。', type: 'inner' },
                    ],
                    addFlags: { escaped_final_battle: true },
                  },
                },
              ],
            },
          },
          {
            text: '同归于尽',
            result: {
              lines: [
                { text: '你深知对方武功高强，只有这一条路。', type: 'inner' },
                { text: '你放弃防守，任由对方一掌打在胸口，同时发出致命一击。', type: 'action' },
                { text: '两个身影同时倒下，风雪掩盖了一切。', type: 'narrative' },
              ],
              endGame: true,
              advanceStage: true,
            },
          },
        ],
      };
    },
  },

  // ===================================
  // 🌲 通用日常
  // ===================================
  {
    id: 'daily_train', tags: ['sect_daily', 'wild_daily'], weight: 5, run: () => ({ lines: [{ text: '今日练功，略有心得。', type: 'narrative' }] }),
  },
  {
    id: 'daily_tea', tags: ['city_daily'], weight: 5, run: () => ({ lines: [{ text: '你在茶馆听了一下午的说书。', type: 'narrative' }] }),
  },
  {
    id: 'daily_wander_city', tags: ['city_daily'], weight: 5, run: () => ({ lines: [{ text: '集市上人来人往，好不热闹。', type: 'narrative' }] }),
  },
  {
    id: 'sect_chat',
    tags: ['sect_daily'],
    weight: 5,
    run: (hero, world) => ({ lines: [{ text: '你与几位师兄弟闲聊了一会江湖趣闻。', type: 'narrative' }] }),
  }
  // ===================================
  // 🌲 通用日常（续）
  // ===================================
];
