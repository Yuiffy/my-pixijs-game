import { generateBattle } from "../logic/battle";
import { SECTS_DATA, MERCHANT_ITEMS } from "../logic/constants";
import { SECT_ARTS, getSectArts, getArtByName } from "../logic/skills";
import { StorySnippet, Sect, Person, StoryChoice, StoryStage, MartialArt, RelationType, StoryLine, Personality, LocationInfo } from "../logic/types";
import { getSectById, describeAppearance, rand, genName, genPersonality, genAppearance, describeAppearanceChange } from "../logic/utils";
import { generateCompanionCampEvent, generateCompanionMealEvent, generateCompanionRomanticEvent } from "./common";

// 动态事件：门派仇杀
const eventRumorDuel: StorySnippet = {
  id: 'event_rumor_duel',
  tags: ['wild_daily'],
  weight: 200,
  req: (hero, world) => hero.knowledge.includes('rumor_duel') &&
    hero.locationId.startsWith('wild_') &&
    !hero.flags.watched_duel,
  run: (hero, world) => {
    const sects = world.sects as Sect[];
    let sectA: Sect | null = null;
    let sectB: Sect | null = null;

    // 找出关系最差的两个门派
    for (const s1 of sects) {
      for (const [s2Id, val] of Object.entries(s1.relations || {})) {
        if (val < -50) {
          sectA = s1;
          sectB = sects.find(s => s.id === s2Id) || null;
          if (sectA && sectB) break;
        }
      }
      if (sectA && sectB) break;
    }

    // 回退：随机选一个正派一个邪派
    if (!sectA || !sectB) {
      sectA = sects.find(s => s.type === 'good') || sects[0];
      sectB = sects.find(s => s.type === 'evil') || sects[1];
    }

    return {
      lines: [
        { text: '你按照茶馆听来的消息，悄悄摸进了一片树林。', type: 'action' },
        { text: `果然！两拨人马正在对峙。看服饰，分别是【${sectA.name}】和【${sectB.name}】的弟子。`, type: 'narrative' },
        { text: `"${sectB.name}的妖人，今日就要算清旧账！"`, type: 'dialogue', speaker: `${sectA.name}弟子` },
        { text: `"哼，${sectA.name}这帮伪君子，死到临头还嘴硬！"`, type: 'dialogue', speaker: `${sectB.name}弟子` },
      ],
      choices: [
        {
          text: `助【${sectA.name}】铲除奸邪`,
          result: {
            lines: [
              { text: '你拔剑而出，加入了战团。', type: 'action' },
              { text: `【${sectA.name}】弟子见有强援，士气大振，一举击溃了对手。`, type: 'narrative' },
              { text: `此役之后，你与【${sectA.name}】的关系更近了一步，但也彻底得罪了【${sectB.name}】。`, type: 'inner' },
            ],
            addFlag: 'watched_duel',
            // 这里可以添加关系变化
          },
        },
        {
          text: `助【${sectB.name}】行事`,
          result: {
            lines: [
              { text: '你竟然选择了帮助被围攻的"妖人"一方。', type: 'action' },
              { text: `【${sectB.name}】弟子颇感意外，但有了你的帮助，他们成功反杀。`, type: 'narrative' },
              { text: '"少侠好胆识！若不嫌弃，可来我派喝杯血酒！"', type: 'dialogue', speaker: `${sectB.name}弟子` },
            ],
            addFlag: 'watched_duel',
          },
        },
        {
          text: '两不相帮，此时不走更待何时',
          result: {
            lines: [{ text: '江湖仇杀，冤冤相报何时了。你摇了摇头，悄然离去。', type: 'action' }],
            addFlag: 'watched_duel',
          }
        }
      ],
    };
  },
};

