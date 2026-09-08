import type { Choice, Question } from "../../components/buttonGame/content";
import type { VoteResult } from "../../components/buttonGame/model";

export interface Database {
  query: (
    text: string,
    values: (string | number)[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
}

// PostgreSQL owns deduplication, including simultaneous requests on different instances.
export async function recordVote(
  db: Database,
  question: Question,
  voter: string,
  choice: Choice,
) {
  await db.query(
    `INSERT INTO button_game_votes (question_id, question_version, voter_hash, choice)
     VALUES ($1, $2, $3, $4) ON CONFLICT (question_id, question_version, voter_hash) DO NOTHING`,
    [question.id, question.version, voter, choice],
  );
}

export async function getResult(
  db: Database,
  question: Question,
  voter: string,
): Promise<VoteResult> {
  const { rows } = await db.query(
    `SELECT COUNT(*) FILTER (WHERE choice = 'press')::int AS press,
            COUNT(*) FILTER (WHERE choice = 'pass')::int AS pass,
            (SELECT choice FROM button_game_votes WHERE question_id = $1 AND question_version = $2 AND voter_hash = $3) AS choice
     FROM button_game_votes WHERE question_id = $1 AND question_version = $2`,
    [question.id, question.version, voter],
  );
  const row = rows[0];
  const press = Number(row.press);
  const pass = Number(row.pass);
  return {
    mode: "global",
    choice: (row.choice as Choice) || null,
    totals: { press, pass, total: press + pass },
  };
}

export async function allowRequest(
  db: Database,
  clientHash: string,
  now = Date.now(),
) {
  const minute = Math.floor(now / 60000);
  const { rows } = await db.query(
    `INSERT INTO button_game_rate_limits (client_hash, minute, attempts) VALUES ($1, $2, 1)
     ON CONFLICT (client_hash) DO UPDATE SET
       minute = EXCLUDED.minute,
       attempts = CASE WHEN button_game_rate_limits.minute < EXCLUDED.minute THEN 1 ELSE button_game_rate_limits.attempts + 1 END
     WHERE button_game_rate_limits.minute < EXCLUDED.minute OR button_game_rate_limits.attempts < 120
     RETURNING attempts`,
    [clientHash, minute],
  );
  return rows.length > 0;
}
