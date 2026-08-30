import { SECTS_DATA } from "../logic/constants";
import type { LocationInfo, Person, Sect } from "../logic/types";
import { StoryStage } from "../logic/types";
import {
  genName,
  generateHiddenMaster,
  generateWorldMap,
  initSectRelations,
  rand,
} from "../logic/utils";

export interface WuxiaWorld {
  npcs: Person[];
  sects: Sect[];
  locations: LocationInfo[];
  heroId: string;
  stage: StoryStage;
  turnInStage: number;
  turn: number;
  party: string[];
  companionId?: string;
  flags: Record<string, any>;
  ended?: boolean;
}

export interface CreatedWuxiaWorld {
  world: WuxiaWorld;
  introduction: string;
}

export function createWuxiaWorld(): CreatedWuxiaWorld {
  const locations = generateWorldMap();
  // Clone canonical records so IDs, restrictions and descriptions stay in
  // sync with the map and with snippets that reference SECTS_DATA directly.
  const sects: Sect[] = SECTS_DATA.map((sect) => ({
    ...sect,
    relations: { ...(sect.relations || {}) },
    members: [],
    leader: undefined,
    locationId: locations.some((location) => location.id === sect.locationId)
      ? sect.locationId
      : locations.find((location) => location.type === "sect")?.id || locations[0].id,
  }));

  initSectRelations(sects);

  const npcs: Person[] = [];
  sects.forEach((sect) => {
    const leader: Person = {
      id: `npc_leader_${sect.id}`,
      name: genName("male"),
      sectId: sect.id,
      role: "leader",
      gender: "male",
      age: 50,
      status: "alive",
      relations: [],
      locationId: sect.locationId,
      inventory: [],
      flags: {},
      arts: [],
      knowledge: [],
      exp: 0,
      maxHp: 100,
    };
    npcs.push(leader);
    sect.leader = leader.id;
    sect.members?.push(leader.id);

    for (let index = 0; index < 2; index += 1) {
      const gender = Math.random() > 0.5 ? "male" : "female";
      npcs.push({
        id: `npc_${npcs.length}`,
        name: genName(gender),
        sectId: sect.id,
        role: "disciple",
        gender,
        age: 18,
        status: "alive",
        relations: [],
        locationId: sect.locationId,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: [],
        exp: 0,
        maxHp: 100,
      });
      sect.members?.push(npcs[npcs.length - 1].id);
    }
  });

  const hiddenMasterCount = 1 + Math.floor(Math.random() * 3);
  for (let index = 0; index < hiddenMasterCount; index += 1) {
    const hiddenMaster = generateHiddenMaster(npcs, sects, locations);
    // The legacy helper used Date.now() for IDs. Normalize here so rapid
    // generations cannot create duplicate NPC references.
    hiddenMaster.id = `npc_hidden_master_${index}`;
    npcs.push(hiddenMaster);
  }

  const heroSect = rand(sects);
  const master = npcs.find(
    (npc) => npc.sectId === heroSect.id && npc.role === "leader",
  );
  const heroLocation =
    locations.find(
      (location) => location.id === heroSect.locationId,
    ) || locations.find((location) => location.type === "sect");
  const hero: Person = {
    id: "hero",
    name: "你",
    sectId: heroSect.id,
    role: "disciple",
    gender: "male",
    age: 16,
    birthYear: new Date().getFullYear() - 16,
    status: "alive",
    relations: master
      ? [{ targetId: master.id, type: "apprentice", value: 50 }]
      : [],
    locationId: heroLocation?.id || locations[0].id,
    inventory: [],
    flags: {},
    arts: [],
    knowledge: ["rumor_duel"],
    exp: 0,
    maxHp: 100,
  };

  heroSect.members?.push(hero.id);

  if (master) {
    master.relations.push({
      targetId: hero.id,
      type: "apprentice",
      value: 50,
    });
  }

  return {
    world: {
      npcs: [...npcs, hero],
      sects,
      locations,
      heroId: hero.id,
      stage: StoryStage.BEGINNING,
      turnInStage: 0,
      turn: 0,
      party: [],
      flags: {},
    },
    introduction: `【世界生成完毕】 你出生在 ${heroSect.name}，师承掌门【${master?.name}】。`,
  };
}
