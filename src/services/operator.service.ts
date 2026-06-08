import { db } from '../db/client';
import type { Operator, Location } from '../types';

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
  franchise_group_id?: string;
  name: string;
  slug: string;
  category: string;
  logo_url?: string;
  points_per_dollar?: number;
  redemption_rate?: number;
}

export async function createOperator(params: CreateOperatorParams): Promise<Operator> {
  const {
    franchise_group_id = null,
    name,
    slug,
    category,
    logo_url = null,
    points_per_dollar = 1.0,
    redemption_rate = 0.01,
  } = params;

  const { rows } = await db.query<Operator>(
    `INSERT INTO operators
       (franchise_group_id, name, slug, category, logo_url, points_per_dollar, redemption_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [franchise_group_id, name, slug, category, logo_url, points_per_dollar, redemption_rate],
  );
  return rows[0];
}

// ─── Geo search (Haversine, no PostGIS required) ──────────────────────────────

export interface SearchParams {
  lat: number;
  lng: number;
  radiusKm: number;
  template?: string;  // maps to operators.category
}

export interface NearbyOperator extends Operator {
  distance_km: number;
  locations: Pick<Location, 'id' | 'name' | 'address' | 'city' | 'lat' | 'lng'>[];
}

export async function searchNearby(params: SearchParams): Promise<NearbyOperator[]> {
  const { lat, lng, radiusKm, template } = params;

  const values: unknown[] = [lat, lng, lat, radiusKm];
  const categoryClause = template ? `AND o.category = $${values.push(template)}` : '';

  // Haversine formula returns distance in km. CTE avoids repeating the expression.
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

  // Collapse multiple location rows per operator into one result with a locations array
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
