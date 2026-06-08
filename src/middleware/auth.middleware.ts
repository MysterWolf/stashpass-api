import { FastifyRequest, FastifyReply } from 'fastify';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

export function requireRole(role: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply);
    const user = request.user as { role: string };
    if (user.role !== role && user.role !== 'superadmin') {
      reply.code(403).send({ error: 'Forbidden' });
    }
  };
}
