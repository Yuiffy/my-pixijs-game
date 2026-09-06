import { createSeededRandom } from "../autoChessGame/core/engine/random";
import {
  BOSSES,
  CHARMS,
  CONTENT_VERSION,
  CONTROLS,
  DIFFICULTIES,
  KEY_OPTIONS,
  MOVES,
} from "./content";
import type {
  Charm,
  ControlAction,
  Difficulty,
  Input,
  Move,
  Vow,
} from "./content";
import { freshCampaign, freshProgress } from "./progress";
import type { BattleRecord, Challenge, FightStats, Progress } from "./progress";

export type Phase = "ready" | "fight" | "paused" | "won" | "lost" | "ending";
export type Cue =
  | "start"
  | "swing"
  | "triple"
  | "danger"
  | "attack"
  | "whiff"
  | "hit"
  | "guard"
  | "parry"
  | "dodge"
  | "hurt"
  | "win"
  | "lose"
  | "deflect"
  | "break"
  | "counter"
  | 'riposte'
  | "exhausted"
  | "bell"
  | "return"
  | 'chapter';
type BossMode = "approach" | "windup" | "recover" | "stagger" | "broken";
export interface BellProjectile {
  id: number;
  volley: number;
  total: number;
  x: number;
  vx: number;
  radius: number;
  reflected: boolean;
}
export interface ActionDenial {
  action: 'attack' | 'dodge' | 'guard';
  reason: 'stamina' | 'recovery' | 'cooldown';
  cost: number;
  visualAt: number;
}
export interface FightState {
  phase: Phase;
  t: number;
  elapsed: number;
  feedbackT: number;
  hitStopRemaining: number;
  pauseReason: string;
  denial: ActionDenial | null;
  projectiles: BellProjectile[];
  bellParries: Record<number, number>;
  player: {
    x: number;
    hp: number;
    stamina: number;
    facing: number;
    attackAt: number;
    attackHit: boolean;
    dashAt: number;
    dashDirection: number;
    hurtAt: number;
    parryAt: number;
    guardAt: number;
    guardUsed: boolean;
    stunUntil: number;
    exertionAt: number;
    windBonus: boolean;
  };
  boss: {
    x: number;
    facing: number;
    spirit: number;
    poise: number;
    mode: BossMode;
    move: Move;
    clock: number;
    hitIndex: number;
    targetX: number;
    sequence: number;
    tripleParries: number;
    hurtAt: number;
    staggerRemaining: number;
    resumeMode: "windup" | "recover" | "approach";
    counterReady: boolean;
    flinchLockUntil: number;
    pressureAt: number;
    rearHitUsed: boolean;
    enraged: boolean;
    resumeClock: number;
    elevation: number;
    motionStarted: boolean;
    motionFromX: number;
    motionToX: number;
  };
  stats: FightStats;
  notice: string;
  noticeUntil: number;
  lastMistake: string;
  events: { id: number; cue: Cue; t: number; visualAt: number; x: number }[];
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const initial = (index: number): FightState => ({
  phase: "ready",
  t: 0,
  elapsed: 0,
  feedbackT: 0,
  hitStopRemaining: 0,
  pauseReason: "",
  denial: null,
  projectiles: [],
  bellParries: {},
  player: {
    x: 430,
    hp: 5,
    stamina: 100,
    facing: 1,
    attackAt: -10000,
    attackHit: true,
    dashAt: -10000,
    dashDirection: -1,
    hurtAt: -10000,
    parryAt: -10000,
    guardAt: -10000,
    guardUsed: false,
    stunUntil: 0,
    exertionAt: -10000,
    windBonus: false,
  },
  boss: {
    x: 835,
    facing: -1,
    spirit: BOSSES[index].health,
    poise: 0,
    mode: "approach",
    move: BOSSES[index].moves[0],
    clock: 0,
    hitIndex: 0,
    targetX: 430,
    sequence: 0,
    tripleParries: 0,
    hurtAt: -10000,
    staggerRemaining: 0,
    resumeMode: "approach",
    counterReady: false,
    flinchLockUntil: 0,
    pressureAt: 0,
    resumeClock: 0,
    rearHitUsed: false,
    enraged: false,
    elevation: 0,
    motionStarted: false,
    motionFromX: 835,
    motionToX: 835,
  },
  stats: {
    parries: 0,
    guards: 0,
    dodges: 0,
    hits: 0,
    damage: 0,
    triple: false,
    breaks: 0,
    counters: 0,
    blockedAttacks: 0,
  },
  notice: "",
  noticeUntil: 0,
  lastMistake: "",
  events: [],
});

export class Sparring {
  state: FightState;
  held = new Set<Input>();
  progress: Progress;
  onSave?: (progress: Progress) => void;
  private accumulator = 0;
  private eventId = 0;
  private rng: ReturnType<typeof createSeededRandom>;

