import { createSeededRandom } from "../../autoChessGame/core/engine/random";
import type {
  ActorTechnique,
  MartialTechniqueDef,
  WuxiaWorldState,
  WorldActor,
} from "./worldSimulation";

export interface CombatHeroStats {
  martial: number;
  insight: number;
  chivalry: number;
  fortune: number;
}

export type CombatResultKind = "命中" | "闪避" | "格挡" | "破招" | "反击" | "进身" | "调息";

export interface WuxiaCombatExchange {
  round: number;
  sequence: number;
  actorId: string;
  actorName: string;
  targetId: string;
  targetName: string;
  techniqueId?: string;
  techniqueName: string;
  result: CombatResultKind;
  damage: number;
  targetHp: number;
  actorQi: number;
  distance: number;
  text: string;
}

export interface WuxiaCombatFighterResult {
  actorId: string;
  name: string;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  damageDealt: number;
  techniquesUsed: string[];
}

export interface WuxiaCombatResult {
  id: string;
  eventId: string;
  choiceId: string;
  turn: number;
  seed: number;
  rounds: number;
  openingDistance: number;
  victor: "hero" | "enemy";
  success: boolean;
  hero: WuxiaCombatFighterResult;
  enemy: WuxiaCombatFighterResult;
  exchanges: WuxiaCombatExchange[];
  techniqueIds: string[];
  summary: string;
  novelParagraphs: string[];
}

export interface WuxiaCombatInput {
  world: WuxiaWorldState;
  turn: number;
  eventId: string;
  choiceId: string;
  heroStats: CombatHeroStats;
  heroLevel: number;
  companionActorIds: string[];
}

interface CombatProfile {
  enemyActorId: string;
  maxRounds: number;
  openingDistance: number;
  enemyLevel: number;
  enemyHp: number;
  enemyQi: number;
  enemyGuard: number;
  enemySpeed: number;
  scene: string;
}

interface Combatant {
  actor: WorldActor;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  martial: number;
  insight: number;
  chivalry: number;
  speed: number;
  guard: number;
  techniques: Array<{ known: ActorTechnique; definition: MartialTechniqueDef }>;
  cooldowns: Record<string, number>;
  damageDealt: number;
  techniquesUsed: string[];
  exposed: number;
  staggered: number;
}

const COMBAT_CHOICES = new Set(["fight-bridge", "accept-duel", "defend-clinic", "final-sword"]);

const EVENT_PROFILES: Record<string, CombatProfile> = {
  "bridge-ambush": { enemyActorId: "actor_scout", maxRounds: 8, openingDistance: 3, enemyLevel: 48, enemyHp: 126, enemyQi: 82, enemyGuard: 19, enemySpeed: 66, scene: "雨夜断桥" },
  "duel-at-dawn": { enemyActorId: "actor_grey_rival", maxRounds: 6, openingDistance: 2, enemyLevel: 63, enemyHp: 158, enemyQi: 108, enemyGuard: 28, enemySpeed: 70, scene: "黑风岭崖畔" },
  "lantern-healer": { enemyActorId: "actor_scout", maxRounds: 9, openingDistance: 3, enemyLevel: 57, enemyHp: 145, enemyQi: 94, enemyGuard: 23, enemySpeed: 68, scene: "悬灯诊棚" },
  "final-confrontation": { enemyActorId: "actor_tide_master", maxRounds: 12, openingDistance: 2, enemyLevel: 74, enemyHp: 205, enemyQi: 142, enemyGuard: 37, enemySpeed: 67, scene: "归潮阁潮阶" },
};

const RANGE_VALUE: Record<MartialTechniqueDef["range"], number> = {
  贴身: 0,
  近: 1,
  中: 2,
  远: 3,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const textSeed = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash + value.charCodeAt(index)) % 4294967291;
    hash = (hash * 16777619) % 4294967291;
  }
  return hash;
};

