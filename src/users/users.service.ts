import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import { UsersRepository, CreateUserInput } from './users.repository';
import { TournamentService } from '../tournament/tournament.service';

/**
 * Encapsulates the "find-or-create" sign-up flow used by the auth guard.
 * Enforces the locked rule: no new users can be created after the active
 * tournament's opener kickoff.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly tournament: TournamentService,
  ) {}

  async findOrCreate(input: CreateUserInput): Promise<User> {
    const existing = await this.users.findBySupabaseUserId(input.supabaseUserId);
    if (existing) return existing;

    if (await this.tournament.isLocked()) {
      throw new ForbiddenException(
        'Sign-up has closed (tournament already started)',
      );
    }
    if (!input.email) {
      throw new UnauthorizedException('Token is missing an email claim');
    }
    return this.users.create(input);
  }
}
