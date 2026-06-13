-- CannaGuide Circles — lightweight device-to-device invite system
-- Uses device UUIDs (not StashPass users) as identity. No FK to users table.

CREATE TABLE cg_circles (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL,
  name         TEXT NOT NULL,
  emoji        TEXT NOT NULL DEFAULT '🌿',
  invite_token TEXT UNIQUE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cg_circles_owner_idx ON cg_circles (owner_id);
CREATE INDEX cg_circles_token_idx ON cg_circles (invite_token);

CREATE TABLE cg_join_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id    TEXT NOT NULL REFERENCES cg_circles(id) ON DELETE CASCADE,
  device_id    TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ,
  UNIQUE (circle_id, device_id)
);

CREATE INDEX cg_join_requests_circle_idx ON cg_join_requests (circle_id, status);
