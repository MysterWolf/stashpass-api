-- 005_operator_locations.sql — per-operator location management
-- Separate from the legacy `locations` table (which is used by transactions)

CREATE TABLE operator_locations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID        NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  address     TEXT,
  city        TEXT,
  state       TEXT,
  zip         TEXT,
  lat         NUMERIC(10,7),
  lng         NUMERIC(10,7),
  phone       TEXT,
  is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operator_locations_operator ON operator_locations(operator_id) WHERE active = TRUE;

CREATE TRIGGER trg_operator_locations_updated_at
  BEFORE UPDATE ON operator_locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Seed: The Green Room (operator a60df8bf-aea0-48fd-a740-ab3d52c02b0c) ─────

INSERT INTO operator_locations (operator_id, name, city, state, is_primary)
VALUES
  ('a60df8bf-aea0-48fd-a740-ab3d52c02b0c', 'The Green Room - Hoboken',  'Hoboken',  'NJ', TRUE),
  ('a60df8bf-aea0-48fd-a740-ab3d52c02b0c', 'The Green Room - Montclair','Montclair','NJ', FALSE),
  ('a60df8bf-aea0-48fd-a740-ab3d52c02b0c', 'The Green Room - Red Bank', 'Red Bank', 'NJ', FALSE),
  ('a60df8bf-aea0-48fd-a740-ab3d52c02b0c', 'The Green Room - Westfield','Westfield','NJ', FALSE)
ON CONFLICT DO NOTHING;
