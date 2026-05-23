import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { UsersService } from '../users/users.service';
import type { Request } from 'express';
import type { SupabaseJwtPayload } from './types';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }
    const token = auth.slice('Bearer '.length);

    const secret = this.config.get<string>('SUPABASE_JWT_SECRET');
    if (!secret) {
      throw new Error('SUPABASE_JWT_SECRET is not configured');
    }

    let payload: SupabaseJwtPayload;
    try {
      payload = jwt.verify(token, secret) as SupabaseJwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const email = payload.email ?? '';
    const name =
      payload.user_metadata?.full_name ??
      payload.user_metadata?.name ??
      email.split('@')[0] ??
      'Guest';
    const avatarUrl =
      payload.user_metadata?.avatar_url ??
      payload.user_metadata?.picture ??
      null;

    const user = await this.users.findOrCreate({
      supabaseUserId: payload.sub,
      email,
      name,
      avatarUrl,
    });

    req.user = user;
    return true;
  }
}
