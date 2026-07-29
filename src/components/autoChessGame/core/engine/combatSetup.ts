import {
  STARTER_EFFECTS,
} from "./runRules";
import {
  TRAITS,
  UNIT_DEFS,
  type AugmentId,
  type TraitId,
  type UnitId,
  traitLevelForCount,
  type WaveDefinition,
} from "../gameData";
import {
  enemyFormationPosition,
  fighterVisualRadius,
  playerFormationPosition,
} from "../battleGeometry";
import type {
  BattleState,
  Fighter,
  GameState,
  OwnedUnit,
} from "../gameTypes";
import type { RandomSource } from "./random";

const STAR_SCALE = [0, 1, 1.68, 2.82];
const TRAFFIC_MEMBER_LIFESTEAL = [0, 0.12, 0.2, 0.32];
const TRAFFIC_TEAM_LIFESTEAL = [0, 0, 0.08, 0.15];
const DANCE_DASH_DODGE = [0, 0.28, 0.36, 0.45];

export const DEFAULT_JUMP_ARC_HEIGHT = 92;

interface CombatSetupHost {
  state: () => GameState;
  rng: () => RandomSource;
  currentWave: () => WaveDefinition;
  augmentStacks: (id: AugmentId) => number;
  grantShield: (
    source: Fighter | null,
    target: Fighter,
    amount: number,
    duration: number,
    battle: BattleState,
  ) => void;
}

export class CombatSetupSystem {
  constructor(private readonly host: CombatSetupHost) {}

  private get state() {
    return this.host.state();
  }

  public getTraitCounts(): Record<TraitId, number> {
    const counts = Object.keys(TRAITS).reduce(
      (result, key) => {
        result[key as TraitId] = 0;
        return result;
      },
      {} as Record<TraitId, number>,
    );

    const countedUnits = new Set<UnitId>();
    this.state.board.forEach((owned) => {
      if (!owned) return;
      if (countedUnits.has(owned.id)) return;
      countedUnits.add(owned.id);
      UNIT_DEFS[owned.id].traits.forEach((trait) => {
        counts[trait] += 1;
      });
    });
    return counts;
  }

  public getPlayerCombatStats(owned: Pick<OwnedUnit, "id" | "star">) {
    return this.calculatePlayerCombatStats(owned, this.getTraitCounts());
  }

  public traitCountsForUnitIds(unitIds: readonly UnitId[]) {
    const counts = Object.keys(TRAITS).reduce(
      (result, key) => {
        result[key as TraitId] = 0;
        return result;
      },
      {} as Record<TraitId, number>,
    );
    const uniqueIds = new Set(unitIds);
    uniqueIds.forEach((id) => {
      UNIT_DEFS[id].traits.forEach((trait) => {
        counts[trait] += 1;
      });
    });
    return counts;
  }

