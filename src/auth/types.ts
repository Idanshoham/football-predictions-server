import type { User } from '@prisma/client';

export interface SupabaseJwtPayload {
  sub: string; // supabase user id
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  };
  iat?: number;
  exp?: number;
}

declare module 'express' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  interface Request {
    user?: User;
  }
}

export type AuthedUser = User;