// 动态事件：偶遇隐世高人
const eventMeetHiddenMaster: StorySnippet = {
  id: 'event_meet_hidden_master',
  tags: ['wild_daily', 'city_daily'],
  weight: 200,
  req: (hero, world) => {
    const master = world.npcs.find((n: Person) => n.role === 'mystery' && n.locationId === hero.locationId);
    return !!master && !hero.flags[`met_${master.id}`];
  },
  run: (hero, world) => {
    const master = world.npcs.find((n: Person) => n.role === 'mystery' && n.locationId === hero.locationId) as Person;
    const identity = master.identity || { originalSect: '未知门派', relationDesc: '神秘莫测的高手' };
    const originalSectName = getSectById(identity.originalSect || '')?.name || '某门派';
    const callSelf = master.age > 60 ? '老夫' : '在下';

    return {
      lines: [
        { text: `你在${hero.locationId.includes('wild') ? '山林深处' : '闹市角落'}，发现一位气度不凡的${master.gender === 'male' ? '老者' : '老妇'}。`, type: 'narrative' },
        { text: describeAppearance(master), type: 'narrative' },
        { text: `此人正是传闻中的【${master.name}】，${identity.relationDesc}。`, type: 'inner' },
        { text: `"${callSelf}已不问江湖世事多年，没想到还有娃娃能找到这里。"`, type: 'dialogue', speaker: master.name },
      ],
      choices: [
        {
          text: `前辈，晚辈对【${originalSectName}】武学仰慕已久`,
          result: {
            lines: [
              { text: `听到${originalSectName}，${master.name}眼中闪过一丝复杂的神色。`, type: 'narrative' },
              { text: '"哼，那个地方...罢了。看你根骨不错，既然有缘，我就指点你几招，能不能领悟看你造化。"', type: 'dialogue', speaker: master.name },
              { text: '你们就在此地盘桓数日，高人悉心指点。', type: 'time-pass' },
            ],
            addArt: master.arts.length > 0 ? master.arts[0] : undefined,
            addFlag: `met_${master.id}`,
            addRelation: { targetId: master.id, type: 'master', value: 30 },
            addTurn: 3
          }
        },
        {
          text: '晚辈斗胆，想请前辈赐教！(切磋)',
          result: {
            lines: [
              { text: '你拔出兵刃，身上战意升腾。', type: 'action' },
              { text: '"哈哈哈！好！比起那些唯唯诺诺的徒子徒孙，老夫更喜欢你这种狂妄的小子！"', type: 'dialogue', speaker: master.name },
              { text: '（切磋过程省略...）你虽然败了，但在实战中获益良多。', type: 'narrative' }
            ],
            addFlag: `met_${master.id}`,
            addRelation: { targetId: master.id, type: 'acquaintance', value: 20 },
            addTurn: 1
          }
        },
        {
          text: '晚辈唐突，这就告退',
          result: {
            lines: [
              { text: '你抱拳行礼，准备离开。', type: 'action' },
              { text: '"哼，无趣。"', type: 'dialogue', speaker: master.name },
              { text: '你感觉错过了什么...', type: 'inner' }
            ],
            addFlag: `met_${master.id}`,
          }
        }
      ]
    };
  }
};