  private calculatePlayerCombatStats(
    owned: Pick<OwnedUnit, "id" | "star">,
    traitCounts: Record<TraitId, number>,
    options: { runBonuses?: boolean; scaleModifier?: number } = {},
  ) {
    const runBonuses = options.runBonuses ?? true;
    const def = UNIT_DEFS[owned.id];
    const traitLevel = (trait: TraitId) => traitLevelForCount(TRAITS[trait], traitCounts[trait]);
    const memberLevel = (trait: TraitId) => {
      if (def.traits.includes(trait)) return traitLevel(trait);
      return 0;
    };
    const augmentStacks = (id: AugmentId) => (
      runBonuses ? this.host.augmentStacks(id) : 0
    );
    const scale = STAR_SCALE[owned.star] * (options.scaleModifier ?? 1);
    const isRanged = def.attackType === "ranged";
    const aggressionLevel = traitLevel("aggression");
    const aggressionMember = def.traits.includes("aggression") && aggressionLevel > 0;
    const vanguardLevel = memberLevel("vanguard");
    const wildLevel = memberLevel("wild");
    const rangerLevel = memberLevel("ranger");
    const skeletonLevel = memberLevel("skeleton_soldier");
    const danceLevel = memberLevel("dance");
    const matureLevel = memberLevel("mature");
    const hostLevel = memberLevel("host");
    const mysticLevel = memberLevel("mystic");
    const globalWildLevel = traitLevel("wild");
    const globalVanguardLevel = traitLevel("vanguard");
    const globalRangerLevel = traitLevel("ranger");
    const globalMysticLevel = traitLevel("mystic");
    const globalDanceLevel = traitLevel("dance");
    const globalHostLevel = traitLevel("host");
    const gen27Member = def.traits.includes("gen27") && traitLevel("gen27") > 0;
    const starterEffect =
      runBonuses && this.state.starter ? STARTER_EFFECTS[this.state.starter] : {};

    let maxHp = def.hp * scale;
    let attack = def.attack * scale * 1.15;
    let { armor } = def;
    let { attackInterval } = def;
    let { range } = def;
    const moveSpeed =
      def.moveSpeed +
      [0, 10, 22, 36][globalHostLevel] +
      (hostLevel ? [0, 18, 32, 50][hostLevel] : 0);

    if (aggressionLevel) {
      attack *=
        1 +
        [0, 0.05, 0.1, 0.2][aggressionLevel] +
        (aggressionMember ? [0, 0.15, 0.3, 0.55][aggressionLevel] : 0);
    }
    if (vanguardLevel) range += [0, 36, 56, 80][vanguardLevel];
    if (globalVanguardLevel >= 2) {
      maxHp *= globalVanguardLevel === 3 ? 1.18 : 1.1;
    }
    if (wildLevel) armor += [0, 10, 22, 38][wildLevel];
    if (rangerLevel) attackInterval /= [1, 1.12, 1.26, 1.45][rangerLevel];
    if (skeletonLevel) {
      attack *= 1.35;
      armor -= 12;
    }
    if (danceLevel) attackInterval /= [1, 1.12, 1.26, 1.45][danceLevel];
    if (!isRanged) {
      if (globalWildLevel >= 2) armor += globalWildLevel === 3 ? 16 : 8;
      if (globalDanceLevel >= 2) {
        attackInterval /= globalDanceLevel === 3 ? 1.16 : 1.08;
      }
    } else if (globalRangerLevel >= 2) {
      attackInterval /= globalRangerLevel === 3 ? 1.3 : 1.15;
    }
    const danceMoveSpeed =
      !isRanged && globalDanceLevel >= 2
        ? globalDanceLevel === 3
          ? 16
          : 8
        : 0;
    const secondWindStacks = augmentStacks("second_wind");
    const glassCannonStacks = augmentStacks("glass_cannon");
    maxHp *= Math.max(
      0.4,
      1 +
        augmentStacks("vitality") * 0.08 +
        secondWindStacks * 0.12 -
        glassCannonStacks * 0.15,
    );
    armor += augmentStacks("tempered") * 10 + secondWindStacks * 10;
    attack *= 1 + augmentStacks("sharp_edge") * 0.12 + glassCannonStacks * 0.25;
    attackInterval /=
      1 + augmentStacks("momentum") * 0.14 + glassCannonStacks * 0.2;
    if (runBonuses && this.state.starter === "dance_start" && danceLevel) {
      attackInterval /= 1 + (starterEffect.danceAttackSpeed || 0);
    }
    const matureAttackSpeed = [0, 0.08, 0.16, 0.24][matureLevel];
    if (matureAttackSpeed) attackInterval /= 1 + matureAttackSpeed;

    return {
      maxHp,
      attack,
      armor,
      range,
      attackInterval,
      moveSpeed: moveSpeed + danceMoveSpeed,
      energy: Math.min(
        def.energyProfile.max,
        def.energyProfile.start +
          [0, 20, 45, 70][mysticLevel] +
          [0, 0, 10, 22][globalMysticLevel] +
          [0, 0, 10, 22][traitLevel("gen27")] * (gen27Member ? 1 : 0) +
          (starterEffect.startingEnergy || 0) +
          augmentStacks("overclock") * 45 +
          augmentStacks("united_front") * 15,
      ),
      maxEnergy: def.energyProfile.max,
    };
  }

