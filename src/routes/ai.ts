import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { enrichStrain } from '../services/ai.service';

function checkApiSecret(req: FastifyRequest, reply: FastifyReply): boolean {
  const secret = process.env.CIRCLES_API_SECRET;
  if (secret && req.headers['x-api-secret'] !== secret) {
    reply.code(401).send({ error: 'unauthorized' });
    return false;
  }
  return true;
}

const EnrichBody = z.object({
  name: z.string().min(1).max(200),
  type: z.string().optional(),
});

export async function aiRoutes(app: FastifyInstance) {
  app.post('/enrich-strain', async (req, reply) => {
    if (!checkApiSecret(req, reply)) return;
    const { name, type } = EnrichBody.parse(req.body);
    try {
      const enriched = await enrichStrain(name, type);
      return reply.code(200).send({ enriched });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(500).send({ error: msg });
    }
  });
}
