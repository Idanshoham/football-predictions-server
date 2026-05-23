import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { TournamentService } from './tournament.service';
import { TournamentPredictionsRepository } from './tournament-predictions.repository';
import { GroupPredictionsRepository } from './group-predictions.repository';
import { BracketPredictionsRepository } from './bracket-predictions.repository';
import { TeamsRepository } from '../teams/teams.repository';
import { PlayersRepository } from '../players/players.repository';
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
    private readonly tournament: TournamentService,
    private readonly tournamentPredictions: TournamentPredictionsRepository,
    private readonly groupPredictions: GroupPredictionsRepository,
    private readonly bracketPredictions: BracketPredictionsRepository,
    private readonly teams: TeamsRepository,
    private readonly players: PlayersRepository,
  ) {}

  // ---------------- Champion + Golden Boot ----------------

  async upsertTournamentPrediction(user: User, dto: UpsertTournamentPredictionDto) {
    if (await this.tournament.isLocked()) {
      throw new ForbiddenException('Tournament predictions are locked');
    }
    const t = await this.tournament.getActive();

    if (dto.championTeamId) {
      const team = await this.teams.findInTournament(dto.championTeamId, t.id);
      if (!team) throw new BadRequestException('Champion team is not in this tournament');
    }
    if (dto.goldenBootPlayerId) {
      const player = await this.players.findInTournament(dto.goldenBootPlayerId, t.id);
      if (!player) throw new BadRequestException('Golden Boot player is not in this tournament');
    }

    return this.tournamentPredictions.upsert({
      userId: user.id,
      tournamentId: t.id,
      championTeamId: dto.championTeamId ?? null,
      goldenBootPlayerId: dto.goldenBootPlayerId ?? null,
    });
  }

  async getMyTournamentPrediction(user: User) {
    const t = await this.tournament.getActive();
    return this.tournamentPredictions.findMine(user.id, t.id);
  }

  // ---------------- Group rankings ----------------

  async upsertGroupRanking(user: User, dto: UpsertGroupRankingDto) {
    if (await this.tournament.isLocked()) {
      throw new ForbiddenException('Tournament predictions are locked');
    }
    const t = await this.tournament.getActive();

    const teamsInGroup = await this.teams.listByTournamentAndGroup(t.id, dto.groupName);
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
    const valid = new Set(teamsInGroup.map((x) => x.id));
    for (const id of dto.ranking) {
      if (!valid.has(id)) {
        throw new BadRequestException(`Team ${id} is not in group ${dto.groupName}`);
      }
    }

    return this.groupPredictions.upsert({
      userId: user.id,
      tournamentId: t.id,
      groupName: dto.groupName,
      ranking: dto.ranking,
    });
  }

  async getMyGroupRankings(user: User) {
    const t = await this.tournament.getActive();
    return this.groupPredictions.findMine(user.id, t.id);
  }

  // ---------------- Bracket ----------------

  async upsertBracket(user: User, dto: UpsertBracketDto) {
    const version = await this.tournament.getActiveBracketVersion();
    const t = await this.tournament.getActive();

    for (const slot of Object.keys(dto.winnersBySlot)) {
      if (!BRACKET_SLOTS.has(slot)) {
        throw new BadRequestException(`Unknown bracket slot: ${slot}`);
      }
    }
    const teamIds = [...new Set(Object.values(dto.winnersBySlot))];
    const existing = await this.teams.listExistingInTournament(t.id, teamIds);
    const validTeamIds = new Set(existing.map((x) => x.id));
    for (const teamId of teamIds) {
      if (!validTeamIds.has(teamId)) {
        throw new BadRequestException(`Team ${teamId} is not in this tournament`);
      }
    }

    await this.bracketPredictions.upsertMany(
      Object.entries(dto.winnersBySlot).map(([matchSlot, winnerTeamId]) => ({
        userId: user.id,
        tournamentId: t.id,
        version,
        matchSlot,
        winnerTeamId,
      })),
    );

    return this.getMyBracket(user);
  }

  async getMyBracket(user: User) {
    const t = await this.tournament.getActive();
    const state = await this.tournament.getBracketLockState();
    const versionToReturn =
      state === 'open' || state === 'locked-final' ? 1 : 2;

    let picks = await this.bracketPredictions.findMyVersion(
      user.id,
      t.id,
      versionToReturn,
    );

    // First entry into the edit window: seed v2 from v1 if v2 is empty.
    if (state === 'edit-window' && picks.length === 0) {
      await this.bracketPredictions.seedV2FromV1(user.id, t.id);
      picks = await this.bracketPredictions.findMyVersion(user.id, t.id, 2);
    }

    return {
      version: versionToReturn,
      lockState: state,
      picks,
    };
  }
}
