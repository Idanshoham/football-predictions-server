import { Injectable } from '@nestjs/common';
import { Team } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByTournament(tournamentId: string): Promise<Team[]> {
    return this.prisma.team.findMany({
      where: { tournamentId },
      orderBy: [{ groupName: 'asc' }, { nameHe: 'asc' }],
    });
  }

  listByTournamentAndGroup(tournamentId: string, groupName: string) {
    return this.prisma.team.findMany({
      where: { tournamentId, groupName },
      select: { id: true },
    });
  }

  /** Validation lookup: does this id belong to a team in the tournament? */
  findInTournament(id: string, tournamentId: string) {
    return this.prisma.team.findFirst({
      where: { id, tournamentId },
      select: { id: true },
    });
  }

  /** Batch validation: which of these team ids exist in the tournament? */
  listExistingInTournament(tournamentId: string, ids: string[]) {
    return this.prisma.team.findMany({
      where: { tournamentId, id: { in: ids } },
      select: { id: true },
    });
  }
}
