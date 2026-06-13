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

  // ── Shares ──────────────────────────────────────────────────────────────────

  const CreateShareBody = z.object({
    sharer_id:    z.string().min(1),
    display_name: z.string().max(100).default(''),
    type:         z.string().min(1),
    payload:      z.string().default('{}'),
    note:         z.string().max(500).default(''),
    timestamp:    z.number().int(),
  });

  // POST /circles/:id/shares
  app.post('/:id/shares', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id } = req.params as { id: string };
    const body = CreateShareBody.parse(req.body);
    const shareId = await circlesService.createShare({
      circleId:    id,
      sharerId:    body.sharer_id,
      displayName: body.display_name,
      type:        body.type,
      payload:     body.payload,
      note:        body.note,
      timestamp:   body.timestamp,
    });
    return reply.code(201).send({ id: shareId });
  });

  // GET /circles/:id/shares
  app.get('/:id/shares', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { id } = req.params as { id: string };
    const shares = await circlesService.getShares(id);
    return reply.send({ shares });
  });

  // ── Reactions ────────────────────────────────────────────────────────────────

  const ReactionBody = z.object({
    user_id: z.string().min(1),
    type:    z.enum(['save', 'fire', 'curious']),
  });

  // POST /circles/:id/shares/:shareId/reactions — toggle
  app.post('/:id/shares/:shareId/reactions', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { shareId } = req.params as { id: string; shareId: string };
    const body = ReactionBody.parse(req.body);
    const action = await circlesService.toggleReaction(shareId, body.user_id, body.type);
    return reply.send({ action });
  });

  // GET /circles/:id/shares/:shareId/reactions
  app.get('/:id/shares/:shareId/reactions', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { shareId } = req.params as { id: string; shareId: string };
    const reactions = await circlesService.getReactions(shareId);
    return reply.send({ reactions });
  });
}
