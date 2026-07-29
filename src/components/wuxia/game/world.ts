import { SECT_NAMES } from "../logic/constants";
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
  party: string[];
}

export interface CreatedWuxiaWorld {
  world: WuxiaWorld;
  introduction: string;
}

export function createWuxiaWorld(): CreatedWuxiaWorld {
  const locations = generateWorldMap();
  const sects: Sect[] = SECT_NAMES.map((name, index) => {
    const sectLocation = locations.find(
      (location) => location.id === `sect_${index}`,
    );
    return {
      id: `sect_${index}`,
      name,
      type: Math.random() > 0.7 ? "evil" : "good",
      locationId: sectLocation?.id || locations[0].id,
      relations: {},
    };
  });

  initSectRelations(sects);

  const npcs: Person[] = [];
  sects.forEach((sect) => {
    const leader: Person = {
      id: `npc_${npcs.length}`,
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
    };
    npcs.push(leader);

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
      });
    }
  });

  const hiddenMasterCount = 1 + Math.floor(Math.random() * 3);
  for (let index = 0; index < hiddenMasterCount; index += 1) {
    npcs.push(generateHiddenMaster(npcs, sects, locations));
  }

  const heroSect = rand(sects);
  const master = npcs.find(
    (npc) => npc.sectId === heroSect.id && npc.role === "leader",
  );
  const heroLocation =
    locations.find(
      (location) => location.id === `sect_${sects.indexOf(heroSect)}`,
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
  };

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
      party: [],
    },
    introduction: `【世界生成完毕】 你出生在 ${heroSect.name}，师承掌门【${master?.name}】。`,
  };
}
