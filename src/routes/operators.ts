import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as operatorService from '../services/operator.service';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const CreateOperatorBody = z.object({
  franchise_group_id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens'),
  category: z.string().min(1).max(60),
  logo_url: z.string().url().optional(),
  points_per_dollar: z.number().positive().default(1.0),
  redemption_rate: z.number().positive().default(0.01),
});

const SearchQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().positive().max(500).default(25),
  template: z.string().optional(),
});

export async function operatorRoutes(app: FastifyInstance) {

  // GET /operators/search — static segment must be registered before /:id
  app.get('/search', async (req, reply) => {
    const query = SearchQuery.parse(req.query);

    const results = await operatorService.searchNearby({
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radius,
      template: query.template,
    });

    return reply.code(200).send({ operators: results });
  });

  // GET /operators/:id — public
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const operator = await operatorService.getOperator(id);
    if (!operator) return reply.code(404).send({ error: 'Operator not found' });
    return reply.code(200).send({ operator });
  });

  // GET /operators/:id/locations — public
  app.get('/:id/locations', async (req, reply) => {
    const { id } = req.params as { id: string };
    const operator = await operatorService.getOperator(id);
    if (!operator) return reply.code(404).send({ error: 'Operator not found' });

    const locations = await operatorService.getLocations(id);
    return reply.code(200).send({ locations });
  });

  // POST /operators — superadmin only
  app.post('/', { preHandler: requireRole('superadmin') }, async (req, reply) => {
    const body = CreateOperatorBody.parse(req.body);
    const operator = await operatorService.createOperator(body);
    return reply.code(201).send({ operator });
  });
}