const techniquesFor = (world: WuxiaWorldState, actor: WorldActor) => actor.techniques
  .map((known) => {
    const definition = world.techniques.find((entry) => entry.id === known.techniqueId);
    return definition ? { known, definition } : null;
  })
  .filter((entry): entry is { known: ActorTechnique; definition: MartialTechniqueDef } => Boolean(entry));

const fighterResult = (fighter: Combatant): WuxiaCombatFighterResult => ({
  actorId: fighter.actor.id,
  name: fighter.actor.name,
  hp: Math.max(0, Math.round(fighter.hp)),
  maxHp: fighter.maxHp,
  qi: Math.max(0, Math.round(fighter.qi)),
  maxQi: fighter.maxQi,
  damageDealt: Math.round(fighter.damageDealt),
  techniquesUsed: [...fighter.techniquesUsed],
});

const chooseTechnique = (fighter: Combatant, distance: number, opponentLastTags: string[]) => fighter.techniques
  .filter(({ definition }) => fighter.qi >= definition.qiCost && (fighter.cooldowns[definition.id] || 0) <= 0 && RANGE_VALUE[definition.range] >= distance)
  .map((entry) => {
    const counterBonus = entry.definition.counters.some((counter) => opponentLastTags.includes(counter)) ? 34 : 0;
    const utility = entry.definition.power * 0.48
      + entry.definition.speed * 0.18
      + entry.definition.accuracy * 0.12
      + entry.known.mastery * 0.3
      + counterBonus
      - entry.definition.qiCost * 0.22;
    return { ...entry, utility };
  })
  .sort((left, right) => right.utility - left.utility || right.known.mastery - left.known.mastery)[0];

const defensiveTechnique = (fighter: Combatant) => fighter.techniques
  .filter(({ definition }) => (
    ["守", "身"].includes(definition.nature)
    && fighter.qi >= Math.ceil(definition.qiCost * 0.45)
    && (fighter.cooldowns[definition.id] || 0) <= 0
  ))
  .sort((left, right) => right.known.mastery + right.definition.speed - left.known.mastery - left.definition.speed)[0];

const movementExchange = (
  round: number,
  sequence: number,
  actor: Combatant,
  target: Combatant,
  distance: number,
): WuxiaCombatExchange => ({
  round,
  sequence,
  actorId: actor.actor.id,
  actorName: actor.actor.name,
  targetId: target.actor.id,
  targetName: target.actor.name,
  techniqueName: "踏位",
  result: "进身",
  damage: 0,
  targetHp: Math.round(target.hp),
  actorQi: Math.round(actor.qi),
  distance,
  text: `${actor.actor.name}没有急着出招，先沿${target.actor.name}的兵刃外缘踏进一步，把距离压到${distance === 0 ? "贴身" : `${distance}丈`}。`,
});

const restExchange = (
  round: number,
  sequence: number,
  actor: Combatant,
  target: Combatant,
  distance: number,
): WuxiaCombatExchange => ({
  round,
  sequence,
  actorId: actor.actor.id,
  actorName: actor.actor.name,
  targetId: target.actor.id,
  targetName: target.actor.name,
  techniqueName: "守中调息",
  result: "调息",
  damage: 0,
  targetHp: Math.round(target.hp),
  actorQi: Math.round(actor.qi),
  distance,
  text: `${actor.actor.name}守住中线换了一口气，没有把内力浪费在够不到的招式上。`,
});

