import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as circlesService from '../services/circles.service';

function checkApiSecret(req: FastifyRequest, reply: FastifyReply): boolean {
  const secret = process.env.CIRCLES_API_SECRET;
  if (secret && req.headers['x-api-secret'] !== secret) {
    reply.code(401).send({ error: 'unauthorized' });
    return false;
  }
  return true;
}

function deviceId(req: FastifyRequest): string | null {
  return (req.headers['x-device-id'] as string) || null;
}

const CreateCircleBody = z.object({
  id: z.string().min(1),
  owner_id: z.string().min(1),
  name: z.string().min(1).max(100),
  emoji: z.string().min(1),
  invite_token: z.string().min(4),
});

const JoinRequestBody = z.object({
  device_id: z.string().min(1),
  display_name: z.string().min(1).max(100),
});

export async function circlesRoutes(app: FastifyInstance) {

  // POST /circles — create a circle
  app.post('/', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const body = CreateCircleBody.parse(req.body);
    await circlesService.createCircle({
      id: body.id,
      ownerId: body.owner_id,
      name: body.name,
      emoji: body.emoji,
      inviteToken: body.invite_token,
    });
    return reply.code(201).send({ id: body.id });
  });

  // GET /circles/token/:token — validate invite token, return circle info
  app.get('/token/:token', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { token } = req.params as { token: string };
    const circle = await circlesService.getCircleByToken(token);
    if (!circle) return reply.code(404).send({ error: 'not_found' });
    return reply.send({
      id: circle.id,
      owner_id: circle.owner_id,
      name: circle.name,
      emoji: circle.emoji,
      invite_token: circle.invite_token,
    });
  });

  // POST /circles/:id/requests — submit join request
  app.post('/:id/requests', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id } = req.params as { id: string };
    const body = JoinRequestBody.parse(req.body);
    const result = await circlesService.createJoinRequest({
      circleId: id,
      deviceId: body.device_id,
      displayName: body.display_name,
    });
    if (result === 'not_found') return reply.code(404).send({ error: 'circle_not_found' });
    return reply.code(201).send({ ok: true });
  });

  // GET /circles/:id/requests — list pending requests (owner only, x-device-id required)
  app.get('/:id/requests', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id } = req.params as { id: string };
    const owner = deviceId(req);
    if (!owner) return reply.code(400).send({ error: 'x-device-id header required' });
    const requests = await circlesService.getPendingRequests(id, owner);
    if (requests === null) return reply.code(403).send({ error: 'forbidden' });
    return reply.send({ requests });
  });

  // POST /circles/:id/requests/:deviceId/approve
  app.post('/:id/requests/:deviceId/approve', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id, deviceId: targetDevice } = req.params as { id: string; deviceId: string };
    const owner = deviceId(req);
    if (!owner) return reply.code(400).send({ error: 'x-device-id header required' });
    const ok = await circlesService.resolveRequest(id, targetDevice, owner, 'approved');
    if (!ok) return reply.code(403).send({ error: 'forbidden' });
    return reply.send({ ok: true });
  });

  // DELETE /circles/:id/requests/:deviceId — decline
  app.delete('/:id/requests/:deviceId', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id, deviceId: targetDevice } = req.params as { id: string; deviceId: string };
    const owner = deviceId(req);
    if (!owner) return reply.code(400).send({ error: 'x-device-id header required' });
    const ok = await circlesService.resolveRequest(id, targetDevice, owner, 'declined');
    if (!ok) return reply.code(403).send({ error: 'forbidden' });
    return reply.send({ ok: true });
  });
}
