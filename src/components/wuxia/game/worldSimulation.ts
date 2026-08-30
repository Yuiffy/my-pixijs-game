import { createSeededRandom } from "../../autoChessGame/core/engine/random";
import type { MartialLineage, StoryCharacter } from "./storyArchitecture";
import { WUXIA_FACTIONS, type WuxiaFactionId } from "./wuxiaRoster";

export type WorldRelationType =
  | "parent"
  | "child"
  | "adoptive_parent"
  | "adoptive_child"
  | "sibling"
  | "uncle"
  | "niece"
  | "master"
  | "disciple"
  | "sect_sibling"
  | "sworn_sibling"
  | "friend"
  | "companion"
  | "lover"
  | "crush"
  | "rival"
  | "enemy"
  | "debtor"
  | "creditor"
  | "protector";

export type TechniqueNature = "攻" | "守" | "身" | "控" | "破" | "医";
export type TechniqueRange = "贴身" | "近" | "中" | "远";
export type MartialSource = "家传" | "师授" | "秘籍" | "观摩" | "偷学" | "自创";
export type WorldLocationType = "sect" | "city" | "wild" | "village" | "inn" | "bridge" | "hall" | "house" | "pavilion" | "clinic";

export interface WorldLocation {
  id: string;
  name: string;
  type: WorldLocationType;
  descriptor: string;
  region: string;
  x: number;
  y: number;
  connections: string[];
  danger: number;
  tags: string[];
}

export interface MartialTechniqueDef {
  id: string;
  artId: string;
  name: string;
  nature: TechniqueNature;
  description: string;
  power: number;
  speed: number;
  accuracy: number;
  range: TechniqueRange;
  qiCost: number;
  cooldown: number;
  difficulty: number;
  tags: string[];
  counters: string[];
}

export interface WorldMartialArt {
  id: string;
  name: string;
  factionId: string;
  grade: "下乘" | "中乘" | "上乘" | "绝学";
  category: "外功" | "内功" | "轻功" | "医术";
  weapon: "拳掌" | "剑" | "刀" | "暗器" | "针" | "身法";
  lineage: string;
  principle: string;
  taboo: string;
  techniqueIds: string[];
}

export interface ActorTechnique {
  techniqueId: string;
  mastery: number;
  source: MartialSource;
  learnedDay: number;
  witnessedFromActorId?: string;
}

export interface ActorGoal {
  kind: "追踪" | "保护" | "寻证" | "赴约" | "归家" | "行医" | "巡守" | "寻人" | "挑战" | "联络" | "访友";
  targetActorId?: string;
  targetLocationId?: string;
  reason: string;
  priority: number;
}

export interface WorldMemory {
  day: number;
  kind: "相遇" | "选择" | "战斗" | "传闻" | "离别";
  text: string;
  actorIds: string[];
  locationId: string;
}

export interface WorldActor {
  id: string;
  characterId?: StoryCharacter["id"];
  name: string;
  title: string;
  role: string;
  factionId: string;
  locationId: string;
  homeLocationId: string;
  destinationId?: string;
  route: string[];
  activity: "停留" | "赶路" | "同行" | "潜伏" | "失踪" | "死亡";
  stayUntilDay: number;
  routineLocationIds: string[];
  goals: ActorGoal[];
  traits: string[];
  techniques: ActorTechnique[];
  memories: WorldMemory[];
}

export interface WorldRelation {
  id: string;
  fromActorId: string;
  toActorId: string;
  type: WorldRelationType;
  strength: number;
  knownToHero: boolean;
  secret: boolean;
  description: string;
  sinceDay: number;
}

export interface WorldManual {
  id: string;
  name: string;
  artId: string;
  techniqueIds: string[];
  state: "藏匿" | "携带" | "售出" | "归还" | "毁去";
  locationId?: string;
  ownerActorId?: string;
  provenance: string;
}

export interface WorldMovement {
  day: number;
  actorId: string;
  fromLocationId: string;
  toLocationId: string;
  reason: string;
}

export interface WorldEncounter {
  id: string;
  day: number;
  turn: number;
  eventId: string;
  locationId: string;
  actorIds: string[];
  baseChance: number;
  dramaticChance: number;
  roll: number;
  reason: string;
}

export interface WorldRumor {
  id: string;
  day: number;
  text: string;
  originLocationId: string;
  reachedLocationIds: string[];
  credibility: number;
}

export interface WorldTransition {
  turn: number;
  eventId: string;
  fromDay: number;
  toDay: number;
  heroPath: string[];
  presentActorIds: string[];
  movementIds: string[];
  encounterId?: string;
  travelProse: string;
}

export interface WuxiaWorldState {
  version: 2;
  seed: number;
  rngState: number;
  day: number;
  heroActorId: "hero";
  locations: WorldLocation[];
  actors: WorldActor[];
  relations: WorldRelation[];
  martialArts: WorldMartialArt[];
  techniques: MartialTechniqueDef[];
  manuals: WorldManual[];
  movements: WorldMovement[];
  encounters: WorldEncounter[];
  rumors: WorldRumor[];
  lastTransition?: WorldTransition;
}

