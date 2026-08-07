import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const OUTPUT_PATH = path.join(
  process.cwd(),
  "artifacts",
  "autochess-human-recovered-latest.json",
);
const ARCHIVE_DIRECTORY = path.join(process.cwd(), "artifacts", "autochess-human-runs");

export async function POST(request: Request) {
  try {
    const trace = await request.json();
    if (
      !trace
      || typeof trace !== "object"
      || !Array.isArray(trace.actions)
      || !Array.isArray(trace.battles)
      || !trace.state
    ) {
      return NextResponse.json({ error: "Invalid autochess trace." }, { status: 400 });
    }

    const capturedAt = typeof trace.capturedAt === "string"
      ? trace.capturedAt
      : new Date().toISOString();
    const player = trace.state.player && typeof trace.state.player === "object"
      ? trace.state.player as Record<string, unknown>
      : {};
    const round = Number.isFinite(Number(trace.state.round)) ? Number(trace.state.round) : 0;
    const hp = Number.isFinite(Number(trace.state.hp ?? player.hp))
      ? Number(trace.state.hp ?? player.hp)
      : null;
    const score = Number.isFinite(Number(trace.state.score ?? player.score))
      ? Number(trace.state.score ?? player.score)
      : 0;
    const archiveName = `${capturedAt.replace(/[^0-9A-Za-z_-]/g, "-")}-round-${round}-score-${score}.json`;
    const archivePath = path.join(ARCHIVE_DIRECTORY, archiveName);
    const payload = `${JSON.stringify(trace, null, 2)}\n`;

    await Promise.all([
      mkdir(path.dirname(OUTPUT_PATH), { recursive: true }),
      mkdir(ARCHIVE_DIRECTORY, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(OUTPUT_PATH, payload, "utf8"),
      writeFile(archivePath, payload, "utf8"),
    ]);

    return NextResponse.json({
      ready: true,
      output: path.relative(process.cwd(), OUTPUT_PATH).replaceAll("\\", "/"),
      archive: path.relative(process.cwd(), archivePath).replaceAll("\\", "/"),
      capturedAt: trace.capturedAt || null,
      version: trace.version || null,
      phase: trace.state.phase || null,
      round: trace.state.round || null,
      hp,
      score,
      actions: trace.actions.length,
      battles: trace.battles.length,
      battleEvents: trace.trace?.battleEvents || 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
