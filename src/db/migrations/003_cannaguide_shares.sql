-- CannaGuide circle shares and reactions — cross-device feed sync

CREATE TABLE cg_shares (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id    TEXT NOT NULL REFERENCES cg_circles(id) ON DELETE CASCADE,
  sharer_id    TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  type         TEXT NOT NULL,
  payload      TEXT NOT NULL DEFAULT '{}',
  note         TEXT NOT NULL DEFAULT '',
  timestamp    BIGINT NOT NULL
);

CREATE INDEX cg_shares_circle_idx ON cg_shares (circle_id, timestamp DESC);

CREATE TABLE cg_reactions (
  share_id   UUID NOT NULL REFERENCES cg_shares(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  type       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (share_id, user_id, type)
);