  constructor(progress = freshProgress()) {
    this.progress = progress;
    this.state = initial(progress.campaign.bossIndex);
    this.rng = createSeededRandom(progress.campaign.seed);
    this.restore(progress);
  }

  restore(progress: Progress) {
    this.progress = progress;
    this.ready();
    this.rng = createSeededRandom(progress.campaign.seed);
    const record = progress.campaign.cleared[progress.campaign.bossIndex];
    if (record && progress.campaign.checkpoint !== "ready") {
      this.state.phase = progress.campaign.checkpoint;
      this.state.stats = { ...record.stats };
      this.state.elapsed = record.elapsed;
      this.state.player.hp = record.health;
      this.state.boss.spirit = 0;
      this.progress.vow = record.vow;
    }
  }

  get bossDefinition() {
    return BOSSES[this.progress.campaign.bossIndex];
  }
  get difficulty() {
    return this.progress.difficulties[this.progress.campaign.bossIndex];
  }
  get rules() {
    return DIFFICULTIES[this.difficulty];
  }
  get guardWindowMs() {
    return this.rules.parry;
  }
  get damagePercent() {
    return Math.floor(
      (1 - this.state.boss.spirit / this.bossDefinition.health) * 100,
    );
  }
  get isEnd() {
    return this.state.phase === "ending";
  }
  get parryWindowOpen() {
    const { boss: b, player: p, t } = this.state;
    const move = MOVES[b.move];
    const next = move.hits[b.hitIndex];
    const bellIncoming = this.incomingBellMs <= this.guardWindowMs;
    return (
      this.state.phase === "fight" &&
      (bellIncoming || (b.mode === "windup" &&
      move.kind !== 'bell' &&
      !move.heavy &&
      next !== undefined &&
      next - b.clock >= 0 &&
      next - b.clock <= this.guardWindowMs &&
      Math.abs(p.x - b.x) < move.range &&
      (move.kind === 'spin' || move.kind === 'rush' || (p.x - b.x) * b.facing > -30))) &&
      t - p.dashAt >= 300 &&
      t - p.attackAt >= 170 &&
      t >= p.stunUntil
    );
  }
  get incomingBellMs() {
    const { player: p, projectiles } = this.state;
    return projectiles.reduce((soonest, bell) => {
      if (bell.reflected || (p.x - bell.x) * bell.vx < 0) return soonest;
      return Math.min(soonest, (Math.max(0, Math.abs(p.x - bell.x) - bell.radius - 25) / Math.abs(bell.vx)) * 1000);
    }, Infinity);
  }
  get vowMet() {
    return (
      (this.state.phase === "won" || this.state.phase === "ending") &&
      (this.progress.vow === "clear" ||
        (this.progress.vow === "combo" && this.state.stats.triple) ||
        (this.progress.vow === "perfect" && this.state.stats.damage === 0))
    );
  }
  get dodgeCost() {
    return 28 * this.rules.cost * (this.progress.charm === "wind" ? 0.75 : 1);
  }
  get attackCost() { return 12 * this.rules.cost; }
  get guardCost() { return 20 * this.rules.cost * (this.progress.charm === 'steady' ? 0.65 : 1); }

  private deny(action: ActionDenial['action'], reason: ActionDenial['reason'], cost: number) {
    const s = this.state;
    if (s.denial?.action === action && s.denial.reason === reason && s.feedbackT - s.denial.visualAt < 1100) return;
    s.denial = { action, reason, cost, visualAt: s.feedbackT };
    if (reason === 'stamina') this.emit('exhausted', s.player.x);
  }

