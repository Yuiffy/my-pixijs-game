import { createHash, randomBytes } from "node:crypto";
import { getPool } from "./db";
import type { Room } from "../components/autoChessGame/multiplayer/room";

export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const newSeed = () => randomBytes(4).readUInt32BE(0);
export const newCode = () => Array.from(
    randomBytes(8),
    (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32],
  ).join("");
export const validCode = (v: unknown): v is string => typeof v === "string" && /^[A-Z2-9]{8}$/.test(v);
export const validToken = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);

let schema: Promise<unknown> | null = null;
export async function ensureRooms() {
  if (!schema) schema = getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS autochess_rooms (
    code text PRIMARY KEY, revision integer NOT NULL DEFAULT 0, data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now())`,
      )
      .catch((error) => {
        schema = null;
        throw error;
      });
  await schema;
}
export async function findRoom(code: string): Promise<Room | null> {
  const result = await getPool().query(
    `SELECT data, revision FROM autochess_rooms WHERE code = $1
    AND updated_at > now() - interval '7 days'`,
    [code],
  );
  return result.rows[0]
    ? { ...result.rows[0].data, revision: result.rows[0].revision }
    : null;
}
export async function saveRoom(before: Room, next: Room): Promise<Room | null> {
  const updated = { ...next, revision: before.revision + 1 };
  const result = await getPool().query(
    `UPDATE autochess_rooms SET data = $1::jsonb,
    revision = revision + 1, updated_at = now() WHERE code = $2 AND revision = $3 RETURNING code`,
    [JSON.stringify(updated), before.code, before.revision],
  );
  return result.rows.length ? updated : null;
}
