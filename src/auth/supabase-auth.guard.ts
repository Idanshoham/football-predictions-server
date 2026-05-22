import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { isKickoffPassed } from '../lib/time';
import type { Request } from 'express';
import type { SupabaseJwtPayload } from './types';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
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

    const supabaseUserId = payload.sub;
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

    let user = await this.prisma.user.findUnique({
      where: { supabaseUserId },
    });

    if (!user) {
      // Sign-up lock: after opener kickoff, no new users.
      const activeTournament = await this.prisma.tournament.findFirst({
        where: { isActive: true },
        orderBy: { openerKickoffAt: 'asc' },
      });
      if (activeTournament && isKickoffPassed(activeTournament.openerKickoffAt)) {
        throw new ForbiddenException(
          'Sign-up has closed (tournament already started)',
        );
      }
      if (!email) {
        throw new UnauthorizedException('Token is missing an email claim');
      }
      user = await this.prisma.user.create({
        data: { supabaseUserId, email, name, avatarUrl },
      });
    }

    req.user = user;
    return true;
  }
}