  save() {
    this.onSave?.(structuredClone(this.progress));
  }
  choose(vow: Vow) {
    if (this.state.phase !== "ready") return;
    this.progress.vow = vow;
    this.save();
  }
  setBinding(action: ControlAction, code: string) {
    if (!KEY_OPTIONS.includes(code)) return;
    const other = CONTROLS.find(
      (control) => control.id !== action && this.progress.bindings[control.id] === code,
    );
    if (other) this.progress.bindings[other.id] = this.progress.bindings[action];
    this.progress.bindings[action] = code;
    this.held.clear();
    this.save();
  }
  setDifficulty(value: Difficulty) {
    if (this.state.phase !== "ready") return;
    for (let i = this.progress.campaign.bossIndex; i < 3; i += 1) this.progress.difficulties[i] = value;
    this.progress.assist = value === "relaxed";
    this.save();
  }
  setAssist(value: boolean) {
    this.setDifficulty(value ? "relaxed" : "standard");
  }
  setCharm(value: Charm) {
    if (
      this.state.phase !== "ready" ||
      this.progress.campaign.cleared.length ||
      !CHARMS.some((charm) => charm.id === value)
    ) return;
    this.progress.charm = value;
    this.save();
  }
  newChapter(
    seed = this.progress.campaign.seed,
    mode: "chapter" | "rematch" = "chapter",
  ) {
    const challengeKey = mode === 'rematch' && seed === this.progress.campaign.seed ? this.progress.campaign.challengeKey : null;
    this.progress.campaign = freshCampaign(seed, mode);
    this.progress.campaign.challengeKey = challengeKey;
    this.progress.assist = this.progress.difficulties[0] === "relaxed";
    this.ready();
    this.save();
  }
  loadChallenge(challenge: Challenge) {
    this.progress.difficulties = [...challenge.difficulties];
    this.progress.charm = challenge.charm;
    this.newChapter(challenge.seed, "rematch");
    this.progress.campaign.challengeKey = JSON.stringify(challenge);
    this.save();
  }
  nextBoss() {
    if (this.state.phase !== "won" || this.progress.campaign.bossIndex >= 2) return;
    this.progress.campaign.bossIndex += 1;
    this.progress.assist = this.difficulty === "relaxed";
    this.progress.campaign.checkpoint = "ready";
    this.ready();
    this.save();
  }
  start() {
    if (!["ready", "lost"].includes(this.state.phase)) return;
    const index = this.progress.campaign.bossIndex;
    this.state = initial(index);
    this.state.phase = "fight";
    this.held.clear();
    this.accumulator = 0;
    this.rng = createSeededRandom(this.progress.campaign.seed + index * 3571);
    this.progress.campaign.checkpoint = "ready";
    this.progress.campaign.attempts[index] += 1;
    this.progress.attempts += 1;
    this.emit("start", 640);
    this.notice("请赐教。", 900);
    this.save();
  }
  ready() {
    this.state = initial(this.progress.campaign.bossIndex);
    this.held.clear();
    this.accumulator = 0;
  }
  pause(reason = "歇一口气") {
    if (this.state.phase !== "fight") return;
    this.state.phase = "paused";
    this.state.pauseReason = reason;
    this.held.clear();
    this.accumulator = 0;
  }
  resume() {
    if (this.state.phase === "paused") {
      this.state.phase = "fight";
      this.held.clear();
    }
  }

