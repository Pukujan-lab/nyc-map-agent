-- migrate:up
-- One row per /api/agent request: how long each part took and how it ended, so slow
-- or stuck answers can be found (owner report, 2026-10-24). Nothing the person asked
-- or where they are is stored: only timings, tool names, the model and token counts.
-- server/features/agent/runLog.ts writes it; rows older than 30 days are dropped there.
CREATE TABLE core.agent_runs (
  id            uuid PRIMARY KEY,
  started_at    timestamptz NOT NULL,
  model         text NOT NULL,
  outcome       text NOT NULL CHECK (outcome IN ('done', 'error', 'stuck', 'aborted')),
  first_step_ms integer,
  first_text_ms integer,
  total_ms      integer,
  steps         jsonb NOT NULL DEFAULT '[]',
  notes         jsonb NOT NULL DEFAULT '[]',
  input_tokens  integer,
  output_tokens integer
);
CREATE INDEX IF NOT EXISTS agent_runs_started_idx ON core.agent_runs (started_at DESC);

-- migrate:down
DROP TABLE IF EXISTS core.agent_runs;
