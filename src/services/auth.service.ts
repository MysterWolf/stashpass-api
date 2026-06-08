import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from '../db/client';
import { redis } from '../db/redis';
import type { User, JwtPayload } from '../types';

const OTP_TTL = parseInt(process.env.OTP_TTL_SECONDS ?? '600', 10);
const OTP_LENGTH = parseInt(process.env.OTP_LENGTH ?? '6', 10);
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? '15m';
const JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL ?? '30d';

// ─── OTP / magic link ─────────────────────────────────────────────────────────

function generateOtp(): string {
  const digits = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return digits.toString().padStart(OTP_LENGTH, '0');
}

function otpKey(contact: string): string {
  return `otp:${contact}`;
}

export async function issueOtp(contact: string): Promise<string> {
  const otp = generateOtp();
  const hash = crypto.createHash('sha256').update(otp).digest('hex');
  await redis.setex(otpKey(contact), OTP_TTL, hash);
  return otp; // caller delivers this via SMS/email
}

export async function verifyOtp(contact: string, otp: string): Promise<boolean> {
  const stored = await redis.get(otpKey(contact));
  if (!stored) return false;
  const hash = crypto.createHash('sha256').update(otp).digest('hex');
  const valid = crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(hash));
  if (valid) await redis.del(otpKey(contact));
  return valid;
}

// ─── Magic link ───────────────────────────────────────────────────────────────

function magicLinkKey(token: string): string {
  return `magic:${token}`;
}

export async function issueMagicToken(email: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await redis.setex(magicLinkKey(token), OTP_TTL, email);
  return token;
}

export async function verifyMagicToken(token: string): Promise<string | null> {
  const email = await redis.get(magicLinkKey(token));
  if (!email) return null;
  await redis.del(magicLinkKey(token));
  return email;
}

// ─── User upsert ─────────────────────────────────────────────────────────────

type ContactType = 'phone' | 'email';

export async function upsertUser(contact: string, type: ContactType): Promise<User> {
  const col = type === 'phone' ? 'phone' : 'email';
  const { rows } = await db.query<User>(
    `INSERT INTO users (${col}) VALUES ($1)
     ON CONFLICT (${col}) DO UPDATE SET last_login_at = NOW(), updated_at = NOW()
     RETURNING *`,
    [contact],
  );
  return rows[0];
}

// ─── JWT ─────────────────────────────────────────────────────────────────────

export function signAccessToken(user: User): string {
  const payload: JwtPayload = { sub: user.id, role: user.role };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_ACCESS_TTL } as jwt.SignOptions);
}

export async function signRefreshToken(user: User): Promise<string> {
  const raw = crypto.randomBytes(40).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  // 30d in seconds
  const ttlMs = 30 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, hash, expiresAt],
  );

  return raw;
}

export async function rotateRefreshToken(
  raw: string,
): Promise<{ user: User; accessToken: string; refreshToken: string } | null> {
  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ user_id: string; expires_at: Date; revoked_at: Date | null }>(
      'SELECT user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE',
      [hash],
    );

    if (rows.length === 0 || rows[0].revoked_at || rows[0].expires_at < new Date()) {
      await client.query('ROLLBACK');
      return null;
    }

    // Revoke old token
    await client.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [hash]);

    const userRow = await client.query<User>('SELECT * FROM users WHERE id = $1', [rows[0].user_id]);
    const user = userRow.rows[0];

    await client.query('COMMIT');

    const accessToken = signAccessToken(user);
    const refreshToken = await signRefreshToken(user);
    return { user, accessToken, refreshToken };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [hash]);
}
