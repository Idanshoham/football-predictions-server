import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MatchStatus, Prediction, User } from '@prisma/client';
import { PredictionsRepository } from './predictions.repository';
import { MatchesRepository } from '../matches/matches.repository';
import { PlayersRepository } from '../players/players.repository';
import { isKickoffPassed } from '../lib/time';
import { UpsertPredictionDto } from './dto/upsert-prediction.dto';

export interface RevealedPrediction {
  userId: string;
  userName: string;
  homeScorePred: number;
  awayScorePred: number;
  firstScorerPlayerId: string | null;
  pointsTotal: number;
}

@Injectable()
export class PredictionsService {
  constructor(
    private readonly predictions: PredictionsRepository,
    private readonly matches: MatchesRepository,
    private readonly players: PlayersRepository,
  ) {}

  /**
   * Upsert a per-match prediction.
   *
   * Rules (server-enforced, sacred):
   *  1. Match must exist and be in status `scheduled` — predictions are only
   *     allowed before kickoff.
   *  2. Current server time must be strictly before `match.kickoffAt`. Strict
   *     lock: no grace period.
   *  3. If `firstScorerPlayerId` is set, the player must be on the match's
   *     home or away team roster.
   */
  async upsert(user: User, dto: UpsertPredictionDto): Promise<Prediction> {
    const match = await this.matches.findById(dto.matchId);
    if (!match) throw new NotFoundException(`Match ${dto.matchId} not found`);

    if (match.status !== MatchStatus.scheduled) {
      throw new ForbiddenException(
        'Predictions are only allowed while a match is in the scheduled state',
      );
    }
    if (isKickoffPassed(match.kickoffAt)) {
      throw new ForbiddenException('Match has already kicked off');
    }

    if (dto.firstScorerPlayerId !== undefined && dto.firstScorerPlayerId !== null) {
      const player = await this.players.findOnMatchRoster(
        dto.firstScorerPlayerId,
        match.homeTeamId,
        match.awayTeamId,
      );
      if (!player) {
        throw new BadRequestException(
          'First-scorer player is not on either team in this match',
        );
      }
    }

    return this.predictions.upsert({
      userId: user.id,
      matchId: dto.matchId,
      homeScorePred: dto.homeScorePred,
      awayScorePred: dto.awayScorePred,
      firstScorerPlayerId: dto.firstScorerPlayerId ?? null,
    });
  }

  listMine(user: User) {
    return this.predictions.findMine(user.id);
  }

  getMineForMatch(user: User, matchId: string) {
    return this.predictions.findMineForMatch(user.id, matchId);
  }

  /**
   * Visibility rule (strict):
   * - User always sees their own prediction (returned as `mine`).
   * - Other users' predictions are returned ONLY if the match has reached
   *   kickoff (status non-scheduled OR `kickoffAt` already passed — the
   *   transient state right at kickoff). Otherwise `others` is empty.
   */
  async getForMatch(
    user: User,
    matchId: string,
  ): Promise<{ mine: Prediction | null; others: RevealedPrediction[] }> {
    const match = await this.matches.findById(matchId);
    if (!match) throw new NotFoundException(`Match ${matchId} not found`);

    const mine = await this.predictions.findMineForMatch(user.id, matchId);

    const revealed =
      match.status !== MatchStatus.scheduled || isKickoffPassed(match.kickoffAt);
    if (!revealed) return { mine, others: [] };

    const all = await this.predictions.findOthersForMatch(user.id, matchId);
    return {
      mine,
      others: all.map((p) => ({
        userId: p.user.id,
        userName: p.user.name,
        homeScorePred: p.homeScorePred,
        awayScorePred: p.awayScorePred,
        firstScorerPlayerId: p.firstScorerPlayerId,
        pointsTotal: p.pointsTotal,
      })),
    };
  }
}
