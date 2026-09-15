import type { AiState } from "./agiEngine";
import { aiCompany, AiCompanyId } from "./agiIndustry";
import { round } from "./core";

export const AI_AGI_TARGETS = [
  { key: "capability", label: "自研能力", required: 100 },
  { key: "compute", label: "算力", required: 5 },
  { key: "reliability", label: "可靠性", required: 70 },
  { key: "safety", label: "安全", required: 40 },
] as const;

export type AiRaceMetric = (typeof AI_AGI_TARGETS)[number]["key"];
export type AiRaceRequirement = {
  key: AiRaceMetric;
  label: string;
  current: number;
  required: number;
  missing: number;
  met: boolean;
};
export type AiRaceRow = Record<AiRaceMetric, number> & {
  company: AiCompanyId;
  name: string;
  player: boolean;
  rank: number;
  stage: "ready" | "near" | "building";
  /** Average completion of the four disclosed targets, not a win probability. */
  progress: number;
  /** Technical launch conditions; the player may still risk an unsafe launch. */
  launchReady: boolean;
  requirements: AiRaceRequirement[];
  missing: string[];
  gapText: string;
};
export type AiRaceReport = {
  rows: AiRaceRow[];
  player: AiRaceRow;
  leader: AiRaceRow;
  threat: AiRaceRow | null;
  headline: string;
  detail: string;
};

type AiRaceEntry = Record<AiRaceMetric, number> & {
  company: AiCompanyId;
  name: string;
  player: boolean;
};

function raceRow(entry: AiRaceEntry): AiRaceRow {
  const requirements = AI_AGI_TARGETS.map(target => ({
    ...target,
    current: entry[target.key],
    missing: round(Math.max(0, target.required - entry[target.key])),
    met: entry[target.key] >= target.required,
  }));
  const missing = requirements.filter(target => !target.met)
    .map(target => `${target.label}差 ${target.missing}（${target.current}/${target.required}）`);
  const ready = requirements.every(target => target.met);
  const near = entry.capability >= 80 && entry.compute >= 4
    && entry.reliability >= 60 && entry.safety >= 30;
  return {
    ...entry,
    rank: 0,
    stage: ready ? "ready" : near ? "near" : "building",
    progress: round((requirements.reduce((total, target) => total + Math.max(0, Math.min(1, target.current / target.required)), 0) / requirements.length) * 100),
    launchReady: entry.capability >= 100 && entry.compute >= 5
      && entry.reliability >= 70 && (entry.player || entry.safety >= 40),
    requirements,
    missing,
    gapText: missing.length ? missing.join("、") : "四项均达标",
  };
}

const stageOrder = { ready: 2, near: 1, building: 0 };

/** Read-only race snapshot. Capability rank and readiness are deliberately separate. */
export function getAiRaceReport(game: AiState): AiRaceReport {
  const rows = [
    raceRow({
      company: game.industry.company,
      name: aiCompany(game.industry.company).name,
      player: true,
      capability: game.capability,
      compute: game.compute,
      reliability: game.industry.reliability,
      safety: game.safety,
    }),
    ...game.rivals.map(rival => raceRow({
      company: rival.company,
      name: aiCompany(rival.company).name,
      player: false,
      capability: rival.capability,
      compute: rival.compute,
      reliability: rival.reliability,
      safety: rival.safety,
    })),
  ].sort((a, b) => b.capability - a.capability);
  rows.forEach((row, index) => {
    row.rank = index > 0 && row.capability === rows[index - 1].capability
      ? rows[index - 1].rank : index + 1;
  });
  const player = rows.find(row => row.player)!;
  const leader = rows[0];
  const leaders = rows.filter(row => row.rank === 1);
  const rivals = rows.filter(row => !row.player);
  const threat = [...rivals].sort((a, b) => stageOrder[b.stage] - stageOrder[a.stage]
    || b.progress - a.progress || b.capability - a.capability)[0] || null;
  const gap = round(leader.capability - player.capability);
  let headline: string;
  if (player.rank === 1) {
    headline = leaders.length > 1
      ? `你与${leaders.find(row => !row.player)!.name}${leaders.length > 2 ? `等 ${leaders.length - 1} 家公司` : ""}并列领跑`
      : rivals.length ? `你领跑 · 领先第二名 ${round(player.capability - rivals[0].capability)}` : "你领跑";
  } else {
    headline = `${leader.name}${leaders.length > 1 ? `等 ${leaders.length} 家公司并列领先` : "领跑"} · 你落后 ${gap}`;
  }
  let detail: string;
  if (game.ending) {
    detail = "本局竞赛已结束。榜单记录终局的自研能力与四项稳健 AGI 指标。";
  } else if (threat?.stage === "ready") {
    detail = `${threat.name}已满足四项稳健 AGI 门槛，可冲线：能力 ${threat.capability}、算力 ${threat.compute}、可靠性 ${threat.reliability}、安全 ${threat.safety}。`;
  } else if (threat?.stage === "near") {
    detail = `${threat.name}接近 AGI，正在冲刺；尚缺${threat.gapText}。`;
  } else if (threat) {
    detail = `对手仍在积累。${threat.name}的四项达标程度最高，尚缺${threat.gapText}。`;
  } else {
    detail = `你的稳健 AGI 进度：${player.gapText}。`;
  }
  if (!game.ending && player.launchReady) {
    detail += player.safety >= 40
      ? " 你已满足稳健 AGI 门槛，可安排启动。"
      : " 你已满足启动技术条件，但安全不足 40；仍可冒险启动，可能进入失控结局。";
  }
  return { rows, player, leader, threat, headline, detail };
}
