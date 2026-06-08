import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

export function errorHandler(
  error: FastifyError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: 'Validation error',
      issues: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const statusCode = (error as FastifyError).statusCode ?? 500;

  if (statusCode >= 500) {
    request.log.error(error);
  }

  reply.code(statusCode).send({
    error: statusCode >= 500 ? 'Internal server error' : error.message,
  });
}
