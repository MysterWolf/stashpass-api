-- 006_strains.sql — strain intelligence database for CannaGuide + StashPass

CREATE TABLE IF NOT EXISTS strains (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  aliases           JSONB       NOT NULL DEFAULT '[]',
  type              TEXT        NOT NULL DEFAULT 'hybrid'
                                CHECK (type IN ('sativa', 'indica', 'hybrid')),
  lineage           TEXT,
  thc_min           NUMERIC(5,2),
  thc_max           NUMERIC(5,2),
  cbd_min           NUMERIC(5,2),
  cbd_max           NUMERIC(5,2),
  terpenes          JSONB       NOT NULL DEFAULT '[]',
  effects           JSONB       NOT NULL DEFAULT '[]',
  use_cases         JSONB       NOT NULL DEFAULT '[]',
  flavors           JSONB       NOT NULL DEFAULT '[]',
  about             TEXT,
  cautions          TEXT,
  best_method       TEXT,
  beginner_friendly BOOLEAN     NOT NULL DEFAULT FALSE,
  session_count     INT         NOT NULL DEFAULT 0,
  active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strains_name    ON strains (lower(name))  WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_strains_type    ON strains (type)         WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_strains_active  ON strains (active);

CREATE TRIGGER trg_strains_updated_at
  BEFORE UPDATE ON strains
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
