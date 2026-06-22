import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as strainService from '../services/strain.service';

function checkApiSecret(req: FastifyRequest, reply: FastifyReply): boolean {
  const secret = process.env.CIRCLES_API_SECRET;
  if (secret && req.headers['x-api-secret'] !== secret) {
    reply.code(401).send({ error: 'unauthorized' });
    return false;
  }
  return true;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const TerpeneSchema = z.object({
  name:   z.string().min(1).max(100),
  effect: z.string().max(200).default(''),
});

// pg returns NUMERIC columns as strings — accept both string and number inputs
const pctField = (min: number, max: number) =>
  z.union([z.null(), z.coerce.number().min(min).max(max)]).optional();

const StrainBody = z.object({
  name:              z.string().min(1).max(200),
  aliases:           z.array(z.string()).default([]),
  type:              z.enum(['sativa', 'indica', 'hybrid']).default('hybrid'),
  lineage:           z.string().max(500).nullable().optional(),
  thc_min:           pctField(0, 100),
  thc_max:           pctField(0, 100),
  cbd_min:           pctField(0, 100),
  cbd_max:           pctField(0, 100),
  terpenes:          z.array(TerpeneSchema).default([]),
  effects:           z.array(z.string()).default([]),
  use_cases:         z.array(z.string()).default([]),
  flavors:           z.array(z.string()).default([]),
  about:             z.string().max(5000).nullable().optional(),
  cautions:          z.string().max(2000).nullable().optional(),
  best_method:       z.string().max(50).nullable().optional(),
  beginner_friendly: z.boolean().default(false),
  dominance:         z.enum(['true_sativa', 'sativa_dominant', 'balanced', 'indica_dominant', 'true_indica']).nullable().optional(),
});

const ListQuery = z.object({
  q:    z.string().optional(),
  type: z.enum(['sativa', 'indica', 'hybrid']).optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function strainRoutes(app: FastifyInstance) {

  // GET /strains — list all (with optional ?q= search and ?type= filter)
  app.get('/', async (req, reply) => {
    const query = ListQuery.parse(req.query);
    const strains = await strainService.listStrains({ q: query.q, type: query.type });
    return reply.code(200).send({ strains });
  });

  // GET /strains/search — alias for ?q= (kept for compatibility)
  app.get('/search', async (req, reply) => {
    const query = ListQuery.parse(req.query);
    const strains = await strainService.listStrains({ q: query.q, type: query.type });
    return reply.code(200).send({ strains });
  });

  // GET /strains/:id — must come after /search
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const strain = await strainService.getStrain(id);
    if (!strain) return reply.code(404).send({ error: 'Strain not found' });
    return reply.code(200).send({ strain });
  });

  // POST /strains — create
  app.post('/', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const body = StrainBody.parse(req.body);
    const strain = await strainService.createStrain(body);
    return reply.code(201).send({ strain });
  });

  // PUT /strains/:id — full update
  app.put('/:id', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id } = req.params as { id: string };
    const body = StrainBody.partial().parse(req.body);
    const strain = await strainService.updateStrain(id, body);
    if (!strain) return reply.code(404).send({ error: 'Strain not found' });
    return reply.code(200).send({ strain });
  });

  // DELETE /strains/:id — soft delete
  app.delete('/:id', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id } = req.params as { id: string };
    const deleted = await strainService.deleteStrain(id);
    if (!deleted) return reply.code(404).send({ error: 'Strain not found' });
    return reply.code(200).send({ deleted: true });
  });
}
