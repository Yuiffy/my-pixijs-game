import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { QUESTIONS, findQuestion } from "@/components/buttonGame/content";
import { isChoice } from "@/components/buttonGame/model";
import { allowRequest, getResult, recordVote } from "@/lib/buttonGame/store";
import {
  COOKIE_MAX_AGE,
  COOKIE_NAME,
  digest,
  visitorIdentity,
} from "@/lib/buttonGame/identity";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}

// POST-only keeps this route out of the site's optional ESA static export.
export async function POST(request: NextRequest) {
  // NextURL normalizes loopback hosts; the HTTP Host preserves the browser origin.
  const expectedOrigin = new URL(request.nextUrl.toString());
  expectedOrigin.host = request.headers.get('host') || request.nextUrl.host;
  if (
    request.headers.get("origin") !== expectedOrigin.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) return json({ error: "请求来源不符" }, 403);
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  ) return json({ error: "需要 JSON 请求" }, 415);
  if (Number(request.headers.get("content-length")) > 2048) return json({ error: "请求过大" }, 413);
  let body;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 2048) return json({ error: "请求过大" }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "请求格式有误" }, 400);
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !["status", "vote"].includes(body.action)
  ) return json({ error: "请求格式有误" }, 400);
  const question = findQuestion(body.id, body.version);
  if (!question) return json(
      {
        error: QUESTIONS.some((q) => q.id === body.id)
          ? "题目已更新，请刷新页面"
          : "题目不存在",
      },
      400,
    );
  if (body.action === "vote" && !isChoice(body.choice)) return json({ error: "请选择按下或不按" }, 400);

  if (!process.env.DATABASE_URL) return json({ mode: "local", choice: null, totals: null });
  const secret = process.env.BUTTON_GAME_VOTE_SECRET;
  if (!secret || secret.length < 32) return json({ error: "全站统计暂不可用，请稍后重试" }, 503);
  const identity = visitorIdentity(
    request.cookies.get(COOKIE_NAME)?.value,
    secret,
  );
  try {
    const db = getPool();
    // Only the Vercel ingress IP is used for shared-IP throttling. Never persist raw addresses.
    const ip =
      process.env.VERCEL === "1"
        ? request.headers.get("x-forwarded-for")?.split(",")[0].trim()
        : null;
    const rateKey = digest(secret, `rate:${ip || identity.voterHash}`);
    if (!(await allowRequest(db, rateKey))) return json({ error: "操作太频繁，请一分钟后再试" }, 429);
    if (body.action === "vote") {
      // The status handshake must establish a signed identity before accepting a vote.
      if (identity.fresh) return json({ error: "投票身份已失效，请重新载入本题" }, 409);
      await recordVote(db, question, identity.voterHash, body.choice);
    }
    const response = json(await getResult(db, question, identity.voterHash));
    response.cookies.set(COOKIE_NAME, identity.cookie, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/api/button-game",
      maxAge: COOKIE_MAX_AGE,
    });
    return response;
  } catch {
    console.error("[button-game] Database operation failed");
    return json({ error: "全站统计暂不可用，你的选择尚未确认，请重试" }, 503);
  }
}
