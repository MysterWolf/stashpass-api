-- Operator profiles — rich dispensary data for CannaGuide + StashPass operator dashboard

ALTER TABLE operators ADD COLUMN IF NOT EXISTS city  TEXT;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS tier  TEXT NOT NULL DEFAULT 'standard';

CREATE TABLE IF NOT EXISTS operator_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id         UUID NOT NULL UNIQUE REFERENCES operators(id) ON DELETE CASCADE,
  about               TEXT,
  hours               JSONB,
  website             TEXT,
  instagram           TEXT,
  leafly_url          TEXT,
  dutchie_url         TEXT,
  other_ordering_url  TEXT,
  ordering_platform   TEXT,
  payment_methods     JSONB,
  black_owned         BOOLEAN NOT NULL DEFAULT FALSE,
  woman_owned         BOOLEAN NOT NULL DEFAULT FALSE,
  lgbtq_friendly      BOOLEAN NOT NULL DEFAULT FALSE,
  veteran_owned       BOOLEAN NOT NULL DEFAULT FALSE,
  specials            JSONB,
  primary_color       TEXT,
  secondary_color     TEXT,
  background_color    TEXT,
  logo_url            TEXT,
  cover_image_url     TEXT,
  palette             TEXT NOT NULL DEFAULT 'cannaguide_default',
  date_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lat                 DECIMAL(10,8),
  lng                 DECIMAL(11,8)
);

CREATE INDEX IF NOT EXISTS operator_profiles_geo_idx
  ON operator_profiles (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;
