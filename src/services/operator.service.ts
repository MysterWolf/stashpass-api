import { randomUUID } from 'crypto';
import { db } from '../db/client';
import type { Operator, Location, OperatorProfile } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    + '-' + Date.now().toString(36);
}

function normalizeSpecials(
  specials?: Array<{ id?: string; item: string; description?: string; updated_at?: number }> | null,
): Array<{ id: string; item: string; description: string; updated_at: number }> | null {
  if (!specials) return null;
  return specials.map(s => ({
    id: s.id ?? randomUUID(),
    item: s.item,
    description: s.description ?? '',
    updated_at: s.updated_at ?? Date.now(),
  }));
}

// ─── Get one operator ─────────────────────────────────────────────────────────

export async function getOperator(id: string): Promise<Operator | null> {
  const { rows } = await db.query<Operator>(
    'SELECT * FROM operators WHERE id = $1 AND is_active = TRUE',
    [id],
  );
  return rows[0] ?? null;
}

// ─── Get locations for an operator ───────────────────────────────────────────

export async function getLocations(operatorId: string): Promise<Location[]> {
  const { rows } = await db.query<Location>(
    'SELECT * FROM locations WHERE operator_id = $1 AND is_active = TRUE ORDER BY name',
    [operatorId],
  );
  return rows;
}

// ─── Create operator ──────────────────────────────────────────────────────────

export interface CreateOperatorParams {
  name: string;
  city?: string;
  state?: string;
  category?: string;
  tier?: string;
}