  input(key: Input, down: boolean) {
    if (!down) {
      this.held.delete(key);
      return;
    }
    if (this.state.phase !== "fight" || this.held.has(key)) return;
    this.held.add(key);
    const { player: p, t } = this.state;
    if (key === 'attack') {
      if (t < p.stunUntil || t - p.attackAt < 480 || t - p.dashAt < 300 || this.held.has('guard')) this.deny('attack', 'recovery', this.attackCost);
      else if (p.stamina < this.attackCost) this.deny('attack', 'stamina', this.attackCost);
    }
    if (
      key === "guard" &&
      t - p.guardAt > 230 &&
      t >= p.stunUntil &&
      t - p.attackAt >= 170 &&
      t - p.dashAt >= 300
    ) {
      p.guardAt = t;
      p.guardUsed = false;
    }
    if (key === 'guard' && (t < p.stunUntil || t - p.attackAt < 170 || t - p.dashAt < 300)) this.deny('guard', 'recovery', this.guardCost);
    if (key === "dodge") {
      if (t < p.stunUntil || t - p.attackAt < 180) { this.deny('dodge', 'recovery', this.dodgeCost); return; }
      if (t - p.dashAt < 750) { this.deny('dodge', 'cooldown', this.dodgeCost); return; }
      if (p.stamina < this.dodgeCost) {
        this.deny('dodge', 'stamina', this.dodgeCost);
        return;
      }
      p.stamina -= this.dodgeCost;
      p.exertionAt = t;
      p.dashAt = t;
      if (this.state.denial?.action === 'dodge') this.state.denial = null;
      p.windBonus = true;
      p.dashDirection = this.held.has("left")
        ? -1
        : this.held.has("right")
          ? 1
          : -p.facing;
      this.emit("dodge", p.x);
    }
  }
  advance(milliseconds: number) {
    if (
      this.state.phase !== "fight" ||
      !Number.isFinite(milliseconds) ||
      milliseconds <= 0
    ) return;
    this.accumulator += Math.min(milliseconds, 120000);
    const tick = 1000 / 120;
    while (this.accumulator >= tick && this.state.phase === "fight") {
      this.tick(tick * this.rules.speed, tick);
      this.accumulator -= tick;
    }
    if (this.state.phase !== "fight") this.accumulator = 0;
  }

