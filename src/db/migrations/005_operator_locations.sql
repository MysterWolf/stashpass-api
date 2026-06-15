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

INSERT INTO operator_locations (operator_id, name, address, city, state, zip, lat, lng, phone, is_primary)
VALUES
  ('a60df8bf-aea0-48fd-a740-ab3d52c02b0c', 'The Green Room - Bloomfield', '465 Bloomfield Ave', 'Bloomfield', 'NJ', '07003', 40.7912000, -74.1846000, '(973) 338-9333', TRUE),
  ('a60df8bf-aea0-48fd-a740-ab3d52c02b0c', 'The Green Room - Lodi',       '110 Main St',        'Lodi',       'NJ', '07644', 40.8801000, -74.0826000, '(201) 215-0420', FALSE),
  ('a60df8bf-aea0-48fd-a740-ab3d52c02b0c', 'The Green Room - Garfield',   '154 Lanza Ave',      'Garfield',   'NJ', '07026', 40.8799000, -74.1090000, '(973) 772-7333', FALSE),
  ('a60df8bf-aea0-48fd-a740-ab3d52c02b0c', 'The Green Room - Hackensack', '183 Main St',        'Hackensack', 'NJ', '07601', 40.8866000, -74.0432000, '(201) 441-3333', FALSE),
  ('a60df8bf-aea0-48fd-a740-ab3d52c02b0c', 'The Green Room - Paterson',   '59 Broadway',        'Paterson',   'NJ', '07501', 40.9168000, -74.1718000, '(973) 357-3333', FALSE)
ON CONFLICT DO NOTHING;