  public createBattle(): BattleState {
    const traitCounts = this.getTraitCounts();
    const traitLevel = (trait: TraitId) => traitLevelForCount(TRAITS[trait], traitCounts[trait]);
    const globalTraitLevel = (trait: TraitId) => traitLevel(trait);
    const wave = this.host.currentWave();
    const enemyTraitCounts = this.traitCountsForUnitIds(
      wave.units.map((unit) => unit.id),
    );
    const enemyTraitLevel = (trait: TraitId) => traitLevelForCount(TRAITS[trait], enemyTraitCounts[trait]);
    const player = this.state.board.flatMap((owned, index) => {
      if (!owned) return [];
      const def = UNIT_DEFS[owned.id];
      const spawn = playerFormationPosition(index);
      const {
        maxHp,
        attack,
        armor,
        range,
        attackInterval,
        moveSpeed,
        energy,
      } = this.calculatePlayerCombatStats(owned, traitCounts);
      const emberLevel = def.traits.includes("ember") ? traitLevel("ember") : 0;
      const vanguardLevel = def.traits.includes("vanguard")
        ? traitLevel("vanguard")
        : 0;
      const mysticLevel = def.traits.includes("mystic")
        ? traitLevel("mystic")
        : 0;
      const assassinLevel = def.traits.includes("assassin")
        ? traitLevel("assassin")
        : 0;
      const chuanmeiLevel = def.traits.includes("chuanmei")
        ? traitLevel("chuanmei")
        : 0;
      const gluttonyHolder = def.traits.includes("gluttony") && traitLevel("gluttony") > 0;
      const gen27Member = def.traits.includes("gen27") && traitLevel("gen27") > 0;
      const yueGangMember = def.traits.includes("yue_gang") && traitLevel("yue_gang") > 0;
      const isRanged = def.attackType === "ranged";
      const trafficLevel = def.traits.includes("traffic") ? traitLevel("traffic") : 0;
      const globalTrafficLevel = globalTraitLevel("traffic");
      const matureLevel = def.traits.includes("mature") ? traitLevel("mature") : 0;
      const danceLevel = def.traits.includes("dance") ? traitLevel("dance") : 0;
      const globalAssassinLevel = globalTraitLevel("assassin");
      const globalChuanmeiLevel = globalTraitLevel("chuanmei");
      const dwarfLevel = def.traits.includes("dwarf") ? traitLevel("dwarf") : 0;
      const matureAttackSpeed = [0, 0.08, 0.16, 0.24][matureLevel];

      const fighter: Fighter = {
        fid: `p-${owned.uid}`,
        unitId: owned.id,
        team: "player",
        star: owned.star,
        x: spawn.x,
        y: spawn.y,
        radius: fighterVisualRadius(owned.id, owned.star),
        baseRadius: fighterVisualRadius(owned.id, owned.star),
        hp: maxHp,
        maxHp,
        shield: 0,
        shieldPeak: 0,
        abilityShield: 0,
        abilityShieldPeak: 0,
        abilityShieldTime: 0,
        attack,
        armor,
        range,
        baseRange: range,
        attackInterval,
        moveSpeed,
        baseAttack: attack,
        baseAttackInterval: attackInterval,
        baseMoveSpeed: moveSpeed,
        cooldown: this.host.rng().next() * 0.25,
        maxEnergy: def.energyProfile.max,
        energyPerSecond: def.energyProfile.perSecond,
        energyOnAttack: def.energyProfile.onAttack,
        energyOnHit: def.energyProfile.onHit,
        energyStyle: def.energyProfile.id,
        attackType: def.attackType,
        energy,
        stun: 0,
        burnTime: 0,
        burnDps: 0,
        burnSourceFid: null,
        burnDamageKind: "attack",
        tauntedByFid: null,
        tauntTime: 0,
        lifesteal:
          TRAFFIC_MEMBER_LIFESTEAL[trafficLevel] +
          TRAFFIC_TEAM_LIFESTEAL[globalTrafficLevel] +
          (trafficLevel && this.state.starter === "traffic_start" ? 0.06 : 0),
        burnOnHitPower: 0,
        spiceBurnOnHitPower: Math.max(
          [0, 0.45, 0.8][chuanmeiLevel],
          isRanged ? [0, 0, 0.22][globalChuanmeiLevel] : 0,
        ),
        dodgeChance:
          (dwarfLevel ? [0, 0.12, 0.22][dwarfLevel] : 0),
        dwarfMember: dwarfLevel > 0,
        gluttonyHolder,
        growthStacks: 0,
        gluttonyKillCooldown: 0,
        reiRevival: false,
        emberMember: emberLevel > 0,
        emberAttackPerStack: emberLevel
          ? (emberLevel && def.traits.includes("ember")
            ? [0, 0.05, 0.08, 0.12][emberLevel]
            : (isRanged ? [0, 0, 0.12 / 5, 0.25 / 5][emberLevel] : 0))
          : 0,
        emberAttackStacks: 0,
        emberAttackStackCap: [0, 5, 5, 5][emberLevel],
        syncAvMember: owned.id === "xuehui",
        syncAvDirection: 0,
        syncAvStrength: 0,
        gen27Member,
        gen27Buffed: false,
        matureMember: matureLevel > 0,
        matureMoveFloor: matureLevel ? 0.7 : 1,
        matureAttackSpeed,
        matureAttackSpeedCurrent: matureAttackSpeed,
        vanguardMember: vanguardLevel > 0,
        vanguardKnockback: vanguardLevel ? [0, 28, 38, 50][vanguardLevel] : 0,
        vanguardJumpArc: vanguardLevel ? [0, 24, 27, 32][vanguardLevel] : 0,
        vanguardJumpCooldown: 0,
        danceMember: danceLevel > 0,
        danceDashCooldown: 0,
        danceDashTime: 0,
        danceDashDodge: danceLevel ? DANCE_DASH_DODGE[danceLevel] : 0,
        barrageActive: false,
        barrageDrainPerSecond: 0,
        suiBirdChargesRemaining: 0,
        sekiChargeActive: false,
        sekiChargeDirectionX: 0,
        sekiChargeDirectionY: 0,
        sekiChargeHitFids: [],
        sekiChargeHitCount: 0,
        towerHackArmed: false,
        towerHackBuffed: false,
        towerHackAttackBonus: 0,
        towerHackArmorBonus: 0,
        towerHackAttackSpeed: 0,
        towerHackMoveSpeed: 0,
        cinderSongPulseTimer: 0,
        abilityAttackBonus: 0,
        abilityAttackBonusTime: 0,
        abilityLifesteal: 0,
        abilityLifestealTime: 0,
        nextAttackLifesteal: 0,
        abilityAttackSpeed: 0,
        abilityAttackSpeedTime: 0,
        abilityMoveSpeed: 0,
        abilityMoveSpeedTime: 0,
        abilityArmorBonus: 0,
        slowTime: 0,
        weakenTime: 0,
        weakenArmorPenalty: 0,
        yueGangMember,
        lowHealthBonus: 0,
        critChance:
          [0, 0.15, 0.3, 0.5][assassinLevel] +
          (isRanged ? [0, 0, 0.12, 0.25][globalAssassinLevel] : 0) +
          this.host.augmentStacks("precision") * 0.15,
        critMultiplier: 1.65,
        castRefund: Math.min(
          def.energyProfile.max,
          def.energyProfile.castRefund +
            [0, 0, 8, 15][mysticLevel] +
            this.host.augmentStacks("overclock") * 10,
        ),
        secondWindUsed: false,
        reborn: false,
        rebirthRecoilTime: 0,
        manquTime: 0,
        stealthTime: 0,
        sumiDragonReady: false,
        enraged: false,
        jumpPending: assassinLevel > 0,
        jumpDelay: assassinLevel ? 3.4 + spawn.row * 0.12 : 0,
        jumpTime: 0,
        jumpDuration: assassinLevel ? 0.68 : 0,
        jumpArcHeight: DEFAULT_JUMP_ARC_HEIGHT,
        attackPulse: 0,
        facingX: 1,
        attackTargetX: spawn.x,
        attackTargetY: spawn.y,
        hitPulse: 0,
        applePieShotsRemaining: 0,
        applePieShotTimer: 0,
        jumpFromX: spawn.x,
        jumpFromY: spawn.y,
        jumpToX: spawn.x,
        jumpToY: spawn.y,
        vanguardJumpAdvancing: false,
        abilityMotion: null,
        channelTargetFid: null,
        channelTime: 0,
        channelPulseTimer: 0,
        targetFid: null,
        targetLock: 0,
        progressAnchorDistance: Infinity,
        progressWindowTime: 0,
        stuckTime: 0,
        avoidSide: owned.uid % 2 === 0 ? 1 : -1,
        avoidTime: 0,
        damageDealt: 0,
        healingDone: 0,
        shieldingDone: 0,
        damageTaken: 0,
        alive: true,
      };
      return [fighter];
    });

    const enemy = wave.units.map((waveUnit, index) => {
      const def = UNIT_DEFS[waveUnit.id];
      const star = waveUnit.star || 1;
      const spawn = enemyFormationPosition(index, wave.units.length);
      const stats = this.calculatePlayerCombatStats(
        { id: waveUnit.id, star },
        enemyTraitCounts,
        {
          runBonuses: false,
          scaleModifier: wave.modifier,
        },
      );
      const emberLevel = def.traits.includes("ember") ? enemyTraitLevel("ember") : 0;
      const vanguardLevel = def.traits.includes("vanguard") ? enemyTraitLevel("vanguard") : 0;
      const mysticLevel = def.traits.includes("mystic") ? enemyTraitLevel("mystic") : 0;
      const assassinLevel = def.traits.includes("assassin") ? enemyTraitLevel("assassin") : 0;
      const chuanmeiLevel = def.traits.includes("chuanmei") ? enemyTraitLevel("chuanmei") : 0;
      const gluttonyHolder = def.traits.includes("gluttony") && enemyTraitLevel("gluttony") > 0;
      const gen27Member = def.traits.includes("gen27") && enemyTraitLevel("gen27") > 0;
      const yueGangMember = def.traits.includes("yue_gang") && enemyTraitLevel("yue_gang") > 0;
      const trafficLevel = def.traits.includes("traffic") ? enemyTraitLevel("traffic") : 0;
      const matureLevel = def.traits.includes("mature") ? enemyTraitLevel("mature") : 0;
      const danceLevel = def.traits.includes("dance") ? enemyTraitLevel("dance") : 0;
      const dwarfLevel = def.traits.includes("dwarf") ? enemyTraitLevel("dwarf") : 0;
      const isRanged = def.attackType === "ranged";
      const globalTrafficLevel = enemyTraitLevel("traffic");
      const globalAssassinLevel = enemyTraitLevel("assassin");
      const globalChuanmeiLevel = enemyTraitLevel("chuanmei");
      const matureAttackSpeed = [0, 0.08, 0.16, 0.24][matureLevel];
      return {
        fid: `e-${this.state.round}-${index}`,
        unitId: waveUnit.id,
        team: "enemy" as const,
        star,
        x: spawn.x,
        y: spawn.y,
        radius: fighterVisualRadius(waveUnit.id, star),
        baseRadius: fighterVisualRadius(waveUnit.id, star),
        hp: stats.maxHp,
        maxHp: stats.maxHp,
        shield: 0,
        shieldPeak: 0,
        abilityShield: 0,
        abilityShieldPeak: 0,
        abilityShieldTime: 0,
        attack: stats.attack,
        armor:
          stats.armor +
          (star - 1) * 4 +
          Math.max(0, wave.modifier - 1) * 20,
        range: stats.range,
        baseRange: stats.range,
        attackInterval: stats.attackInterval,
        moveSpeed: stats.moveSpeed,
        baseAttack: stats.attack,
        baseAttackInterval: stats.attackInterval,
        baseMoveSpeed: stats.moveSpeed,
        cooldown: this.host.rng().next() * 0.4,
        maxEnergy: def.energyProfile.max,
        energyPerSecond: def.energyProfile.perSecond,
        energyOnAttack: def.energyProfile.onAttack,
        energyOnHit: def.energyProfile.onHit,
        energyStyle: def.energyProfile.id,
        attackType: def.attackType,
        energy: Math.min(def.energyProfile.max, stats.energy + (wave.tag === "boss" ? 28 : 0)),
        stun: 0,
        burnTime: 0,
        burnDps: 0,
        burnSourceFid: null,
        burnDamageKind: "attack",
        tauntedByFid: null,
        tauntTime: 0,
        lifesteal:
          TRAFFIC_MEMBER_LIFESTEAL[trafficLevel] +
          TRAFFIC_TEAM_LIFESTEAL[globalTrafficLevel],
        burnOnHitPower: 0,
        spiceBurnOnHitPower: Math.max(
          [0, 0.45, 0.8][chuanmeiLevel],
          isRanged ? [0, 0, 0.22][globalChuanmeiLevel] : 0,
        ),
        dodgeChance: dwarfLevel ? [0, 0.12, 0.22][dwarfLevel] : 0,
        dwarfMember: dwarfLevel > 0,
        gluttonyHolder,
        growthStacks: 0,
        gluttonyKillCooldown: 0,
        reiRevival: false,
        emberMember: emberLevel > 0,
        emberAttackPerStack: emberLevel
          ? [0, 0.05, 0.08, 0.12][emberLevel]
          : 0,
        emberAttackStacks: 0,
        emberAttackStackCap: [0, 5, 5, 5][emberLevel],
        syncAvMember: waveUnit.id === "xuehui",
        syncAvDirection: 0,
        syncAvStrength: 0,
        gen27Member,
        gen27Buffed: false,
        matureMember: matureLevel > 0,
        matureMoveFloor: matureLevel ? 0.7 : 1,
        matureAttackSpeed,
        matureAttackSpeedCurrent: matureAttackSpeed,
        vanguardMember: vanguardLevel > 0,
        vanguardKnockback: vanguardLevel ? [0, 28, 38, 50][vanguardLevel] : 0,
        vanguardJumpArc: vanguardLevel ? [0, 24, 27, 32][vanguardLevel] : 0,
        vanguardJumpCooldown: 0,
        danceMember: danceLevel > 0,
        danceDashCooldown: 0,
        danceDashTime: 0,
        danceDashDodge: danceLevel ? DANCE_DASH_DODGE[danceLevel] : 0,
        barrageActive: false,
        barrageDrainPerSecond: 0,
        suiBirdChargesRemaining: 0,
        sekiChargeActive: false,
        sekiChargeDirectionX: 0,
        sekiChargeDirectionY: 0,
        sekiChargeHitFids: [],
        sekiChargeHitCount: 0,
        towerHackArmed: false,
        towerHackBuffed: false,
        towerHackAttackBonus: 0,
        towerHackArmorBonus: 0,
        towerHackAttackSpeed: 0,
        towerHackMoveSpeed: 0,
        cinderSongPulseTimer: 0,
        abilityAttackBonus: 0,
        abilityAttackBonusTime: 0,
        abilityLifesteal: 0,
        abilityLifestealTime: 0,
        nextAttackLifesteal: 0,
        abilityAttackSpeed: 0,
        abilityAttackSpeedTime: 0,
        abilityMoveSpeed: 0,
        abilityMoveSpeedTime: 0,
        abilityArmorBonus: 0,
        slowTime: 0,
        weakenTime: 0,
        weakenArmorPenalty: 0,
        yueGangMember,
        lowHealthBonus: 0,
        critChance:
          [0, 0.15, 0.3, 0.5][assassinLevel] +
          (isRanged ? [0, 0, 0.12, 0.25][globalAssassinLevel] : 0),
        critMultiplier: 1.65,
        castRefund: Math.min(
          def.energyProfile.max,
          def.energyProfile.castRefund + [0, 0, 8, 15][mysticLevel],
        ),
        secondWindUsed: false,
        reborn: false,
        rebirthRecoilTime: 0,
        manquTime: 0,
        stealthTime: 0,
        sumiDragonReady: false,
        enraged: false,
        attackPulse: 0,
        facingX: -1,
        attackTargetX: spawn.x,
        attackTargetY: spawn.y,
        hitPulse: 0,
        applePieShotsRemaining: 0,
        applePieShotTimer: 0,
        jumpPending: assassinLevel > 0,
        jumpDelay: assassinLevel ? 3.4 + spawn.row * 0.12 : 0,
        jumpTime: 0,
        jumpDuration: assassinLevel ? 0.68 : 0,
        jumpArcHeight: DEFAULT_JUMP_ARC_HEIGHT,
        jumpFromX: spawn.x,
        jumpFromY: spawn.y,
        jumpToX: spawn.x,
        jumpToY: spawn.y,
        vanguardJumpAdvancing: false,
        abilityMotion: null,
        channelTargetFid: null,
        channelTime: 0,
        channelPulseTimer: 0,
        targetFid: null,
        targetLock: 0,
        progressAnchorDistance: Infinity,
        progressWindowTime: 0,
        stuckTime: 0,
        avoidSide: index % 2 === 0 ? -1 : 1,
        avoidTime: 0,
        damageDealt: 0,
        healingDone: 0,
        shieldingDone: 0,
        damageTaken: 0,
        alive: true,
      } satisfies Fighter;
    });

    const battle: BattleState = {
      elapsed: 0,
      limit: 24,
      engagedTeams: { player: false, enemy: false },
      player,
      enemy,
      effects: [],
      projectiles: [],
      projectileVolley: [],
      corpses: [],
      resurrectionSerial: 0,
      chronospheres: [],
      healingZones: [],
      pets: [],
      petSerial: 0,
      pineTrees: [],
      pineTreeSerial: 0,
      fieldMedicTimer: 2.5,
      gluttonyTimer: 3,
      emberTimer: 3,
      yueGangTimer: 0.45,
      matureTimer: 4,
      banner:
        wave.tag === "boss"
          ? "首领战 · 暴君降临"
          : wave.tag === "elite"
            ? "精英战 · 奖励提升"
            : `第 ${wave.round} 战`,
      bannerTimer: 2.2,
      rankingOpen: false,
      rankingMetric: "damage",
    };
    const openingShield = this.state.starter
      ? STARTER_EFFECTS[this.state.starter].openingShield || 0
      : 0;
    if (openingShield) {
      battle.player.forEach((fighter) => {
        this.host.grantShield(
          null,
          fighter,
          fighter.maxHp * openingShield,
          0.6,
          battle,
        );
      });
    }
    const matureLevel = globalTraitLevel("mature");
    if (matureLevel) {
      const memberShield = [0, 0.1, 0.18, 0.28][matureLevel];
      const allShield = [0, 0, 0.04, 0.08][matureLevel];
      battle.player.forEach((fighter) => {
        const ratio = (fighter.matureMember ? memberShield : 0) + allShield;
        if (ratio) this.host.grantShield(null, fighter, fighter.maxHp * ratio, 0.6, battle);
      });
    }
    const enemyMatureLevel = enemyTraitLevel("mature");
    if (enemyMatureLevel) {
      const memberShield = [0, 0.1, 0.18, 0.28][enemyMatureLevel];
      const allShield = [0, 0, 0.04, 0.08][enemyMatureLevel];
      battle.enemy.forEach((fighter) => {
        const ratio = (fighter.matureMember ? memberShield : 0) + allShield;
        if (ratio) this.host.grantShield(null, fighter, fighter.maxHp * ratio, 0.6, battle);
      });
    }
    const unitedFrontStacks = this.host.augmentStacks("united_front");
    if (unitedFrontStacks) {
      battle.player.forEach((fighter) => {
        this.host.grantShield(
          null,
          fighter,
          fighter.maxHp * 0.25 * unitedFrontStacks,
          0.8,
          battle,
        );
      });
    }
    return battle;
  }

}
