import { createHash, randomBytes } from "node:crypto";
import {
  type Action,
  type GameState,
  type PlayerConfig,
  type StreamerId,
  ROSTERS,
  chooseAiAction,
  chooseAiClip,
  continueGame,
  createGame,
  launch,
  prepareAi,
  resolveClip,
  restoreGame,
  roll,
  setRoster,
  setWarmup,
  takeAction,
} from "@/components/hypeHarbor/engine";

export type RoomCommand =
  | { kind: "start" }
  | { kind: "roster"; boat: number; streamer: StreamerId }
  | { kind: "warmup"; boat: number; amount: number }
  | { kind: "launch" }
  | { kind: "action"; action: Action }
  | { kind: "clip"; boat: number | null }
  | { kind: "roll" }
  | { kind: "continue" };

export interface RoomRow {
  code: string;
  revision: number;
  rounds: number;
  roster: StreamerId[];
  players: PlayerConfig[];
  tokens: (string | null)[];
  state: GameState | null;
}

export interface RoomView {
  code: string;
  revision: number;
  seat: number;
  players: (PlayerConfig & { joined: boolean })[];
  state: GameState | null;
}

export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const newCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    randomBytes(8),
    (byte) => alphabet[byte % alphabet.length],
  ).join("");
};
export const validCode = (code: unknown): code is string => typeof code === "string" && /^[A-Z2-9]{8}$/.test(code);
export const validToken = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

export function validPlayers(value: unknown): value is PlayerConfig[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 4 &&
    value[0]?.ai === false &&
    value.every(
      (player) => player &&
        typeof player.name === "string" &&
        player.name.trim().length > 0 &&
        player.name.trim().length <= 12 &&
        typeof player.ai === "boolean",
    )
  );
}

export function seatFor(row: RoomRow, token: string): number {
  const hash = tokenHash(token);
  return row.tokens.findIndex((entry) => entry === hash);
}

export function viewRoom(row: RoomRow, seat: number): RoomView {
  return {
    code: row.code,
    revision: row.revision,
    seat,
    players: row.players.map((player, i) => ({
      ...player,
      joined: player.ai || Boolean(row.tokens[i]),
    })),
    // Dice are chosen on the server. The client does not need the RNG seed.
    state: row.state ? { ...row.state, seed: 0 } : null,
  };
}

export function advanceAi(input: GameState): GameState {
  let state = input;
  for (
    let i = 0;
    i < 16 &&
    ["preparing", "placing", "spotlight"].includes(state.phase) &&
    state.players[state.turn].ai;
    i++
  ) {
    if (state.phase === "preparing") state = prepareAi(state);
    else if (state.phase === "placing") state = takeAction(state, chooseAiAction(state).action);
    else state = resolveClip(state, chooseAiClip(state));
  }
  return state;
}

export function applyRoomCommand(
  row: RoomRow,
  seat: number,
  command: RoomCommand,
): RoomRow | null {
  if (command.kind === "start") {
    if (
      seat !== 0 ||
      row.state ||
      row.players.some((p, i) => !p.ai && !row.tokens[i])
    ) return null;
    return {
      ...row,
      state: advanceAi(
        createGame(
          row.players,
          row.rounds,
          randomBytes(4).readUInt32BE(0),
          row.roster,
        ),
      ),
    };
  }
  const { state } = row;
  if (!state) return null;
  let next = state;
  if (
    command.kind === "roster" &&
    state.phase === "preparing" &&
    state.turn === seat &&
    Number.isInteger(command.boat) &&
    typeof command.streamer === "string"
  ) next = setRoster(state, command.boat, command.streamer);
  else if (
    command.kind === "warmup" &&
    state.phase === "preparing" &&
    state.turn === seat &&
    Number.isInteger(command.boat) &&
    Number.isInteger(command.amount)
  ) next = setWarmup(state, command.boat, command.amount);
  else if (
    command.kind === "launch" &&
    state.phase === "preparing" &&
    state.turn === seat
  ) next = launch(state);
  else if (
    command.kind === "action" &&
    state.phase === "placing" &&
    state.turn === seat &&
    command.action &&
    typeof command.action === "object" &&
    typeof command.action.kind === "string" &&
    Number.isInteger(command.action.boat)
  ) next = takeAction(state, command.action);
  else if (
    command.kind === "clip" &&
    state.phase === "spotlight" &&
    state.turn === seat &&
    (command.boat === null || Number.isInteger(command.boat))
  ) next = resolveClip(state, command.boat);
  else if (command.kind === "roll" && state.phase === "sailing") next = roll(state);
  else if (
    command.kind === "continue" &&
    ["reveal", "settlement"].includes(state.phase)
  ) next = continueGame(state);
  if (next === state || next.revision === state.revision) return null;
  next = advanceAi(next);
  return { ...row, state: next };
}

export function parseRoomRow(value: Record<string, unknown>): RoomRow | null {
  const { roster } = value;
  if (
    !validCode(value.code) ||
    !Number.isInteger(value.revision) ||
    ![3, 5].includes(Number(value.rounds)) ||
    !ROSTERS.some(
      (choice) => Array.isArray(roster) &&
        choice.members.every((id, i) => roster[i] === id),
    ) ||
    !validPlayers(value.players) ||
    !Array.isArray(value.tokens) ||
    value.tokens.length !== value.players.length ||
    !value.tokens.every((token) => token === null || typeof token === "string")
  ) return null;
  const state =
    value.state === null ? null : restoreGame(JSON.stringify(value.state));
  if (value.state !== null && !state) return null;
  return {
    code: value.code,
    revision: value.revision as number,
    rounds: Number(value.rounds),
    roster: value.roster as StreamerId[],
    players: value.players,
    tokens: value.tokens,
    state,
  };
}