const performTechnique = (
  round: number,
  sequence: number,
  actor: Combatant,
  target: Combatant,
  selected: NonNullable<ReturnType<typeof chooseTechnique>>,
  distance: number,
  random: ReturnType<typeof createSeededRandom>,
): WuxiaCombatExchange => {
  const { known, definition } = selected;
  actor.qi -= definition.qiCost;
  actor.cooldowns[definition.id] = Math.max(1, definition.cooldown);
  if (!actor.techniquesUsed.includes(definition.id)) actor.techniquesUsed.push(definition.id);
  const hitChance = clamp(
    definition.accuracy
      + known.mastery * 0.15
      + actor.insight * 0.12
      - target.speed * 0.2
      - distance * 4
      + target.exposed * 8
      - actor.staggered * 9,
    20,
    96,
  );
  if (random.next() * 100 > hitChance) {
    target.exposed = Math.max(0, target.exposed - 1);
    return {
      round,
      sequence,
      actorId: actor.actor.id,
      actorName: actor.actor.name,
      targetId: target.actor.id,
      targetName: target.actor.name,
      techniqueId: definition.id,
      techniqueName: definition.name,
      result: "闪避",
      damage: 0,
      targetHp: Math.round(target.hp),
      actorQi: Math.round(actor.qi),
      distance,
      text: `${actor.actor.name}使出“${definition.name}”，劲路刚到，${target.actor.name}已借${definition.tags[0] || "风势"}侧开半步，招锋只擦过衣角。`,
    };
  }

  const defense = defensiveTechnique(target);
  const counters = defense?.definition.counters.some((counter) => definition.tags.includes(counter)) || false;
  const blockChance = defense
    ? clamp(10 + target.chivalry * 0.17 + defense.known.mastery * 0.2 + defense.definition.speed * 0.08 + (counters ? 22 : 0), 12, 72)
    : clamp(5 + target.chivalry * 0.11, 5, 24);
  const blocked = random.next() * 100 <= blockChance;
  const baseDamage = definition.power
    * (0.52 + known.mastery / 165)
    * (0.72 + actor.martial / 210)
    * (0.88 + random.next() * 0.24);
  const guard = Math.max(0, target.guard - target.exposed * 4);
  let damage = Math.max(4, baseDamage - guard * 0.28);
  let result: CombatResultKind = "命中";
  let defenseName = "";
  if (blocked && defense) {
    target.qi -= Math.ceil(defense.definition.qiCost * 0.45);
    target.cooldowns[defense.definition.id] = Math.max(1, Math.ceil(defense.definition.cooldown * 0.6));
    damage *= counters ? 0.18 : 0.38;
    result = counters ? "破招" : "格挡";
    defenseName = defense.definition.name;
  } else if (blocked) {
    damage *= 0.58;
    result = "格挡";
  }
  if (definition.nature === "破") target.exposed = clamp(target.exposed + 1, 0, 3);
  if (definition.nature === "控" && !blocked) target.staggered = clamp(target.staggered + 1, 0, 2);
  damage = Math.max(1, Math.round(damage));
  target.hp = Math.max(0, target.hp - damage);
  actor.damageDealt += damage;
  const text = (() => {
    if (result === "破招") return `${actor.actor.name}的“${definition.name}”撞上${target.actor.name}的“${defenseName}”；后者恰好克住${definition.tags[0] || "来势"}，只以半步便把劲力引空，仍受${damage}点余劲。`;
    if (result === "格挡") return `${actor.actor.name}使出“${definition.name}”，${target.actor.name}${defenseName ? `以“${defenseName}”` : "横臂"}守住要害，仍被震退，受${damage}点伤势。`;
    return `${actor.actor.name}以“${definition.name}”抢入${definition.range}势，${definition.description}这一招落实，${target.actor.name}受${damage}点伤势。`;
  })();
  return {
    round,
    sequence,
    actorId: actor.actor.id,
    actorName: actor.actor.name,
    targetId: target.actor.id,
    targetName: target.actor.name,
    techniqueId: definition.id,
    techniqueName: definition.name,
    result,
    damage,
    targetHp: Math.round(target.hp),
    actorQi: Math.round(actor.qi),
    distance,
    text,
  };
};

