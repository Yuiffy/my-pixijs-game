DO $migration$
BEGIN

CREATE TABLE IF NOT EXISTS button_game_votes (
  question_id text NOT NULL CHECK (length(question_id) BETWEEN 1 AND 80),
  question_version integer NOT NULL CHECK (question_version > 0),
  voter_hash text NOT NULL CHECK (length(voter_hash) = 64),
  choice text NOT NULL CHECK (choice IN ('press', 'pass')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, question_version, voter_hash)
);

CREATE TABLE IF NOT EXISTS button_game_rate_limits (
  client_hash text PRIMARY KEY CHECK (length(client_hash) = 64),
  minute bigint NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0)
);

END
$migration$;
