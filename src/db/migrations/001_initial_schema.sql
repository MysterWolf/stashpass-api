-- StashPass initial schema
-- Run via: npm run migrate

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Franchise groups ────────────────────────────────────────────────────────

CREATE TABLE franchise_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  logo_url      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Operators ────────────────────────────────────────────────────────────────
-- An operator is a business that runs one or more locations.

CREATE TABLE operators (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_group_id  UUID REFERENCES franchise_groups(id),
  name                TEXT NOT NULL,
  slug                TEXT UNIQUE NOT NULL,
  category            TEXT NOT NULL,               -- 'cannabis' | 'coffee' | 'barbershop' | 'boutique' | etc.
  logo_url            TEXT,
  points_per_dollar   NUMERIC(10, 4) NOT NULL DEFAULT 1.0,
  redemption_rate     NUMERIC(10, 4) NOT NULL DEFAULT 0.01, -- dollars per point
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Locations ────────────────────────────────────────────────────────────────

CREATE TABLE locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  address     TEXT,
  city        TEXT,
  province    TEXT,
  postal_code TEXT,
  lat         NUMERIC(9, 6),
  lng         NUMERIC(9, 6),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone          TEXT UNIQUE,
  email          TEXT UNIQUE,
  display_name   TEXT,
  avatar_url     TEXT,
  role           TEXT NOT NULL DEFAULT 'user',     -- 'user' | 'operator_admin' | 'superadmin'
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_contact_required CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

-- ─── User wallets ─────────────────────────────────────────────────────────────
-- One wallet per (user, operator) pair.

CREATE TABLE user_wallets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operator_id     UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  balance_points  BIGINT NOT NULL DEFAULT 0 CHECK (balance_points >= 0),
  lifetime_earned BIGINT NOT NULL DEFAULT 0,
  lifetime_spent  BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, operator_id)
);

-- ─── Transactions ─────────────────────────────────────────────────────────────

CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       UUID NOT NULL REFERENCES user_wallets(id) ON DELETE CASCADE,
  location_id     UUID REFERENCES locations(id),
  type            TEXT NOT NULL,                   -- 'earn' | 'redeem' | 'adjust' | 'circle_share' | 'circle_receive'
  points_delta    BIGINT NOT NULL,                 -- positive = earn, negative = spend
  balance_after   BIGINT NOT NULL,
  reference_id    TEXT,                            -- POS order ID, receipt #, etc.
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX transactions_wallet_id_idx ON transactions (wallet_id, created_at DESC);

-- ─── Circles (social sharing groups) ─────────────────────────────────────────

CREATE TABLE circles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE circle_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id  UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',       -- 'owner' | 'member'
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (circle_id, user_id)
);

CREATE TABLE circle_shares (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id        UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  from_wallet_id   UUID NOT NULL REFERENCES user_wallets(id),
  to_wallet_id     UUID NOT NULL REFERENCES user_wallets(id),
  points           BIGINT NOT NULL CHECK (points > 0),
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Refresh tokens ───────────────────────────────────────────────────────────

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);

-- ─── updated_at triggers ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_franchise_groups_updated_at BEFORE UPDATE ON franchise_groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_operators_updated_at        BEFORE UPDATE ON operators        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_locations_updated_at        BEFORE UPDATE ON locations        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at            BEFORE UPDATE ON users            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_wallets_updated_at     BEFORE UPDATE ON user_wallets     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_circles_updated_at          BEFORE UPDATE ON circles          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
