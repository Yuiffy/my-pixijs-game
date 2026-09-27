import {
  act,
  createMatch,
  engineFor,
  tickMatch,
  validConfig,
  type Match,
  type MatchConfig,
  type PrepAction,
  type Seat,
} from "./match";

export type Room = {
  code: string;
  revision: number;
  config: MatchConfig;
  seats: Seat[];
  tokens: (string | null)[];
  match: Match | null;
};
export type Command =
  | { kind: "configure"; config: MatchConfig }
  | { kind: "rename"; name: string }
  | { kind: "start" }
  | { kind: "ready"; round: number; ready: boolean }
  | { kind: "continue"; round: number }
  | { kind: "action"; round: number; action: PrepAction };
export const validName = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.trim().length <= 12;
export function configure(room: Room, config: MatchConfig): Room | null {
  if (room.match || !validConfig(config)) return null;
  const occupied = room.tokens.flatMap((t, i) => (t ? [i] : []));
  if (
    occupied.some((i) => i >= config.seats) ||
    config.aiCount > config.seats - occupied.length
  ) return null;
  const tokens = Array.from(
    { length: config.seats },
    (_, i) => room.tokens[i] || null,
  );
  const seats = tokens.map((t, i) => (t ? room.seats[i] : { name: "等待玩家", ai: false, joined: false }),);
  let ai = config.aiCount;
  for (let i = seats.length - 1; i > 0 && ai > 0; i--) {
    if (!tokens[i]) {
      seats[i] = { name: `电脑 ${i + 1}`, ai: true, joined: true };
      ai--;
    }
  }
  return { ...room, config, seats, tokens };
}
export function createRoom(
  code: string,
  tokenHash: string,
  name: string,
  config: MatchConfig,
): Room {
  if (!validName(name) || !validConfig(config)) throw new Error("房间配置有误");
  const room = configure(
    {
      code,
      revision: 0,
      config,
      seats: [{ name: name.trim(), ai: false, joined: true }],
      tokens: [tokenHash],
      match: null,
    },
    config,
  );
  if (!room) throw new Error("房间配置有误");
  return room;
}
export function joinRoom(room: Room, hash: string, name: string): Room | null {
  if (room.match || !validName(name)) return null;
  const index = room.seats.findIndex((p) => !p.ai && !p.joined);
  if (index < 0) return null;
  const next = structuredClone(room);
  next.seats[index] = { name: name.trim(), ai: false, joined: true };
  next.tokens[index] = hash;
  return next;
}
export function applyCommand(
  room: Room,
  seat: number,
  command: Command,
  seed: number,
  now = Date.now(),
): Room | null {
  if (!room.tokens[seat] || !command || typeof command !== "object") return null;
  if (command.kind === "configure") return seat === 0 ? configure(room, command.config) : null;
  if (command.kind === "rename") {
    if (room.match || !validName(command.name)) return null;
    const next = structuredClone(room);
    next.seats[seat].name = command.name.trim();
    return next;
  }
  if (command.kind === "start") {
    if (seat !== 0 || room.match || room.seats.some((p) => !p.joined)) return null;
    return { ...room, match: createMatch(room.config, room.seats, seed, now) };
  }
  if (
    !room.match ||
    command.round !== room.match.round ||
    room.match.phase === "finished"
  ) return null;
  const match = structuredClone(room.match);
  const player = match.players[seat];
  if (player.hp <= 0) return null;
  if (
    command.kind === "ready" &&
    match.phase === "preparation" &&
    typeof command.ready === "boolean"
  ) player.ready = command.ready;
  // Legacy clients cannot shorten the shared battle / rescue timeline.
  else if (
    command.kind === "continue" &&
    match.phase === "review" &&
    now >= match.deadline
  ) player.acknowledged = true;
  else if (
    command.kind === "action" &&
    match.phase === "preparation" &&
    !player.ready &&
    command.action &&
    typeof command.action === "object"
  ) {
    const e = engineFor(player.snapshot);
    if (!act(e, command.action)) return null;
    player.snapshot = e.getSimulationSnapshot();
  } else return null;
  player.revision++;
  return { ...room, match: tickMatch(match, now) };
}
export function tickRoom(room: Room, now = Date.now()): Room {
  if (!room.match) return room;
  const match = tickMatch(room.match, now);
  return match === room.match ? room : { ...room, match };
}
export function viewRoom(room: Room, seat: number, now = Date.now()) {
  const m = room.match;
  const self = m ? engineFor(m.players[seat].snapshot) : null;
  if (self && m?.mode === "coop") self.state.enemySeed = m.seed;
  return {
    code: room.code,
    revision: room.revision,
    serverNow: now,
    config: room.config,
    seat,
    seats: room.seats,
    match: m && {
      version: m.version,
      mode: m.mode,
      round: m.round,
      phase: m.phase,
      deadline: m.deadline,
      timeline: m.timeline,
      players: m.players.map(({ snapshot, ...p }) => p),
      pairings: m.pairings,
      battles: m.battles,
      winners: m.winners,
      self: self!.state,
      simulation:
        self &&
        (({ state: _state, ...simulation }) => simulation)(
          m.players[seat].snapshot,
        ),
      boardCap: self!.boardCap,
      upgradeCost: self!.upgradeCost,
      traits: self!.getActiveTraits(),
      interest: self!.interestIncome,
    },
  };
}
export type RoomView = ReturnType<typeof viewRoom>;
export function summarizeRoom(room: Room) {
  return {
    code: room.code,
    host: room.seats[0].name,
    mode: room.config.mode,
    seats: room.config.seats,
    aiCount: room.config.aiCount,
    joined: room.seats.filter((p) => p.joined && !p.ai).length,
  };
}
export type RoomSummary = ReturnType<typeof summarizeRoom>;
