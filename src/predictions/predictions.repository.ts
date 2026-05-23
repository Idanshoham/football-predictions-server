import { Injectable } from '@nestjs/common';
import { Prediction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface UpsertPredictionData {
  userId: string;
  matchId: string;
  homeScorePred: number;
  awayScorePred: number;
  firstScorerPlayerId: string | null;
}

@Injectable()
export class PredictionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsert(data: UpsertPredictionData): Promise<Prediction> {
    return this.prisma.prediction.upsert({
      where: { userId_matchId: { userId: data.userId, matchId: data.matchId } },
      create: { ...data, pointsTotal: 0 },
      update: {
        homeScorePred: data.homeScorePred,
        awayScorePred: data.awayScorePred,
        firstScorerPlayerId: data.firstScorerPlayerId,
      },
    });
  }

  findMine(userId: string): Promise<Prediction[]> {
    return this.prisma.prediction.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findMineForMatch(userId: string, matchId: string): Promise<Prediction | null> {
    return this.prisma.prediction.findUnique({
      where: { userId_matchId: { userId, matchId } },
    });
  }

  /** Used in Section 3 (live reveal) — excludes the caller. */
  findOthersForMatch(callerUserId: string, matchId: string) {
    return this.prisma.prediction.findMany({
      where: { matchId, NOT: { userId: callerUserId } },
      include: { user: { select: { id: true, name: true } } },
    });
  }

  listMissingPredictions(matchId: string) {
    return this.prisma.prediction.findMany({
      where: { matchId },
      select: { userId: true },
    });
  }

  /** For the leaderboard: every prediction with its match outcome. Narrow projection. */
  listAllWithMatchOutcomes() {
    return this.prisma.prediction.findMany({
      select: {
        userId: true,
        homeScorePred: true,
        awayScorePred: true,
        pointsTotal: true,
        match: {
          select: {
            status: true,
            homeScore: true,
            awayScore: true,
          },
        },
      },
    });
  }

  /** For rescoring: every prediction whose match is in the given id set. */
  listForMatchIds(matchIds: string[]) {
    return this.prisma.prediction.findMany({
      where: { matchId: { in: matchIds } },
      select: {
        id: true,
        matchId: true,
        homeScorePred: true,
        awayScorePred: true,
        firstScorerPlayerId: true,
        pointsTotal: true,
      },
    });
  }

  updatePoints(id: string, pointsTotal: number): Promise<Prediction> {
    return this.prisma.prediction.update({
      where: { id },
      data: { pointsTotal },
    });
  }
}
