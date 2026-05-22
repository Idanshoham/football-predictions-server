import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type MatchFilter = 'upcoming' | 'live' | 'past';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter?: MatchFilter) {
    const where = filterToWhere(filter);
    return this.prisma.match.findMany({
      where,
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: { kickoffAt: 'asc' },
    });
  }

  async getById(id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        homeTeam: { include: { players: true } },
        awayTeam: { include: { players: true } },
      },
    });
    if (!match) throw new NotFoundException(`Match ${id} not found`);
    return match;
  }
}

function filterToWhere(filter?: MatchFilter) {
  if (!filter) return {};
  if (filter === 'upcoming') {
    return { status: { in: [MatchStatus.scheduled] } };
  }
  if (filter === 'live') {
    return { status: { in: [MatchStatus.live, MatchStatus.halftime] } };
  }
  if (filter === 'past') {
    return {
      status: {
        in: [MatchStatus.full_time, MatchStatus.cancelled, MatchStatus.postponed],
      },
    };
  }
  return {};
}