  private tick(dt: number, wallDt: number) {
    const s = this.state;
    const p = s.player;
    const b = s.boss;
    const previousPlayerX = p.x;
    s.elapsed += wallDt;
    s.feedbackT += wallDt;
    if (s.hitStopRemaining > 0) {
      s.hitStopRemaining = Math.max(0, s.hitStopRemaining - wallDt);
      return;
    }
    s.t += dt;
    p.facing = p.x <= b.x ? 1 : -1;
    const dash = s.t - p.dashAt < 300;
    const guard =
      this.held.has("guard") &&
      s.t - p.attackAt >= 170 &&
      !dash &&
      s.t >= p.stunUntil;
    if (s.t - p.exertionAt > 450) {
      const recovery =
        28 * (this.progress.charm === "breath" ? 1.3 : 1) * (guard ? 0.5 : 1);
      p.stamina = Math.min(100, p.stamina + (recovery * dt) / 1000);
    }
    if (s.t >= p.stunUntil) {
      const axis =
        Number(this.held.has("right")) - Number(this.held.has("left"));
      p.x = clamp(
        p.x +
          ((dash ? p.dashDirection * 745 : axis * (guard ? 105 : 295)) * dt) /
            1000,
        100,
        1180,
      );
      const passing = b.mode === 'windup' && (MOVES[b.move].kind === 'rush' || b.elevation > 40);
      if (!dash && !passing && Math.abs(p.x - b.x) < 74) {
        p.x = clamp(b.x - p.facing * 74, 100, 1180);
        if (Math.abs(p.x - b.x) < 74) b.x = clamp(p.x + p.facing * 74, 150, 1130);
      }
    }
    const cost = this.attackCost;
    if (
      this.held.has("attack") &&
      !guard &&
      !dash &&
      s.t >= p.stunUntil &&
      s.t - p.attackAt >= 480
    ) {
      if (p.stamina < cost) this.deny('attack', 'stamina', cost);
      else {
        p.stamina -= cost;
        p.exertionAt = s.t;
        p.attackAt = s.t;
        p.attackHit = false;
        if (s.denial?.action === 'attack') s.denial = null;
        this.emit("attack", p.x);
      }
    }
    if (!p.attackHit && s.t - p.attackAt >= 145) {
      p.attackHit = true;
      this.playerHit();
      if (s.phase !== "fight") return;
    }
    this.advanceBells(dt, guard, dash, previousPlayerX);
    if (s.phase !== 'fight') return;
    if (b.mode !== "broken" && s.t - b.pressureAt > 3500) b.poise = Math.max(0, b.poise - (7 * dt) / 1000);
    if (b.mode === "stagger" || b.mode === "broken") {
      b.staggerRemaining -= dt;
      if (b.staggerRemaining <= 0) {
        if (b.mode === "broken") {
          b.poise = 0;
          this.nextMove();
        } else {
          b.mode = b.resumeMode;
          b.clock = b.resumeClock;
        }
      }
      return;
    }
    if (b.mode === "approach") {
      b.counterReady = false;
      b.facing = b.x >= p.x ? -1 : 1;
      const distance = Math.abs(b.x - p.x);
      const retreat = this.bossDefinition.id === 'keeper' && distance < 320 && b.x - b.facing * 60 >= 150 && b.x - b.facing * 60 <= 1130;
      if (retreat) b.x -= (b.facing * this.bossDefinition.speed * dt) / 1000;
      else if (distance > MOVES[b.move].reach) b.x += (b.facing * this.bossDefinition.speed * dt) / 1000;
      else {
        b.mode = "windup";
        b.clock = 0;
        b.hitIndex = 0;
        b.targetX = MOVES[b.move].kind === 'ward' ? 640 : p.x;
        b.motionStarted = false;
        b.elevation = 0;
        b.tripleParries = 0;
        b.rearHitUsed = false;
        this.emit(
          MOVES[b.move].heavy
            ? "danger"
            : MOVES[b.move].hits.length >= 3
              ? "triple"
              : "swing",
          b.x,
        );
      }
    } else {
      b.clock += dt;
      const move = MOVES[b.move];
      if (b.mode === "windup") {
        if (move.motion && b.clock >= move.motion.start) {
          if (!b.motionStarted) {
            b.motionStarted = true;
            b.motionFromX = b.x;
            if (move.kind === 'rush') b.targetX = p.x;
            b.facing = b.targetX >= b.x ? 1 : -1;
            b.motionToX = clamp(b.targetX + (move.kind === 'rush' ? b.facing * 100 : 0), 150, 1130);
          }
          const ratio = clamp((b.clock - move.motion.start) / (move.motion.end - move.motion.start), 0, 1);
          b.x = b.motionFromX + (b.motionToX - b.motionFromX) * ratio;
          b.elevation = Math.sin(ratio * Math.PI) * move.motion.height;
        }
        const next = move.hits[b.hitIndex];
        // Facing is reacquired between blows, then visibly committed before contact.
        const committedMotion = move.motion && b.clock >= move.motion.start && b.clock <= move.motion.end;
        if (!move.heavy && !committedMotion && next !== undefined && next - b.clock > move.tracking) b.facing = b.x >= p.x ? -1 : 1;
        if (next !== undefined && b.clock >= next) {
          b.hitIndex += 1;
          if (move.kind === 'bell') {
            s.projectiles.push({ id: ++this.eventId, volley: b.sequence, total: move.hits.length, x: b.x + b.facing * 35, vx: b.facing * move.projectileSpeed!, radius: move.range, reflected: false });
            this.emit('bell', b.x);
          } else this.bossHit(guard, dash);
          if (s.phase !== "fight" || b.mode !== "windup") return;
        }
        if (b.clock >= move.hits[move.hits.length - 1] + 170) {
          b.mode = "recover";
          b.clock = 0;
          b.counterReady = true;
          this.notice("破绽", 800);
        }
      } else if (b.clock >= move.recovery) this.nextMove();
    }
    b.x = clamp(b.x, 150, 1130);
  }

  private nextMove() {
    const b = this.state.boss;
    b.sequence += 1;
    const { moves } = this.bossDefinition;
    b.move =
      b.sequence < 3
        ? moves[b.sequence]
        : this.rng.pick(moves.filter((move) => move !== b.move));
    if (
      this.bossDefinition.id === "master" &&
      b.spirit <= this.bossDefinition.health / 2 &&
      !b.enraged
    ) {
      b.enraged = true;
      b.move = "finalChain";
      this.notice("压轴，三式！", 1200);
    }
    b.mode = "approach";
    b.clock = 0;
    b.hitIndex = 0;
    b.counterReady = false;
    b.staggerRemaining = 0;
    b.elevation = 0;
    b.motionStarted = false;
    for (const volley of Object.keys(this.state.bellParries)) if (Number(volley) < b.sequence - 3) delete this.state.bellParries[Number(volley)];
  }

