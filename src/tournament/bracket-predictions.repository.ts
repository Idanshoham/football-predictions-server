import { Injectable } from '@nestjs/common';
import { BracketPrediction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface UpsertBracketPickInput {
  userId: string;
  tournamentId: string;
  version: 1 | 2;
  matchSlot: string;
  winnerTeamId: string;
}

@Injectable()
export class BracketPredictionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMyVersion(
    userId: string,
    tournamentId: string,
    version: 1 | 2,
  ): Promise<BracketPrediction[]> {
    return this.prisma.bracketPrediction.findMany({
      where: { userId, tournamentId, version },
      orderBy: { matchSlot: 'asc' },
    });
  }

  /**
   * Atomically upsert a set of bracket picks. Runs inside a single
   * Prisma transaction so a partial save can't leave the bracket in
   * an inconsistent state.
   */
  async upsertMany(picks: UpsertBracketPickInput[]): Promise<void> {
    if (picks.length === 0) return;
    const writes = picks.map((p) =>
      this.prisma.bracketPrediction.upsert({
        where: {
          userId_tournamentId_version_matchSlot: {
            userId: p.userId,
            tournamentId: p.tournamentId,
            version: p.version,
            matchSlot: p.matchSlot,
          },
        },
        create: {
          userId: p.userId,
          tournamentId: p.tournamentId,
          version: p.version,
          matchSlot: p.matchSlot,
          winnerTeamId: p.winnerTeamId,
          points: 0,
        },
        update: { winnerTeamId: p.winnerTeamId },
      }),
    );
    await this.prisma.$transaction(writes);
  }

  /**
   * Seed version 2 from version 1 (used the first time the edit window
   * opens). Skips duplicates so it's safe to re-run.
   */
  async seedV2FromV1(userId: string, tournamentId: string): Promise<void> {
    const v1 = await this.prisma.bracketPrediction.findMany({
      where: { userId, tournamentId, version: 1 },
    });
    if (v1.length === 0) return;
    const seeded: Prisma.BracketPredictionCreateManyInput[] = v1.map((row) => ({
      userId: row.userId,
      tournamentId: row.tournamentId,
      version: 2,
      matchSlot: row.matchSlot,
      winnerTeamId: row.winnerTeamId,
      points: 0,
    }));
    await this.prisma.bracketPrediction.createMany({
      data: seeded,
      skipDuplicates: true,
    });
  }

  /** Leaderboard aggregate. */
  listAllByTournament(tournamentId?: string) {
    return this.prisma.bracketPrediction.findMany({
      where: tournamentId ? { tournamentId } : undefined,
      select: { userId: true, points: true },
    });
  }

  /** Rescoring: every pick for a set of slots. */
  listPicksBySlots(matchSlots: string[]) {
    return this.prisma.bracketPrediction.findMany({
      where: { matchSlot: { in: matchSlots } },
      select: { id: true, matchSlot: true, winnerTeamId: true, points: true },
    });
  }

  updatePoints(id: string, points: number): Promise<BracketPrediction> {
    return this.prisma.bracketPrediction.update({
      where: { id },
      data: { points },
    });
  }
}
