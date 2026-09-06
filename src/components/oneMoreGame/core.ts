export type Phase = "ready" | "fight" | "paused" | "won" | "lost";
export type Vow = "clear" | "combo" | "perfect";
export type Move = "sweep" | "triple" | "slam";
export type Input = "left" | "right" | "attack" | "guard" | "dodge";
export type ControlAction = Input | 'pause';
export const CONTROLS: { id: ControlAction; label: string }[] = [
  { id: 'left', label: '向左移动' }, { id: 'right', label: '向右移动' },
  { id: 'attack', label: '挥剑' }, { id: 'guard', label: '格挡 / 弹反' },
  { id: 'dodge', label: '闪避' }, { id: 'pause', label: '暂停' },
];
export const DEFAULT_BINDINGS: Record<ControlAction, string> = {
  left: 'KeyA', right: 'KeyD', attack: 'KeyJ', guard: 'KeyK', dodge: 'Space', pause: 'Escape',
};
export const KEY_OPTIONS = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').map(letter => `Key${letter}`)
  .concat(['Space', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ShiftLeft', 'Enter']);
export const keyLabel = (code: string) => (({ Space: 'Space', Escape: 'Esc', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ShiftLeft: 'Shift', Enter: 'Enter' } as Record<string, string>)[code] ?? code.replace('Key', ''));
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
  | "lose";

export const WIDTH = 1280;
export const HEIGHT = 720;
export const FLOOR = 564;
export const SAVE_KEY = "sui-sparring-v1";
export const VOWS: { id: Vow; name: string; target: string }[] = [
  { id: "clear", name: "这把拿下", target: "击败饼师傅" },
  { id: "combo", name: "三招全接", target: "完整弹反一组三连，并获胜" },
  { id: "perfect", name: "一滴不掉", target: "不受伤，赢下这一场" },
];
export const MOVES: Record<
  Move,
  { name: string; hits: number[]; recovery: number }
> = {
  sweep: { name: "试探横挥", hits: [1050], recovery: 1150 },
  triple: { name: "三连敲击", hits: [1100, 1650, 2200], recovery: 1550 },
  slam: { name: "举势重击", hits: [1450], recovery: 1700 },
};

export interface Progress {
  version: 1;
  attempts: number;
  wins: number;
  bestDamage: number;
  bestParries: number;
  bestTime: number | null;
  stamps: string[];
  vow: Vow;
  assist: boolean;
  muted: boolean;
  volume: number;
  bindings: Record<ControlAction, string>;
}
export const freshProgress = (): Progress => ({
  version: 1,
  attempts: 0,
  wins: 0,
  bestDamage: 0,
  bestParries: 0,
  bestTime: null,
  stamps: [],
  vow: "clear",
  assist: false,
  muted: true,
  volume: 0.35,
  bindings: { ...DEFAULT_BINDINGS },
});
export function readProgress(raw: string | null): Progress {
  const fallback = freshProgress();
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw);
    if (data?.version !== 1) return fallback;
    const bindings = { ...DEFAULT_BINDINGS, ...data.bindings };
    const codes = CONTROLS.map(control => bindings[control.id]);
    const validBindings = codes.every(code => KEY_OPTIONS.includes(code)) && new Set(codes).size === CONTROLS.length;
    const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : 0);
    return {
      ...fallback,
      bindings: validBindings ? bindings : { ...DEFAULT_BINDINGS },
      attempts: count(data.attempts),
      wins: count(data.wins),
      bestDamage: Math.min(100, count(data.bestDamage)),
      bestParries: count(data.bestParries),
      bestTime:
        typeof data.bestTime === "number" &&
        data.bestTime > 0 &&
        Number.isFinite(data.bestTime)
          ? data.bestTime
          : null,
      stamps: Array.isArray(data.stamps)
        ? data.stamps.filter(
            (s: unknown) => typeof s === "string" &&
              /^(clear|combo|perfect):(standard|assist)$/.test(s),
          )
        : [],
      vow: VOWS.some((v) => v.id === data.vow) ? data.vow : "clear",
      assist: data.assist === true,
      muted: data.muted !== false,
      volume:
        typeof data.volume === "number" && Number.isFinite(data.volume)
          ? Math.max(0, Math.min(1, data.volume))
          : 0.35,
    };
  } catch {
    return fallback;
  }
}

