import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentService } from '../tournament/tournament.service';

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournament: TournamentService,
  ) {}

  async listAllForActiveTournament() {
    const t = await this.tournament.getActive();
    return this.prisma.player.findMany({
      where: { tournamentId: t.id, isActive: true },
      include: {
        team: { select: { id: true, nameHe: true, flagEmoji: true } },
      },
      orderBy: [{ team: { nameHe: 'asc' } }, { nameHe: 'asc' }],
    });
  }
}