export async function createOperator(params: CreateOperatorParams): Promise<Operator> {
  const { name, city = null, state = null, category = 'general', tier = 'standard' } = params;
  const slug = slugify(name);

  const { rows } = await db.query<Operator>(
    `INSERT INTO operators (name, slug, category, city, state, tier)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, slug, category, city, state, tier],
  );
  return rows[0];
}

// ─── Operator profile — get ───────────────────────────────────────────────────

export async function getProfile(operatorId: string): Promise<OperatorProfile | null> {
  const { rows } = await db.query<OperatorProfile>(
    'SELECT * FROM operator_profiles WHERE operator_id = $1',
    [operatorId],
  );
  return rows[0] ?? null;
}

// ─── Operator profile — full replace (POST) ───────────────────────────────────

export type ProfileData = {
  about?: string | null;
  hours?: Record<string, string> | null;
  website?: string | null;
  instagram?: string | null;
  leafly_url?: string | null;
  dutchie_url?: string | null;
  other_ordering_url?: string | null;
  ordering_platform?: string | null;
  payment_methods?: string[] | null;
  black_owned?: boolean;
  woman_owned?: boolean;
  lgbtq_friendly?: boolean;
  veteran_owned?: boolean;
  specials?: Array<{ id?: string; item: string; description?: string; updated_at?: number }> | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  background_color?: string | null;
  logo_url?: string | null;
  cover_image_url?: string | null;
  palette?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export async function setProfile(operatorId: string, data: ProfileData): Promise<OperatorProfile> {
  const specials = normalizeSpecials(data.specials ?? null);

  const { rows } = await db.query<OperatorProfile>(
    `INSERT INTO operator_profiles (
       operator_id, about, hours, website, instagram, leafly_url, dutchie_url,
       other_ordering_url, ordering_platform, payment_methods,
       black_owned, woman_owned, lgbtq_friendly, veteran_owned,
       specials, primary_color, secondary_color, background_color,
       logo_url, cover_image_url, palette, lat, lng, date_updated
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW()
     )
     ON CONFLICT (operator_id) DO UPDATE SET
       about             = EXCLUDED.about,
       hours             = EXCLUDED.hours,
       website           = EXCLUDED.website,
       instagram         = EXCLUDED.instagram,
       leafly_url        = EXCLUDED.leafly_url,
       dutchie_url       = EXCLUDED.dutchie_url,
       other_ordering_url = EXCLUDED.other_ordering_url,
       ordering_platform = EXCLUDED.ordering_platform,
       payment_methods   = EXCLUDED.payment_methods,
       black_owned       = EXCLUDED.black_owned,
       woman_owned       = EXCLUDED.woman_owned,
       lgbtq_friendly    = EXCLUDED.lgbtq_friendly,
       veteran_owned     = EXCLUDED.veteran_owned,
       specials          = EXCLUDED.specials,
       primary_color     = EXCLUDED.primary_color,
       secondary_color   = EXCLUDED.secondary_color,
       background_color  = EXCLUDED.background_color,
       logo_url          = EXCLUDED.logo_url,
       cover_image_url   = EXCLUDED.cover_image_url,
       palette           = EXCLUDED.palette,
       lat               = EXCLUDED.lat,
       lng               = EXCLUDED.lng,
       date_updated      = NOW()
     RETURNING *`,
    [
      operatorId,
      data.about ?? null,
      data.hours != null ? JSON.stringify(data.hours) : null,
      data.website ?? null,
      data.instagram ?? null,
      data.leafly_url ?? null,
      data.dutchie_url ?? null,
      data.other_ordering_url ?? null,
      data.ordering_platform ?? null,
      data.payment_methods != null ? JSON.stringify(data.payment_methods) : null,
      data.black_owned ?? false,
      data.woman_owned ?? false,
      data.lgbtq_friendly ?? false,
      data.veteran_owned ?? false,
      specials != null ? JSON.stringify(specials) : null,
      data.primary_color ?? null,
      data.secondary_color ?? null,
      data.background_color ?? null,
      data.logo_url ?? null,
      data.cover_image_url ?? null,
      data.palette ?? 'cannaguide_default',
      data.lat ?? null,
      data.lng ?? null,
    ],
  );
  return rows[0];
}

// ─── Operator profile — partial update (PUT) ──────────────────────────────────

export async function patchProfile(operatorId: string, data: Partial<ProfileData>): Promise<OperatorProfile | null> {
  const existing = await getProfile(operatorId);
  if (!existing) return null;

  // Build SET clause dynamically — only update keys present in the request body
  const values: unknown[] = [operatorId];
  const sets: string[] = [];

  function maybeSet(col: string, val: unknown, transform?: (v: unknown) => unknown) {
    values.push(transform ? transform(val) : val);
    sets.push(`${col} = $${values.length}`);
  }

  if ('about' in data) maybeSet('about', data.about);
  if ('hours' in data) maybeSet('hours', data.hours, v => v != null ? JSON.stringify(v) : null);
  if ('website' in data) maybeSet('website', data.website);
  if ('instagram' in data) maybeSet('instagram', data.instagram);
  if ('leafly_url' in data) maybeSet('leafly_url', data.leafly_url);
  if ('dutchie_url' in data) maybeSet('dutchie_url', data.dutchie_url);
  if ('other_ordering_url' in data) maybeSet('other_ordering_url', data.other_ordering_url);
  if ('ordering_platform' in data) maybeSet('ordering_platform', data.ordering_platform);
  if ('payment_methods' in data) maybeSet('payment_methods', data.payment_methods, v => v != null ? JSON.stringify(v) : null);
  if ('black_owned' in data) maybeSet('black_owned', data.black_owned ?? false);
  if ('woman_owned' in data) maybeSet('woman_owned', data.woman_owned ?? false);
  if ('lgbtq_friendly' in data) maybeSet('lgbtq_friendly', data.lgbtq_friendly ?? false);
  if ('veteran_owned' in data) maybeSet('veteran_owned', data.veteran_owned ?? false);
  if ('specials' in data) {
    const specials = normalizeSpecials(data.specials ?? null);
    values.push(specials != null ? JSON.stringify(specials) : null);
    sets.push(`specials = $${values.length}`);
  }
  if ('primary_color' in data) maybeSet('primary_color', data.primary_color);
  if ('secondary_color' in data) maybeSet('secondary_color', data.secondary_color);
  if ('background_color' in data) maybeSet('background_color', data.background_color);
  if ('logo_url' in data) maybeSet('logo_url', data.logo_url);
  if ('cover_image_url' in data) maybeSet('cover_image_url', data.cover_image_url);
  if ('palette' in data) maybeSet('palette', data.palette ?? 'cannaguide_default');
  if ('lat' in data) maybeSet('lat', data.lat);
  if ('lng' in data) maybeSet('lng', data.lng);

  if (sets.length === 0) return existing;

  sets.push('date_updated = NOW()');

  const { rows } = await db.query<OperatorProfile>(
    `UPDATE operator_profiles SET ${sets.join(', ')} WHERE operator_id = $1 RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

// ─── Specials — replace array ─────────────────────────────────────────────────

export async function replaceSpecials(
  operatorId: string,
  specials: Array<{ id?: string; item: string; description?: string; updated_at?: number }>,
): Promise<OperatorProfile | null> {
  const normalized = normalizeSpecials(specials);
  const { rows } = await db.query<OperatorProfile>(
    `UPDATE operator_profiles SET specials = $2, date_updated = NOW()
     WHERE operator_id = $1 RETURNING *`,
    [operatorId, JSON.stringify(normalized)],
  );
  return rows[0] ?? null;
}

// ─── Specials — delete one by id ──────────────────────────────────────────────

export async function deleteSpecial(operatorId: string, specialId: string): Promise<OperatorProfile | null> {
  // Filter the JSONB array in Postgres, removing the element whose 'id' matches
  const { rows } = await db.query<OperatorProfile>(
    `UPDATE operator_profiles
     SET specials = (
       SELECT COALESCE(jsonb_agg(s), '[]'::jsonb)
       FROM jsonb_array_elements(COALESCE(specials, '[]'::jsonb)) AS s
       WHERE (s->>'id') <> $2
     ),
     date_updated = NOW()
     WHERE operator_id = $1
     RETURNING *`,
    [operatorId, specialId],
  );
  return rows[0] ?? null;
}

// ─── Geo search — operators with profiles (lat/lng from operator_profiles) ───

export interface NearbyWithProfile extends Operator {
  distance_km: number;
  profile: OperatorProfile;
}

export async function searchNearby(params: {
  lat: number;
  lng: number;
  radiusKm: number;
  template?: string;
}): Promise<NearbyWithProfile[]> {
  const { lat, lng, radiusKm, template } = params;

  // $1 = lat, $2 = lng, $3 = radiusKm (lat reused for both cos and sin terms)
  const values: unknown[] = [lat, lng, radiusKm];
  const categoryClause = template ? `AND o.category = $${values.push(template)}` : '';

  // row_to_json(op) returns the full profile row as a JSONB object — avoids aliasing every column
  const { rows } = await db.query<Operator & { distance_km: number; profile: OperatorProfile }>(
    `WITH nearby AS (
       SELECT
         o.*,
         row_to_json(op) AS profile,
         (
           6371 * acos(
             LEAST(1.0,
               cos(radians($1)) * cos(radians(op.lat::float))
               * cos(radians(op.lng::float) - radians($2))
               + sin(radians($1)) * sin(radians(op.lat::float))
             )
           )
         ) AS distance_km
       FROM operators o
       JOIN operator_profiles op ON op.operator_id = o.id
       WHERE o.is_active = TRUE
         AND op.lat IS NOT NULL AND op.lng IS NOT NULL
         ${categoryClause}
     )
     SELECT * FROM nearby
     WHERE distance_km <= $3
     ORDER BY distance_km`,
    values,
  );

  return rows;
}

// ─── Legacy location-based geo search (keeps /search working) ─────────────────

export interface NearbyOperator extends Operator {
  distance_km: number;
  locations: Pick<Location, 'id' | 'name' | 'address' | 'city' | 'lat' | 'lng'>[];
}

export async function searchNearbyLocations(params: {
  lat: number;
  lng: number;
  radiusKm: number;
  template?: string;
}): Promise<NearbyOperator[]> {
  const { lat, lng, radiusKm, template } = params;

  const values: unknown[] = [lat, lng, lat, radiusKm];
  const categoryClause = template ? `AND o.category = $${values.push(template)}` : '';

  const { rows } = await db.query<NearbyOperator & { location_id: string; location_name: string; location_address: string | null; location_city: string | null; location_lat: string | null; location_lng: string | null }>(
    `WITH nearby AS (
       SELECT
         o.*,
         l.id          AS location_id,
         l.name        AS location_name,
         l.address     AS location_address,
         l.city        AS location_city,
         l.lat         AS location_lat,
         l.lng         AS location_lng,
         (
           6371 * acos(
             LEAST(1.0,
               cos(radians($1)) * cos(radians(l.lat::float))
               * cos(radians(l.lng::float) - radians($2))
               + sin(radians($1)) * sin(radians(l.lat::float))
             )
           )
         ) AS distance_km
       FROM operators o
       JOIN locations l ON l.operator_id = o.id AND l.is_active = TRUE
         AND l.lat IS NOT NULL AND l.lng IS NOT NULL
       WHERE o.is_active = TRUE ${categoryClause}
     )
     SELECT * FROM nearby
     WHERE distance_km <= $4
     ORDER BY distance_km`,
    values,
  );

  const map = new Map<string, NearbyOperator>();
  for (const row of rows) {
    if (!map.has(row.id)) {
      const { location_id, location_name, location_address, location_city, location_lat, location_lng, ...op } = row;
      map.set(row.id, { ...op, locations: [] });
    }
    map.get(row.id)!.locations.push({
      id: row.location_id,
      name: row.location_name,
      address: row.location_address,
      city: row.location_city,
      lat: row.location_lat,
      lng: row.location_lng,
    });
  }

  return Array.from(map.values());
}