export interface FightState {
  phase: Phase;
  t: number;
  elapsed: number;
  feedbackT: number;
  hitStopRemaining: number;
  pauseReason: string;
  player: {
    x: number;
    hp: number;
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
  };
  boss: {
    x: number;
    facing: number;
    spirit: number;
    mode: "approach" | "windup" | "recover";
    move: Move;
    clock: number;
    hitIndex: number;
    targetX: number;
    sequence: number;
    tripleParries: number;
    hurtAt: number;
  };
  stats: {
    parries: number;
    guards: number;
    dodges: number;
    hits: number;
    damage: number;
    triple: boolean;
  };
  notice: string;
  noticeUntil: number;
  lastMistake: string;
  events: { id: number; cue: Cue; t: number; visualAt: number; x: number }[];
}

const initial = (): FightState => ({
  phase: "ready",
  t: 0,
  elapsed: 0,
  feedbackT: 0,
  hitStopRemaining: 0,
  pauseReason: "",
  player: {
    x: 440,
    hp: 5,
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
  },
  boss: {
    x: 835,
    facing: -1,
    spirit: 100,
    mode: "approach",
    move: "sweep",
    clock: 0,
    hitIndex: 0,
    targetX: 440,
    sequence: 0,
    tripleParries: 0,
    hurtAt: -10000,
  },
  stats: {
    parries: 0,
    guards: 0,
    dodges: 0,
    hits: 0,
    damage: 0,
    triple: false,
  },
  notice: "",
  noticeUntil: 0,
  lastMistake: "",
  events: [],
});
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export class Sparring {
  state = initial();
  held = new Set<Input>();
  progress: Progress;
  onSave?: (progress: Progress) => void;
  private accumulator = 0;
  private eventId = 0;

  constructor(progress = freshProgress()) {
    this.progress = progress;
  }

  save() {
    this.onSave?.({ ...this.progress, stamps: [...this.progress.stamps] });
  }

  choose(vow: Vow) {
    if (this.state.phase === "fight" || this.state.phase === "paused") return;
    this.progress.vow = vow;
    this.save();
  }

  setBinding(action: ControlAction, code: string) {
    if (!KEY_OPTIONS.includes(code)) return;
    const other = CONTROLS.find(control => control.id !== action && this.progress.bindings[control.id] === code);
    if (other) this.progress.bindings[other.id] = this.progress.bindings[action];
    this.progress.bindings[action] = code;
    this.held.clear(); this.save();
  }

  get guardWindowMs() { return this.progress.assist ? 250 : 170; }
  get parryWindowOpen() {
    const { boss } = this.state;
    const next = MOVES[boss.move].hits[boss.hitIndex];
    return this.state.phase === 'fight' && boss.mode === 'windup' && boss.move !== 'slam'
      && next !== undefined && next - boss.clock >= 0 && next - boss.clock <= this.guardWindowMs;
  }

  start() {
    this.state = initial();
    this.state.phase = "fight";
    this.held.clear();
    this.accumulator = 0;
    this.progress.attempts += 1;
    this.emit("start", 640);
    this.notice("请赐教。", 1300);
    this.save();
  }

  ready() {
    this.state = initial();
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

  setAssist(assist: boolean) {
    // A difficulty change takes effect at the next attempt, preserving result conditions.
    if (this.state.phase === "fight" || this.state.phase === "paused") return;
    this.progress.assist = assist;
    this.save();
  }

  input(key: Input, down: boolean) {
    if (!down) {
      this.held.delete(key);
      return;
    }
    if (this.state.phase !== "fight" || this.held.has(key)) return;
    this.held.add(key);
    const s = this.state;
    const p = s.player;
    if (
      key === "guard" &&
      s.t - p.guardAt > 230 &&
      s.t >= p.stunUntil &&
      s.t - p.attackAt >= 150
    ) {
      p.guardAt = s.t;
      p.guardUsed = false;
    }
    if (
      key === "dodge" &&
      s.t - p.dashAt >= 680 &&
      s.t >= p.stunUntil &&
      s.t - p.attackAt >= 150
    ) {
      p.dashAt = s.t;
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
      this.tick(tick * (this.progress.assist ? 0.78 : 1), tick);
      this.accumulator -= tick;
    }
    if (this.state.phase !== "fight") this.accumulator = 0;
  }

  private tick(dt: number, wallDt: number) {
    const s = this.state;
    const p = s.player;
    const b = s.boss;
    s.elapsed += wallDt;
    s.feedbackT += wallDt;
    if (s.hitStopRemaining > 0) {
      s.hitStopRemaining = Math.max(0, s.hitStopRemaining - wallDt);
      return;
    }
    s.t += dt;
    p.facing = p.x <= b.x ? 1 : -1;
    const dash = s.t - p.dashAt < 300;
    const guard = this.held.has("guard") && s.t - p.attackAt >= 150 && !dash;
    if (s.t >= p.stunUntil) {
      const axis =
        Number(this.held.has("right")) - Number(this.held.has("left"));
      p.x = clamp(
        p.x +
          ((dash ? p.dashDirection * 760 : axis * (guard ? 105 : 310)) * dt) /
            1000,
        120,
        1160,
      );
    }
    if (
      this.held.has("attack") &&
      !guard &&
      !dash &&
      s.t >= p.stunUntil &&
      s.t - p.attackAt >= 470
    ) {
      p.attackAt = s.t;
      p.attackHit = false;
      this.emit("attack", p.x);
    }
    if (!p.attackHit && s.t - p.attackAt >= 140) {
      p.attackHit = true;
      if (Math.abs(p.x - b.x) <= 225) {
        s.stats.hits += 1;
        this.damageBoss(b.mode === "recover" ? 3 : 1.25);
        if (s.phase !== "fight") return;
      } else this.emit("whiff", p.x);
    }
    if (b.mode === "approach") {
      b.facing = b.x >= p.x ? -1 : 1;
      if (Math.abs(b.x - p.x) > 185) b.x += (b.facing * 185 * dt) / 1000;
      else {
        b.mode = "windup";
        b.clock = 0;
        b.hitIndex = 0;
        b.targetX = p.x;
        b.tripleParries = 0;
        this.emit(
          b.move === "slam"
            ? "danger"
            : b.move === "triple"
              ? "triple"
              : "swing",
          b.x,
        );
      }
    } else {
      b.clock += dt;
      const move = MOVES[b.move];
      if (b.mode === "windup") {
        if (b.hitIndex < move.hits.length && b.clock >= move.hits[b.hitIndex]) {
          this.bossHit(guard, dash);
          b.hitIndex += 1;
          if (s.phase !== "fight") return;
        }
        if (b.clock >= move.hits[move.hits.length - 1] + 180) {
          b.mode = "recover";
          b.clock = 0;
          if (b.move === "triple" && b.tripleParries === 3) {
            s.stats.triple = true;
            this.notice("三招，全接住了！", 1800);
          } else this.notice("破绽", 850);
        }
      } else if (b.clock >= move.recovery) {
        b.sequence += 1;
        const order: Move[] = [
          "sweep",
          "triple",
          "slam",
          "triple",
          "sweep",
          "slam",
        ];
        b.move = order[b.sequence % order.length];
        b.mode = "approach";
        b.clock = 0;
      }
    }
    b.x = clamp(b.x, 180, 1100);
  }

  private bossHit(guard: boolean, dash: boolean) {
    const s = this.state;
    const p = s.player;
    const b = s.boss;
    const inRange =
      b.move === "slam"
        ? Math.abs(p.x - b.targetX) < 170
        : Math.abs(p.x - b.x) < 260 && (p.x - b.x) * b.facing > -30;
    if (!inRange || (dash && s.t - p.dashAt <= 240)) {
      if (inRange || b.move === "slam") s.stats.dodges += 1;
      return;
    }
    if (guard && b.move !== "slam") {
      if (
        !p.guardUsed &&
        s.t - p.guardAt <= this.guardWindowMs
      ) {
        p.guardUsed = true;
        p.parryAt = s.t;
        s.stats.parries += 1;
        b.tripleParries += 1;
        s.hitStopRemaining = 85;
        this.emit("parry", (p.x + b.x) / 2);
        this.notice("弹反成功", 650);
        // Register the third parry before damage can end the fight.
        if (b.move === "triple" && b.tripleParries === 3) s.stats.triple = true;
        this.damageBoss(5, false);
      } else {
        s.stats.guards += 1;
        p.x = clamp(p.x - p.facing * 18, 120, 1160);
        p.stunUntil = s.t + 100;
        this.emit("guard", p.x);
        this.notice("挡住了", 550);
      }
      return;
    }
    if (s.t - p.hurtAt < 380) return;
    p.hp -= 1;
    s.stats.damage += 1;
    p.hurtAt = s.t;
    p.stunUntil = s.t + 240;
    p.x = clamp(p.x - p.facing * 32, 120, 1160);
    s.lastMistake =
      b.move === "slam"
        ? "重击落地前，闪出那片红色落点。"
        : b.move === "triple"
          ? "第三下也会来。稳住，再接一招。"
          : "木剑扬起来时，留一点防守的余地。";
    this.emit("hurt", p.x);
    if (p.hp <= 0) this.finish(false);
  }

  private damageBoss(amount: number, hitCue = true) {
    this.state.boss.spirit = Math.max(0, this.state.boss.spirit - amount);
    this.state.boss.hurtAt = this.state.t;
    if (hitCue) this.emit("hit", this.state.boss.x);
    if (this.state.boss.spirit <= 0) this.finish(true);
  }

  get vowMet() {
    return (
      this.state.phase === "won" &&
      (this.progress.vow === "clear" ||
        (this.progress.vow === "combo" && this.state.stats.triple) ||
        (this.progress.vow === "perfect" && this.state.stats.damage === 0))
    );
  }

  private finish(won: boolean) {
    const s = this.state;
    s.phase = won ? "won" : "lost";
    this.held.clear();
    this.progress.bestDamage = Math.max(
      this.progress.bestDamage,
      Math.floor(100 - s.boss.spirit),
    );
    this.progress.bestParries = Math.max(
      this.progress.bestParries,
      s.stats.parries,
    );
    if (won) {
      this.progress.wins += 1;
      this.progress.bestTime = Math.min(
        this.progress.bestTime ?? Infinity,
        s.elapsed,
      );
      const stamp = `${this.progress.vow}:${this.progress.assist ? "assist" : "standard"}`;
      if (this.vowMet && !this.progress.stamps.includes(stamp)) this.progress.stamps.push(stamp);
    }
    this.emit(won ? "win" : "lose", s.player.x);
    this.save();
  }

  private notice(text: string, duration: number) {
    this.state.notice = text;
    this.state.noticeUntil = this.state.t + duration;
  }
  private emit(cue: Cue, x: number) {
    this.eventId += 1;
    this.state.events.push({ id: this.eventId, cue, t: this.state.t, visualAt: this.state.feedbackT, x });
    if (this.state.events.length > 30) this.state.events.shift();
  }

  snapshot() {
    const { state: s } = this;
    return {
      game: "岁岁过招",
      version: "0.1.0",
      coordinates: "1280x720, origin top-left, x right, feet y=564",
      phase: s.phase,
      pausedReason: s.pauseReason,
      t: Math.round(s.t),
      elapsed: Math.round(s.elapsed),
      feedbackT: Math.round(s.feedbackT),
      hitStopRemaining: s.hitStopRemaining,
      parryWindowOpen: this.parryWindowOpen,
      lastParry: [...s.events].reverse().find(event => event.cue === 'parry') ?? null,
      bindings: { ...this.progress.bindings },
      player: {
        ...s.player,
        guarding: this.held.has("guard"),
        dodging: s.t - s.player.dashAt < 300,
      },
      boss: {
        ...s.boss,
        nextImpact:
          s.boss.mode === "windup"
            ? (MOVES[s.boss.move].hits[s.boss.hitIndex] ?? null)
            : null,
      },
      stats: { ...s.stats },
      vow: this.progress.vow,
      vowMet: this.vowMet,
      assist: this.progress.assist,
      attempts: this.progress.attempts,
      wins: this.progress.wins,
      stamps: [...this.progress.stamps],
      notice: s.t <= s.noticeUntil ? s.notice : "",
      muted: this.progress.muted,
    };
  }
}