export interface WorldSetupInput {
  seed: number;
  heroName: string;
  heroHomeId: string;
  affiliationName: string;
  locations: WorldLocation[];
  cast: StoryCharacter[];
  heroMartial: MartialLineage;
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const masteryStage = (value: number) => {
  if (value >= 82) return "融会";
  if (value >= 58) return "渐熟";
  if (value >= 32) return "初窥";
  return "生疏";
};

const technique = (
  artId: string,
  id: string,
  name: string,
  nature: TechniqueNature,
  description: string,
  stats: Pick<MartialTechniqueDef, "power" | "speed" | "accuracy" | "range" | "qiCost" | "cooldown" | "difficulty">,
  tags: string[],
  counters: string[],
): MartialTechniqueDef => ({ artId, id, name, nature, description, ...stats, tags, counters });

const createMartialCatalog = (input: WorldSetupInput) => {
  const heroArtId = "art_hero";
  const heroTechniqueStats: Array<Pick<MartialTechniqueDef, "nature" | "power" | "speed" | "accuracy" | "range" | "qiCost" | "cooldown" | "difficulty" | "tags" | "counters">> = [
    { nature: "攻", power: 44, speed: 68, accuracy: 76, range: "近", qiCost: 12, cooldown: 1, difficulty: 28, tags: ["试探", "连招"], counters: ["蓄力"] },
    { nature: "破", power: 68, speed: 58, accuracy: 70, range: "近", qiCost: 24, cooldown: 2, difficulty: 52, tags: ["破绽", "破甲"], counters: ["格挡", "虚招"] },
    { nature: "守", power: 84, speed: 46, accuracy: 82, range: "中", qiCost: 42, cooldown: 4, difficulty: 78, tags: ["绝式", "止战"], counters: ["强攻", "围攻"] },
  ];
  const heroTechniques = input.heroMartial.techniques.map((entry, index) => technique(
    heroArtId,
    entry.id,
    entry.name,
    heroTechniqueStats[index].nature,
    entry.description,
    heroTechniqueStats[index],
    heroTechniqueStats[index].tags,
    heroTechniqueStats[index].counters,
  ));
  const natureFor = (character: StoryCharacter): TechniqueNature => {
    const text = `${character.signatureMove}${character.signatureDescription}`;
    if (/治疗|回复|护航|医|救/.test(text)) return "医";
    if (/眩晕|控|时停|恐惧|击退/.test(text)) return "控";
    if (/护盾|格挡|逃生/.test(text)) return "守";
    if (/冲|跃|闪现|移速|滑跪/.test(text)) return "身";
    if (/削弱|降低|破/.test(text)) return "破";
    return "攻";
  };
  const signatureTechniques = input.cast.map((character, index) => {
    const nature = natureFor(character);
    const ranged = /射|弹|炮|光|扔|投|云/.test(`${character.signatureMove}${character.signatureDescription}`);
    return technique(
      `art_${character.id}`,
      `signature_${character.id}`,
      character.signatureMove,
      nature,
      character.signatureDescription,
      {
        power: 44 + ((index * 9 + input.seed) % 43),
        speed: 48 + ((index * 13 + input.seed) % 39),
        accuracy: 62 + ((index * 7 + input.seed) % 29),
        range: ranged ? "远" : nature === "身" ? "中" : "近",
        qiCost: 16 + ((index * 5 + input.seed) % 27),
        cooldown: 1 + (index % 4),
        difficulty: 38 + ((index * 11 + input.seed) % 47),
      },
      [character.circles[0] || character.title, nature === "医" ? "救援" : nature === "控" ? "控场" : "独门"],
      nature === "守" ? ["破甲"] : nature === "身" ? ["封路"] : nature === "医" ? ["流血"] : ["格挡"],
    );
  });
  const techniques = [...heroTechniques, ...signatureTechniques];
  const martialArts: WorldMartialArt[] = [
    {
      id: heroArtId,
      name: input.heroMartial.name,
      factionId: "home",
      grade: "上乘",
      category: "外功",
      weapon: input.heroMartial.name.includes("剑") ? "剑" : input.heroMartial.name.includes("步") ? "身法" : "拳掌",
      lineage: input.heroMartial.origin,
      principle: input.heroMartial.philosophy,
      taboo: input.heroMartial.cost,
      techniqueIds: heroTechniques.map((entry) => entry.id),
    },
    ...input.cast.map((character, index): WorldMartialArt => ({
      id: `art_${character.id}`,
      name: `${character.signatureMove}谱`,
      factionId: character.factionId,
      grade: index < 2 ? "绝学" : index < 5 ? "上乘" : "中乘",
      category: natureFor(character) === "医" ? "医术" : natureFor(character) === "身" ? "轻功" : "外功",
      weapon: /针|医/.test(character.signatureMove) ? "针" : /射|弹|炮|扔/.test(character.signatureMove) ? "暗器" : natureFor(character) === "身" ? "身法" : "拳掌",
      lineage: `江湖人据${character.sourceName}最常使的路数整理而成，招意仍保留原主性情。`,
      principle: `先懂${character.name}为何使出这一招，才算真正学会“${character.signatureMove}”。`,
      taboo: character.fear,
      techniqueIds: [`signature_${character.id}`],
    })),
  ];
  return { martialArts, techniques };
};

const relation = (
  fromActorId: string,
  toActorId: string,
  type: WorldRelationType,
  strength: number,
  knownToHero: boolean,
  secret: boolean,
  description: string,
): WorldRelation => ({
  id: `rel-${fromActorId}-${toActorId}-${type}`,
  fromActorId,
  toActorId,
  type,
  strength,
  knownToHero,
  secret,
  description,
  sinceDay: 0,
});

const castActor = (
  cast: StoryCharacter[],
  characterId: StoryCharacter["id"],
  input: Omit<WorldActor, "id" | "characterId" | "name" | "title" | "memories" | "route">,
): WorldActor => {
  const character = cast.find((entry) => entry.id === characterId)!;
  return {
    ...input,
    id: `actor_${characterId}`,
    characterId,
    name: character.name,
    title: character.title,
    route: [],
    memories: [],
  };
};

const actorTechnique = (techniqueId: string, mastery: number, source: MartialSource): ActorTechnique => ({
  techniqueId,
  mastery,
  source,
  learnedDay: 0,
});

export const createWorldSimulation = (input: WorldSetupInput): WuxiaWorldState => {
  const rng = createSeededRandom(input.seed + 9187);
  const { martialArts, techniques } = createMartialCatalog(input);
  const heroFirstTechnique = input.heroMartial.techniques[0].id;
  const availableLocations = input.locations.map((entry) => entry.id);
  const goalKinds: ActorGoal["kind"][] = ["追踪", "保护", "寻证", "赴约", "归家", "行医", "巡守", "寻人", "挑战", "联络", "访友"];
  const coreGoalKinds: ActorGoal["kind"][] = ["挑战", "寻证", "保护", "赴约"];
  const coreRotation = input.seed % coreGoalKinds.length;
  const rotatedCoreGoals = [...coreGoalKinds.slice(coreRotation), ...coreGoalKinds.slice(0, coreRotation)];
  const remainingGoals = goalKinds
    .filter((kind) => !coreGoalKinds.includes(kind))
    .map((kind) => ({ kind, rank: rng.next() }))
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => entry.kind);
  const goalPlan = [...rotatedCoreGoals, ...remainingGoals];
  const castActors = input.cast.map((character, index) => {
    const homeLocationId = WUXIA_FACTIONS[character.factionId as WuxiaFactionId]?.homeLocationId || input.heroHomeId;
    const startCandidates = availableLocations.filter((id) => id !== input.heroHomeId);
    const startLocationId = index % 3 === 0 ? homeLocationId : startCandidates[Math.floor(rng.next() * startCandidates.length)] || homeLocationId;
    const targetCharacter = input.cast[(index + 1 + Math.floor(rng.next() * Math.max(1, input.cast.length - 1))) % input.cast.length];
    const targetActorId = `actor_${targetCharacter.id}`;
    const routinePool = [homeLocationId, "city_luoyang", "inn_tingyu", "hall_changhe", startLocationId]
      .filter((id, itemIndex, items) => availableLocations.includes(id) && items.indexOf(id) === itemIndex);
    const goalKind = goalPlan[index % goalPlan.length];
    return castActor(input.cast, character.id, {
      role: character.role,
      factionId: character.factionId,
      locationId: startLocationId,
      homeLocationId,
      activity: rng.next() < 0.22 ? "潜伏" : "停留",
      stayUntilDay: 1 + Math.floor(rng.next() * 4),
      routineLocationIds: routinePool,
      goals: [{
        kind: goalKind,
        ...(goalKind === "归家" ? { targetLocationId: homeLocationId } : { targetActorId }),
        reason: character.desire,
        priority: 56 + Math.floor(rng.next() * 38),
      }],
      traits: [character.title, ...character.circles],
      techniques: [actorTechnique(`signature_${character.id}`, 46 + Math.floor(rng.next() * 43), index < 2 ? "自创" : "师授")],
    });
  });
  const actors: WorldActor[] = [{
    id: "hero",
    name: input.heroName,
    title: "执卷人",
    role: "会改变他人行程与关系的玩家角色",
    factionId: "hero",
    locationId: input.heroHomeId,
    homeLocationId: input.heroHomeId,
    route: [],
    activity: "停留",
    stayUntilDay: 0,
    routineLocationIds: [input.heroHomeId, "city_luoyang", "inn_tingyu"].filter((id) => availableLocations.includes(id)),
    goals: [{ kind: "寻人", targetActorId: castActors[0]?.id, reason: "在自行运转的江湖里找到值得同行或交手的人", priority: 72 }],
    traits: ["执着", "可被玩家改变"],
    techniques: [actorTechnique(heroFirstTechnique, input.heroMartial.techniques[0].mastery, "师授")],
    memories: [],
  }, ...castActors];
  const relations: WorldRelation[] = [];
  for (let leftIndex = 0; leftIndex < input.cast.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < input.cast.length; rightIndex += 1) {
      const left = input.cast[leftIndex];
      const right = input.cast[rightIndex];
      const leftActorId = `actor_${left.id}`;
      const rightActorId = `actor_${right.id}`;
      const sharedCircles = left.circles.filter((circle) => right.circles.includes(circle));
      if (sharedCircles.length) {
        const description = `${left.name}与${right.name}同属${sharedCircles.join("、")}关系圈，这段旧识在江湖上早已有迹可循。`;
        relations.push(relation(leftActorId, rightActorId, "friend", 62 + sharedCircles.length * 6, true, false, description));
        relations.push(relation(rightActorId, leftActorId, "friend", 62 + sharedCircles.length * 6, true, false, description));
      }
      if (left.factionId === right.factionId) {
        const factionName = WUXIA_FACTIONS[left.factionId as WuxiaFactionId]?.name || input.affiliationName;
        const description = `${left.name}与${right.name}同属${factionName}，往日虽听过彼此名号，却未必有过深交。`;
        relations.push(relation(leftActorId, rightActorId, "sect_sibling", 38, true, false, description));
        relations.push(relation(rightActorId, leftActorId, "sect_sibling", 38, true, false, description));
      }
    }
  }
  const generatedRelations: Array<{
    type: WorldRelationType;
    reverseType: WorldRelationType;
    story: string;
  }> = [
    { type: "sibling", reverseType: "sibling", story: "一段不愿在门派名册里公开的手足旧缘" },
    { type: "enemy", reverseType: "enemy", story: "一次至今无人肯先放下的旧仇" },
    { type: "master", reverseType: "disciple", story: "一场只传过半招的秘密师承" },
    { type: "debtor", reverseType: "creditor", story: "一笔尚未还清的救命人情" },
    { type: "protector", reverseType: "debtor", story: "一次没有对外承认的暗中护持" },
    { type: "sworn_sibling", reverseType: "sworn_sibling", story: "一场不设香案的结义" },
    { type: "rival", reverseType: "rival", story: "一份谁也不肯作废的胜负之约" },
  ];
  const rotation = input.cast.length ? input.seed % input.cast.length : 0;
  generatedRelations.slice(0, Math.max(0, input.cast.length - 1)).forEach((blueprint, index) => {
    const left = input.cast[(rotation + index) % input.cast.length];
    const right = input.cast[(rotation + index + 1) % input.cast.length];
    if (!left || !right || left.id === right.id) return;
    const description = `${left.name}与${right.name}之间藏着${blueprint.story}，知情者一直没有把它写进公开名册。`;
    relations.push(relation(`actor_${left.id}`, `actor_${right.id}`, blueprint.type, 50 + index * 4, false, true, description));
    relations.push(relation(`actor_${right.id}`, `actor_${left.id}`, blueprint.reverseType, 46 + index * 4, false, true, description));
  });
  return {
    version: 2,
    seed: input.seed,
    rngState: rng.snapshot(),
    day: 0,
    heroActorId: "hero",
    locations: input.locations.map((entry) => ({ ...entry, connections: [...entry.connections], tags: [...entry.tags] })),
    actors,
    relations,
    martialArts,
    techniques,
    manuals: input.cast.slice(0, 3).map((character, index) => ({
      id: `manual_${character.id}`,
      name: `《${character.signatureMove}·抄本》`,
      artId: `art_${character.id}`,
      techniqueIds: [`signature_${character.id}`],
      state: "藏匿" as const,
      locationId: availableLocations[(index * 3 + input.seed) % availableLocations.length],
      provenance: `${character.name}的一次公开演练被旁观者拆成招式图，后来又几经转手，今日落在何处，连原主也未必知情。`,
    })),
    movements: [],
    encounters: [],
    rumors: [],
  };
};

