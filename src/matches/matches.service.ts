import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { MatchesRepository } from './matches.repository';

export type MatchFilter = 'upcoming' | 'live' | 'past';

const STATUS_BY_FILTER: Record<MatchFilter, MatchStatus[]> = {
  upcoming: [MatchStatus.scheduled],
  live: [MatchStatus.live, MatchStatus.halftime],
  past: [MatchStatus.full_time, MatchStatus.cancelled, MatchStatus.postponed],
};

@Injectable()
export class MatchesService {
  constructor(private readonly matches: MatchesRepository) {}

  async list(filter?: MatchFilter) {
    return this.matches.list({
      status: filter ? STATUS_BY_FILTER[filter] : undefined,
    });
  }

  async getById(id: string) {
    const match = await this.matches.findByIdWithFullRosters(id);
    if (!match) throw new NotFoundException(`Match ${id} not found`);
    return match;
  }
}
