// Diagnostic startup: uses require() instead of import so each module load
// can be bracketed with a log line. Remove this comment once stable.

process.stdout.write('[startup] 0 — file executing\n');

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv/config');
process.stdout.write('[startup] 1 — dotenv\n');

// Helper: handles both CJS modules and ESM-compiled defaults
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function req(id: string): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require(id);
  return m && m.__esModule && m.default !== undefined ? m.default : m;
}

const Fastify = req('fastify');
process.stdout.write('[startup] 2 — fastify\n');

const fastifyJwt     = req('@fastify/jwt');
process.stdout.write('[startup] 3 — @fastify/jwt\n');

const fastifyCors    = req('@fastify/cors');
process.stdout.write('[startup] 4 — @fastify/cors\n');

const fastifyHelmet  = req('@fastify/helmet');
process.stdout.write('[startup] 5 — @fastify/helmet\n');

const fastifyRateLimit = req('@fastify/rate-limit');
process.stdout.write('[startup] 6 — @fastify/rate-limit\n');

const { errorHandler } = req('./middleware/error.middleware');
process.stdout.write('[startup] 7 — error.middleware\n');

const { authRoutes }     = req('./routes/auth');
process.stdout.write('[startup] 8 — routes/auth\n');

const { walletRoutes }   = req('./routes/wallet');
process.stdout.write('[startup] 9 — routes/wallet\n');

const { operatorRoutes } = req('./routes/operators');
process.stdout.write('[startup] 10 — routes/operators\n');

const { circlesRoutes }  = req('./routes/circles');
process.stdout.write('[startup] 10b — routes/circles\n');

// ─── Env var check ────────────────────────────────────────────────────────────

const REQUIRED_ENV = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  process.stdout.write(`[startup] FAIL — missing env vars: ${missing.join(', ')}\n`);
  process.stdout.write('[startup] Set these in Railway → your service → Variables\n');
  process.exit(1);
}
process.stdout.write(`[startup] 11 — env OK (PORT=${process.env.PORT} NODE_ENV=${process.env.NODE_ENV})\n`);

// ─── App ──────────────────────────────────────────────────────────────────────

const app = Fastify({ logger: true });
process.stdout.write('[startup] 12 — Fastify instance created\n');

app.register(fastifyHelmet);
process.stdout.write('[startup] 13 — helmet registered\n');

app.register(fastifyCors, { origin: process.env.CORS_ORIGIN ?? '*' });
process.stdout.write('[startup] 14 — cors registered\n');

app.register(fastifyRateLimit, { max: 100, timeWindow: '1 minute' });
process.stdout.write('[startup] 15 — rate-limit registered\n');

app.register(fastifyJwt, { secret: process.env.JWT_SECRET! });
process.stdout.write('[startup] 16 — jwt registered\n');

app.register(authRoutes,     { prefix: '/auth' });
app.register(walletRoutes,   { prefix: '/wallet' });
app.register(operatorRoutes, { prefix: '/operators' });
app.register(circlesRoutes,  { prefix: '/circles' });
app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));
app.setErrorHandler(errorHandler);
process.stdout.write('[startup] 17 — all routes registered\n');

// ─── Boot ─────────────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3000', 10);
process.stdout.write(`[startup] 18 — calling app.listen on port ${port}\n`);

app.listen({ port, host: '0.0.0.0' }, (err: Error | null) => {
  if (err) {
    process.stdout.write(`[startup] FAIL — app.listen error: ${err.message}\n`);
    process.exit(1);
  }
  process.stdout.write('[startup] 19 — listening. Server is up.\n');
});
