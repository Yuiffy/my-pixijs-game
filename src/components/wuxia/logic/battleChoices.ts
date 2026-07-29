import type { Person, RelationType, StoryChoice } from "./types";

/**
 * 生成同伴邀请的交互选项
 * @param ally 邀请加入的同伴
 * @param hero 主角
 * @param world 游戏世界状态
 * @param allyWantsToKill 盟友是否想杀死敌人（影响对话）
 * @returns 包含对话和选项的对象
 */
const getCompanionInvitation = (ally: Person, hero: Person, world: any, allyWantsToKill: boolean) => {
  const canInvite = (world.party?.length || 0) < 3;

  return {
    lines: [
      {
        text: allyWantsToKill
          ? `【${ally.name}】收起染血的武器，转身对你说道："少侠武艺高强，在下佩服。"`
          : `【${ally.name}】看着你，欲言又止。`,
        type: 'dialogue' as const,
        speaker: ally.name
      },
      {
        text: canInvite
          ? `"${allyWantsToKill ? '不知少侠接下来有何打算？若是不嫌弃，在下愿与少侠同行，共闯江湖！' : '在下与少侠一见如故，不知能否有幸与少侠结伴同行？'}"`
          : `【${ally.name}】似乎想对你说些什么，但看到你身边已有不少同伴，便没有开口。`,
        type: 'dialogue' as const,
        speaker: canInvite ? ally.name : '旁白'
      }
    ],
    ...(canInvite ? { choices: getCompanionInviteChoices(ally, hero) } : {})
  };
};

