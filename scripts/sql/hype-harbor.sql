DO $migration$
BEGIN
  CREATE TABLE IF NOT EXISTS hype_harbor_rooms (
    code text PRIMARY KEY CHECK (code ~ '^[A-Z2-9]{8}$'),
    revision integer NOT NULL DEFAULT 0,
    rounds integer NOT NULL CHECK (rounds IN (3, 5)),
    roster jsonb NOT NULL,
    is_public boolean NOT NULL DEFAULT false,
    players jsonb NOT NULL,
    tokens jsonb NOT NULL,
    state jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE hype_harbor_rooms
    ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
  CREATE INDEX IF NOT EXISTS hype_harbor_rooms_updated_at
    ON hype_harbor_rooms (updated_at);
  CREATE INDEX IF NOT EXISTS hype_harbor_rooms_public_lobby
    ON hype_harbor_rooms (updated_at DESC)
    WHERE is_public AND state IS NULL;
END
$migration$;
