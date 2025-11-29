import { generateBattle } from "../logic/battle";
import { SECTS_DATA, MERCHANT_ITEMS } from "../logic/constants";
import { SECT_ARTS, getSectArts, getArtByName } from "../logic/skills";
import { StorySnippet, Sect, Person, StoryChoice, StoryStage, MartialArt, RelationType, StoryLine, Personality, Location } from "../logic/types";
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
