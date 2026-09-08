import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const content = await loadTypescriptModule(
  "src/components/buttonGame/content.ts",
);
const model = await loadTypescriptModule("src/components/buttonGame/model.ts");
const store = await loadTypescriptModule("src/lib/buttonGame/store.ts");
const { QUESTIONS, TAGS, THEMES, questionKey, filterQuestions } = content;
const migration = await readFile(
  new URL("../sql/button-game.sql", import.meta.url),
  "utf8",
);
const require = createRequire(import.meta.url);
const compile = async (relative, dependencies = {}) => {
  const source = await readFile(
    new URL(`../../${relative}`, import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  Function(
    "module",
    "exports",
    "require",
    compiled,
  )(
    module,
    module.exports,
    (specifier) => dependencies[specifier] || require(specifier),
  );
  return module.exports;
};
const identity = await compile("src/lib/buttonGame/identity.ts");
const voter = (number) => number.toString(16).padStart(64, "0");

test("catalog has stable IDs, real themes/tags and explicit attribution only on adaptations", () => {
  assert.equal(QUESTIONS.length, 38);
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, QUESTIONS.length);
  assert.equal(QUESTIONS.filter((q) => q.theme === "vtuber").length, 32);
  for (const q of QUESTIONS) {
    assert.match(q.id, /^[a-z][a-z0-9-]{1,79}$/);
    assert.ok(Number.isInteger(q.version) && q.version > 0);
    assert.ok(THEMES.some((theme) => theme.id === q.theme));
    assert.ok(q.tags.length && q.tags.every((tag) => TAGS[tag]));
    assert.ok(q.gain.length >= 10 && q.cost.length >= 10 && q.gain !== q.cost);
    assert.equal(q.tags.includes("inspiration"), Boolean(q.source));
  }
  assert.equal(QUESTIONS.filter((q) => q.source).length, 2);
});

test("filters compose and empty groups are valid; skipping does not mark an answer", () => {
  assert.equal(filterQuestions("vtuber", "inspiration", "all").length, 2);
  assert.equal(filterQuestions("vtuber", "inspiration", "viewer").length, 0);
  assert.ok(
    filterQuestions("vtuber", "fans", "viewer").every(
      (q) => q.tags.includes("fans") && q.perspective === "viewer",
    ),
  );
  const answers = {};
  assert.equal(
    model.nextUnanswered(QUESTIONS, answers, QUESTIONS[0].id).id,
    QUESTIONS[1].id,
  );
  assert.deepEqual(answers, {});
  const completed = Object.fromEntries(
    QUESTIONS.map((q) => [questionKey(q), { choice: "pass" }]),
  );
  assert.equal(
    model.nextUnanswered(QUESTIONS, completed, QUESTIONS[0].id),
    null,
  );
  assert.equal(model.nextUnanswered([], {}, ""), null);
});

test("saved data rejects corruption, obsolete versions and invalid choices", () => {
  for (const raw of [null, "[1,2]", "null", "{", "0", '"abc"'])
    assert.deepEqual(model.readAnswers(raw), {});
  const q = QUESTIONS[0];
  const valid = {
    id: q.id,
    version: q.version,
    choice: "press",
    mode: "local",
    at: new Date().toISOString(),
  };
  assert.deepEqual(model.readAnswers(JSON.stringify({ ignoredKey: valid })), {
    [questionKey(q)]: valid,
  });
  for (const change of [
    { version: 999 },
    { id: "missing" },
    { choice: "skip" },
    { mode: "fake" },
    { at: "invalid" },
  ]) {
    assert.deepEqual(
      model.readAnswers(JSON.stringify({ x: { ...valid, ...change } })),
      {},
    );
  }
});

test("percentages handle zero, ties, small samples and invalid server data honestly", () => {
  assert.equal(model.pressPercent({ press: 0, pass: 0, total: 0 }), null);
  assert.equal(model.pressPercent({ press: 1, pass: 0, total: 1 }), 100);
  assert.equal(model.pressPercent({ press: 1, pass: 1, total: 2 }), 50);
  assert.equal(model.pressPercent({ press: 2, pass: 1, total: 3 }), 67);
  assert.equal(model.pressPercent({ press: -1, pass: 2, total: 1 }), null);
  assert.throws(() =>
    model.parseResult({
      mode: "global",
      choice: null,
      totals: { press: 1, pass: 2, total: 20 },
    }),
  );
  assert.throws(() =>
    model.parseResult({ mode: "global", choice: "fake", totals: null }),
  );
  assert.deepEqual(
    model.parseResult({ mode: "local", choice: null, totals: { press: 100 } }),
    { mode: "local", choice: null, totals: null },
  );
});

test("signed anonymous identity cannot be selected or modified by the client", () => {
  const secret = "test-only-".repeat(5);
  const now = 1788816000000;
  const fresh = identity.visitorIdentity(undefined, secret, now);
  assert.equal(fresh.fresh, true);
  assert.equal(fresh.voterHash.length, 64);
  assert.deepEqual(identity.visitorIdentity(fresh.cookie, secret, now + 1000), {
    ...fresh,
    fresh: false,
  });
  for (const cookie of [
    "../x",
    "",
    `${fresh.cookie}x`,
    fresh.cookie.replace(/^./, "z"),
    fresh.cookie.replace(/.$/, fresh.cookie.endsWith("a") ? "b" : "a"),
  ]) {
    const result = identity.visitorIdentity(cookie, secret, now);
    assert.equal(result.fresh, true);
    assert.notEqual(result.voterHash, fresh.voterHash);
  }
  assert.equal(
    identity.visitorIdentity(fresh.cookie, "different-secret", now).fresh,
    true,
  );
  assert.equal(
    identity.visitorIdentity(
      fresh.cookie,
      secret,
      now + (identity.COOKIE_MAX_AGE + 1) * 1000,
    ).fresh,
    true,
  );
  assert.equal(
    identity.visitorIdentity(fresh.cookie, secret, now - 120000).fresh,
    true,
  );
});

test("actual PostgreSQL schema and queries are idempotent, versioned and concurrency-safe", async () => {
  const db = new PGlite();
  try {
    await db.exec(migration);
    await db.exec(migration);
    const q = QUESTIONS[0];
    assert.deepEqual(await store.getResult(db, q, voter(0)), {
      mode: "global",
      choice: null,
      totals: { press: 0, pass: 0, total: 0 },
    });
    await Promise.all(
      Array.from({ length: 30 }, () =>
        store.recordVote(db, q, voter(1), "press"),
      ),
    );
    await store.recordVote(db, q, voter(1), "pass");
    assert.deepEqual(await store.getResult(db, q, voter(1)), {
      mode: "global",
      choice: "press",
      totals: { press: 1, pass: 0, total: 1 },
    });
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.recordVote(db, q, voter(index + 2), index % 2 ? "pass" : "press"),
      ),
    );
    assert.deepEqual((await store.getResult(db, q, voter(1))).totals, {
      press: 11,
      pass: 10,
      total: 21,
    });
    await store.recordVote(db, { ...q, version: 2 }, voter(1), "pass");
    assert.equal(
      (await store.getResult(db, { ...q, version: 2 }, voter(1))).totals.total,
      1,
    );
    assert.equal((await store.getResult(db, q, voter(1))).totals.total, 21);
    await assert.rejects(store.recordVote(db, q, voter(40), "injected"));
    await assert.rejects(store.recordVote(db, q, "short", "press"));
  } finally {
    await db.close();
  }
});