export const findWorldPath = (world: Pick<WuxiaWorldState, "locations">, fromId: string, toId: string): string[] => {
  if (fromId === toId) return [];
  const queue: Array<{ id: string; path: string[] }> = [{ id: fromId, path: [] }];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    if (current.id === toId) return current.path;
    visited.add(current.id);
    const location = world.locations.find((entry) => entry.id === current.id);
    location?.connections.forEach((nextId) => {
      if (!visited.has(nextId)) queue.push({ id: nextId, path: [...current.path, nextId] });
    });
  }
  return [];
};

export const worldDistance = (world: Pick<WuxiaWorldState, "locations">, fromId: string, toId: string) => {
  if (fromId === toId) return 0;
  const path = findWorldPath(world, fromId, toId);
  return path.length || 99;
};

export const focusActorsForEvent = (eventId: string): string[] => eventId
  .split(":")
  .filter((part) => part.startsWith("actor_character_"));

const cloneWorld = (world: WuxiaWorldState): WuxiaWorldState => ({
  ...world,
  locations: world.locations.map((entry) => ({ ...entry, connections: [...entry.connections], tags: [...entry.tags] })),
  actors: world.actors.map((actor) => ({
    ...actor,
    route: [...actor.route],
    routineLocationIds: [...actor.routineLocationIds],
    goals: actor.goals.map((goal) => ({ ...goal })),
    traits: [...actor.traits],
    techniques: actor.techniques.map((entry) => ({ ...entry })),
    memories: actor.memories.map((memory) => ({ ...memory, actorIds: [...memory.actorIds] })),
  })),
  relations: world.relations.map((entry) => ({ ...entry })),
  martialArts: world.martialArts.map((entry) => ({ ...entry, techniqueIds: [...entry.techniqueIds] })),
  techniques: world.techniques.map((entry) => ({ ...entry, tags: [...entry.tags], counters: [...entry.counters] })),
  manuals: world.manuals.map((entry) => ({ ...entry, techniqueIds: [...entry.techniqueIds] })),
  movements: world.movements.map((entry) => ({ ...entry })),
  encounters: world.encounters.map((entry) => ({ ...entry, actorIds: [...entry.actorIds] })),
  rumors: world.rumors.map((entry) => ({ ...entry, reachedLocationIds: [...entry.reachedLocationIds] })),
  ...(world.lastTransition ? { ...world.lastTransition, heroPath: [...world.lastTransition.heroPath], presentActorIds: [...world.lastTransition.presentActorIds], movementIds: [...world.lastTransition.movementIds] } : {}),
});

