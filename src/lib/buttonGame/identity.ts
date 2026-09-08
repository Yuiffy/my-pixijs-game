import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "button_game_voter";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export function digest(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function visitorIdentity(
  cookie: string | undefined,
  secret: string,
  now = Date.now(),
) {
  const parts = (cookie || "").split(".");
  const [id, issued, signature] = parts;
  const seconds = Math.floor(now / 1000);
  const validShape =
    parts.length === 3 &&
    /^[0-9a-f-]{36}$/.test(id) &&
    /^\d{10}$/.test(issued) &&
    /^[0-9a-f]{64}$/.test(signature);
  const validTime =
    validShape &&
    Number(issued) <= seconds + 60 &&
    Number(issued) > seconds - COOKIE_MAX_AGE;
  if (
    validTime &&
    timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest(secret, `cookie:${id}.${issued}`)),
    )
  ) {
    return {
      cookie: cookie!,
      voterHash: digest(secret, `voter:${id}`),
      fresh: false,
    };
  }
  const newId = randomUUID();
  const payload = `${newId}.${seconds}`;
  return {
    cookie: `${payload}.${digest(secret, `cookie:${payload}`)}`,
    voterHash: digest(secret, `voter:${newId}`),
    fresh: true,
  };
}
