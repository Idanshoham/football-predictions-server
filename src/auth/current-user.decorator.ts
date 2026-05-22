import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@prisma/client';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new Error(
        'CurrentUser used on a route without SupabaseAuthGuard',
      );
    }
    return req.user;
  },
);
