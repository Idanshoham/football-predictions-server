import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentService } from '../tournament/tournament.service';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournament: TournamentService,
  ) {}

  async listAllForActiveTournament() {
    const t = await this.tournament.getActive();
    return this.prisma.team.findMany({
      where: { tournamentId: t.id },
      orderBy: [{ groupName: 'asc' }, { nameHe: 'asc' }],
    });
  }
}
