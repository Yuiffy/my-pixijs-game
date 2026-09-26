import RAPIER from "@dimforge/rapier3d-compat";
import type { UnitId } from "../autoChessGame/core/data/types";

export type FlickSide = "red" | "blue";
export type FlickKind = "rook" | "horse" | "elephant" | "advisor" | "general" | "cannon" | "pawn";
export type FlickPhase = "aiming" | "moving" | "finished";

export const FLICK_BOARD = { width: 11.4, length: 16.1, thickness: 0.24 } as const;

export interface FlickExitSnapshot {
  x: number;
  y: number;
  z: number;
  angle: number;
  vx: number;
  vy: number;
  vz: number;
  shotCount: number;
}

export interface FlickPieceSnapshot {
  id: string;
  side: FlickSide;
  kind: FlickKind;
  unitId: UnitId;
  portrait: string;
  characterName: string;
  x: number;
  y: number;
  z: number;
  angle: number;
  radius: number;
  height: number;
  mass: number;
  inPlay: boolean;
  exit: FlickExitSnapshot | null;
}

export interface FlickSnapshot {
  board: typeof FLICK_BOARD;
  phase: FlickPhase;
  turn: FlickSide;
  winner: FlickSide | "draw" | null;
  pieces: FlickPieceSnapshot[];
  remaining: Record<FlickSide, number>;
  shotCount: number;
}

export interface FlickShot {
  pieceId: string;
  angle: number;
  power: number;
}

interface PieceSpec {
  radius: number;
  height: number;
  mass: number;
}

interface Character {
  unitId: UnitId;
  name: string;
  filename: string;
}

interface PieceRuntime extends FlickPieceSnapshot {
  body: RAPIER.RigidBody | null;
}

interface AiCandidate {
  shot: FlickShot;
  priority: number;
}

const STEP_SECONDS = 1 / 60;
const SETTLED_SPEED = 0.14;
const SETTLED_ANGULAR_SPEED = 0.35;
const SETTLED_SECONDS = 0.45;
const MAX_SHOT_SECONDS = 16;
const FILE_SPACING = 1.1725;
const AI_PAIR_LIMIT = 4;
const AI_ROLLOUT_LIMIT = 24;
const RED_BACK: FlickKind[] = ["rook", "horse", "elephant", "advisor", "general", "advisor", "elephant", "horse", "rook"];
const SPEC: Record<FlickKind, PieceSpec> = {
  general: { radius: 0.51, height: 0.28, mass: 2.1 },
  rook: { radius: 0.47, height: 0.26, mass: 1.7 },
  elephant: { radius: 0.45, height: 0.25, mass: 1.45 },
  cannon: { radius: 0.44, height: 0.24, mass: 1.3 },
  horse: { radius: 0.43, height: 0.24, mass: 1.25 },
  advisor: { radius: 0.42, height: 0.23, mass: 1.15 },
  pawn: { radius: 0.37, height: 0.21, mass: 0.85 },
};

