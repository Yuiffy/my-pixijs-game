import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const OUTPUT_PATH = path.join(
  process.cwd(),
  "artifacts",
  "autochess-human-recovered-latest.json",
);

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

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(trace, null, 2)}\n`, "utf8");

    return NextResponse.json({
      ready: true,
      output: path.relative(process.cwd(), OUTPUT_PATH).replaceAll("\\", "/"),
      capturedAt: trace.capturedAt || null,
      version: trace.version || null,
      phase: trace.state.phase || null,
      round: trace.state.round || null,
      hp: trace.state.hp ?? null,
      score: trace.state.score ?? null,
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
