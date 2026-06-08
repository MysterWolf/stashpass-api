import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as walletService from '../services/wallet.service';
import { requireAuth } from '../middleware/auth.middleware';
import type { JwtPayload } from '../types';

const EarnBody = z.object({
  operator_id: z.string().uuid(),
  location_id: z.string().uuid().optional(),
  amount_dollars: z.number().positive(),
  reference_id: z.string().optional(),
  note: z.string().max(255).optional(),
});

const RedeemBody = z.object({
  operator_id: z.string().uuid(),
  location_id: z.string().uuid().optional(),
  points: z.number().int().positive(),
  reference_id: z.string().optional(),
  note: z.string().max(255).optional(),
});

const BalanceParams = z.object({
  operator_id: z.string().uuid(),
});

const HistoryQuery = z.object({
  operator_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().datetime().optional(),
});

export async function walletRoutes(app: FastifyInstance) {

  // All wallet routes require auth
  app.addHook('preHandler', requireAuth);

  // POST /wallet/earn
  app.post('/earn', async (req, reply) => {
    const { sub: userId } = req.user as JwtPayload;
    const body = EarnBody.parse(req.body);

    const tx = await walletService.earnPoints({
      userId,
      operatorId: body.operator_id,
      locationId: body.location_id,
      amountDollars: body.amount_dollars,
      referenceId: body.reference_id,
      note: body.note,
    });

    return reply.code(201).send({ transaction: tx });
  });

  // POST /wallet/redeem
  app.post('/redeem', async (req, reply) => {
    const { sub: userId } = req.user as JwtPayload;
    const body = RedeemBody.parse(req.body);

    const result = await walletService.redeemPoints({
      userId,
      operatorId: body.operator_id,
      locationId: body.location_id,
      pointsToSpend: body.points,
      referenceId: body.reference_id,
      note: body.note,
    });

    return reply.code(200).send({
      transaction: result,
      dollar_value: result.dollarValue,
    });
  });

  // GET /wallet/balance?operator_id=...
  app.get('/balance', async (req, reply) => {
    const { sub: userId } = req.user as JwtPayload;
    const query = BalanceParams.parse(req.query);

    const result = await walletService.getBalance(userId, query.operator_id);
    return reply.code(200).send({
      balance_points: result.wallet.balance_points,
      lifetime_earned: result.wallet.lifetime_earned,
      lifetime_spent: result.wallet.lifetime_spent,
      dollar_value: result.dollarValue,
    });
  });

  // GET /wallet/history?operator_id=...&limit=...&before=...
  app.get('/history', async (req, reply) => {
    const { sub: userId } = req.user as JwtPayload;
    const query = HistoryQuery.parse(req.query);

    const transactions = await walletService.getHistory({
      userId,
      operatorId: query.operator_id,
      limit: query.limit,
      before: query.before,
    });

    return reply.code(200).send({ transactions });
  });
}
