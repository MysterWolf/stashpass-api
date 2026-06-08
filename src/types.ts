export interface User {
  id: string;
  phone: string | null;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'operator_admin' | 'superadmin';
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserWallet {
  id: string;
  user_id: string;
  operator_id: string;
  balance_points: number;
  lifetime_earned: number;
  lifetime_spent: number;
  created_at: Date;
  updated_at: Date;
}

export interface Transaction {
  id: string;
  wallet_id: string;
  location_id: string | null;
  type: 'earn' | 'redeem' | 'adjust' | 'circle_share' | 'circle_receive';
  points_delta: number;
  balance_after: number;
  reference_id: string | null;
  note: string | null;
  created_at: Date;
}

export interface JwtPayload {
  sub: string;   // user id
  role: string;
  iat?: number;
  exp?: number;
}
