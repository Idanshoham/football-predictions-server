import { Injectable } from '@nestjs/common';
import { UsersRepository } from '../users/users.repository';
import { PredictionsRepository } from '../predictions/predictions.repository';
import { TournamentPredictionsRepository } from '../tournament/tournament-predictions.repository';
import { GroupPredictionsRepository } from '../tournament/group-predictions.repository';
import { BracketPredictionsRepository } from '../tournament/bracket-predictions.repository';

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  totalPoints: number;
  exactCount: number;
  correctResultCount: number;
  matchesPredicted: number;
}

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly users: UsersRepository,
    private readonly predictions: PredictionsRepository,
    private readonly tournamentPredictions: TournamentPredictionsRepository,
    private readonly groupPredictions: GroupPredictionsRepository,
    private readonly bracketPredictions: BracketPredictionsRepository,
  ) {}

  /**
   * Returns the leaderboard sorted by total points DESC, then exact-prediction
   * count DESC, then correct-result count DESC. Ties broken alphabetically.
   *
   * Five batched queries regardless of user count.
   */
  async list(tournamentId?: string): Promise<LeaderboardRow[]> {
    const [
      users,
      predictions,
      tournamentPreds,
      groupPreds,
      bracketPreds,
    ] = await Promise.all([
      this.users.listAllForLeaderboard(),
      this.predictions.listAllWithMatchOutcomes(),
      this.tournamentPredictions.listAllForLeaderboard(tournamentId),
      this.groupPredictions.listAllByTournament(tournamentId),
      this.bracketPredictions.listAllByTournament(tournamentId),
    ]);

    const matchPoints = sumBy(predictions, (p) => p.userId, (p) => p.pointsTotal);
    const tournamentPoints = sumBy(tournamentPreds, (p) => p.userId, (p) => p.pointsTotal);
    const groupPoints = sumBy(groupPreds, (p) => p.userId, (p) => p.points);
    const bracketPoints = sumBy(bracketPreds, (p) => p.userId, (p) => p.points);

    const exactCount = new Map<string, number>();
    const correctResultCount = new Map<string, number>();
    const matchesPredicted = new Map<string, number>();

    for (const p of predictions) {
      matchesPredicted.set(p.userId, (matchesPredicted.get(p.userId) ?? 0) + 1);
      if (
        p.match.status !== 'full_time' ||
        p.match.homeScore === null ||
        p.match.awayScore === null
      ) {
        continue;
      }
      const exact =
        p.homeScorePred === p.match.homeScore &&
        p.awayScorePred === p.match.awayScore;
      if (exact) {
        exactCount.set(p.userId, (exactCount.get(p.userId) ?? 0) + 1);
      }
      const predSign = Math.sign(p.homeScorePred - p.awayScorePred);
      const actSign = Math.sign(p.match.homeScore - p.match.awayScore);
      if (predSign === actSign) {
        correctResultCount.set(
          p.userId,
          (correctResultCount.get(p.userId) ?? 0) + 1,
        );
      }
    }

    const rows: LeaderboardRow[] = users.map((u) => ({
      rank: 0,
      userId: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      totalPoints:
        (matchPoints.get(u.id) ?? 0) +
        (tournamentPoints.get(u.id) ?? 0) +
        (groupPoints.get(u.id) ?? 0) +
        (bracketPoints.get(u.id) ?? 0),
      exactCount: exactCount.get(u.id) ?? 0,
      correctResultCount: correctResultCount.get(u.id) ?? 0,
      matchesPredicted: matchesPredicted.get(u.id) ?? 0,
    }));

    rows.sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.exactCount - a.exactCount ||
        b.correctResultCount - a.correctResultCount ||
        a.name.localeCompare(b.name, 'he'),
    );

    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }
}

function sumBy<T>(
  items: T[],
  key: (item: T) => string,
  value: (item: T) => number,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(key(item), (map.get(key(item)) ?? 0) + value(item));
  }
  return map;
}