const finishParagraphs = (scene: string, exchanges: WuxiaCombatExchange[], hero: Combatant, enemy: Combatant, success: boolean) => {
  const techniqueExchanges = exchanges.filter((exchange) => exchange.techniqueId);
  const opening = techniqueExchanges[0] || exchanges[0];
  const pivotal = [...techniqueExchanges].sort((left, right) => right.damage - left.damage)[0];
  const counter = techniqueExchanges.find((exchange) => ["破招", "格挡", "闪避"].includes(exchange.result));
  const closing = exchanges[exchanges.length - 1];
  const keyExchangeFor = (actorId: string) => [...techniqueExchanges]
    .filter((exchange) => exchange.actorId === actorId)
    .sort((left, right) => right.damage - left.damage)[0];
  const seenSequences = new Set<number>();
  const seenTechniqueResults = new Set<string>();
  const selected = [
    keyExchangeFor(hero.actor.id),
    keyExchangeFor(enemy.actor.id),
    counter,
    opening,
    pivotal,
    closing,
  ].filter((exchange): exchange is WuxiaCombatExchange => {
    if (!exchange || seenSequences.has(exchange.sequence)) return false;
    if (exchange.techniqueId) {
      const key = `${exchange.actorId}:${exchange.techniqueId}:${exchange.result}`;
      if (seenTechniqueResults.has(key)) return false;
      seenTechniqueResults.add(key);
    }
    seenSequences.add(exchange.sequence);
    return true;
  }).sort((left, right) => left.sequence - right.sequence);
  const body = selected.map((exchange) => {
    if (exchange.result === "进身") {
      return `${exchange.actorName}没有急着亮招，只沿${exchange.targetName}的兵刃外缘踏入一步，把原先的空隙压成了短兵相接。`;
    }
    if (exchange.result === "调息") {
      return `${exchange.actorName}守住中线换过一口气，任${exchange.targetName}的试探从衣角外掠过。`;
    }
    if (exchange.result === "闪避") {
      return `${exchange.actorName}使出“${exchange.techniqueName}”，${exchange.targetName}却借来势侧开半步，招锋只擦过衣角。`;
    }
    if (exchange.result === "破招") {
      return `${exchange.actorName}的“${exchange.techniqueName}”撞上${exchange.targetName}早已备好的守势，劲路被从转折处引开，只余一阵闷响。`;
    }
    if (exchange.result === "格挡") {
      return `${exchange.actorName}以“${exchange.techniqueName}”抢入中门，${exchange.targetName}横势守住要害，仍被余劲震得连退。`;
    }
    const wound = exchange.damage >= 34 ? "重重落在要害" : exchange.damage >= 18 ? "逼得对手气息一乱" : "在对手衣上留下一道浅痕";
    return `${exchange.actorName}的“${exchange.techniqueName}”终于走实，${wound}；${exchange.targetName}没有倒下，却已不能照原来的节奏出招。`;
  });
  const heroTechniques = hero.techniquesUsed
    .map((id) => hero.techniques.find((entry) => entry.definition.id === id)?.definition.name)
    .filter(Boolean)
    .join("、");
  const outcome = success
    ? `${scene}的胜负没有靠一句“武艺高强”带过。${hero.actor.name}以${heroTechniques || "守势"}撑过最后一次换招，迫使${enemy.actor.name}先收了势。`
    : `${scene}里，${hero.actor.name}最终慢了半拍；败势不是凭空落下，而是距离、换气与每一次被克住的招式共同累成。`;
  return [...body, outcome];
};

const sandboxCombatActorId = (choiceId: string) => (
  choiceId.startsWith("sandbox-duel:") || choiceId.startsWith("sandbox-confront:")
    ? choiceId.split(":")[1]
    : undefined
);

export const isWuxiaCombatChoice = (choiceId: string) => COMBAT_CHOICES.has(choiceId) || Boolean(sandboxCombatActorId(choiceId));

