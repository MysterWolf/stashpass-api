import { db } from '../db/client';
import type { UserWallet, Transaction } from '../types';

// ─── Wallet lookup / creation ─────────────────────────────────────────────────

export async function getOrCreateWallet(userId: string, operatorId: string): Promise<UserWallet> {
  const { rows } = await db.query<UserWallet>(
    `INSERT INTO user_wallets (user_id, operator_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, operator_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [userId, operatorId],
  );
  return rows[0];
}

export async function getWallet(userId: string, operatorId: string): Promise<UserWallet | null> {
  const { rows } = await db.query<UserWallet>(
    'SELECT * FROM user_wallets WHERE user_id = $1 AND operator_id = $2',
    [userId, operatorId],
  );
  return rows[0] ?? null;
}

export async function getWalletById(walletId: string): Promise<UserWallet | null> {
  const { rows } = await db.query<UserWallet>('SELECT * FROM user_wallets WHERE id = $1', [walletId]);
  return rows[0] ?? null;
}

// ─── Earn ─────────────────────────────────────────────────────────────────────

export interface EarnParams {
  userId: string;
  operatorId: string;
  locationId?: string;
  amountDollars: number;
  referenceId?: string;
  note?: string;
}

export async function earnPoints(params: EarnParams): Promise<Transaction> {
  const { userId, operatorId, locationId, amountDollars, referenceId, note } = params;

  const opRow = await db.query<{ points_per_dollar: string }>(
    'SELECT points_per_dollar FROM operators WHERE id = $1 AND is_active = TRUE',
    [operatorId],
  );
  if (opRow.rows.length === 0) throw Object.assign(new Error('Operator not found'), { statusCode: 404 });

  const rate = parseFloat(opRow.rows[0].points_per_dollar);
  const pointsDelta = Math.round(amountDollars * rate);
  if (pointsDelta <= 0) throw Object.assign(new Error('Amount too small to earn points'), { statusCode: 400 });

  return applyTransaction({ userId, operatorId, locationId, type: 'earn', pointsDelta, referenceId, note });
}

// ─── Redeem ───────────────────────────────────────────────────────────────────

export interface RedeemParams {
  userId: string;
  operatorId: string;
  locationId?: string;
  pointsToSpend: number;
  referenceId?: string;
  note?: string;
}

export async function redeemPoints(params: RedeemParams): Promise<Transaction & { dollarValue: number }> {
  const { userId, operatorId, locationId, pointsToSpend, referenceId, note } = params;

  if (pointsToSpend <= 0) throw Object.assign(new Error('pointsToSpend must be positive'), { statusCode: 400 });

  const opRow = await db.query<{ redemption_rate: string }>(
    'SELECT redemption_rate FROM operators WHERE id = $1 AND is_active = TRUE',
    [operatorId],
  );
  if (opRow.rows.length === 0) throw Object.assign(new Error('Operator not found'), { statusCode: 404 });

  const tx = await applyTransaction({
    userId, operatorId, locationId,
    type: 'redeem',
    pointsDelta: -pointsToSpend,
    referenceId, note,
  });

  const dollarValue = pointsToSpend * parseFloat(opRow.rows[0].redemption_rate);
  return { ...tx, dollarValue };
}

// ─── Core transaction writer (serializable) ───────────────────────────────────

interface ApplyParams {
  userId: string;
  operatorId: string;
  locationId?: string;
  type: Transaction['type'];
  pointsDelta: number;
  referenceId?: string;
  note?: string;
}

async function applyTransaction(params: ApplyParams): Promise<Transaction> {
  const { userId, operatorId, locationId, type, pointsDelta, referenceId, note } = params;

  const client = await db.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // Lock the wallet row to prevent concurrent balance corruption
    const walletRes = await client.query<UserWallet>(
      `INSERT INTO user_wallets (user_id, operator_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, operator_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [userId, operatorId],
    );
    const wallet = walletRes.rows[0];

    const newBalance = wallet.balance_points + pointsDelta;
    if (newBalance < 0) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('Insufficient points'), { statusCode: 422 });
    }

    // Update wallet
    const newLifetimeEarned = type === 'earn' ? wallet.lifetime_earned + pointsDelta : wallet.lifetime_earned;
    const newLifetimeSpent  = type === 'redeem' ? wallet.lifetime_spent + Math.abs(pointsDelta) : wallet.lifetime_spent;

    await client.query(
      `UPDATE user_wallets
       SET balance_points = $1, lifetime_earned = $2, lifetime_spent = $3, updated_at = NOW()
       WHERE id = $4`,
      [newBalance, newLifetimeEarned, newLifetimeSpent, wallet.id],
    );

    // Write transaction record
    const txRes = await client.query<Transaction>(
      `INSERT INTO transactions (wallet_id, location_id, type, points_delta, balance_after, reference_id, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [wallet.id, locationId ?? null, type, pointsDelta, newBalance, referenceId ?? null, note ?? null],
    );

    await client.query('COMMIT');
    return txRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Balance ──────────────────────────────────────────────────────────────────

export interface BalanceResult {
  wallet: UserWallet;
  dollarValue: number;
}

export async function getBalance(userId: string, operatorId: string): Promise<BalanceResult> {
  const wallet = await getOrCreateWallet(userId, operatorId);

  const opRow = await db.query<{ redemption_rate: string }>(
    'SELECT redemption_rate FROM operators WHERE id = $1',
    [operatorId],
  );
  const rate = opRow.rows.length ? parseFloat(opRow.rows[0].redemption_rate) : 0;

  return { wallet, dollarValue: wallet.balance_points * rate };
}

// ─── History ──────────────────────────────────────────────────────────────────

export interface HistoryParams {
  userId: string;
  operatorId: string;
  limit?: number;
  before?: string; // ISO timestamp cursor
}

export async function getHistory(params: HistoryParams): Promise<Transaction[]> {
  const { userId, operatorId, limit = 50, before } = params;

  const wallet = await getWallet(userId, operatorId);
  if (!wallet) return [];

  const cap = Math.min(limit, 200);
  const cursorClause = before ? `AND t.created_at < $3` : '';
  const values: unknown[] = [wallet.id, cap];
  if (before) values.push(before);

  const { rows } = await db.query<Transaction>(
    `SELECT t.* FROM transactions t
     WHERE t.wallet_id = $1 ${cursorClause}
     ORDER BY t.created_at DESC
     LIMIT $2`,
    values,
  );
  return rows;
}
