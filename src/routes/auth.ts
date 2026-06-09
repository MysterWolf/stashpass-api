import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as authService from '../services/auth.service';
import { sendOtpEmail } from '../services/email.service';
import { requireAuth } from '../middleware/auth.middleware';

const RequestOtpBody = z.object({
  phone: z.string().min(10).optional(),
  email: z.string().email().optional(),
}).refine(d => d.phone || d.email, { message: 'phone or email required' });

const VerifyOtpBody = z.object({
  phone: z.string().optional(),
  email: z.string().optional(),
  otp: z.string().length(6),
}).refine(d => d.phone || d.email, { message: 'phone or email required' });

const MagicLinkBody = z.object({
  email: z.string().email(),
});

const MagicVerifyBody = z.object({
  token: z.string().min(32),
});

const RefreshBody = z.object({
  refresh_token: z.string().min(10),
});

export async function authRoutes(app: FastifyInstance) {

  // POST /auth/otp/request
  app.post('/otp/request', async (req, reply) => {
    const body = RequestOtpBody.parse(req.body);
    const contact = (body.phone ?? body.email)!;
    const otp = await authService.issueOtp(contact);

    if (body.email) {
      try {
        await sendOtpEmail(body.email, otp);
      } catch (err) {
        // In dev, _dev_otp is returned so the caller still has the code.
        // In production, surface the failure so the user knows delivery broke.
        if (process.env.NODE_ENV === 'production') throw err;
        req.log.warn({ err }, 'Resend delivery failed (dev — _dev_otp still returned)');
      }
    }

    return reply.code(200).send({
      message: 'OTP sent',
      ...(process.env.NODE_ENV !== 'production' && { _dev_otp: otp }),
    });
  });

  // POST /auth/otp/verify
  app.post('/otp/verify', async (req, reply) => {
    const body = VerifyOtpBody.parse(req.body);
    const contact = (body.phone ?? body.email)!;
    const type = body.phone ? 'phone' : 'email';

    const valid = await authService.verifyOtp(contact, body.otp);
    if (!valid) return reply.code(401).send({ error: 'Invalid or expired OTP' });

    const user = await authService.upsertUser(contact, type);
    const accessToken = authService.signAccessToken(user);
    const refreshToken = await authService.signRefreshToken(user);

    return reply.code(200).send({ access_token: accessToken, refresh_token: refreshToken, user });
  });

  // POST /auth/magic/request
  app.post('/magic/request', async (req, reply) => {
    const { email } = MagicLinkBody.parse(req.body);
    const token = await authService.issueMagicToken(email);

    // In production: email link to user
    return reply.code(200).send({
      message: 'Magic link sent',
      ...(process.env.NODE_ENV !== 'production' && { _dev_token: token }),
    });
  });

  // POST /auth/magic/verify
  app.post('/magic/verify', async (req, reply) => {
    const { token } = MagicVerifyBody.parse(req.body);
    const email = await authService.verifyMagicToken(token);
    if (!email) return reply.code(401).send({ error: 'Invalid or expired magic link' });

    const user = await authService.upsertUser(email, 'email');
    const accessToken = authService.signAccessToken(user);
    const refreshToken = await authService.signRefreshToken(user);

    return reply.code(200).send({ access_token: accessToken, refresh_token: refreshToken, user });
  });

  // POST /auth/refresh
  app.post('/refresh', async (req, reply) => {
    const { refresh_token } = RefreshBody.parse(req.body);
    const result = await authService.rotateRefreshToken(refresh_token);
    if (!result) return reply.code(401).send({ error: 'Invalid or expired refresh token' });

    return reply.code(200).send({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
    });
  });

  // POST /auth/logout
  app.post('/logout', { preHandler: requireAuth }, async (req, reply) => {
    const { refresh_token } = RefreshBody.parse(req.body);
    await authService.revokeRefreshToken(refresh_token);
    return reply.code(200).send({ message: 'Logged out' });
  });

  // GET /auth/me
  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    return reply.code(200).send({ user: req.user });
  });
}