export const simulateWuxiaCombat = (input: WuxiaCombatInput): WuxiaCombatResult => {
  const sandboxEnemyId = sandboxCombatActorId(input.choiceId);
  const sandboxEnemy = sandboxEnemyId ? input.world.actors.find((actor) => actor.id === sandboxEnemyId) : undefined;
  const sandboxMastery = sandboxEnemy?.techniques.reduce((best, entry) => Math.max(best, entry.mastery), 45) || 45;
  const sandboxLocation = sandboxEnemy
    ? input.world.locations.find((location) => location.id === sandboxEnemy.locationId)?.name
    : undefined;
  const profile: CombatProfile | undefined = EVENT_PROFILES[input.eventId] || (sandboxEnemy ? {
    enemyActorId: sandboxEnemy.id,
    maxRounds: 7 + Math.min(4, Math.floor(input.turn / 3)),
    openingDistance: sandboxEnemy.techniques.some((known) => input.world.techniques.find((entry) => entry.id === known.techniqueId)?.range === "远") ? 3 : 2,
    enemyLevel: 42 + sandboxMastery * 0.42 + input.turn * 1.4,
    enemyHp: Math.round(108 + sandboxMastery * 0.82 + input.turn * 4),
    enemyQi: Math.round(72 + sandboxMastery * 0.62),
    enemyGuard: Math.round(14 + sandboxMastery * 0.2),
    enemySpeed: Math.round(48 + sandboxMastery * 0.3),
    scene: sandboxLocation || "江湖偶遇之地",
  } : undefined);
  const heroActor = input.world.actors.find((actor) => actor.id === "hero");
  const enemyActor = input.world.actors.find((actor) => actor.id === profile?.enemyActorId);
  if (!profile || !heroActor || !enemyActor) {
    throw new Error(`缺少战斗配置: ${input.eventId}/${input.choiceId}`);
  }
  const seed = (input.world.seed + textSeed(`${input.turn}:${input.eventId}:${input.choiceId}`) * 31) % 4294967296;
  const random = createSeededRandom(seed);
  const companionGuard = input.eventId === "duel-at-dawn" ? 0 : input.companionActorIds.length * 5;
  const heroMaxHp = Math.round(84 + input.heroStats.martial * 0.88 + input.heroLevel * 9);
  const heroMaxQi = Math.round(68 + input.heroStats.insight * 0.56 + input.heroLevel * 4);
  const hero: Combatant = {
    actor: heroActor,
    hp: heroMaxHp,
    maxHp: heroMaxHp,
    qi: heroMaxQi,
    maxQi: heroMaxQi,
    martial: input.heroStats.martial,
    insight: input.heroStats.insight,
    chivalry: input.heroStats.chivalry,
    speed: 45 + input.heroStats.fortune * 0.28 + input.companionActorIds.length * 2,
    guard: 13 + input.heroStats.chivalry * 0.27 + companionGuard,
    techniques: techniquesFor(input.world, heroActor),
    cooldowns: {},
    damageDealt: 0,
    techniquesUsed: [],
    exposed: 0,
    staggered: 0,
  };
  const enemy: Combatant = {
    actor: enemyActor,
    hp: profile.enemyHp,
    maxHp: profile.enemyHp,
    qi: profile.enemyQi,
    maxQi: profile.enemyQi,
    martial: profile.enemyLevel,
    insight: profile.enemyLevel * 0.82,
    chivalry: profile.enemyLevel * 0.55,
    speed: profile.enemySpeed,
    guard: profile.enemyGuard,
    techniques: techniquesFor(input.world, enemyActor),
    cooldowns: {},
    damageDealt: 0,
    techniquesUsed: [],
    exposed: 0,
    staggered: 0,
  };
  let distance = profile.openingDistance;
  let sequence = 0;
  let rounds = 0;
  let heroLastTags: string[] = [];
  let enemyLastTags: string[] = [];
  const exchanges: WuxiaCombatExchange[] = [];

  for (let round = 1; round <= profile.maxRounds && hero.hp > 0 && enemy.hp > 0; round += 1) {
    rounds = round;
    [hero, enemy].forEach((fighter) => {
      Object.keys(fighter.cooldowns).forEach((techniqueId) => {
        fighter.cooldowns[techniqueId] = Math.max(0, fighter.cooldowns[techniqueId] - 1);
      });
      fighter.qi = Math.min(fighter.maxQi, fighter.qi + 5);
      fighter.exposed = Math.max(0, fighter.exposed - 0.25);
      fighter.staggered = Math.max(0, fighter.staggered - 0.5);
    });
    const heroPreview = chooseTechnique(hero, distance, enemyLastTags);
    const enemyPreview = chooseTechnique(enemy, distance, heroLastTags);
    const heroInitiative = hero.speed + (heroPreview?.definition.speed || 20) * 0.32 + random.next() * 18 - hero.staggered * 8;
    const enemyInitiative = enemy.speed + (enemyPreview?.definition.speed || 20) * 0.32 + random.next() * 18 - enemy.staggered * 8;
    const order = heroInitiative >= enemyInitiative ? [hero, enemy] : [enemy, hero];
    for (const actor of order) {
      const target = actor === hero ? enemy : hero;
      if (actor.hp <= 0 || target.hp <= 0) continue;
      sequence += 1;
      const opponentTags = actor === hero ? enemyLastTags : heroLastTags;
      const selected = chooseTechnique(actor, distance, opponentTags);
      if (selected) {
        const exchange = performTechnique(round, sequence, actor, target, selected, distance, random);
        exchanges.push(exchange);
        if (actor === hero) heroLastTags = selected.definition.tags;
        else enemyLastTags = selected.definition.tags;
        if (selected.definition.nature === "身") distance = clamp(distance + (actor === hero ? -1 : 1), 0, 3);
        if (exchange.result === "闪避") distance = clamp(distance + (target === hero ? -1 : 1), 0, 3);
        continue;
      }
      const hasFutureTechnique = actor.techniques.some(({ definition }) => actor.qi >= definition.qiCost);
      if (distance > 0 && hasFutureTechnique) {
        distance -= 1;
        exchanges.push(movementExchange(round, sequence, actor, target, distance));
      } else {
        actor.qi = Math.min(actor.maxQi, actor.qi + 12);
        exchanges.push(restExchange(round, sequence, actor, target, distance));
      }
    }
  }

  const heroRatio = hero.hp / hero.maxHp;
  const enemyRatio = enemy.hp / enemy.maxHp;
  const heroScore = heroRatio * 70 + (hero.damageDealt / enemy.maxHp) * 35 + (hero.qi / hero.maxQi) * 8;
  const enemyScore = enemyRatio * 70 + (enemy.damageDealt / hero.maxHp) * 35 + (enemy.qi / enemy.maxQi) * 8;
  const success = enemy.hp <= 0 || (hero.hp > 0 && heroScore >= enemyScore);
  const victor = success ? "hero" : "enemy";
  const summary = success
    ? `${hero.actor.name}在逐招换势中压住${enemy.actor.name}，最后仍能稳稳收招。`
    : `${enemy.actor.name}在换气与距离上占住上风，${hero.actor.name}只能先行收势。`;
  const novelParagraphs = finishParagraphs(profile.scene, exchanges, hero, enemy, success);
  const techniqueIds = Array.from(new Set(exchanges.map((exchange) => exchange.techniqueId).filter((id): id is string => Boolean(id))));
  return {
    id: `combat-${input.turn}-${input.eventId}-${input.choiceId}`,
    eventId: input.eventId,
    choiceId: input.choiceId,
    turn: input.turn,
    seed,
    rounds,
    openingDistance: profile.openingDistance,
    victor,
    success,
    hero: fighterResult(hero),
    enemy: fighterResult(enemy),
    exchanges,
    techniqueIds,
    summary,
    novelParagraphs,
  };
};
