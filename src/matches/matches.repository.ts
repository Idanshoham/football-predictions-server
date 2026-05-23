import { Injectable } from '@nestjs/common';
import { Match, MatchStage, MatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MatchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Match | null> {
    return this.prisma.match.findUnique({ where: { id } });
  }

  findByIdWithFullRosters(id: string) {
    return this.prisma.match.findUnique({
      where: { id },
      include: {
        homeTeam: { include: { players: true } },
        awayTeam: { include: { players: true } },
      },
    });
  }

  list(filter: { status?: MatchStatus[] }) {
    const where: Prisma.MatchWhereInput = {};
    if (filter.status) where.status = { in: filter.status };
    return this.prisma.match.findMany({
      where,
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffAt: 'asc' },
    });
  }

  listForTournamentByStage(tournamentId: string, stage: MatchStage) {
    return this.prisma.match.findMany({
      where: { tournamentId, stage },
      orderBy: { kickoffAt: 'asc' },
    });
  }

  findLatestGroupStageKickoff(tournamentId: string) {
    return this.prisma.match.findFirst({
      where: { tournamentId, stage: MatchStage.group },
      orderBy: { kickoffAt: 'desc' },
    });
  }

  findEarliestKickoffByStage(tournamentId: string, stage: MatchStage) {
    return this.prisma.match.findFirst({
      where: { tournamentId, stage },
      orderBy: { kickoffAt: 'asc' },
    });
  }

  listScheduled(tournamentId: string) {
    return this.prisma.match.findMany({
      where: {
        tournamentId,
        status: MatchStatus.scheduled,
      },
      include: { homeTeam: true, awayTeam: true },
    });
  }

  listLiveCandidates(tournamentId: string) {
    return this.prisma.match.findMany({
      where: {
        tournamentId,
        status: {
          in: [MatchStatus.scheduled, MatchStatus.live, MatchStatus.halftime],
        },
      },
      select: {
        id: true,
        status: true,
        kickoffAt: true,
        homeScore: true,
        awayScore: true,
        firstScorerPlayerId: true,
        apiIds: true,
      },
    });
  }

  listFinished() {
    return this.prisma.match.findMany({
      where: { status: MatchStatus.full_time },
      select: {
        id: true,
        homeScore: true,
        awayScore: true,
        firstScorerPlayerId: true,
        status: true,
      },
    });
  }

  listFinishedKnockoutSlots() {
    return this.prisma.match.findMany({
      where: {
        status: MatchStatus.full_time,
        stage: {
          in: [
            MatchStage.r32,
            MatchStage.r16,
            MatchStage.qf,
            MatchStage.sf,
            MatchStage.final,
            MatchStage.third,
          ],
        },
      },
      select: {
        slotId: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
      },
    });
  }

  listGroupStage(tournamentId: string) {
    return this.prisma.match.findMany({
      where: { tournamentId, stage: MatchStage.group },
      select: {
        groupName: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        status: true,
      },
    });
  }

  findFinishedFinal(tournamentId: string) {
    return this.prisma.match.findFirst({
      where: {
        tournamentId,
        stage: MatchStage.final,
        status: MatchStatus.full_time,
      },
      select: {
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
      },
    });
  }

  listFinishedFirstScorers(tournamentId: string) {
    return this.prisma.match.findMany({
      where: { tournamentId, status: MatchStatus.full_time },
      select: { firstScorerPlayerId: true },
    });
  }

  update(id: string, data: Prisma.MatchUpdateInput): Promise<Match> {
    return this.prisma.match.update({ where: { id }, data });
  }
}
