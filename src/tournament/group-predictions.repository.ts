import { Injectable } from '@nestjs/common';
import { GroupPrediction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface UpsertGroupRankingData {
  userId: string;
  tournamentId: string;
  groupName: string;
  ranking: string[];
}

@Injectable()
export class GroupPredictionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMine(userId: string, tournamentId: string): Promise<GroupPrediction[]> {
    return this.prisma.groupPrediction.findMany({
      where: { userId, tournamentId },
      orderBy: { groupName: 'asc' },
    });
  }

  upsert(data: UpsertGroupRankingData): Promise<GroupPrediction> {
    return this.prisma.groupPrediction.upsert({
      where: {
        userId_tournamentId_groupName: {
          userId: data.userId,
          tournamentId: data.tournamentId,
          groupName: data.groupName,
        },
      },
      create: {
        userId: data.userId,
        tournamentId: data.tournamentId,
        groupName: data.groupName,
        ranking: data.ranking as Prisma.InputJsonValue,
        points: 0,
      },
      update: {
        ranking: data.ranking as Prisma.InputJsonValue,
      },
    });
  }

  /** Leaderboard / rescore aggregation. */
  listAllByTournament(tournamentId?: string) {
    return this.prisma.groupPrediction.findMany({
      where: tournamentId ? { tournamentId } : undefined,
      select: { userId: true, points: true },
    });
  }

  /** Rescoring: predictions for a specific group, full rankings. */
  listForGroupRescore(tournamentId: string, groupName: string) {
    return this.prisma.groupPrediction.findMany({
      where: { tournamentId, groupName },
      select: { id: true, ranking: true, points: true },
    });
  }

  updatePoints(id: string, points: number): Promise<GroupPrediction> {
    return this.prisma.groupPrediction.update({
      where: { id },
      data: { points },
    });
  }
}