  private stagger(
    duration: number,
    resume: "windup" | "recover",
    counter = true,
    preserveClock = false,
  ) {
    const b = this.state.boss;
    b.resumeClock = resume === "windup" || preserveClock ? b.clock : 0;
    b.mode = "stagger";
    b.staggerRemaining = duration;
    b.resumeMode = resume;
    b.counterReady = counter;
    b.hurtAt = this.state.t;
    if (resume === "recover") b.clock = 0;
  }
  private pressure(amount: number) {
    const b = this.state.boss;
    if (b.mode === "broken") return;
    b.poise = Math.min(100, b.poise + amount);
    b.pressureAt = this.state.t;
    if (b.poise >= 100) {
      b.mode = "broken";
      b.staggerRemaining = 1600;
      b.counterReady = true;
      b.hitIndex = MOVES[b.move].hits.length;
      b.elevation = 0;
      this.state.stats.breaks += 1;
      this.state.hitStopRemaining = 115;
      this.emit("break", b.x);
      this.notice("破架！", 1300);
    }
  }
  private playerHit() {
    const s = this.state;
    const p = s.player;
    const b = s.boss;
    if (Math.abs(p.x - b.x) > 228 || b.elevation > 55) {
      this.emit("whiff", p.x);
      return;
    }
    const rear = (p.x - b.x) * b.facing < -30;
    const exposed =
      b.mode === "recover" || b.mode === "stagger" || b.mode === "broken";
    if (!exposed && (!rear || b.rearHitUsed)) {
      s.stats.blockedAttacks += 1;
      p.stunUntil = s.t + 105;
      this.emit("deflect", (p.x + b.x) / 2);
      this.notice("架住了", 500);
      this.pressure(4 * (this.progress.charm === "breaker" ? 1.3 : 1));
      return;
    }
    if (rear && !exposed) b.rearHitUsed = true;
    const counter = b.counterReady;
    const broken = b.mode === "broken";
    let damage = counter ? (broken ? 19 : 10) : 4;
    if (p.windBonus && this.progress.charm === "wind") damage += 2;
    p.windBonus = false;
    if (counter) {
      b.counterReady = false;
      s.stats.counters += 1;
      s.hitStopRemaining = broken ? 95 : 45;
      this.emit(broken ? 'riposte' : "counter", b.x);
      this.notice(broken ? "破架追击" : "反击！", 850);
    } else this.emit("hit", b.x);
    s.stats.hits += 1;
    b.hurtAt = s.t;
    b.spirit = Math.max(0, b.spirit - damage);
    if (exposed && b.mode === "recover" && s.t >= b.flinchLockUntil) {
      this.stagger(180, "recover", false, true);
      b.flinchLockUntil = s.t + 850;
    }
    if (exposed) b.x = clamp(b.x + p.facing * 8, 150, 1130);
    this.pressure(
      (counter ? 8 : 13) * (this.progress.charm === "breaker" ? 1.3 : 1),
    );
    if (b.spirit <= 0) this.finish(true);
  }

  private advanceBells(dt: number, guard: boolean, dash: boolean, previousPlayerX: number) {
    const s = this.state;
    s.projectiles = s.projectiles.filter(bell => {
      if (s.phase !== 'fight') return false;
      const from = bell.x;
      bell.x += (bell.vx * dt) / 1000;
      const target = bell.reflected ? s.boss.x : s.player.x;
      const previousTarget = bell.reflected ? target : previousPlayerX;
      const contact = Math.abs(bell.x - target) <= bell.radius + 25 || (from - previousTarget) * (bell.x - target) <= 0;
      if (contact) {
        if (!bell.reflected) {
          this.bossHit(guard, dash, bell);
          return bell.reflected;
        }
        const b = s.boss;
        b.spirit = Math.max(0, b.spirit - 10);
        b.hurtAt = s.t;
        s.stats.hits += 1;
        // A returned bell interrupts casting only on contact; a triple volley can resume.
        if (b.mode !== 'broken') this.stagger(300, b.mode === 'windup' || (b.mode === 'stagger' && b.resumeMode === 'windup') ? 'windup' : 'recover', true, true);
        this.pressure(25);
        this.emit('return', b.x);
        this.notice('飞铃回击 · 震退', 900);
        s.hitStopRemaining = Math.max(s.hitStopRemaining, 65);
        if (b.spirit <= 0) this.finish(true);
        return false;
      }
      return bell.x > 20 && bell.x < 1260;
    });
  }

