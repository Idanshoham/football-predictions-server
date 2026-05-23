import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateUserInput {
  supabaseUserId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySupabaseUserId(supabaseUserId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { supabaseUserId } });
  }

  create(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({ data: input });
  }

  /** Used by the leaderboard — narrow projection only. */
  listAllForLeaderboard(): Promise<
    Pick<User, 'id' | 'name' | 'avatarUrl'>[]
  > {
    return this.prisma.user.findMany({
      select: { id: true, name: true, avatarUrl: true },
    });
  }

  /** Used by email reminders — narrow projection only. */
  listAllForReminders(): Promise<
    Pick<User, 'id' | 'email' | 'name'>[]
  > {
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true },
    });
  }
}
