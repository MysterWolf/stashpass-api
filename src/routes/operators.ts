import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as operatorService from '../services/operator.service';

const ListQuery = z.object({
  tier:     z.string().optional(),
  category: z.string().optional(),
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

function checkApiSecret(req: FastifyRequest, reply: FastifyReply): boolean {
  const secret = process.env.CIRCLES_API_SECRET;
  if (secret && req.headers['x-api-secret'] !== secret) {
    reply.code(401).send({ error: 'unauthorized' });
    return false;
  }
  return true;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateOperatorBody = z.object({
  name: z.string().min(1).max(120),
  city: z.string().max(120).optional(),
  state: z.string().max(60).optional(),
  category: z.string().max(60).default('general'),
  tier: z.string().max(40).default('standard'),
});

const SpecialSchema = z.object({
  id: z.string().optional(),
  item: z.string().min(1).max(200),
  description: z.string().max(500).default(''),
  updated_at: z.number().int().optional(),
});

const ProfileBody = z.object({
  about: z.string().max(2000).nullable().optional(),
  hours: z.record(z.string()).nullable().optional(),
  website: z.string().url().nullable().optional(),
  instagram: z.string().max(200).nullable().optional(),
  leafly_url: z.string().url().nullable().optional(),
  dutchie_url: z.string().url().nullable().optional(),
  other_ordering_url: z.string().url().nullable().optional(),
  ordering_platform: z.string().max(100).nullable().optional(),
  payment_methods: z.array(z.string()).nullable().optional(),
  black_owned: z.boolean().optional(),
  woman_owned: z.boolean().optional(),
  lgbtq_friendly: z.boolean().optional(),
  veteran_owned: z.boolean().optional(),
  specials: z.array(SpecialSchema).nullable().optional(),
  primary_color: z.string().max(20).nullable().optional(),
  secondary_color: z.string().max(20).nullable().optional(),
  background_color: z.string().max(20).nullable().optional(),
  logo_url: z.string().url().nullable().optional(),
  cover_image_url: z.string().url().nullable().optional(),
  palette: z.string().max(60).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

const SpecialsBody = z.object({
  specials: z.array(SpecialSchema),
});

const LocationBody = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(300).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(60).nullable().optional(),
  zip: z.string().max(20).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  is_primary: z.boolean().optional(),
});

const NearbyQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().positive().max(500).default(25),
  template: z.string().optional(),
});

const SearchQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().positive().max(500).default(25),
  template: z.string().optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function operatorRoutes(app: FastifyInstance) {

  // GET /operators — list all active operators (must come before /:id)
  app.get('/', async (req, reply) => {
    const query = ListQuery.parse(req.query);
    const operators = await operatorService.listOperators({
      tier: query.tier,
      category: query.category,
    });
    return reply.code(200).send({ operators });
  });

  // GET /operators/nearby — profile-based geo search (must come before /:id)
  app.get('/nearby', async (req, reply) => {
    const query = NearbyQuery.parse(req.query);
    const results = await operatorService.searchNearby({
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radius,
      template: query.template,
    });
    return reply.code(200).send({ operators: results });
  });

  // GET /operators/search — legacy location-based geo search
  app.get('/search', async (req, reply) => {
    const query = SearchQuery.parse(req.query);
    const results = await operatorService.searchNearbyLocations({
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
    const locations = await operatorService.getOperatorLocations(id);
    return reply.code(200).send({ locations });
  });

  // POST /operators/:id/locations — add a location
  app.post('/:id/locations', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id } = req.params as { id: string };
    const operator = await operatorService.getOperator(id);
    if (!operator) return reply.code(404).send({ error: 'Operator not found' });
    const body = LocationBody.parse(req.body);
    const location = await operatorService.addOperatorLocation(id, body);
    return reply.code(201).send({ location });
  });

  // PUT /operators/:id/locations/:locationId — update a location
  app.put('/:id/locations/:locationId', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id, locationId } = req.params as { id: string; locationId: string };
    const operator = await operatorService.getOperator(id);
    if (!operator) return reply.code(404).send({ error: 'Operator not found' });
    const body = LocationBody.partial().parse(req.body);
    const location = await operatorService.updateOperatorLocation(id, locationId, body);
    if (!location) return reply.code(404).send({ error: 'Location not found' });
    return reply.code(200).send({ location });
  });

  // DELETE /operators/:id/locations/:locationId — remove a location
  app.delete('/:id/locations/:locationId', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id, locationId } = req.params as { id: string; locationId: string };
    const operator = await operatorService.getOperator(id);
    if (!operator) return reply.code(404).send({ error: 'Operator not found' });
    const deleted = await operatorService.deleteOperatorLocation(id, locationId);
    if (!deleted) return reply.code(404).send({ error: 'Location not found' });
    return reply.code(200).send({ deleted: true });
  });

  // GET /operators/:id/profile — public
  app.get('/:id/profile', async (req, reply) => {
    const { id } = req.params as { id: string };
    const operator = await operatorService.getOperator(id);
    if (!operator) return reply.code(404).send({ error: 'Operator not found' });
    const [profile, locations] = await Promise.all([
      operatorService.getProfile(id),
      operatorService.getOperatorLocations(id),
    ]);
    return reply.code(200).send({ profile: profile ? { ...profile, locations } : null });
  });

  // POST /operators — create operator
  app.post('/', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const body = CreateOperatorBody.parse(req.body);
    const operator = await operatorService.createOperator(body);
    return reply.code(201).send({ operator });
  });

  // POST /operators/:id/profile — push full profile (create or replace)
  app.post('/:id/profile', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id } = req.params as { id: string };
    const operator = await operatorService.getOperator(id);
    if (!operator) return reply.code(404).send({ error: 'Operator not found' });
    const body = ProfileBody.parse(req.body);
    const profile = await operatorService.setProfile(id, body);
    return reply.code(200).send({ profile });
  });

  // PUT /operators/:id/profile — partial update
  app.put('/:id/profile', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id } = req.params as { id: string };
    const operator = await operatorService.getOperator(id);
    if (!operator) return reply.code(404).send({ error: 'Operator not found' });
    const body = ProfileBody.parse(req.body);
    const profile = await operatorService.patchProfile(id, body);
    if (!profile) return reply.code(404).send({ error: 'Profile not found — use POST to create it first' });
    return reply.code(200).send({ profile });
  });

  // POST /operators/:id/specials — replace specials array
  app.post('/:id/specials', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id } = req.params as { id: string };
    const operator = await operatorService.getOperator(id);
    if (!operator) return reply.code(404).send({ error: 'Operator not found' });
    const { specials } = SpecialsBody.parse(req.body);
    const profile = await operatorService.replaceSpecials(id, specials);
    if (!profile) return reply.code(404).send({ error: 'Profile not found — use POST /profile to create it first' });
    return reply.code(200).send({ profile });
  });

  // DELETE /operators/:id/specials/:specialId — remove one special
  app.delete('/:id/specials/:specialId', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id, specialId } = req.params as { id: string; specialId: string };
    const operator = await operatorService.getOperator(id);
    if (!operator) return reply.code(404).send({ error: 'Operator not found' });
    const profile = await operatorService.deleteSpecial(id, specialId);
    if (!profile) return reply.code(404).send({ error: 'Profile not found' });
    return reply.code(200).send({ profile });
  });
}