  private bossHit(guard: boolean, dash: boolean, bell?: BellProjectile) {
    const s = this.state;
    const p = s.player;
    const b = s.boss;
    const move = MOVES[b.move];
    const heavy = !bell && move.heavy;
    const inRange = bell ? true : move.kind === 'ward'
      ? Math.abs(p.x - b.targetX) > move.range
      : heavy ? Math.abs(p.x - b.targetX) < move.range
        : Math.abs(p.x - b.x) < move.range && (move.kind === 'spin' || move.kind === 'rush' || (p.x - b.x) * b.facing > -30);
    if (!inRange || (dash && s.t - p.dashAt <= 215)) {
      if (dash || heavy) s.stats.dodges += 1;
      return;
    }
    if (guard && !heavy) {
      if (!p.guardUsed && s.t - p.guardAt <= this.guardWindowMs) {
        p.guardUsed = true;
        p.parryAt = s.t;
        p.stamina = Math.min(100, p.stamina + 22);
        p.exertionAt = s.t - 500;
        s.stats.parries += 1;
        s.hitStopRemaining = 85;
        this.emit('parry', bell ? p.x + Math.sign(bell.x - p.x) * 35 : (p.x + b.x) / 2);
        if (bell) {
          bell.reflected = true;
          bell.vx = Math.sign(b.x - p.x) * Math.abs(bell.vx) * 1.65;
          const count = (s.bellParries[bell.volley] ?? 0) + 1;
          s.bellParries[bell.volley] = count;
          b.tripleParries = count;
          if (bell.total === 3 && count === 3) s.stats.triple = true;
          this.notice('飞铃弹回', 800);
          return;
        }
        b.tripleParries += 1;
        const last = b.hitIndex >= move.hits.length;
        if (move.hits.length === 3 && b.tripleParries === 3) s.stats.triple = true;
        const stopRush = move.kind === 'rush';
        this.stagger(last || stopRush ? 520 : 160, last || stopRush ? "recover" : "windup", last || stopRush);
        this.notice(stopRush ? '截停突进' : last ? "弹反震退" : "弹反成功", 650);
        b.spirit = Math.max(0, b.spirit - 2);
        this.pressure(30);
        if (b.spirit <= 0) this.finish(true);
        return;
      }
      const cost = this.guardCost;
      if (p.stamina >= cost) {
        p.stamina -= cost;
        p.exertionAt = s.t;
        s.stats.guards += 1;
        p.x = clamp(
          p.x - p.facing * (this.progress.charm === "steady" ? 7 : 16),
          100,
          1180,
        );
        p.stunUntil = s.t + 110;
        this.emit("guard", p.x);
        this.notice("挡住了", 500);
        return;
      }
      p.stamina = 0;
      this.deny('guard', 'stamina', cost);
      p.stunUntil = s.t + 800;
      this.notice("防守失衡", 1000);
    }
    if (s.t - p.hurtAt < 380) return;
    p.hp -= 1;
    s.stats.damage += 1;
    p.hurtAt = s.t;
    p.stunUntil = Math.max(p.stunUntil, s.t + 270);
    p.exertionAt = s.t;
    p.x = clamp(p.x - p.facing * 24, 100, 1180);
    s.lastMistake =
      p.stamina < 12
        ? "体力耗尽，防守失衡。"
        : heavy
          ? move.kind === 'ward' ? '钟域扩散，没能回到中央。' : "重击落点里，没有退路。"
          : "出手太急，接招慢了一步。";
    this.emit("hurt", p.x);
    if (p.hp <= 0) this.finish(false);
  }