const locationName = (world: WuxiaWorldState, id: string) => world.locations.find((entry) => entry.id === id)?.name || id;

const moveActor = (world: WuxiaWorldState, actor: WorldActor, toLocationId: string, day: number, reason: string) => {
  if (actor.locationId === toLocationId) return;
  const movement: WorldMovement = {
    day,
    actorId: actor.id,
    fromLocationId: actor.locationId,
    toLocationId,
    reason,
  };
  actor.locationId = toLocationId;
  actor.activity = actor.id === "hero" ? "赶路" : actor.activity === "同行" ? "同行" : "赶路";
  world.movements.push(movement);
};

const strongestRelation = (world: WuxiaWorldState, fromActorId: string, toActorId: string) => world.relations
  .filter((entry) => entry.fromActorId === fromActorId && entry.toActorId === toActorId)
  .sort((left, right) => right.strength - left.strength)[0];

export const advanceWorldToScene = (
  source: WuxiaWorldState,
  input: {
    turn: number;
    eventId: string;
    targetLocationId: string;
    companionActorIds: string[];
    focusActorIds?: string[];
  },
): WuxiaWorldState => {
  const world = cloneWorld(source);
  const rng = createSeededRandom(world.rngState);
  const hero = world.actors.find((actor) => actor.id === "hero")!;
  const fromLocationId = hero.locationId;
  const heroRoute = findWorldPath(world, hero.locationId, input.targetLocationId);
  const route = heroRoute.length || hero.locationId === input.targetLocationId ? heroRoute : [];
  const focusIds = input.focusActorIds?.length ? input.focusActorIds : focusActorsForEvent(input.eventId);
  const fromDay = world.day;
  const focusTravelDays = focusIds.reduce((longest, actorId) => {
    const actor = world.actors.find((entry) => entry.id === actorId);
    if (!actor || input.companionActorIds.includes(actor.id)) return longest;
    const distance = worldDistance(world, actor.locationId, input.targetLocationId);
    return distance === 99 ? longest : Math.max(longest, distance);
  }, 0);
  const elapsedDays = Math.max(1, route.length, focusTravelDays);
  const movementStart = world.movements.length;

  for (let offset = 1; offset <= elapsedDays; offset += 1) {
    const day = fromDay + offset;
    const heroNext = route[offset - 1];
    if (heroNext) moveActor(world, hero, heroNext, day, "沿故事线索赶路");

    world.actors.forEach((actor) => {
      if (actor.id === "hero" || ["死亡", "失踪"].includes(actor.activity)) return;
      if (input.companionActorIds.includes(actor.id)) {
        moveActor(world, actor, hero.locationId, day, "与主角同行");
        actor.activity = "同行";
        actor.route = [];
        return;
      }
      const isFocus = focusIds.includes(actor.id);
      const { destinationId: scheduledDestinationId } = actor;
      let destinationId = scheduledDestinationId;
      if (isFocus) destinationId = input.targetLocationId;
      if (!destinationId && actor.goals[0]?.targetActorId) {
        const target = world.actors.find((entry) => entry.id === actor.goals[0].targetActorId);
        if (target && (isFocus || rng.next() < actor.goals[0].priority / 240)) destinationId = target.locationId;
      }
      if (!destinationId && actor.goals[0]?.targetLocationId && (isFocus || rng.next() < actor.goals[0].priority / 260)) {
        destinationId = actor.goals[0].targetLocationId;
      }
      if (!destinationId && day > actor.stayUntilDay && rng.next() < 0.24 && actor.routineLocationIds.length > 1) {
        destinationId = rng.pick(actor.routineLocationIds.filter((entry) => entry !== actor.locationId));
      }
      if (!destinationId || destinationId === actor.locationId) {
        actor.activity = actor.activity === "潜伏" ? "潜伏" : "停留";
        return;
      }
      const actorRoute = findWorldPath(world, actor.locationId, destinationId);
      const next = actorRoute[0];
      if (next) {
        moveActor(world, actor, next, day, isFocus ? "因关键人物与线索赶往同一地点" : actor.goals[0]?.reason || "按日常行程移动");
        actor.route = actorRoute.slice(1);
        actor.destinationId = destinationId;
        if (next === destinationId) {
          actor.destinationId = undefined;
          actor.route = [];
          actor.activity = actor.traits.includes("潜伏") ? "潜伏" : "停留";
          actor.stayUntilDay = day + 1 + Math.floor(rng.next() * 3);
        }
      }
    });
  }
  world.day = fromDay + elapsedDays;
  hero.activity = "停留";
  input.companionActorIds.forEach((actorId) => {
    const actor = world.actors.find((entry) => entry.id === actorId);
    if (actor) {
      actor.locationId = hero.locationId;
      actor.activity = "同行";
    }
  });

  const present = world.actors.filter((actor) => actor.locationId === hero.locationId && actor.id !== "hero" && !["死亡", "失踪"].includes(actor.activity));
  const focusedPresent = present.filter((actor) => focusIds.includes(actor.id));
  const encounterActors = focusedPresent.length ? focusedPresent : present.filter(() => rng.next() < 0.35).slice(0, 2);
  let encounter: WorldEncounter | undefined;
  if (encounterActors.length) {
    const strongest = encounterActors.reduce((best, actor) => {
      const current = strongestRelation(world, "hero", actor.id)?.strength || 0;
      return current > best ? current : best;
    }, 0);
    const baseChance = Math.round(clamp(8 + strongest * 0.12, 5, 28) * 100) / 100;
    const dramaticChance = Math.round(clamp(baseChance + (focusedPresent.length ? 56 : 14) + Math.min(14, input.turn * 1.2), 8, 94) * 100) / 100;
    const roll = Math.round(rng.next() * 10000) / 100;
    encounter = {
      id: `encounter-${input.turn}-${input.eventId}`,
      day: world.day,
      turn: input.turn,
      eventId: input.eventId,
      locationId: hero.locationId,
      actorIds: ["hero", ...encounterActors.map((actor) => actor.id)],
      baseChance,
      dramaticChance,
      roll,
      reason: focusedPresent.length
        ? "原是缘浅的一次错身，共同目标与未清旧债却把几条路牵到了一处。"
        : "同地停留与沿路传闻让这场偶遇不再只是巧合。",
    };
    world.encounters.push(encounter);
    const memory: WorldMemory = {
      day: world.day,
      kind: "相遇",
      text: `${encounterActors.map((actor) => actor.name).join("、")}在${locationName(world, hero.locationId)}与主角相遇。`,
      actorIds: encounter.actorIds,
      locationId: hero.locationId,
    };
    encounterActors.forEach((actor) => actor.memories.push(memory));
    hero.memories.push(memory);
  }
  const pathNames = [fromLocationId, ...route].filter((entry, index, list) => index === 0 || entry !== list[index - 1]).map((id) => locationName(world, id));
  const movementIds = world.movements.slice(movementStart).map((entry) => `${entry.day}-${entry.actorId}-${entry.toLocationId}`);
  world.lastTransition = {
    turn: input.turn,
    eventId: input.eventId,
    fromDay,
    toDay: world.day,
    heroPath: [fromLocationId, ...route],
    presentActorIds: present.map((actor) => actor.id),
    movementIds,
    ...(encounter ? { encounterId: encounter.id } : {}),
    travelProse: pathNames.length > 1
      ? `你从${pathNames[0]}赶了几程，沿${pathNames.slice(1, -1).join("、") || "一段无人官道"}抵达${pathNames[pathNames.length - 1]}。一路上，江湖里的其他人也在各自赶路。`
      : `你在${pathNames[0]}略作停留。看似没有换地方，江湖里其余人的位置却已经不同。`,
  };
  world.rngState = rng.snapshot();
  return world;
};

