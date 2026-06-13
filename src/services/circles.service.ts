import { db } from '../db/client';

async function getCircleById(id: string) {
  const { rows } = await db.query(
    `SELECT id, owner_id, name, emoji, invite_token FROM cg_circles WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createCircle(data: {
  id: string;
  ownerId: string;
  name: string;
  emoji: string;
  inviteToken: string;
}) {
  await db.query(
    `INSERT INTO cg_circles (id, owner_id, name, emoji, invite_token) VALUES ($1, $2, $3, $4, $5)`,
    [data.id, data.ownerId, data.name, data.emoji, data.inviteToken]
  );
}

export async function getCircleByToken(token: string) {
  const { rows } = await db.query(
    `SELECT id, owner_id, name, emoji, invite_token FROM cg_circles WHERE invite_token = $1`,
    [token]
  );
  return rows[0] ?? null;
}

export async function createJoinRequest(data: {
  circleId: string;
  deviceId: string;
  displayName: string;
}): Promise<'ok' | 'not_found'> {
  const circle = await getCircleById(data.circleId);
  if (!circle) return 'not_found';
  await db.query(
    `INSERT INTO cg_join_requests (circle_id, device_id, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (circle_id, device_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           status = 'pending',
           requested_at = NOW(),
           resolved_at = NULL`,
    [data.circleId, data.deviceId, data.displayName]
  );
  return 'ok';
}

export async function getPendingRequests(circleId: string, ownerDeviceId: string) {
  const circle = await getCircleById(circleId);
  if (!circle || circle.owner_id !== ownerDeviceId) return null;
  const { rows } = await db.query(
    `SELECT device_id AS user_id, display_name, requested_at
     FROM cg_join_requests
     WHERE circle_id = $1 AND status = 'pending'
     ORDER BY requested_at ASC`,
    [circleId]
  );
  return rows;
}

export async function resolveRequest(
  circleId: string,
  deviceId: string,
  ownerDeviceId: string,
  action: 'approved' | 'declined'
): Promise<boolean> {
  const circle = await getCircleById(circleId);
  if (!circle || circle.owner_id !== ownerDeviceId) return false;
  await db.query(
    `UPDATE cg_join_requests
     SET status = $3, resolved_at = NOW()
     WHERE circle_id = $1 AND device_id = $2 AND status = 'pending'`,
    [circleId, deviceId, action]
  );
  return true;
}