test("database-backed rate limiting has a hard concurrent limit and resets next minute", async () => {
  const db = new PGlite();
  try {
    await db.exec(migration);
    const outcomes = await Promise.all(
      Array.from({ length: 130 }, () =>
        store.allowRequest(db, voter(0), 120000),
      ),
    );
    assert.equal(outcomes.filter(Boolean).length, 120);
    assert.equal(await store.allowRequest(db, voter(0), 180000), true);
    assert.equal(await store.allowRequest(db, voter(1), 120000), true);
  } finally {
    await db.close();
  }
});

test("real Next route validates requests, performs cookie handshake, and never fabricates fallback counts", async () => {
  const { NextRequest } = require("next/server");
  const db = new PGlite();
  const names = ["DATABASE_URL", "BUTTON_GAME_VOTE_SECRET", "VERCEL"];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  const route = await compile("src/app/api/button-game/route.ts", {
    "@/lib/db": { getPool: () => db },
    "@/components/buttonGame/content": content,
    "@/components/buttonGame/model": model,
    "@/lib/buttonGame/store": store,
    "@/lib/buttonGame/identity": identity,
  });
  const q = QUESTIONS[0];
  const request = (body = {}, headers = {}) =>
    new NextRequest("https://example.test/api/button-game", {
      method: "POST",
      headers: {
        origin: "https://example.test",
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        action: "status",
        id: q.id,
        version: q.version,
        ...body,
      }),
    });
  try {
    await db.exec(migration);
    delete process.env.DATABASE_URL;
    delete process.env.VERCEL;
    const loopback = new NextRequest('http://127.0.0.1:3838/api/button-game', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:3838', host: '127.0.0.1:3838', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'status', id: q.id, version: q.version }),
    });
    assert.equal((await route.POST(loopback)).status, 200);
    assert.deepEqual(await (await route.POST(request())).json(), {
      mode: "local",
      choice: null,
      totals: null,
    });
    assert.equal(
      (await route.POST(request({}, { origin: "https://other.test" }))).status,
      403,
    );
    assert.equal(
      (await route.POST(request({}, { "content-type": "text/plain" }))).status,
      415,
    );
    assert.equal(
      (await route.POST(request({ padding: "x".repeat(2100) }))).status,
      413,
    );
    assert.equal((await route.POST(request({ id: "missing" }))).status, 400);
    assert.equal((await route.POST(request({ version: 90 }))).status, 400);
    assert.equal(
      (await route.POST(request({ action: "vote", choice: "skip" }))).status,
      400,
    );
    assert.equal((await route.POST(request({ action: "erase" }))).status, 400);
    process.env.DATABASE_URL = "test-injected-never-connected";
    delete process.env.BUTTON_GAME_VOTE_SECRET;
    assert.equal((await route.POST(request())).status, 503);
    process.env.BUTTON_GAME_VOTE_SECRET = "stable-test-only-secret-".repeat(3);
    assert.equal(
      (await route.POST(request({ action: "vote", choice: "press" }))).status,
      409,
    );
    const handshake = await route.POST(request());
    assert.match(handshake.headers.get("cache-control"), /no-store/);
    assert.match(handshake.headers.get("set-cookie"), /HttpOnly/i);
    assert.match(handshake.headers.get("set-cookie"), /Secure/i);
    const cookie = handshake.headers.get("set-cookie").split(";")[0];
    const voted = await route.POST(
      request({ action: "vote", choice: "press" }, { cookie }),
    );
    assert.equal(voted.status, 200);
    assert.equal((await voted.json()).totals.total, 1);
    const duplicate = await route.POST(
      request({ action: "vote", choice: "pass" }, { cookie }),
    );
    assert.deepEqual(await duplicate.json(), {
      mode: "global",
      choice: "press",
      totals: { press: 1, pass: 0, total: 1 },
    });
    assert.equal(
      (await (await route.POST(request({}, { cookie }))).json()).choice,
      "press",
    );
  } finally {
    names.forEach((name) => {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    });
    await db.close();
  }
});
