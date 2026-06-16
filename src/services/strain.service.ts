import { db } from '../db/client';
import type { Strain } from '../types';

export interface StrainData {
  name: string;
  aliases?: unknown[];
  type?: string;
  lineage?: string | null;
  thc_min?: number | null;
  thc_max?: number | null;
  cbd_min?: number | null;
  cbd_max?: number | null;
  terpenes?: unknown[];
  effects?: unknown[];
  use_cases?: unknown[];
  flavors?: unknown[];
  about?: string | null;
  cautions?: string | null;
  best_method?: string | null;
  beginner_friendly?: boolean;
}

// ─── List / Search ─────────────────────────────────────────────────────────────

export async function listStrains(params?: { q?: string; type?: string }): Promise<Strain[]> {
  const values: unknown[] = [];
  const wheres: string[] = ['active = TRUE'];

  if (params?.type) {
    values.push(params.type);
    wheres.push(`type = $${values.length}`);
  }

  if (params?.q) {
    const pattern = `%${params.q.toLowerCase()}%`;
    values.push(pattern);
    // Search by name or any alias value
    wheres.push(`(
      lower(name) LIKE $${values.length}
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(aliases) AS a
        WHERE lower(a) LIKE $${values.length}
      )
    )`);
  }

  const { rows } = await db.query<Strain>(
    `SELECT * FROM strains WHERE ${wheres.join(' AND ')} ORDER BY name`,
    values,
  );
  return rows;
}

// ─── Get one ───────────────────────────────────────────────────────────────────

export async function getStrain(id: string): Promise<Strain | null> {
  const { rows } = await db.query<Strain>(
    'SELECT * FROM strains WHERE id = $1 AND active = TRUE',
    [id],
  );
  return rows[0] ?? null;
}

// ─── Create ────────────────────────────────────────────────────────────────────

export async function createStrain(data: StrainData): Promise<Strain> {
  const { rows } = await db.query<Strain>(
    `INSERT INTO strains (
       name, aliases, type, lineage,
       thc_min, thc_max, cbd_min, cbd_max,
       terpenes, effects, use_cases, flavors,
       about, cautions, best_method, beginner_friendly
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
     ) RETURNING *`,
    [
      data.name,
      JSON.stringify(data.aliases ?? []),
      data.type ?? 'hybrid',
      data.lineage ?? null,
      data.thc_min ?? null,
      data.thc_max ?? null,
      data.cbd_min ?? null,
      data.cbd_max ?? null,
      JSON.stringify(data.terpenes ?? []),
      JSON.stringify(data.effects ?? []),
      JSON.stringify(data.use_cases ?? []),
      JSON.stringify(data.flavors ?? []),
      data.about ?? null,
      data.cautions ?? null,
      data.best_method ?? null,
      data.beginner_friendly ?? false,
    ],
  );
  return rows[0]!;
}

// ─── Update ────────────────────────────────────────────────────────────────────

export async function updateStrain(id: string, data: Partial<StrainData>): Promise<Strain | null> {
  const values: unknown[] = [id];
  const sets: string[] = [];

  function maybeSet(col: string, val: unknown, transform?: (v: unknown) => unknown) {
    values.push(transform ? transform(val) : val);
    sets.push(`${col} = $${values.length}`);
  }

  if ('name' in data)              maybeSet('name', data.name);
  if ('aliases' in data)           maybeSet('aliases', data.aliases, v => JSON.stringify(v ?? []));
  if ('type' in data)              maybeSet('type', data.type ?? 'hybrid');
  if ('lineage' in data)           maybeSet('lineage', data.lineage);
  if ('thc_min' in data)           maybeSet('thc_min', data.thc_min);
  if ('thc_max' in data)           maybeSet('thc_max', data.thc_max);
  if ('cbd_min' in data)           maybeSet('cbd_min', data.cbd_min);
  if ('cbd_max' in data)           maybeSet('cbd_max', data.cbd_max);
  if ('terpenes' in data)          maybeSet('terpenes', data.terpenes, v => JSON.stringify(v ?? []));
  if ('effects' in data)           maybeSet('effects', data.effects, v => JSON.stringify(v ?? []));
  if ('use_cases' in data)         maybeSet('use_cases', data.use_cases, v => JSON.stringify(v ?? []));
  if ('flavors' in data)           maybeSet('flavors', data.flavors, v => JSON.stringify(v ?? []));
  if ('about' in data)             maybeSet('about', data.about);
  if ('cautions' in data)          maybeSet('cautions', data.cautions);
  if ('best_method' in data)       maybeSet('best_method', data.best_method);
  if ('beginner_friendly' in data) maybeSet('beginner_friendly', data.beginner_friendly ?? false);

  if (sets.length === 0) return getStrain(id);

  const { rows } = await db.query<Strain>(
    `UPDATE strains SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 AND active = TRUE RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

// ─── Soft delete ───────────────────────────────────────────────────────────────

export async function deleteStrain(id: string): Promise<boolean> {
  const { rowCount } = await db.query(
    'UPDATE strains SET active = FALSE, updated_at = NOW() WHERE id = $1 AND active = TRUE',
    [id],
  );
  return (rowCount ?? 0) > 0;
}
