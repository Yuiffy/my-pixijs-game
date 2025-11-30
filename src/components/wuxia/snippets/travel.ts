import { StorySnippet, Person, TravelMode } from "../logic/types";
import { rand, getCompanionNamesList, calculateTravelCost, describeAppearance, generateNpc } from "../logic/utils";

export const travelSnippets: StorySnippet[] = [
  // ==========================================
  // 1. 触发旅行 (替代原有的移动逻辑)
  // ==========================================
  {
    id: 'prepare_travel',
    tags: ['city_daily', 'wild_daily'], // 在任何地方都可以决定去哪
    weight: 5, // 稍微低一点，作为主动选项
    run: (hero, world) => {
      const currentLoc = world.locations.find((l: any) => l.id === hero.locationId);
      const connections = currentLoc.connections || [];
      const neighbors = world.locations.filter((l: any) => connections.includes(l.id));

      if (neighbors.length === 0) {
        return {
          lines: [{
            text: '此处是死路，无法前行。',
            type: 'narrative'
          }]
        };
      }

      const choices = neighbors.map((loc: any) => {
        const { distance } = calculateTravelCost(hero.locationId, loc.id, world.locations);
        return {
          text: `去往：${loc.name}`,
          desc: `预计路程 ${distance} 天`,
          result: {
            lines: [{ text: `你决定前往${loc.name}。`, type: 'narrative' }],
            // 这里不直接 startTravel，而是进入路线选择
            choices: [
              {
                text: '走官道 (需住店/买干粮)',
                desc: '安全，花费银两，耗时正常',
                result: {
                  lines: [{ text: '你收拾行囊，准备沿官道出发。', type: 'action' }],
                  startTravel: { targetId: loc.id, days: distance, mode: 'road' as TravelMode },
                  addSupplies: 5 // 假设出发前自动补充一点
                }
              },
              {
                text: '抄近道/翻山越岭',
                desc: '危险，省钱，可能遭遇野兽，可打猎',
                result: {
                  lines: [{ text: '你决定不走寻常路，翻山越岭而去。', type: 'action' }],
                  startTravel: { targetId: loc.id, days: Math.max(1, distance - 1), mode: 'wild' as TravelMode },
                  addSupplies: 2
                }
              }
            ]
          }
        };
      });

      // 增加"留在这里"选项
      choices.push({
        text: '暂不远行',
        result: { lines: [{ text: '你决定还是先在这里逗留几日。', type: 'narrative' }] }
      });

      return {
        lines: [
          { text: '你站在路口，看着延伸向远方的道路。', type: 'narrative' },
          { text: '天下之大，该去往何处？', type: 'inner' }
        ],
        choices
      };
    }
  },

  // ==========================================
  // 2. 旅途中的每日事件 (Travel Daily)
  // ==========================================

  // 旅途：日常赶路 (无事发生)
  {
    id: 'travel_smooth',
    tags: ['travel_daily'],
    weight: 40,
    run: (hero, world) => {
      const companionTxt = getCompanionNamesList(world);
      const hasCompanions = world.party && world.party.length > 0;

      const lines: any[] = [
        {
          text: `第 ${(world.travelState?.daysTotal || 0) - (world.travelState?.daysLeft || 0) + 1} 天。`,
          type: 'time-pass'
        }
      ];

      if (hasCompanions) {
        lines.push({ text: `你与${companionTxt}在赶路，${rand(['相谈甚欢', '一路无话', '欣赏沿途风景'])}。`, type: 'narrative' });
        // 增加好感
        // 简化：这里可以添加增加好感的逻辑
        // 例如：addRelationToParty(pid, 1);
      } else {
        lines.push({ text: '你独自一人赶路，身影略显孤单。', type: 'narrative' });
      }

      // 消耗干粮
      const supplyCost = hasCompanions ? world.party.length + 1 : 1;

      return {
        lines,
        addSupplies: -supplyCost,
      };
    }
  },

  // 旅途：偶遇路人 (结伴系统)
  {
    id: 'travel_meet_stranger',
    tags: ['travel_daily'],
    weight: 20,
    run: (hero, world) => {
      // 生成一个路人
      const npc = generateNpc({
        role: 'hero',
        locationId: hero.locationId,
        desiredLocationId: world.travelState?.destinationId
      });
      const desc = describeAppearance(npc);

      return {
        lines: [
          { text: '前路遇到一位行色匆匆的旅人。', type: 'narrative' },
          { text: desc, type: 'narrative' },
          { text: `对方似乎也要去往同一个方向。`, type: 'narrative' }
        ],
        choices: [
          {
            text: '上前攀谈并邀请同行',
            result: {
              lines: [
                { text: `你上前拱手："在下${hero.name}，阁下也是去往那边吗？"`, type: 'dialogue', speaker: '你' },
                { text: `【${npc.name}】打量了你一番，笑道："正是，相请不如偶遇，不如结伴而行？"`, type: 'dialogue', speaker: npc.name }
              ],
              addNpc: npc,
              addToParty: npc.id,
              addRelations: [{ targetId: npc.id, type: 'acquaintance', value: 20 }]
            }
          },
          {
            text: '点头致意，各走各的',
            result: {
              lines: [{ text: '你们互相点了点头，保持着距离赶路。', type: 'narrative' }]
            }
          },
          { // 甚至可以打劫
            text: '看他包袱沉重...(打劫)',
            result: {
              lines: [{ text: '你心生歹念...', type: 'inner' }],
              // ... 触发战斗逻辑
            }
          }
        ]
      };
    }
  },

  // 旅途：打猎/采集 (Wild 模式特有)
  {
    id: 'travel_hunt',
    tags: ['travel_daily'],
    weight: 30,
    req: (_hero, world) => world.travelState?.mode === 'wild',
    run: (hero, world) => {
      return {
        lines: [
          { text: '山路崎岖，但野味颇多。', type: 'narrative' },
          { text: '你尝试在此打猎补充给养。', type: 'action' }
        ],
        // 简单判定成功
        addSupplies: 3,
        choices: [
          {
            text: '烤了吃！',
            result: {
              lines: [{ text: '饱餐一顿，体力充沛。', type: 'narrative' }],
              addHp: 20,
            }
          }
        ]
      };
    }
  },

  // ==========================================
  // 3. 到达目的地 (Arrival)
  // ==========================================
  {
    id: 'travel_arrival',
    tags: ['travel_arrival'], // 特殊 tag
    weight: 100,
    run: (hero, world) => {
      const destinationId = world.travelState?.destinationId;
      const targetLoc = world.locations.find((l: any) => l.id === destinationId);

      // 处理伙伴离开逻辑
      const leavingPartyIds: string[] = [];
      const lines: any[] = [
        { text: `经过几日的跋涉，终于到达了【${targetLoc?.name}】。`, type: 'narrative' }
      ];

      if (world.party && world.party.length > 0) {
        world.party.forEach((pid: string) => {
          const p = world.npcs.find((n: Person) => n.id === pid);
          // 简单的离开判定：如果是刚才路上捡的路人(desiredLocationId匹配)，或者随机离开
          if (p && (p.desiredLocationId === destinationId || Math.random() < 0.4)) {
            leavingPartyIds.push(pid);
            lines.push({
              text: `【${p.name}】停下脚步："${hero.name}，我就送你到这里了，咱们后会有期！"`,
              type: 'dialogue',
              speaker: p.name
            });
          }
        });
      }

      return {
        lines,
        newLocationId: destinationId, // 正式更新位置
        removeFromParty: leavingPartyIds.length > 0 ? leavingPartyIds : undefined
        // 清除旅行状态（在WuxiaGame组件中处理）
        // startTravel: undefined
      };
    }
  }
];
