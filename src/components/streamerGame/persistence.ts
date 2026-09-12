import type { StreamState } from "./types";
import { getEnding, getSupportRate, getViewers } from "./engine";

export const SAVE_KEY = "streamer-run-v1";
export const META_KEY = "streamer-career-v1";
export const ENDING_IDS = [
  "collapse",
  "burnout",
  "empty-room",
  "echo-chamber",
  "tightrope",
  "community",
  "steady",
];

export interface Career {
  runs: number;
  best: number;
  endings: string[];
  recorded: string[];
  skin: string;
}

export const emptyCareer = (): Career => ({
  runs: 0,
  best: 0,
  endings: [],
  recorded: [],
  skin: "sui-short",
});

export function readCareer(): Career {
  try {
    const value = JSON.parse(localStorage.getItem(META_KEY) || "null");
    if (
      !value ||
      !Number.isSafeInteger(value.runs) ||
      value.runs < 0 ||
      !Number.isSafeInteger(value.best) ||
      value.best < 0
    ) return emptyCareer();
    return {
      runs: Math.min(value.runs, 100000),
      best: value.best,
      endings: Array.isArray(value.endings)
        ? Array.from(
            new Set<string>(
              value.endings.filter(
                (id: unknown) => typeof id === "string" && ENDING_IDS.includes(id),
              ),
            ),
          )
        : [],
      recorded: Array.isArray(value.recorded)
        ? value.recorded
            .filter((id: unknown) => typeof id === "string")
            .slice(-100)
        : [],
      skin: typeof value.skin === "string" ? value.skin : "sui-short",
    };
  } catch {
    return emptyCareer();
  }
}

export function resultText(state: StreamState): string {
  const ending = getEnding(state);
  return `饼干岁，听我说！\n我的直播结局：${ending.title}\n控场评分 ${state.score} · 在线 ${getViewers(state)} · 支持率 ${Math.round(getSupportRate(state))}%\n完成 ${state.completedTopics}/6 个话题 · 脑控 ${Math.round(state.control)}%\n直播种子 ${state.seed}\n${typeof window !== "undefined" ? `${window.location.origin}/game/streamer?seed=${state.seed}` : ""}`;
}

export async function downloadResult(state: StreamState): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建成绩卡");
  ctx.fillStyle = "#f0eafb";
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#744ddd";
  ctx.beginPath();
  ctx.arc(1080, 0, 470, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#211932";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("SUI LIVE  /  直播成绩单", 80, 110);
  ctx.font = "bold 72px sans-serif";
  ctx.fillText("饼干岁，", 80, 245);
  ctx.fillText("听我说。", 80, 340);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(60, 430, 960, 610);
  ctx.fillStyle = "#744ddd";
  ctx.font = "bold 46px sans-serif";
  ctx.fillText(getEnding(state).title, 100, 515);
  ctx.font = "bold 132px sans-serif";
  ctx.fillText(String(state.score), 95, 690);
  ctx.fillStyle = "#6a6178";
  ctx.font = "28px sans-serif";
  ctx.fillText("本场控场评分", 105, 745);
  ctx.font = "32px sans-serif";
  ctx.fillText(
    `在线观众 ${getViewers(state)}      支持率 ${Math.round(getSupportRate(state))}%`,
    100,
    850,
  );
  ctx.fillText(
    `脑控 ${Math.round(state.control)}%      完成话题 ${state.completedTopics} / 6`,
    100,
    925,
  );
  ctx.font = "26px sans-serif";
  ctx.fillText(`直播种子  ${state.seed}  ·  来试试你的结局`, 80, 1130);
  ctx.fillText("三幕直播，每一句都由你控场。", 80, 1190);
  ctx.font = "22px sans-serif";
  ctx.fillText(
    `${window.location.origin}/game/streamer?seed=${state.seed}`,
    80,
    1270,
    920,
  );
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) throw new Error("导出失败");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sui-live-${state.seed}-${state.score}.png`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
