import { findQuestion, questionKey } from "./content";
import type { Choice, Question } from "./content";

export interface Totals {
  press: number;
  pass: number;
  total: number;
}
export interface VoteResult {
  mode: "global" | "local";
  choice: Choice | null;
  totals: Totals | null;
}
export interface Answer {
  id: string;
  version: number;
  choice: Choice;
  mode: "global" | "local";
  at: string;
}
export type Answers = Record<string, Answer>;
export const STORAGE_KEY = "button-game.answers.v1";

export function isChoice(value: unknown): value is Choice {
  return value === "press" || value === "pass";
}

export function readAnswers(raw: string | null): Answers {
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Answers = {};
    Object.values(parsed).forEach((value) => {
      if (!value || typeof value !== "object") return;
      const answer = value as Answer;
      const question = findQuestion(answer.id, answer.version);
      if (
        !question ||
        !isChoice(answer.choice) ||
        !["local", "global"].includes(answer.mode) ||
        typeof answer.at !== "string" ||
        !Number.isFinite(Date.parse(answer.at))
      ) return;
      result[questionKey(question)] = {
        id: question.id,
        version: question.version,
        choice: answer.choice,
        mode: answer.mode,
        at: answer.at,
      };
    });
    return result;
  } catch {
    return {};
  }
}

export function pressPercent(totals: Totals): number | null {
  if (
    !Number.isSafeInteger(totals.total) ||
    totals.total <= 0 ||
    totals.press < 0 ||
    totals.pass < 0 ||
    totals.press + totals.pass !== totals.total
  ) return null;
  return Math.round((totals.press / totals.total) * 100);
}

export function parseResult(value: unknown): VoteResult {
  if (!value || typeof value !== "object") throw new Error("统计响应无效");
  const data = value as VoteResult;
  if (
    !["global", "local"].includes(data.mode) ||
    (data.choice !== null && !isChoice(data.choice))
  ) throw new Error("统计响应无效");
  if (data.mode === "local") return { mode: "local", choice: null, totals: null };
  const { totals } = data;
  if (
    !totals ||
    ![totals.press, totals.pass, totals.total].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    totals.press + totals.pass !== totals.total
  ) throw new Error("统计响应无效");
  return { mode: "global", choice: data.choice, totals };
}

export function nextUnanswered(
  questions: Question[],
  answers: Answers,
  currentId: string,
): Question | null {
  const start = Math.max(
    0,
    questions.findIndex((question) => question.id === currentId),
  );
  for (let step = 1; step <= questions.length; step++) {
    const question = questions[(start + step) % questions.length];
    if (!answers[questionKey(question)]) return question;
  }
  return null;
}