  private finish(won: boolean) {
    const s = this.state;
    const { campaign } = this.progress;
    s.phase = won ? (campaign.bossIndex === 2 ? "ending" : "won") : "lost";
    this.held.clear();
    this.progress.bestDamage = Math.max(
      this.progress.bestDamage,
      this.damagePercent,
    );
    this.progress.bestParries = Math.max(
      this.progress.bestParries,
      s.stats.parries,
    );
    if (won) {
      this.progress.wins += 1;
      const record: BattleRecord = {
        bossId: this.bossDefinition.id,
        bossIndex: campaign.bossIndex,
        elapsed: Math.round(s.elapsed),
        health: s.player.hp,
        attempts: campaign.attempts[campaign.bossIndex],
        stats: { ...s.stats },
        vow: this.progress.vow,
        vowMet: this.vowMet,
        difficulty: this.difficulty,
        charm: this.progress.charm,
      };
      campaign.cleared[campaign.bossIndex] = record;
      campaign.checkpoint = s.phase === "ending" ? "ending" : "won";
      const stamp = `${this.bossDefinition.id}:${this.progress.vow}:${this.difficulty}`;
      if (this.vowMet && !this.progress.stamps.includes(stamp)) this.progress.stamps.push(stamp);
      if (s.phase === "ending") {
        this.progress.chapterWins += 1;
        const total = campaign.cleared.reduce(
          (sum, item) => sum + item.elapsed,
          0,
        );
        this.progress.bestTime = Math.min(
          this.progress.bestTime ?? Infinity,
          total,
        );
      }
    } else campaign.checkpoint = "ready";
    this.emit(won ? s.phase === 'ending' ? 'chapter' : "win" : "lose", s.player.x);
    this.save();
  }
  private notice(text: string, duration: number) {
    this.state.notice = text;
    this.state.noticeUntil = this.state.t + duration;
  }
  private emit(cue: Cue, x: number) {
    this.eventId += 1;
    this.state.events.push({
      id: this.eventId,
      cue,
      t: this.state.t,
      visualAt: this.state.feedbackT,
      x,
    });
    if (this.state.events.length > 35) this.state.events.shift();
  }
  snapshot() {
    const s = this.state;
    return {
      game: "岁岁过招",
      version: CONTENT_VERSION,
      coordinates: "1280x720, origin top-left, x right, feet y=564",
      phase: s.phase,
      pausedReason: s.pauseReason,
      t: Math.round(s.t),
      elapsed: Math.round(s.elapsed),
      feedbackT: Math.round(s.feedbackT),
      hitStopRemaining: s.hitStopRemaining,
      parryWindowOpen: this.parryWindowOpen,
      incomingBellMs: Number.isFinite(this.incomingBellMs) ? this.incomingBellMs : null,
      projectiles: s.projectiles.map(bell => ({ ...bell })),
      denial: s.denial && s.feedbackT - s.denial.visualAt < 1300 ? { ...s.denial } : null,
      lastParry:
        [...s.events].reverse().find((event) => event.cue === "parry") ?? null,
      bindings: { ...this.progress.bindings },
      player: {
        ...s.player,
        guarding: this.held.has("guard"),
        dodging: s.t - s.player.dashAt < 300,
        dodgeCost: this.dodgeCost,
        attackCost: this.attackCost,
        guardCost: this.guardCost,
      },
      boss: {
        ...s.boss,
        id: this.bossDefinition.id,
        name: this.bossDefinition.name,
        maxSpirit: this.bossDefinition.health,
        nextImpact:
          s.boss.mode === "windup"
            ? (MOVES[s.boss.move].hits[s.boss.hitIndex] ?? null)
            : null,
        attack: { ...MOVES[s.boss.move] },
      },
      stats: { ...s.stats },
      vow: this.progress.vow,
      vowMet: this.vowMet,
      difficulty: this.difficulty,
      assist: this.difficulty === "relaxed",
      charm: this.progress.charm,
      attempts: this.progress.attempts,
      wins: this.progress.wins,
      chapterWins: this.progress.chapterWins,
      stamps: [...this.progress.stamps],
      campaign: structuredClone(this.progress.campaign),
      layout: this.progress.layout,
      notice: s.t <= s.noticeUntil ? s.notice : "",
      muted: this.progress.muted,
    };
  }
}