const upsertRelation = (
  world: WuxiaWorldState,
  fromActorId: string,
  toActorId: string,
  type: WorldRelationType,
  delta: number,
  description: string,
  knownToHero = true,
) => {
  const existing = world.relations.find((entry) => entry.fromActorId === fromActorId && entry.toActorId === toActorId && entry.type === type);
  if (existing) {
    existing.strength = clamp(existing.strength + delta);
    existing.knownToHero = existing.knownToHero || knownToHero;
    existing.description = description;
    return;
  }
  world.relations.push({
    ...relation(fromActorId, toActorId, type, clamp(delta), knownToHero, false, description),
    sinceDay: world.day,
  });
};

const revealRelations = (world: WuxiaWorldState, actorIds: string[]) => {
  world.relations.forEach((entry) => {
    if (actorIds.includes(entry.fromActorId) || actorIds.includes(entry.toActorId)) entry.knownToHero = true;
  });
};

const teachTechnique = (
  world: WuxiaWorldState,
  techniqueId: string,
  source: MartialSource,
  mastery: number,
  witnessedFromActorId?: string,
) => {
  const hero = world.actors.find((actor) => actor.id === "hero")!;
  const existing = hero.techniques.find((entry) => entry.techniqueId === techniqueId);
  if (existing) {
    existing.mastery = clamp(Math.max(existing.mastery, mastery));
    if (witnessedFromActorId) existing.witnessedFromActorId = witnessedFromActorId;
    if (source === "师授" && existing.source === "偷学") existing.source = "师授";
    return;
  }
  hero.techniques.push({
    techniqueId,
    mastery,
    source,
    learnedDay: world.day,
    ...(witnessedFromActorId ? { witnessedFromActorId } : {}),
  });
};