// 🆕 Feature 3: 生成战斗胜利后的通用选择
export const getBattleOutcomeChoices = (
  enemy: Person,
  hero: Person,
  world: any,
  baseRelationVal: number = 0,
  ally?: Person // 新增参数：战斗中的盟友
) => {
  // 基础选择：没有盟友时的选项
  const baseChoices = [
    {
      text: '斩草除根',
      desc: '杀死敌人，永绝后患',
      result: {
        lines: [
          { text: '你眼神一冷，手起刀落。', type: 'action' as const },
          { text: `【${enemy.name}】倒在了血泊中。`, type: 'narrative' as const },
          { text: `【${enemy.name}】已气绝身亡。`, type: 'narrative' as const }
        ],
        addFlags: { [`killed_${enemy.id}`]: true },
        removeItem: enemy.id,
        addRelations: [{ targetId: enemy.id, type: 'enemy' as RelationType, value: -100 }],
        // Mark the NPC as dead and remove them from the world
        setNpcStatus: { id: enemy.id, status: 'dead' as const },
        removeFromWorld: [enemy.id]
      }
    },
    {
      text: '放他一马',
      desc: '增加名声',
      result: {
        lines: [
          { text: '你收起兵刃："滚吧。"', type: 'dialogue' as const, speaker: '你' },
          { text: `【${enemy.name}】连滚带爬地逃走了。`, type: 'narrative' as const },
          { text: `【${enemy.name}】对你好感度提升了。`, type: 'narrative' as const }
        ],
        addRelations: [{ targetId: enemy.id, type: 'acquaintance' as RelationType, value: baseRelationVal + 10 }]
      }
    },
    {
      text: '邀请入伙',
      desc: '化敌为友',
      result: {
        lines: [
          { text: '"我看你身手不错，不如随我一同闯荡江湖？"', type: 'dialogue' as const, speaker: '你' },
          { text: `【${enemy.name}】一愣，随即拱手："愿效犬马之劳！"`, type: 'dialogue' as const, speaker: enemy.name }
        ],
        addRelations: [{ targetId: enemy.id, type: 'friend' as RelationType, value: 60 }],
        addToParty: enemy.id
      }
    }
  ];

  // 如果有盟友，添加额外的互动选项
  if (ally) {
    // 盟友对敌人的态度（随机生成，但受角色性格影响）
    const allyWantsToKill = Math.random() > 0.5;

    // 处理敌人状态的函数
    const handleEnemyFate = (spareEnemy: boolean) => {
      if (spareEnemy) {
        // 饶恕敌人的情况
        return {
          lines: [
            {
              text: allyWantsToKill
                ? `"且慢！"你上前一步，"得饶人处且饶人，不如给他一个改过自新的机会？"`
                : '"好，就依你所言。"',
              type: 'dialogue' as const,
              speaker: '你'
            },
            ...(allyWantsToKill ? [
              {
                text: `【${ally.name}】沉思片刻，终于点了点头："罢了，就看在你的面子上。"`,
                type: 'dialogue' as const,
                speaker: ally.name
              },
              {
                text: `【${enemy.name}】如蒙大赦，连连作揖："多谢两位大侠不杀之恩！"`,
                type: 'dialogue' as const,
                speaker: enemy.name
              },
              {
                text: `【${enemy.name}】对你好感度大幅提升！`,
                type: 'narrative' as const
              }
            ] : [
              {
                text: `【${enemy.name}】感激地抱拳："多谢两位不杀之恩，后会有期！"`,
                type: 'dialogue' as const,
                speaker: enemy.name
              },
              {
                text: `【${enemy.name}】对你好感度提升了。`,
                type: 'narrative' as const
              }
            ])
          ],
          addRelations: [
            { targetId: enemy.id, type: 'friend' as RelationType, value: 30 },
            { targetId: ally.id, type: 'friend' as RelationType, value: 10 }
          ],
          // 有几率敌人会请求加入队伍
          ...(Math.random() > 0.7 ? {
            lines: [
              ...(allyWantsToKill ? [
                {
                  text: `【${enemy.name}】犹豫了一下，突然跪倒在地："两位大侠，在下愿追随左右，以报不杀之恩！"`,
                  type: 'dialogue' as const,
                  speaker: enemy.name
                }
              ] : [
                {
                  text: `【${enemy.name}】走了几步又回头："两位大侠，在下对江湖不熟，不知能否与两位同行？"`,
                  type: 'dialogue' as const,
                  speaker: enemy.name
                }
              ]),
              {
                text: `你看向【${ally.name}】，等待他/她的意见...`,
                type: 'narrative' as const
              },
              {
                text: `【${ally.name}】微微一笑："多一个朋友多一条路，不如就让他/她加入吧。"`,
                type: 'dialogue' as const,
                speaker: ally.name
              }
            ],
            choices: getCompanionInviteChoices(enemy, hero, ally)
          } : {})
        };
      }
      // 杀死敌人的情况
      return {
        lines: [
          {
            text: allyWantsToKill
              ? `你点了点头："此人作恶多端，确实该杀。"`
              : `"不行！此贼不除，后患无穷！"你厉声道。`,
            type: 'dialogue' as const,
            speaker: '你'
          },
          {
            text: allyWantsToKill
              ? `【${ally.name}】手起刀落，结果了【${enemy.name}】的性命。`
              : `【${ally.name}】叹了口气："既然你执意如此..."`,
            type: 'narrative' as const
          },
          {
            text: `【${enemy.name}】倒在了血泊中。`,
            type: 'narrative' as const
          },
          {
            text: allyWantsToKill
              ? `【${ally.name}】对你的好感度提升了。`
              : `【${ally.name}】似乎对你的决定有些不满...`,
            type: 'narrative' as const
          }
        ],
        addFlags: { [`killed_${enemy.id}`]: true },
        removeItem: enemy.id,
        addRelations: [
          { targetId: enemy.id, type: 'enemy' as RelationType, value: -100 },
          {
            targetId: ally.id,
            type: 'friend' as RelationType,
            value: allyWantsToKill ? 15 : -10
          }
        ]
      };

    };

    const allyDialogue = allyWantsToKill
      ? `【${ally.name}】怒目圆睁："此贼作恶多端，今日定要取他性命！"`
      : `【${ally.name}】收起兵刃："既然已被你制服，就饶他一命吧。"`;

    return [
      {
        text: '让盟友决定',
        desc: '让盟友决定敌人的命运',
        result: {
          lines: [
            { text: `你看向【${ally.name}】，示意由他/她来决定。`, type: 'action' as const },
            { text: allyDialogue, type: 'dialogue' as const, speaker: ally.name },
            ...(allyWantsToKill ? [
              { text: `【${enemy.name}】惊恐地看着【${ally.name}】，似乎想要求饶。`, type: 'narrative' as const },
              { text: '你决定...', type: 'narrative' as const }
            ] : [
              { text: `【${enemy.name}】感激地看了【${ally.name}】一眼，又转向你。`, type: 'narrative' as const },
              { text: '你决定...', type: 'narrative' as const }
            ])
          ],
          choices: [
            {
              text: allyWantsToKill ? '劝说盟友饶他一命' : '同意放人',
              desc: allyWantsToKill ? '尝试说服盟友放人' : '同意盟友的意见',
              result: {
                ...handleEnemyFate(true),
                // 处理完敌人后，处理盟友互动
                choices: [{
                  text: '继续',
                  result: getCompanionInvitation(ally, hero, world, allyWantsToKill)
                }]
              }
            },
            {
              text: allyWantsToKill ? '同意处决' : '执意要杀',
              desc: allyWantsToKill ? '同意盟友的决定' : '坚持要杀死敌人',
              result: {
                ...handleEnemyFate(false),
                // 处理完敌人后，处理盟友互动
                choices: [{
                  text: '继续',
                  result: getCompanionInvitation(ally, hero, world, allyWantsToKill)
                }]
              }
            }
          ]
        }
      },
      ...baseChoices
    ];
  }

  return baseChoices;
};

