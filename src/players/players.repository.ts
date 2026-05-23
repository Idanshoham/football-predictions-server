import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlayersRepository {
  constructor(private readonly prisma: PrismaService) {}

  listActiveForTournament(tournamentId: string) {
    return this.prisma.player.findMany({
      where: { tournamentId, isActive: true },
      include: {
        team: { select: { id: true, nameHe: true, flagEmoji: true } },
      },
      orderBy: [{ team: { nameHe: 'asc' } }, { nameHe: 'asc' }],
    });
  }

  /** Roster validation: is this player on one of the match's two teams? */
  findOnMatchRoster(playerId: string, homeTeamId: string, awayTeamId: string) {
    return this.prisma.player.findFirst({
      where: {
        id: playerId,
        teamId: { in: [homeTeamId, awayTeamId] },
      },
      select: { id: true },
    });
  }

  /** Tournament-wide validation: is this player in this tournament? */
  findInTournament(playerId: string, tournamentId: string) {
    return this.prisma.player.findFirst({
      where: { id: playerId, tournamentId },
      select: { id: true },
    });
  }
}
