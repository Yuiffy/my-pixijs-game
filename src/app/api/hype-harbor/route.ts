import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { ROSTERS } from "@/components/hypeHarbor/engine";
import {
  type RoomCommand,
  type RoomRow,
  applyRoomCommand,
  newCode,
  newToken,
  parseRoomRow,
  seatFor,
  tokenHash,
  validCode,
  validPlayers,
  validToken,
  viewRoom,
} from "@/lib/hypeHarbor/room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function findRoom(code: string): Promise<RoomRow | null> {
  const { rows } = await getPool().query(
    `SELECT code, revision, rounds, roster, players, tokens, state FROM hype_harbor_rooms
     WHERE code = $1 AND updated_at > now() - interval '7 days'`,
    [code],
  );
  return rows[0] ? parseRoomRow(rows[0]) : null;
}

export async function POST(request: NextRequest) {
  const expected = new URL(request.nextUrl.toString());
  expected.host = request.headers.get("host") || request.nextUrl.host;
  if (
    request.headers.get("origin") !== expected.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return json({ error: "请求来源不符" }, 403);
  }
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  ) return json({ error: "需要 JSON 请求" }, 415);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 2048) return json({ error: "请求过大" }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "请求格式有误" }, 400);
  } catch {
    return json({ error: "请求格式有误" }, 400);
  }
  if (!process.env.DATABASE_URL) return json({ error: "在线房间暂未配置" }, 503);
  try {
    if (body.operation === "create") {
      if (
        !validPlayers(body.players) ||
        ![3, 5].includes(Number(body.rounds)) ||
        !Number.isInteger(body.rosterIndex) ||
        !ROSTERS[Number(body.rosterIndex)]
      ) return json({ error: "开局设置有误" }, 400);
      const players = body.players.map((player) => ({
        name: player.name.trim(),
        ai: player.ai,
      }));
      const token = newToken();
      const tokens = players.map((player, index) => (index === 0 ? tokenHash(token) : null),);
      for (let attempt = 0; attempt < 4; attempt++) {
        const code = newCode();
        // Retry the rare room-code collision.
        // eslint-disable-next-line no-await-in-loop
        const result = await getPool().query(
          `INSERT INTO hype_harbor_rooms (code, rounds, roster, players, tokens)
           VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb) ON CONFLICT DO NOTHING RETURNING code`,
          [
            code,
            body.rounds as number,
            JSON.stringify(ROSTERS[Number(body.rosterIndex)].members),
            JSON.stringify(players),
            JSON.stringify(tokens),
          ],
        );
        if (result.rows.length) return json({
            token,
            room: viewRoom(
              {
                code,
                revision: 0,
                rounds: body.rounds as number,
                roster: ROSTERS[Number(body.rosterIndex)].members,
                players,
                tokens,
                state: null,
              },
              0,
            ),
          });
      }
      return json({ error: "房间号生成失败，请重试" }, 503);
    }
    if (!validCode(body.code)) return json({ error: "房间号格式有误" }, 400);
    if (body.operation === "join") {
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.trim().length > 12
      ) return json({ error: "请填写 1–12 字的名字" }, 400);
      const joinName = body.name.trim();
      for (let attempt = 0; attempt < 3; attempt++) {
        // A concurrent join can claim the same empty seat; retry against the new revision.
        // eslint-disable-next-line no-await-in-loop
        const room = await findRoom(body.code);
        if (!room) return json({ error: "房间不存在或已过期" }, 404);
        if (room.state) return json({ error: "对局已经开始" }, 409);
        const seat = room.players.findIndex(
          (player, i) => !player.ai && !room.tokens[i],
        );
        if (seat < 0) return json({ error: "房间已满" }, 409);
        const token = newToken();
        const players = room.players.map((player, i) => (i === seat ? { ...player, name: joinName } : player),);
        const tokens = room.tokens.map((entry, i) => (i === seat ? tokenHash(token) : entry),);
        // eslint-disable-next-line no-await-in-loop
        const result = await getPool().query(
          `UPDATE hype_harbor_rooms SET players = $1::jsonb, tokens = $2::jsonb,
           revision = revision + 1, updated_at = now() WHERE code = $3 AND revision = $4 RETURNING revision`,
          [
            JSON.stringify(players),
            JSON.stringify(tokens),
            room.code,
            room.revision,
          ],
        );
        if (result.rows.length) return json({
            token,
            room: viewRoom(
              { ...room, players, tokens, revision: room.revision + 1 },
              seat,
            ),
          });
      }
      return json({ error: "房间刚刚变化，请重试" }, 409);
    }
    if (!validToken(body.token)) return json({ error: "房间身份已失效，请重新加入" }, 401);
    const room = await findRoom(body.code);
    if (!room) return json({ error: "房间不存在或已过期" }, 404);
    const seat = seatFor(room, body.token);
    if (seat < 0) return json({ error: "无权操作这个房间" }, 403);
    if (body.operation === "status") return json({ room: viewRoom(room, seat) });
    if (
      body.operation !== "command" ||
      !body.command ||
      typeof body.command !== "object" ||
      Array.isArray(body.command) ||
      !Number.isInteger(body.revision)
    ) return json({ error: "操作格式有误" }, 400);
    if (body.revision !== room.revision) return json({ error: "房间状态已更新", room: viewRoom(room, seat) }, 409);
    const changed = applyRoomCommand(room, seat, body.command as RoomCommand);
    if (!changed) return json(
        { error: "当前不能执行这个操作", room: viewRoom(room, seat) },
        409,
      );
    const result = await getPool().query(
      `UPDATE hype_harbor_rooms SET state = $1::jsonb, revision = revision + 1,
       updated_at = now() WHERE code = $2 AND revision = $3 RETURNING revision`,
      [JSON.stringify(changed.state), room.code, room.revision],
    );
    if (!result.rows.length) {
      const latest = await findRoom(room.code);
      return json(
        { error: "房间状态已更新", room: latest && viewRoom(latest, seat) },
        409,
      );
    }
    return json({
      room: viewRoom({ ...changed, revision: room.revision + 1 }, seat),
    });
  } catch (error) {
    console.error("[hype-harbor] Room operation failed", error);
    return json({ error: "房间服务暂不可用，请稍后重试" }, 503);
  }
}