const CHARACTERS: Record<FlickSide, readonly Character[]> = {
  red: [
    { unitId: "sui", name: "小红帽", filename: "sui.png" },
    { unitId: "shiori", name: "椰子栞", filename: "shiori.png" },
    { unitId: "pako", name: "帕可", filename: "pako.png" },
    { unitId: "kioi", name: "美·鱿鱼", filename: "kioi.png" },
    { unitId: "mumu", name: "木木", filename: "mumu.png" },
    { unitId: "tiandou", name: "恬豆", filename: "tiandou.png" },
    { unitId: "zeyin", name: "泽音", filename: "zeyin.png" },
    { unitId: "rei", name: "阿梨", filename: "rei.png" },
    { unitId: "lian", name: "梨安", filename: "lian.png" },
    { unitId: "sumi", name: "礼墨", filename: "sumi.png" },
    { unitId: "yua", name: "悠亚", filename: "yua.png" },
    { unitId: "biscuit_sui", name: "饼干岁", filename: "biscuit_sui.png" },
    { unitId: "sui_blue", name: "贪吃岁", filename: "sui_blue.png" },
    { unitId: "sui_bird", name: "小岁鸟", filename: "sui_bird.png" },
    { unitId: "sui_flower", name: "暴龙岁", filename: "sui_flower.png" },
    { unitId: "sui_cat", name: "小猫拳", filename: "sui_cat.png" },
  ],
  blue: [
    { unitId: "ember_blade", name: "兔子射手", filename: "ember-blade.png" },
    { unitId: "gale_archer", name: "浣熊店员", filename: "raccoon-archer.png" },
    { unitId: "sun_guard", name: "果冻风纪", filename: "sun-guard.png" },
    { unitId: "mossback", name: "绒绒的狗", filename: "mossback.png" },
    { unitId: "clock_gunner", name: "老弥", filename: "clock-gunner.png" },
    { unitId: "dawn_duelist", name: "大黑鼠", filename: "dawn_duelist.png" },
    { unitId: "cog_scribe", name: "轴轴的宝", filename: "cog-scribe.png" },
    { unitId: "spark_mage", name: "北欧魔法师", filename: "spark-mage.png" },
    { unitId: "grove_mender", name: "七海大鲨鱼", filename: "grove_mender.png" },
    { unitId: "cinder_ram", name: "蛙梓", filename: "cinder_ram.png" },
    { unitId: "seki_boar_king", name: "星汐", filename: "seki_boar_king.png" },
    { unitId: "nagisa", name: "米米", filename: "nagisa.png" },
    { unitId: "nori", name: "能能弄你", filename: "nori.png" },
    { unitId: "meme", name: "毛神", filename: "meme.png" },
    { unitId: "youyi", name: "又一", filename: "youyi.png" },
    { unitId: "guangyi", name: "光一", filename: "guangyi.png" },
  ],
};

const opposite = (side: FlickSide): FlickSide => (side === "red" ? "blue" : "red");
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const edgePressure = (x: number, z: number) => Math.max(
  Math.abs(x) / (FLICK_BOARD.width / 2),
  Math.abs(z) / (FLICK_BOARD.length / 2),
);

export class FlickGame {
  private world: RAPIER.World;
  private pieces: PieceRuntime[] = [];
  private phase: FlickPhase = "aiming";
  private turn: FlickSide = "red";
  private winner: FlickSide | "draw" | null = null;
  private shotCount = 0;
  private accumulator = 0;
  private settledFor = 0;
  private shotElapsed = 0;
  private destroyed = false;

  constructor() {
    this.world = this.createWorld();
    this.setupPieces();
  }