export const applyWorldChoice = (
  source: WuxiaWorldState,
  input: {
    turn: number;
    eventId: string;
    choiceId: string;
    success: boolean;
    companionActorIds: string[];
    combatSummary?: string;
    combatTechniqueIds?: string[];
  },
): { world: WuxiaWorldState; discoveries: string[] } => {
  const world = cloneWorld(source);
  const discoveries: string[] = [];
  const relationTarget = input.companionActorIds[0] || "actor_rain_witness";
  const hero = world.actors.find((actor) => actor.id === "hero")!;
  const targetActor = world.actors.find((actor) => actor.id === relationTarget);
  const addMemory = (text: string, actorIds: string[]) => {
    const memory: WorldMemory = { day: world.day, kind: "选择", text, actorIds, locationId: hero.locationId };
    actorIds.forEach((actorId) => world.actors.find((actor) => actor.id === actorId)?.memories.push(memory));
  };
  const choiceParts = input.choiceId.split(":");
  const dynamicActorId = choiceParts[1];
  const dynamicActor = world.actors.find((actor) => actor.id === dynamicActorId);
  if (input.choiceId.startsWith("sandbox-aid:") && dynamicActor) {
    upsertRelation(world, "hero", dynamicActor.id, "protector", input.success ? 62 : 24, `你在${locationName(world, hero.locationId)}介入了${dynamicActor.name}的当前目标。`, true);
    upsertRelation(world, dynamicActor.id, "hero", input.success ? "debtor" : "rival", input.success ? 58 : 22, `${dynamicActor.name}记住了这次援手的结果。`, true);
    if (input.companionActorIds.includes(dynamicActor.id)) dynamicActor.activity = "同行";
    discoveries.push(input.success ? `${dynamicActor.name}与你结下一笔可继续发展的同行人情` : `${dynamicActor.name}对这次介入留下疑问`);
  }
  if (input.choiceId.startsWith("sandbox-duel:") && dynamicActor) {
    upsertRelation(world, "hero", dynamicActor.id, "rival", input.success ? 58 : 44, `你以真实招式向${dynamicActor.name}请教。`, true);
    upsertRelation(world, dynamicActor.id, "hero", "rival", input.success ? 54 : 46, `${dynamicActor.name}认可这场过招会有下一次。`, true);
    const signatureId = dynamicActor.techniques[0]?.techniqueId;
    if (signatureId) {
      teachTechnique(world, signatureId, "观摩", input.success ? 18 : 10, dynamicActor.id);
      const name = world.techniques.find((entry) => entry.id === signatureId)?.name || signatureId;
      discoveries.push(`从${dynamicActor.name}的实战中观摩“${name}”`);
    }
  }
  if (input.choiceId.startsWith("sandbox-observe:") && dynamicActor) {
    revealRelations(world, [dynamicActor.id]);
    if (input.success) {
      const signatureId = dynamicActor.techniques[0]?.techniqueId;
      if (signatureId) {
        teachTechnique(world, signatureId, "偷学", 12, dynamicActor.id);
        discoveries.push(`偷学到${dynamicActor.name}的“${world.techniques.find((entry) => entry.id === signatureId)?.name || signatureId}”入门劲路`);
      }
    } else {
      upsertRelation(world, dynamicActor.id, "hero", "rival", 20, `${dynamicActor.name}发现你在暗中观招。`, true);
    }
  }
  if (input.choiceId.startsWith("campaign-bond:") && dynamicActor) {
    const intent = choiceParts[2];
    if (intent === "romance") {
      upsertRelation(world, "hero", dynamicActor.id, "crush", input.success ? 34 : 16, `你向${dynamicActor.name}坦白了愿意进一步相知的心意。`, true);
      upsertRelation(world, dynamicActor.id, "hero", "crush", input.success ? 26 : 10, `${dynamicActor.name}没有让这句话被当作从未发生。`, true);
      discoveries.push(input.success ? `你与${dynamicActor.name}之间有了尚待回应的情意` : `${dynamicActor.name}希望先保留这段关系原本的步调`);
    } else if (intent === "befriend") {
      upsertRelation(world, "hero", dynamicActor.id, "friend", input.success ? 26 : 12, `你与${dynamicActor.name}共同做完了一件具体的事。`, true);
      upsertRelation(world, dynamicActor.id, "hero", "friend", input.success ? 24 : 10, `${dynamicActor.name}愿意下次不再从客套开始。`, true);
      discoveries.push(`${dynamicActor.name}与你的信任有了可以追溯的来处`);
    } else if (intent === "observe") {
      upsertRelation(world, "hero", dynamicActor.id, "friend", input.success ? 12 : 6, `你没有急着给与${dynamicActor.name}的关系定名。`, true);
      revealRelations(world, [dynamicActor.id]);
      discoveries.push(`你记住了${dynamicActor.name}今日真正关心的事`);
    }
  }
  if (input.choiceId.startsWith("campaign-defer:") && dynamicActor) {
    addMemory(`你没有强留${dynamicActor.name}，只记下了对方下一段行程。`, ["hero", dynamicActor.id]);
    discoveries.push(`对${dynamicActor.name}的追寻已保留，可在以后恢复`);
  }
  if (input.choiceId.startsWith("campaign-train:") && dynamicActorId) {
    const practiced = hero.techniques.find((entry) => entry.techniqueId === dynamicActorId);
    if (practiced) {
      const previousStage = masteryStage(practiced.mastery);
      practiced.mastery = clamp(practiced.mastery + (input.success ? 8 : 4));
      const nextStage = masteryStage(practiced.mastery);
      const techniqueName = world.techniques.find((entry) => entry.id === practiced.techniqueId)?.name || practiced.techniqueId;
      discoveries.push(previousStage === nextStage
        ? `“${techniqueName}”的落点比昨日更稳`
        : `“${techniqueName}”由${previousStage}渐入${nextStage}`);
    }
  }
  if (input.choiceId.startsWith("campaign-opportunity-study:") && dynamicActor) {
    const signatureId = dynamicActor.techniques[0]?.techniqueId;
    if (signatureId && input.success) teachTechnique(world, signatureId, "观摩", 16, dynamicActor.id);
    revealRelations(world, [dynamicActor.id]);
    discoveries.push(input.success ? `你从公开演武中辨清${dynamicActor.name}的招式来路` : `你至少排除了两种错误的门派判断`);
  }
  if (input.choiceId.startsWith("campaign-opportunity-social:") && dynamicActor) {
    upsertRelation(world, "hero", dynamicActor.id, "friend", input.success ? 30 : 12, `你在公开活动中与${dynamicActor.name}交换了下一次可拜访的地点。`, true);
    upsertRelation(world, dynamicActor.id, "hero", "friend", input.success ? 24 : 10, `${dynamicActor.name}知道你并非只为名次而来。`, true);
    discoveries.push(input.success ? `${dynamicActor.name}成为可以主动拜访的人` : `你辨清了${dynamicActor.name}在活动中的立场`);
  }
  if (input.choiceId.startsWith("campaign-opportunity-rescue:") && dynamicActor) {
    upsertRelation(world, dynamicActor.id, "hero", "debtor", input.success ? 42 : 20, `${dynamicActor.name}见证你先救人、后争奇遇。`, true);
  }
  const supportiveChoice = /^sandbox-(guard|tend|decoy|warn|deliver|separate|back|repay|broker|keep-secret|reconcile|carry-message):/.test(input.choiceId);
  const investigativeChoice = /^sandbox-(track|lure|terms|witness|mediate|shadow|proof|reveal|ask-truth):/.test(input.choiceId);
  const martialChoice = /^sandbox-(confront|ask-teach|compare):/.test(input.choiceId);
  if (supportiveChoice && dynamicActor) {
    const strength = input.success ? 58 : 28;
    upsertRelation(world, "hero", dynamicActor.id, "protector", strength, `你在${locationName(world, hero.locationId)}介入了${dynamicActor.name}正在承担的事。`, true);
    upsertRelation(world, dynamicActor.id, "hero", input.success ? "friend" : "rival", input.success ? 52 : 20, `${dynamicActor.name}会把这次选择带到下一次相逢。`, true);
    if (input.companionActorIds.includes(dynamicActor.id)) dynamicActor.activity = "同行";
    const focusedActors = focusActorsForEvent(input.eventId);
    if (focusedActors.length > 1) revealRelations(world, focusedActors);
    discoveries.push(input.success ? `${dynamicActor.name}记下了这份能继续生长的人情` : `${dynamicActor.name}对你的介入仍有保留`);
  }
  if (investigativeChoice && dynamicActor) {
    const focusActorIds = Array.from(new Set([dynamicActor.id, ...focusActorsForEvent(input.eventId)]));
    revealRelations(world, focusActorIds);
    upsertRelation(world, dynamicActor.id, "hero", input.success ? "friend" : "rival", input.success ? 34 : 18, `${dynamicActor.name}知道你已经看见这段行程背后的部分实情。`, true);
    discoveries.push(input.success ? `${dynamicActor.name}牵连的一段行程与旧识有了清楚来路` : `这次追问仍让${dynamicActor.name}露出了一处破绽`);
  }
  if (martialChoice && dynamicActor) {
    const signatureId = dynamicActor.techniques[0]?.techniqueId;
    upsertRelation(world, "hero", dynamicActor.id, input.choiceId.startsWith("sandbox-ask-teach:") ? "disciple" : "rival", input.success ? 54 : 38, `你与${dynamicActor.name}围绕一门真实招式有过往来。`, true);
    upsertRelation(world, dynamicActor.id, "hero", input.choiceId.startsWith("sandbox-ask-teach:") ? "master" : "rival", input.success ? 50 : 36, `${dynamicActor.name}记住了你如何理解这门招式。`, true);
    if (signatureId) {
      const martialSource: MartialSource = input.choiceId.startsWith("sandbox-ask-teach:") ? "师授" : "观摩";
      teachTechnique(world, signatureId, martialSource, input.success ? 20 : 11, dynamicActor.id);
      const name = world.techniques.find((entry) => entry.id === signatureId)?.name || signatureId;
      discoveries.push(`${input.success ? "领会" : "记下"}${dynamicActor.name}的“${name}”劲路`);
    }
    revealRelations(world, focusActorsForEvent(input.eventId));
  }
  if (input.choiceId.startsWith("sandbox-place-")) {
    const placeResult = input.success ? "此地留下的物证与传闻已有了可追来路" : "这桩地方异闻虽然生变，仍留下了下一处可查的痕迹";
    discoveries.push(placeResult);
    addMemory(placeResult, ["hero"]);
  }
  if (input.choiceId.startsWith("sandbox-fallout-")) {
    const reachedLocationIds = world.locations
      .filter((location) => worldDistance(world, hero.locationId, location.id) <= 2)
      .map((location) => location.id);
    world.rumors.push({
      id: `rumor-fallout-${input.turn}`,
      day: world.day,
      text: input.success ? "主角亲手改写了一段正在传开的说法。" : "关于主角上一回选择的传闻又添了新的版本。",
      originLocationId: hero.locationId,
      reachedLocationIds,
      credibility: input.success ? 78 : 46,
    });
    discoveries.push(input.success ? "上一回的选择不再只由旁人转述" : "传闻虽然未能平息，却暴露了谁在推波助澜");
  }
  if (input.choiceId.startsWith("sandbox-manual-")) {
    const manual = world.manuals.find((entry) => entry.id === dynamicActorId);
    if (manual && input.choiceId.startsWith("sandbox-manual-learn:")) {
      manual.state = "携带";
      manual.ownerActorId = "hero";
      manual.locationId = undefined;
      manual.techniqueIds.forEach((techniqueId) => teachTechnique(world, techniqueId, "秘籍", input.success ? 24 : 10));
      discoveries.push(`取得${manual.name}并${input.success ? "学会其中新招" : "记下尚未练顺的劲路"}`);
    } else if (manual && input.choiceId.startsWith("sandbox-manual-trace:")) {
      discoveries.push(`${manual.name}的流转来历已被记入江湖志`);
    }
  }
  switch (input.choiceId) {
    case "invite-companion":
      upsertRelation(world, "hero", "actor_rain_witness", "companion", 72, "你在听雨渡主动邀她同行。", true);
      upsertRelation(world, "actor_rain_witness", "hero", "companion", 64, "她把左侧的风交给了你。", true);
      world.actors.find((actor) => actor.id === "actor_rain_witness")!.activity = "同行";
      discoveries.push("宁照雪的行程改为与你同行");
      break;
    case "trade-clue":
      upsertRelation(world, "hero", "actor_rain_witness", "friend", input.success ? 38 : 18, "你们以半句真话换了半句真话。", true);
      break;
    case "leave-rain":
      upsertRelation(world, "actor_rain_witness", "hero", "rival", 24, "你在听雨渡拒绝同行，她决定从另一条路查案。", true);
      break;
    case "trust-companion":
      upsertRelation(world, "hero", relationTarget, "protector", input.success ? 58 : 24, "伏击中，你把后背交给了同行之人。", true);
      upsertRelation(world, relationTarget, "hero", "protector", input.success ? 66 : 30, "对方替你挡住了窗外第一箭。", true);
      revealRelations(world, [relationTarget]);
      discoveries.push(`${targetActor?.name || "同行之人"}与归潮阁的隐秘关系被揭开`);
      break;
    case "burn-evidence":
      upsertRelation(world, relationTarget, "hero", "debtor", 74, "你烧掉证据，先救下了眼前的人。", true);
      break;
    case "accept-duel":
      upsertRelation(world, "hero", "actor_grey_rival", "rival", input.success ? 62 : 48, "你在黑风岭接下三招。", true);
      revealRelations(world, ["actor_grey_rival", "actor_mentor"]);
      discoveries.push("灰衣剑客与你原是同门，他也是师长最早逐出的弟子");
      break;
    case "read-sword":
      teachTechnique(world, world.actors.find((actor) => actor.id === "actor_grey_rival")?.techniques[1]?.techniqueId || "tide_listen", input.success ? "观摩" : "偷学", input.success ? 24 : 12, "actor_grey_rival");
      revealRelations(world, ["actor_grey_rival", "actor_mentor"]);
      discoveries.push("你从第三招里观摩到一式本不该外传的同门剑理");
      break;
    case "learn-manual": {
      const manual = world.manuals.find((entry) => entry.id === "manual_broken_tide")!;
      manual.state = "携带";
      manual.ownerActorId = "hero";
      manual.locationId = undefined;
      teachTechnique(world, "borrowed_breath", "秘籍", input.success ? 22 : 10);
      discoveries.push("学会《无相潮生篇》残式“借潮换息”");
      break;
    }
    case "sell-manual": {
      const manual = world.manuals.find((entry) => entry.id === "manual_broken_tide")!;
      manual.state = "售出";
      manual.ownerActorId = "actor_archivist";
      manual.locationId = undefined;
      addMemory("残卷被卖给旧盟抄手，秘籍会继续在江湖流转。", ["hero", "actor_archivist"]);
      break;
    }
    case "return-manual": {
      const manual = world.manuals.find((entry) => entry.id === "manual_broken_tide")!;
      manual.state = "归还";
      manual.ownerActorId = undefined;
      manual.locationId = "village_bailu";
      break;
    }
    case "tell-truth":
    case "hide-sect":
    case "leave-sect":
      revealRelations(world, ["actor_mentor", "actor_grey_rival"]);
      discoveries.push("山门与逐门首徒的师徒旧缘浮出水面");
      break;
    case "invite-healer":
      upsertRelation(world, "hero", "actor_lantern_healer", "companion", 68, "你在白露井旁请她一同走完旧案。", true);
      world.actors.find((actor) => actor.id === "actor_lantern_healer")!.activity = "同行";
      revealRelations(world, ["actor_lantern_healer", "actor_tide_master"]);
      break;
    case "defend-clinic":
      upsertRelation(world, "actor_lantern_healer", "hero", "creditor", input.success ? 72 : 58, "你替诊棚挡下归潮翎卫。", true);
      revealRelations(world, ["actor_lantern_healer", "actor_tide_master"]);
      break;
    case "final-truth":
    case "final-spare":
    case "final-sword":
      world.relations.forEach((entry) => { entry.knownToHero = true; });
      discoveries.push("沉星渡旧案牵连的亲属、师徒与恩仇关系全部公开");
      break;
    default:
      break;
  }
  if (
    ["fight-bridge", "accept-duel", "defend-clinic", "final-sword", "train"].includes(input.choiceId)
    || input.choiceId.startsWith("sandbox-duel:")
    || input.choiceId.startsWith("sandbox-confront:")
  ) {
    const trainedTechniqueIds = input.combatTechniqueIds?.length
      ? input.combatTechniqueIds
      : [hero.techniques[hero.techniques.length - 1]?.techniqueId || hero.techniques[0]?.techniqueId];
    trainedTechniqueIds.filter(Boolean).forEach((techniqueId) => {
      const used = hero.techniques.find((entry) => entry.techniqueId === techniqueId);
      if (!used) return;
      const previousStage = masteryStage(used.mastery);
      used.mastery = clamp(used.mastery + (input.success ? 7 : 4));
      const techniqueName = world.techniques.find((entry) => entry.id === techniqueId)?.name || techniqueId;
      const nextStage = masteryStage(used.mastery);
      discoveries.push(previousStage === nextStage
        ? `“${techniqueName}”在实战里又稳了一层`
        : `“${techniqueName}”由${previousStage}渐入${nextStage}`);
    });
  }
  if (input.combatSummary) {
    addMemory(input.combatSummary, ["hero", ...focusActorsForEvent(input.eventId)]);
  }
  addMemory(`第${input.turn}回，你选择“${input.choiceId}”，${input.success ? "事情大体如愿" : "结果生出变数"}。`, ["hero", ...focusActorsForEvent(input.eventId)]);
  if (input.turn % 2 === 0) {
    const reached = world.locations
      .filter((location) => worldDistance(world, hero.locationId, location.id) <= 2)
      .map((location) => location.id);
    world.rumors.push({
      id: `rumor-${input.turn}-${input.choiceId}`,
      day: world.day,
      text: `有人在${locationName(world, hero.locationId)}议论主角刚做出的选择。`,
      originLocationId: hero.locationId,
      reachedLocationIds: reached,
      credibility: input.success ? 72 : 48,
    });
  }
  return { world, discoveries };
};

export const actorAtLocation = (world: WuxiaWorldState, locationId: string) => world.actors
  .filter((actor) => actor.locationId === locationId && !["死亡", "失踪"].includes(actor.activity));

export const knownRelations = (world: WuxiaWorldState) => world.relations.filter((entry) => entry.knownToHero);

export const relationLabel: Record<WorldRelationType, string> = {
  parent: "父母",
  child: "子女",
  adoptive_parent: "养亲",
  adoptive_child: "养子女",
  sibling: "手足",
  uncle: "舅甥",
  niece: "甥亲",
  master: "师父",
  disciple: "弟子",
  sect_sibling: "同门",
  sworn_sibling: "结义",
  friend: "故交",
  companion: "同行",
  lover: "情人",
  crush: "倾慕",
  rival: "对手",
  enemy: "仇敌",
  debtor: "欠命",
  creditor: "施恩",
  protector: "护持",
};
