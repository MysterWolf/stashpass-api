-- 009_strain_queue.sql — strain discovery queue for CannaGuide devices

CREATE TABLE strain_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  type          TEXT,
  device_id     TEXT        NOT NULL,
  device_ids    JSONB       NOT NULL DEFAULT '[]',
  surfaced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'enriching', 'published', 'rejected')),
  strain_id     UUID        REFERENCES strains(id) ON DELETE SET NULL,
  surface_count INT         NOT NULL DEFAULT 1
);

CREATE INDEX idx_strain_queue_status    ON strain_queue(status);
CREATE INDEX idx_strain_queue_name_type ON strain_queue(name, type);
