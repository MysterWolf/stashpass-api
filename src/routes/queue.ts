import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client';

function checkApiSecret(req: FastifyRequest, reply: FastifyReply): boolean {
  const secret = process.env.CIRCLES_API_SECRET;
  if (secret && req.headers['x-api-secret'] !== secret) {
    reply.code(401).send({ error: 'unauthorized' });
    return false;
  }
  return true;
}

// Mirror of Flutter's _normalizeName: lowercase, strip punctuation, collapse spaces
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Mirror of Flutter's _typeCompatible — sativa/indica mutually exclusive;
// unknown types (e.g. product formats) are treated as don't-care.
const KNOWN_GENETIC = new Set(['sativa', 'indica', 'hybrid', 'sativa_dominant', 'indica_dominant', 'balanced']);
const sativaLike = (t: string) => t === 'sativa' || t === 'sativa_dominant';
const indicaLike = (t: string) => t === 'indica' || t === 'indica_dominant';

function typesCompatible(a: string, b: string): boolean {
  const na = (a || '').toLowerCase().trim();
  const nb = (b || '').toLowerCase().trim();
  if (!na || !nb) return true;
  if (!KNOWN_GENETIC.has(na) || !KNOWN_GENETIC.has(nb)) return true;
  if (na === nb) return true;
  if (sativaLike(na) && indicaLike(nb)) return false;
  if (indicaLike(na) && sativaLike(nb)) return false;
  return true;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const SurfaceBody = z.object({
  name:      z.string().min(1).max(200),
  type:      z.string().max(50).optional(),
  device_id: z.string().min(1).max(200),
});

const PatchBody = z.object({
  status:    z.enum(['pending', 'enriching', 'published', 'rejected']).optional(),
  strain_id: z.string().uuid().nullable().optional(),
});

// ─── Route types ──────────────────────────────────────────────────────────────

interface QueueRow {
  id: string;
  name: string;
  type: string | null;
  surface_count: number;
  device_ids: string[];
}

interface StrainRow {
  id: string;
  name: string;
  type: string;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function queueRoutes(app: FastifyInstance) {

  // POST /queue/strains — CannaGuide device surfaces an unknown strain
  // Public endpoint — no API secret required (called by device, not admin)
  app.post('/strains', async (req, reply) => {
    const { name, type, device_id } = SurfaceBody.parse(req.body);
    const normName = normalizeName(name);
    const apiType = (type ?? '').toLowerCase().trim();

    // 1. Check if a published strain already matches
    const { rows: published } = await db.query<StrainRow>(
      'SELECT id, name, type FROM strains WHERE active = TRUE',
    );
    const existingStrain = published.find(s =>
      normalizeName(s.name) === normName && typesCompatible(s.type, apiType),
    );
    if (existingStrain) {
      return reply.code(200).send({ status: 'exists', strain_id: existingStrain.id });
    }

    // 2. Check queue for an existing pending/enriching row
    const { rows: queueRows } = await db.query<QueueRow>(
      `SELECT id, name, type, surface_count, device_ids
       FROM strain_queue
       WHERE status IN ('pending', 'enriching')`,
    );
    const queueMatch = queueRows.find(r =>
      normalizeName(r.name) === normName && typesCompatible(r.type ?? '', apiType),
    );

    if (queueMatch) {
      const updatedIds = Array.from(new Set([...queueMatch.device_ids, device_id]));
      await db.query(
        `UPDATE strain_queue
         SET surface_count = surface_count + 1, device_ids = $1::jsonb
         WHERE id = $2`,
        [JSON.stringify(updatedIds), queueMatch.id],
      );
      return reply.code(200).send({ status: 'queued', queue_id: queueMatch.id });
    }

    // 3. Insert new queue row
    const { rows: inserted } = await db.query<{ id: string }>(
      `INSERT INTO strain_queue (name, type, device_id, device_ids, surface_count)
       VALUES ($1, $2, $3, $4::jsonb, 1)
       RETURNING id`,
      [name, type ?? null, device_id, JSON.stringify([device_id])],
    );
    return reply.code(201).send({ status: 'queued', queue_id: inserted[0]!.id });
  });

  // GET /queue/strains — list pending + enriching items (admin)
  app.get('/strains', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { rows } = await db.query(
      `SELECT id, name, type, surface_count, surfaced_at, status, strain_id, device_ids
       FROM strain_queue
       WHERE status IN ('pending', 'enriching')
       ORDER BY surface_count DESC, surfaced_at ASC`,
    );
    return reply.code(200).send({ items: rows });
  });

  // PATCH /queue/strains/:id — update status / link strain_id (admin)
  app.patch('/strains/:id', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id } = req.params as { id: string };
    const body = PatchBody.parse(req.body);

    const sets: string[] = [];
    const values: unknown[] = [id];

    if (body.status !== undefined) {
      values.push(body.status);
      sets.push(`status = $${values.length}`);
    }
    if ('strain_id' in body) {
      values.push(body.strain_id);
      sets.push(`strain_id = $${values.length}`);
    }

    if (sets.length === 0) return reply.code(400).send({ error: 'Nothing to update' });

    const { rows } = await db.query(
      `UPDATE strain_queue SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Queue item not found' });
    return reply.code(200).send({ item: rows[0] });
  });
}
