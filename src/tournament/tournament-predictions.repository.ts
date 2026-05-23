import { Injectable } from '@nestjs/common';
import { TournamentPrediction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface UpsertTournamentPredictionData {
  userId: string;
  tournamentId: string;
  championTeamId: string | null;
  goldenBootPlayerId: string | null;
}

@Injectable()
export class TournamentPredictionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMine(userId: string, tournamentId: string): Promise<TournamentPrediction | null> {
    return this.prisma.tournamentPrediction.findUnique({
      where: { userId_tournamentId: { userId, tournamentId } },
    });
  }

  upsert(data: UpsertTournamentPredictionData): Promise<TournamentPrediction> {
    return this.prisma.tournamentPrediction.upsert({
      where: {
        userId_tournamentId: {
          userId: data.userId,
          tournamentId: data.tournamentId,
        },
      },
      create: {
        userId: data.userId,
        tournamentId: data.tournamentId,
        championTeamId: data.championTeamId,
        goldenBootPlayerId: data.goldenBootPlayerId,
        pointsTotal: 0,
      },
      update: {
        championTeamId: data.championTeamId,
        goldenBootPlayerId: data.goldenBootPlayerId,
      },
    });
  }

  /** Leaderboard: every user's tournament-level point total. */
  listAllForLeaderboard(tournamentId?: string) {
    return this.prisma.tournamentPrediction.findMany({
      where: tournamentId ? { tournamentId } : undefined,
      select: { userId: true, pointsTotal: true },
    });
  }

  /** Rescoring: every user's champion + golden-boot picks. */
  listAllForRescore(tournamentId: string) {
    return this.prisma.tournamentPrediction.findMany({
      where: { tournamentId },
      select: {
        id: true,
        championTeamId: true,
        goldenBootPlayerId: true,
        pointsTotal: true,
      },
    });
  }

  updatePoints(id: string, pointsTotal: number): Promise<TournamentPrediction> {
    return this.prisma.tournamentPrediction.update({
      where: { id },
      data: { pointsTotal },
    });
  }
}
