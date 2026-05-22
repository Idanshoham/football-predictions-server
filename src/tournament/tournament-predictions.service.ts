import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentService } from './tournament.service';
import { allBracketSlots } from '../scoring/bracket-scoring';
import {
  UpsertBracketDto,
  UpsertGroupRankingDto,
  UpsertTournamentPredictionDto,
} from './dto/upsert-tournament.dto';

const BRACKET_SLOTS = new Set(allBracketSlots());

@Injectable()
export class TournamentPredictionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournament: TournamentService,
  ) {}

  // ---------------- Champion + Golden Boot ----------------

  async upsertTournamentPrediction(user: User, dto: UpsertTournamentPredictionDto) {
    if (await this.tournament.isLocked()) {
      throw new ForbiddenException('Tournament predictions are locked');
    }
    const t = await this.tournament.getActive();

    if (dto.championTeamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: dto.championTeamId, tournamentId: t.id },
        select: { id: true },
      });
      if (!team) throw new BadRequestException('Champion team is not in this tournament');
    }
    if (dto.goldenBootPlayerId) {
      const player = await this.prisma.player.findFirst({
        where: { id: dto.goldenBootPlayerId, tournamentId: t.id },
        select: { id: true },
      });
      if (!player) throw new BadRequestException('Golden Boot player is not in this tournament');
    }

    return this.prisma.tournamentPrediction.upsert({
      where: { userId_tournamentId: { userId: user.id, tournamentId: t.id } },
      create: {
        userId: user.id,
        tournamentId: t.id,
        championTeamId: dto.championTeamId ?? null,
        goldenBootPlayerId: dto.goldenBootPlayerId ?? null,
        pointsTotal: 0,
      },
      update: {
        championTeamId: dto.championTeamId ?? null,
        goldenBootPlayerId: dto.goldenBootPlayerId ?? null,
      },
    });
  }

  async getMyTournamentPrediction(user: User) {
    const t = await this.tournament.getActive();
    return this.prisma.tournamentPrediction.findUnique({
      where: { userId_tournamentId: { userId: user.id, tournamentId: t.id } },
    });
  }

  // ---------------- Group rankings ----------------

  async upsertGroupRanking(user: User, dto: UpsertGroupRankingDto) {
    if (await this.tournament.isLocked()) {
      throw new ForbiddenException('Tournament predictions are locked');
    }
    const t = await this.tournament.getActive();

    // Validate teams: every id must belong to this group within this tournament.
    const teamsInGroup = await this.prisma.team.findMany({
      where: { tournamentId: t.id, groupName: dto.groupName },
      select: { id: true },
    });
    const valid = new Set(teamsInGroup.map((x) => x.id));
    if (teamsInGroup.length === 0) {
      throw new NotFoundException(`Group ${dto.groupName} has no teams`);
    }
    if (dto.ranking.length !== teamsInGroup.length) {
      throw new BadRequestException(
        `Group ${dto.groupName} expects ${teamsInGroup.length} teams in ranking`,
      );
    }
    if (new Set(dto.ranking).size !== dto.ranking.length) {
      throw new BadRequestException('Ranking has duplicate teams');
    }
    for (const id of dto.ranking) {
      if (!valid.has(id)) {
        throw new BadRequestException(`Team ${id} is not in group ${dto.groupName}`);
      }
    }

    return this.prisma.groupPrediction.upsert({
      where: {
        userId_tournamentId_groupName: {
          userId: user.id,
          tournamentId: t.id,
          groupName: dto.groupName,
        },
      },
      create: {
        userId: user.id,
        tournamentId: t.id,
        groupName: dto.groupName,
        ranking: dto.ranking,
        points: 0,
      },
      update: {
        ranking: dto.ranking,
      },
    });
  }

  async getMyGroupRankings(user: User) {
    const t = await this.tournament.getActive();
    return this.prisma.groupPrediction.findMany({
      where: { userId: user.id, tournamentId: t.id },
      orderBy: { groupName: 'asc' },
    });
  }

  // ---------------- Bracket ----------------

  async upsertBracket(user: User, dto: UpsertBracketDto) {
    const version = await this.tournament.getActiveBracketVersion();
    const t = await this.tournament.getActive();

    // Validate slots
    for (const slot of Object.keys(dto.winnersBySlot)) {
      if (!BRACKET_SLOTS.has(slot)) {
        throw new BadRequestException(`Unknown bracket slot: ${slot}`);
      }
    }
    // Validate teams exist in this tournament
    const teamIds = new Set(Object.values(dto.winnersBySlot));
    const teams = await this.prisma.team.findMany({
      where: { tournamentId: t.id, id: { in: [...teamIds] } },
      select: { id: true },
    });
    const validTeamIds = new Set(teams.map((x) => x.id));
    for (const teamId of teamIds) {
      if (!validTeamIds.has(teamId)) {
        throw new BadRequestException(`Team ${teamId} is not in this tournament`);
      }
    }

    // Upsert each slot individually (small N, simple semantics).
    const writes = Object.entries(dto.winnersBySlot).map(([matchSlot, winnerTeamId]) =>
      this.prisma.bracketPrediction.upsert({
        where: {
          userId_tournamentId_version_matchSlot: {
            userId: user.id,
            tournamentId: t.id,
            version,
            matchSlot,
          },
        },
        create: {
          userId: user.id,
          tournamentId: t.id,
          version,
          matchSlot,
          winnerTeamId,
          points: 0,
        },
        update: { winnerTeamId },
      }),
    );
    await this.prisma.$transaction(writes);

    return this.getMyBracket(user);
  }

  async getMyBracket(user: User) {
    const t = await this.tournament.getActive();
    const state = await this.tournament.getBracketLockState();
    const versionToReturn =
      state === 'open' || state === 'locked-final' ? 1 : 2;

    let rows = await this.prisma.bracketPrediction.findMany({
      where: { userId: user.id, tournamentId: t.id, version: versionToReturn },
      orderBy: { matchSlot: 'asc' },
    });

    // If we're in the edit window and the user has no v2 picks yet, seed v2 from v1
    if (state === 'edit-window' && rows.length === 0) {
      const v1 = await this.prisma.bracketPrediction.findMany({
        where: { userId: user.id, tournamentId: t.id, version: 1 },
      });
      if (v1.length > 0) {
        const seeded = v1.map((row) => ({
          ...row,
          id: undefined as unknown as string,
          version: 2,
          points: 0,
        }));
        await this.prisma.bracketPrediction.createMany({
          data: seeded.map(({ id: _ignored, ...rest }) => rest),
          skipDuplicates: true,
        });
        rows = await this.prisma.bracketPrediction.findMany({
          where: { userId: user.id, tournamentId: t.id, version: 2 },
          orderBy: { matchSlot: 'asc' },
        });
      }
    }

    return {
      version: versionToReturn,
      lockState: state,
      picks: rows,
    };
  }
}
