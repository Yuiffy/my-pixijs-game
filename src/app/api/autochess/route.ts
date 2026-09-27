import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import {
  ensureRooms,
  findRoom,
  saveRoom,
  tokenHash,
  newCode,
  newToken,
  newSeed,
  validCode,
  validToken,
} from "@/lib/autochessRooms";
import {
  applyCommand,
  createRoom,
  joinRoom,
  summarizeRoom,
  tickRoom,
  validName,
  viewRoom,
  type Command,
  type Room,
} from "@/components/autoChessGame/multiplayer/room";
import { validConfig } from "@/components/autoChessGame/multiplayer/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const json = (body: unknown, status = 200) => NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function GET() {
  if (!process.env.DATABASE_URL) return json({ error: "在线房间尚未配置，本地人机可正常游玩" }, 503);
  try {
    await ensureRooms();
    const { rows } = await getPool().query(`SELECT data FROM autochess_rooms
      WHERE data->'config'->>'isPublic' = 'true' AND data->'match' = 'null'::jsonb
      AND updated_at > now() - interval '7 days' ORDER BY updated_at DESC LIMIT 50`);
    return json({ rooms: rows.map((r) => summarizeRoom(r.data as Room)) });
  } catch (error) {
    console.error("[autochess] room list", error);
    return json({ error: "房间服务暂不可用，可稍后重试或先玩本地人机" }, 503);
  }
}
export async function POST(request: NextRequest) {
  const expected = new URL(request.nextUrl.toString());
  expected.host = request.headers.get("host") || expected.host;
  if (
    request.headers.get("origin") !== expected.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) return json({ error: "请求来源不符" }, 403);
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  ) return json({ error: "需要 JSON 请求" }, 415);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 4096) return json({ error: "请求过大" }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "请求格式有误" }, 400);
  } catch {
    return json({ error: "请求格式有误" }, 400);
  }
  if (!process.env.DATABASE_URL) return json({ error: "在线房间尚未配置" }, 503);
  try {
    await ensureRooms();
    if (body.operation === "create") {
      if (!validName(body.name) || !validConfig(body.config)) return json({ error: "名字或房间配置有误" }, 400);
      const token = newToken();
      const room = createRoom(
        newCode(),
        tokenHash(token),
        body.name,
        body.config,
      );
      await getPool().query(
        "INSERT INTO autochess_rooms (code, data) VALUES ($1, $2::jsonb)",
        [room.code, JSON.stringify(room)],
      );
      return json({ token, room: viewRoom(room, 0) });
    }
    if (!validCode(body.code)) return json({ error: "请填写 8 位房间号" }, 400);
    let room = await findRoom(body.code);
    if (!room) return json({ error: "房间已关闭或超过七天未活动", expired: true }, 404);
    if (body.operation === "join") {
      if (!validName(body.name)) return json({ error: "请填写 1–12 字名字" }, 400);
      const token = newToken();
      const hash = tokenHash(token);
      const changed = joinRoom(room, hash, body.name);
      if (!changed) return json({ error: "房间已满或已经开局" }, 409);
      const saved = await saveRoom(room, changed);
      return saved
        ? json({ token, room: viewRoom(saved, saved.tokens.indexOf(hash)) })
        : json({ error: "有人刚刚加入，请重试" }, 409);
    }
    if (!validToken(body.token)) return json({ error: "房间身份已失效", expired: true }, 401);
    const seat = room.tokens.indexOf(tokenHash(body.token));
    if (seat < 0) return json({ error: "房间身份已失效", expired: true }, 403);
    const advanced = tickRoom(room);
    if (advanced !== room) room = (await saveRoom(room, advanced)) || (await findRoom(room.code));
    if (!room) return json({ error: "房间已关闭", expired: true }, 404);
    if (body.operation === "status") {
      if (body.revision === room.revision) return json({ unchanged: true, revision: room.revision, serverNow: Date.now() });
      return json({ room: viewRoom(room, seat) });
    }
    if (body.operation === "leave") {
      if (room.match) return json(
          { error: "对局已开始，请返回大厅；原席位保留，可随时恢复" },
          409,
        );
      if (seat === 0) {
        const removed = await getPool().query(
          "DELETE FROM autochess_rooms WHERE code = $1 AND revision = $2 RETURNING code",
          [room.code, room.revision],
        );
        return removed.rows.length
          ? json({ ok: true })
          : json({ error: "房间刚刚变化，请重试" }, 409);
      }
      const next = structuredClone(room);
      next.tokens[seat] = null;
      next.seats[seat] = { name: "等待玩家", ai: false, joined: false };
      return (await saveRoom(room, next))
        ? json({ ok: true })
        : json({ error: "房间刚刚变化，请重试" }, 409);
    }
    if (
      body.operation !== "command" ||
      !body.command ||
      typeof body.command !== "object" ||
      Array.isArray(body.command)
    ) return json({ error: "操作格式有误" }, 400);
    for (let attempt = 0; attempt < 4; attempt++) {
      const c = body.command as Command;
      const personal =
        room.match && ["action", "ready", "continue"].includes(c.kind);
      const versionMatches = personal
        ? Number.isInteger(body.playerRevision) &&
          body.playerRevision === room.match!.players[seat].revision
        : body.revision === room.revision;
      if (!versionMatches) return json(
          { error: "你的状态已更新，请再次操作", room: viewRoom(room, seat) },
          409,
        );
      const changed = applyCommand(room, seat, c, newSeed());
      if (!changed) return json(
          {
            error: "当前不能执行此操作，请检查金币、席位或准备状态",
            room: viewRoom(room, seat),
          },
          409,
        );
      // Failed CAS made no changes. Only rebase an unchanged personal version.
      // eslint-disable-next-line no-await-in-loop
      const saved = await saveRoom(room, changed);
      if (saved) return json({ room: viewRoom(saved, seat) });
      // eslint-disable-next-line no-await-in-loop
      const fresh = await findRoom(room.code);
      if (!fresh || fresh.tokens[seat] !== tokenHash(body.token)) return json({ error: "席位已变化，请重新进入", expired: true }, 409);
      room = fresh;
    }
    const latest = await findRoom(room.code);
    return json(
      {
        error: "房间已更新，请再次操作",
        room: latest && viewRoom(latest, seat),
      },
      409,
    );
  } catch (error) {
    console.error("[autochess] room operation", error);
    return json({ error: "房间服务暂不可用，保留了你的席位，请重试" }, 503);
  }
}