  private createWorld() {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = STEP_SECONDS;
    world.numSolverIterations = 8;
    const board = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -FLICK_BOARD.thickness / 2, 0));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(FLICK_BOARD.width / 2, FLICK_BOARD.thickness / 2, FLICK_BOARD.length / 2)
        .setFriction(0.28)
        .setRestitution(0.12),
      board,
    );
    return world;
  }

  private addPiece(side: FlickSide, index: number, kind: FlickKind, x: number, z: number) {
    const spec = SPEC[kind];
    const character = CHARACTERS[side][index];
    const y = spec.height / 2 + 0.01;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .enabledRotations(false, true, false)
        .setLinearDamping(0.16)
        .setAngularDamping(1.4)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(spec.height / 2, spec.radius)
        .setMass(spec.mass)
        .setFriction(0.34)
        .setRestitution(0.67),
      body,
    );
    this.pieces.push({
      id: `${side}-${index}`,
      side,
      kind,
      unitId: character.unitId,
      portrait: `/images/autochess/portraits/minimal/${character.filename}`,
      characterName: character.name,
      x,
      y,
      z,
      angle: 0,
      ...spec,
      inPlay: true,
      exit: null,
      body,
    });
  }

  private setupPieces() {
    (["red", "blue"] as const).forEach((side) => {
      const direction = side === "red" ? 1 : -1;
      RED_BACK.forEach((kind, index) => this.addPiece(side, index, kind, (index - 4) * FILE_SPACING, direction * 7.2));
      this.addPiece(side, 9, "cannon", -3 * FILE_SPACING, direction * 4);
      this.addPiece(side, 10, "cannon", 3 * FILE_SPACING, direction * 4);
      for (let index = 0; index < 5; index++) {
        this.addPiece(side, index + 11, "pawn", (index - 2) * 2 * FILE_SPACING, direction * 2.4);
      }
    });
  }

  private updatePiecePose(piece: PieceRuntime) {
    if (!piece.body) return;
    const position = piece.body.translation();
    const rotation = piece.body.rotation();
    piece.x = position.x;
    piece.y = position.y;
    piece.z = position.z;
    piece.angle = 2 * Math.atan2(rotation.y, rotation.w);
  }

  private removeOutOfBounds() {
    this.pieces.forEach((piece) => {
      if (!piece.body) return;
      this.updatePiecePose(piece);
      const outside = Math.abs(piece.x) > FLICK_BOARD.width / 2 + piece.radius * 0.35
        || Math.abs(piece.z) > FLICK_BOARD.length / 2 + piece.radius * 0.35
        || piece.y < -0.36;
      if (outside) {
        const velocity = piece.body.linvel();
        piece.exit = {
          x: piece.x,
          y: piece.y,
          z: piece.z,
          angle: piece.angle,
          vx: velocity.x,
          vy: velocity.y,
          vz: velocity.z,
          shotCount: this.shotCount,
        };
        this.world.removeRigidBody(piece.body);
        piece.body = null;
        piece.inPlay = false;
      }
    });
  }

  private remaining() {
    return this.pieces.reduce<Record<FlickSide, number>>((counts, piece) => {
      if (piece.inPlay) counts[piece.side]++;
      return counts;
    }, { red: 0, blue: 0 });
  }

  private finishTurn() {
    this.pieces.forEach((piece) => piece.body?.sleep());
    const counts = this.remaining();
    if (counts.red === 0 && counts.blue === 0) this.winner = "draw";
    else if (counts.red === 0) this.winner = "blue";
    else if (counts.blue === 0) this.winner = "red";
    if (this.winner) this.phase = "finished";
    else {
      this.turn = opposite(this.turn);
      this.phase = "aiming";
    }
    this.settledFor = 0;
    this.shotElapsed = 0;
  }

  launch(pieceId: string, angleRadians: number, power: number): boolean {
    if (this.destroyed || this.phase !== "aiming" || !Number.isFinite(angleRadians)
      || !Number.isFinite(power) || power <= 0 || power > 1) return false;
    const piece = this.pieces.find((candidate) => candidate.id === pieceId);
    if (!piece?.body || piece.side !== this.turn) return false;
    const speed = 1 + 10 * power;
    const impulse = speed * piece.mass;
    piece.body.applyImpulse({ x: Math.cos(angleRadians) * impulse, y: 0, z: Math.sin(angleRadians) * impulse }, true);
    this.phase = "moving";
    this.shotCount++;
    this.accumulator = 0;
    this.settledFor = 0;
    this.shotElapsed = 0;
    return true;
  }

  step(deltaSeconds: number): FlickSnapshot {
    if (this.destroyed) throw new Error("FlickGame has been destroyed");
    if (this.phase === "finished" || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.snapshot();
    this.accumulator += Math.min(deltaSeconds, 0.25);
    while (this.accumulator >= STEP_SECONDS) {
      this.world.step();
      this.removeOutOfBounds();
      this.accumulator -= STEP_SECONDS;
      if (this.phase === "moving") {
        const counts = this.remaining();
        if (counts.red === 0 || counts.blue === 0) {
          this.finishTurn();
          break;
        }
      }
      if (this.phase !== "moving") continue;
      this.shotElapsed += STEP_SECONDS;
      const moving = this.pieces.some((piece) => {
        if (!piece.body) return false;
        const velocity = piece.body.linvel();
        const angular = piece.body.angvel();
        return Math.hypot(velocity.x, velocity.y, velocity.z) > SETTLED_SPEED
          || Math.abs(angular.y) > SETTLED_ANGULAR_SPEED;
      });
      this.settledFor = moving ? 0 : this.settledFor + STEP_SECONDS;
      if (this.shotElapsed >= MAX_SHOT_SECONDS) {
        this.pieces.forEach((piece) => {
          piece.body?.setLinvel({ x: 0, y: 0, z: 0 }, true);
          piece.body?.setAngvel({ x: 0, y: 0, z: 0 }, true);
          piece.body?.sleep();
        });
      }
      if (this.settledFor >= SETTLED_SECONDS || this.shotElapsed >= MAX_SHOT_SECONDS) {
        this.finishTurn();
        break;
      }
    }
    return this.snapshot();
  }

  snapshot(): FlickSnapshot {
    if (this.destroyed) throw new Error("FlickGame has been destroyed");
    this.pieces.forEach((piece) => this.updatePiecePose(piece));
    return {
      board: FLICK_BOARD,
      phase: this.phase,
      turn: this.turn,
      winner: this.winner,
      pieces: this.pieces.map(({ body, ...piece }) => ({ ...piece, exit: piece.exit ? { ...piece.exit } : null })),
      remaining: this.remaining(),
      shotCount: this.shotCount,
    };
  }

  reset(): FlickSnapshot {
    if (this.destroyed) throw new Error("FlickGame has been destroyed");
    this.world.free();
    this.world = this.createWorld();
    this.pieces = [];
    this.phase = "aiming";
    this.turn = "red";
    this.winner = null;
    this.shotCount = 0;
    this.accumulator = 0;
    this.settledFor = 0;
    this.shotElapsed = 0;
    this.setupPieces();
    return this.snapshot();
  }

  destroy() {
    if (this.destroyed) return;
    this.world.free();
    this.pieces = [];
    this.destroyed = true;
  }

  static chooseAiShot(snapshot: FlickSnapshot): FlickShot | null {
    if (snapshot.phase !== "aiming" || snapshot.winner) return null;
    const own = snapshot.pieces.filter((piece) => piece.inPlay && piece.side === snapshot.turn);
    const enemies = snapshot.pieces.filter((piece) => piece.inPlay && piece.side !== snapshot.turn);
    if (!own.length || !enemies.length) return null;

    const pairs = own.flatMap((piece) => enemies.map((target) => {
      const dx = target.x - piece.x;
      const dz = target.z - piece.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.001) return null;
      const directionX = dx / distance;
      const directionZ = dz / distance;
      let friendlyBlockers = 0;
      let enemyBlockers = 0;
      snapshot.pieces.forEach((other) => {
        if (!other.inPlay || other.id === piece.id || other.id === target.id) return;
        const along = (other.x - piece.x) * directionX + (other.z - piece.z) * directionZ;
        const across = Math.abs((other.x - piece.x) * directionZ - (other.z - piece.z) * directionX);
        if (along > piece.radius && along < distance - target.radius
          && across < piece.radius + other.radius + 0.06) {
          if (other.side === piece.side) friendlyBlockers++;
          else enemyBlockers++;
        }
      });
      const edge = edgePressure(target.x, target.z);
      const outward = (target.x * directionX) / (FLICK_BOARD.width / 2)
        + (target.z * directionZ) / (FLICK_BOARD.length / 2);
      return {
        piece,
        target,
        distance,
        angle: Math.atan2(dz, dx),
        priority: 5 / (1 + distance) + edge * 1.1 + outward * 0.45
          + (piece.mass / target.mass) * 0.3 - friendlyBlockers * 1.8 - enemyBlockers * 0.35,
      };
    }).filter((pair): pair is NonNullable<typeof pair> => pair !== null));
    pairs.sort((a, b) => b.priority - a.priority);

    const candidates: AiCandidate[] = [];
    pairs.slice(0, AI_PAIR_LIMIT).forEach(({ piece, target, distance, angle, priority }) => {
      const travel = Math.max(0, distance - piece.radius - target.radius);
      const basePower = clamp((Math.sqrt(2 * 2.7 * travel) + 1.4 - 1) / 10, 0.2, 1);
      const powerChoices = [basePower, clamp(basePower + 0.22, 0.2, 1)];
      const angleOffset = Math.atan2(target.radius * 0.62, distance);
      [0, -angleOffset, angleOffset].forEach((offset) => {
        powerChoices.forEach((power) => {
          if (candidates.length >= AI_ROLLOUT_LIMIT) return;
          candidates.push({ shot: { pieceId: piece.id, angle: angle + offset, power }, priority });
        });
      });
    });

    const preview = new FlickGame();
    const handles = new Map<string, number>();
    preview.pieces.forEach((piece) => {
      const source = snapshot.pieces.find((candidate) => candidate.id === piece.id);
      if (!source || !source.inPlay) {
        if (piece.body) preview.world.removeRigidBody(piece.body);
        piece.body = null;
        return;
      }
      if (!piece.body) return;
      piece.body.setTranslation({ x: source.x, y: source.y, z: source.z }, true);
      piece.body.setRotation({ x: 0, y: Math.sin(source.angle / 2), z: 0, w: Math.cos(source.angle / 2) }, true);
      piece.body.sleep();
      handles.set(piece.id, piece.body.handle);
    });
    const worldSnapshot = preview.world.takeSnapshot();
    preview.destroy();

    let best: { shot: FlickShot; score: number } | null = null;
    for (let index = 0; index < candidates.length; index++) {
      const { shot, priority } = candidates[index];
      const world = RAPIER.World.restoreSnapshot(worldSnapshot);
      try {
        const shooter = snapshot.pieces.find((piece) => piece.id === shot.pieceId);
        const shooterHandle = handles.get(shot.pieceId);
        if (!shooter || shooterHandle === undefined) continue;
        const shooterBody = world.getRigidBody(shooterHandle);
        const impulse = (1 + 10 * shot.power) * shooter.mass;
        shooterBody.applyImpulse({
          x: Math.cos(shot.angle) * impulse,
          y: 0,
          z: Math.sin(shot.angle) * impulse,
        }, true);
        const active = snapshot.pieces.filter((piece) => piece.inPlay).map((piece) => ({
          piece,
          body: world.getRigidBody(handles.get(piece.id)!),
          out: false,
        }));
        const remaining = { ...snapshot.remaining };
        let settledFor = 0;
        for (let step = 0; step < MAX_SHOT_SECONDS / STEP_SECONDS; step++) {
          world.step();
          let moving = false;
          active.forEach((entry) => {
            if (entry.out) return;
            const position = entry.body.translation();
            if (Math.abs(position.x) > FLICK_BOARD.width / 2 + entry.piece.radius * 0.35
              || Math.abs(position.z) > FLICK_BOARD.length / 2 + entry.piece.radius * 0.35
              || position.y < -0.36) {
              world.removeRigidBody(entry.body);
              entry.out = true;
              remaining[entry.piece.side]--;
              return;
            }
            const velocity = entry.body.linvel();
            const angular = entry.body.angvel();
            if (Math.hypot(velocity.x, velocity.y, velocity.z) > SETTLED_SPEED
              || Math.abs(angular.y) > SETTLED_ANGULAR_SPEED) moving = true;
          });
          if (remaining.red === 0 || remaining.blue === 0) break;
          settledFor = moving ? 0 : settledFor + STEP_SECONDS;
          if (settledFor >= SETTLED_SECONDS) break;
        }

        let score = priority * 0.02;
        active.forEach(({ piece, body, out }) => {
          const sign = piece.side === snapshot.turn ? -1 : 1;
          if (out) {
            score += sign * (piece.kind === "general" ? 21 : 17);
            return;
          }
          const position = body.translation();
          const movement = Math.hypot(position.x - piece.x, position.z - piece.z);
          score += sign * (3.2 * (edgePressure(position.x, position.z)
            - edgePressure(piece.x, piece.z)) + 0.09 * Math.min(movement, 6));
        });
        if (!best || score > best.score) best = { shot, score };
      } finally {
        world.free();
      }
    }
    return best?.shot ?? null;
  }
}

let rapierReady: Promise<void> | null = null;

export async function createFlickGame(): Promise<FlickGame> {
  if (!rapierReady) {
    rapierReady = RAPIER.init().catch((error: unknown) => {
      rapierReady = null;
      throw error;
    });
  }
  await rapierReady;
  return new FlickGame();
}

export function chooseAiShot(snapshot: FlickSnapshot): FlickShot | null {
  return FlickGame.chooseAiShot(snapshot);
}
