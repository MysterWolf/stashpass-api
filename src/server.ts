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

console.log('[startup] 1/6 modules loaded — PORT=%s NODE_ENV=%s', process.env.PORT, process.env.NODE_ENV);

// ─── Env var check ────────────────────────────────────────────────────────────
// stdout (not stderr) so Railway Deploy Logs always shows this line.

const REQUIRED_ENV = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.log('[startup] FAIL — missing required env vars:', missing.join(', '));
  console.log('[startup] Set these in Railway dashboard → your service → Variables');
  process.exit(1);
}
console.log('[startup] 2/6 env vars OK');

// ─── App ──────────────────────────────────────────────────────────────────────

const app = Fastify({ logger: true });

app.register(fastifyHelmet);
app.register(fastifyCors, { origin: process.env.CORS_ORIGIN ?? '*' });
app.register(fastifyRateLimit, { max: 100, timeWindow: '1 minute' });
app.register(fastifyJwt, { secret: process.env.JWT_SECRET! });
console.log('[startup] 3/6 plugins registered');

app.register(authRoutes,     { prefix: '/auth' });
app.register(walletRoutes,   { prefix: '/wallet' });
app.register(operatorRoutes, { prefix: '/operators' });
app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));
app.setErrorHandler(errorHandler);
console.log('[startup] 4/6 routes registered');

// ─── Boot ─────────────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3000', 10);
console.log('[startup] 5/6 calling app.listen on port %d', port);

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.log('[startup] FAIL — app.listen error:', err.message);
    process.exit(1);
  }
  console.log('[startup] 6/6 listening — server is up');
});