/**
 * 生成同伴邀请的选择项
 * @param npc 要邀请的NPC
 * @param hero 主角
 * @param ally 战斗中的盟友（可选）
 * @returns 包含邀请选项的StoryChoice数组
 */
export const getCompanionInviteChoices = (
  npc: Person,
  hero: Person,
  ally?: Person
): StoryChoice[] => {
  // 判断是否是帮助过的NPC
  const isHelpedNpc = !ally;
  const isAllyInviting = ally && ally.id !== hero.id;

  const inviteResult = {
    text: isHelpedNpc ? '邀请入伙' : '同意入伙',
    desc: isHelpedNpc ? '邀请同行' : '化敌为友',
    result: {
      lines: (() => {
        if (isHelpedNpc) {
          // 帮助过的NPC
          return [
            { text: `"${npc.name}，你一个人在这里太危险了，不如和我一起走吧？"`, type: 'dialogue' as const, speaker: hero.name },
            { text: `【${npc.name}】眼中闪过一丝感激："真的可以吗？太好了！"`, type: 'dialogue' as const, speaker: npc.name }
          ];
        } if (isAllyInviting) {
          // 盟友邀请敌人
          return [
            { text: `"好，从今以后我们就是同伴了。"`, type: 'dialogue' as const, speaker: '你' },
            { text: `【${npc.name}】欣喜若狂："多谢两位！在下定当竭尽所能！"`, type: 'dialogue' as const, speaker: npc.name }
          ];
        }
        // 主角邀请敌人
        return [
          { text: `"你的武艺不错，可愿随我一同闯荡江湖？"`, type: 'dialogue' as const, speaker: hero.name },
          { text: `【${npc.name}】抱拳道："承蒙不弃，在下愿效犬马之劳！"`, type: 'dialogue' as const, speaker: npc.name }
        ];

      })(),
      addRelations: [
        { targetId: npc.id, type: 'friend' as const, value: isHelpedNpc ? 70 : 60 },
        ...(ally ? [{ targetId: ally.id, type: 'friend' as const, value: 20 }] : [])
      ],
      addToParty: isHelpedNpc ? npc.id : [npc.id]
    }
  };

  const declineResult = {
    text: '婉拒',
    desc: isHelpedNpc ? '婉拒同行' : '婉拒邀请',
    result: {
      lines: (() => {
        if (isHelpedNpc) {
          return [
            { text: '"抱歉，我还有要事在身，恐怕不能与你同行。"', type: 'dialogue' as const, speaker: hero.name },
            { text: `【${npc.name}】有些失落："是在下冒昧了。少侠保重！"`, type: 'dialogue' as const, speaker: npc.name }
          ];
        } if (isAllyInviting) {
          return [
            { text: '"抱歉，我们还有要事在身，不便同行。"', type: 'dialogue' as const, speaker: '你' },
            { text: `【${npc.name}】略显失望："是在下唐突了。后会有期！"`, type: 'dialogue' as const, speaker: npc.name }
          ];
        }
        return [
          { text: `"抱歉，我还有些私事要处理，恐怕不能与你同行。"`, type: 'dialogue' as const, speaker: hero.name },
          { text: `【${npc.name}】抱拳道："无妨，江湖路远，他日有缘再见！"`, type: 'dialogue' as const, speaker: npc.name }
        ];

      })(),
      addRelations: [
        { targetId: npc.id, type: 'friend' as const, value: isHelpedNpc ? 40 : 30 },
        ...(ally ? [{ targetId: ally.id, type: 'friend' as const, value: 5 }] : [])
      ]
    }
  };

  return [inviteResult, declineResult];
};
