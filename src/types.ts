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

export interface Operator {
  id: string;
  franchise_group_id: string | null;
  name: string;
  slug: string;
  category: string;
  city: string | null;
  state: string | null;
  tier: string;
  logo_url: string | null;
  points_per_dollar: string;
  redemption_rate: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Location {
  id: string;
  operator_id: string;
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  lat: string | null;
  lng: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface OperatorLocation {
  id: string;
  operator_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: string | null;
  lng: string | null;
  phone: string | null;
  is_primary: boolean;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface JwtPayload {
  sub: string;   // user id
  role: string;
  iat?: number;
  exp?: number;
}

export interface OperatorProfile {
  id: string;
  operator_id: string;
  about: string | null;
  hours: Record<string, string> | null;
  website: string | null;
  instagram: string | null;
  leafly_url: string | null;
  dutchie_url: string | null;
  other_ordering_url: string | null;
  ordering_platform: string | null;
  payment_methods: string[] | null;
  black_owned: boolean;
  woman_owned: boolean;
  lgbtq_friendly: boolean;
  veteran_owned: boolean;
  specials: Array<{ id: string; item: string; description: string; updated_at: number }> | null;
  primary_color: string | null;
  secondary_color: string | null;
  background_color: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  palette: string;
  date_updated: Date;
  lat: string | null;
  lng: string | null;
}
