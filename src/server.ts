import 'dotenv/config';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';

import { errorHandler } from './middleware/error.middleware';
import { authRoutes } from './routes/auth';
import { walletRoutes } from './routes/wallet';
import { operatorRoutes } from './routes/operators';

const app = Fastify({ logger: true });

// ─── Plugins ──────────────────────────────────────────────────────────────────

app.register(fastifyHelmet);
app.register(fastifyCors, { origin: process.env.CORS_ORIGIN ?? '*' });
app.register(fastifyRateLimit, { max: 100, timeWindow: '1 minute' });
app.register(fastifyJwt, { secret: process.env.JWT_SECRET! });

// ─── Routes ───────────────────────────────────────────────────────────────────

app.register(authRoutes,     { prefix: '/auth' });
app.register(walletRoutes,   { prefix: '/wallet' });
app.register(operatorRoutes, { prefix: '/operators' });

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

// ─── Error handler ────────────────────────────────────────────────────────────

app.setErrorHandler(errorHandler);

// ─── Boot ─────────────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3000', 10);

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