export const compainionSnippets: StorySnippet[] = [
  // 1. 传闻：野外约战
  {
    id: 'event_rumor_duel',
    tags: ['wild_daily'],
    weight: 50, // 降低权重，减少触发频率
    // 条件：在野外 + 有对应的rumor_duel情报 + 没看过这个特定门派的战斗 + 冷却时间
    req: (hero, world) => {
      if (!hero.locationId.startsWith('wild_')) return false;
      // 添加冷却时间，至少10回合才能再次触发
      if (hero.flags.last_duel_event && world.turn - hero.flags.last_duel_event < 10) return false;

      // 查找所有的rumor_duel情报
      const duelRumors = hero.knowledge.filter(k => k.startsWith('rumor_duel:'));
      if (duelRumors.length === 0) return false;

      // 获取第一个未触发过的rumor
      for (const rumor of duelRumors) {
        const [_, sectIds] = rumor.split(':');
        const [sect1Id, sect2Id] = sectIds.split(',');
        const flag = `watched_duel_${sect1Id}_${sect2Id}`;

        if (!hero.flags[flag]) {
          return true;
        }
      }

      return false;
    },
    run: (hero, world) => {
      // 获取第一个未触发过的rumor
      const duelRumor = hero.knowledge.find(k => k.startsWith('rumor_duel:'));
      const [, sectIds] = duelRumor!.split(':');
      const [sect1Id, sect2Id] = sectIds.split(',');

      // 获取门派信息
      const sect1 = SECTS_DATA.find(s => s.id === sect1Id);
      const sect2 = SECTS_DATA.find(s => s.id === sect2Id);

      if (!sect1 || !sect2) {
        // 如果找不到门派信息，使用默认值
        return {
          lines: [
            { text: '你来到传闻中的地点，但似乎什么也没发生。', type: 'narrative' },
            { text: '可能是消息有误，或者你来晚了。', type: 'inner' },
          ],
          addFlag: `watched_duel_${sect1Id}_${sect2Id}`,
          addFlags: { last_duel_event: world.turn },
        };
      }

      // 根据门派类型决定描述
      const sect1Desc = sect1.type === 'good' ? '弟子' : '恶徒';
      const sect2Desc = sect2.type === 'good' ? '弟子' : '恶徒';

      // 随机选择哪一方先说话
      const firstSpeaker = Math.random() > 0.5 ? sect1 : sect2;
      // 使用firstSpeaker和sect1/sect2的关系来决定第二说话者
      const secondSpeaker = firstSpeaker === sect1 ? sect2 : sect1;

      // 先自动观察战斗
      const initialLines: StoryLine[] = [
        { text: '你按照茶馆听来的消息，悄悄摸进了一片树林。', type: 'action' },
        { text: '果然！前方空地上，两拨人马正在对峙。', type: 'narrative' },
        { text: `左边是${sect1.name}的${sect1Desc}，右边是${sect2.name}的${sect2Desc}。`, type: 'narrative' },
        { text: `“今日不是你死，就是我亡！”${firstSpeaker.name}的弟子大喝道。`, type: 'dialogue', speaker: `${firstSpeaker.name}弟子` },
        { text: '双方剑拔弩张，战斗一触即发。你决定先观察情况...', type: 'narrative' },
      ];

      // 随机决定战斗发展
      const battleOutcome = Math.random();

      // 30% 机会出现需要玩家干预的情况
      if (battleOutcome < 0.3) {
        // 需要玩家做出选择
        return {
          lines: [
            ...initialLines,
            { text: `战斗开始不久，你注意到${sect1.name}的弟子似乎处于下风。`, type: 'narrative' },
            { text: `“啊！”一名${sect1.name}的弟子被击倒在地，情况危急！`, type: 'action' },
            { text: '你意识到，现在必须做出选择了...', type: 'inner' },
          ],
          choices: [
            {
              text: `帮助${sect1.name}`,
              result: {
                lines: [
                  { text: `你大喝一声：“住手！”拔剑冲入战团。`, type: 'action' },
                  { text: `${sect1.name}弟子见有援军，顿时士气大振。`, type: 'narrative' },
                  { text: `在你的帮助下，${sect2.name}的人马很快不敌撤退。`, type: 'action' },
                  { text: '“多谢少侠仗义援手！在下没齿难忘。”', type: 'dialogue', speaker: `${sect1.name}弟子` },
                ],
                addFlag: `watched_duel_${sect1Id}_${sect2Id}`,
                addFlags: { last_duel_event: world.turn },
                updateRelations: [
                  { target: `sect:${sect1Id}`, type: 'friendly', value: 20 },
                  { target: `sect:${sect2Id}`, type: 'hostile', value: 10 },
                ],
                ...(Math.random() < 0.5 ? {
                  addKnowledge: `met_${sect1Id}_disciple`,
                  lines: [
                    { text: `“在下${sect1.name}弟子${genName('male')}，不知少侠如何称呼？”`, type: 'dialogue', speaker: `${sect1.name}弟子` },
                    { text: '你与对方交换了姓名，江湖路远，后会有期。', type: 'narrative' },
                  ]
                } : {})
              },
            },
            {
              text: '继续观察',
              result: {
                lines: [
                  { text: '你决定继续观察，不轻易介入这场纷争。', type: 'action' },
                  { text: `最终，${sect1.name}的弟子们虽然受伤不轻，但还是击退了${sect2.name}的进攻。`, type: 'narrative' },
                  { text: '“哼！这次算你们走运！”', type: 'dialogue', speaker: `${sect2.name}弟子` },
                ],
                addFlag: `watched_duel_${sect1Id}_${sect2Id}`,
                addFlags: { last_duel_event: world.turn },
              },
            },
          ],
        };
      }
      // 战斗自然结束，不需要玩家干预
      const winner = battleOutcome < 0.65 ? sect1 : sect2;
      const loser = winner === sect1 ? sect2 : sect1;

      return {
        lines: [
          ...initialLines,
          { text: '双方激烈交战，你来我往，战况胶着。', type: 'narrative' },
          { text: `经过一番激战，${winner.name}逐渐占据上风。`, type: 'narrative' },
          { text: `“撤！”${loser.name}的弟子见势不妙，迅速撤退。`, type: 'action' },
          { text: `“哼，算他们跑得快！”${winner.name}的弟子收起武器。`, type: 'dialogue', speaker: `${winner.name}弟子` },
          { text: '你默默记下这场战斗的结果，悄然离去。', type: 'narrative' },
        ],
        addFlag: `watched_duel_${sect1Id}_${sect2Id}`,
        addFlags: { last_duel_event: world.turn },
      };

    },
  }
];
