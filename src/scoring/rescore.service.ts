import { Injectable, Logger } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { MatchesRepository } from '../matches/matches.repository';
import { PredictionsRepository } from '../predictions/predictions.repository';
import { TournamentRepository } from '../tournament/tournament.repository';
import { TournamentPredictionsRepository } from '../tournament/tournament-predictions.repository';
import { GroupPredictionsRepository } from '../tournament/group-predictions.repository';
import { BracketPredictionsRepository } from '../tournament/bracket-predictions.repository';
import { AuditRepository } from '../audit/audit.repository';
import { calculateMatchPoints } from './match-scoring';

/**
 * Idempotent re-scoring of every user's points from raw DB state.
 *
 * Triggered by:
 *  - Live-sync cron after any match update.
 *  - /__rescore?secret=XXX after a manual DB fix.
 *
 * Categories of points re-computed:
 *  - Per-match (predictions.pointsTotal) — based on full_time matches.
 *  - Bracket (bracketPredictions.points) — per knockout match completed.
 *  - Group rankings (groupPredictions.points) — per group whose last match
 *    has finished.
 *  - Tournament-level champion + golden boot (tournamentPredictions
 *    .pointsTotal) — only when the final has finished.
 *
 * Re-scoring is a full sweep: every row is recomputed. At 100 users this is
 * in the low milliseconds.
 */
@Injectable()
export class RescoreService {
  private readonly logger = new Logger(RescoreService.name);

  constructor(
    private readonly matches: MatchesRepository,
    private readonly predictions: PredictionsRepository,
    private readonly tournaments: TournamentRepository,
    private readonly tournamentPredictions: TournamentPredictionsRepository,
    private readonly groupPredictions: GroupPredictionsRepository,
    private readonly bracketPredictions: BracketPredictionsRepository,
    private readonly audit: AuditRepository,
  ) {}

  async rescoreAll(): Promise<{
    perMatchUpdated: number;
    bracketUpdated: number;
    groupUpdated: number;
    tournamentUpdated: number;
  }> {
    const perMatchUpdated = await this.rescoreMatchPredictions();
    const bracketUpdated = await this.rescoreBracket();
    const groupUpdated = await this.rescoreGroupRankings();
    const tournamentUpdated = await this.rescoreTournament();

    await this.audit.record('rescore_triggered', {
      perMatchUpdated,
      bracketUpdated,
      groupUpdated,
      tournamentUpdated,
    });
    this.logger.log(
      `rescoreAll: match=${perMatchUpdated} bracket=${bracketUpdated} group=${groupUpdated} tournament=${tournamentUpdated}`,
    );

    return { perMatchUpdated, bracketUpdated, groupUpdated, tournamentUpdated };
  }

  private async rescoreMatchPredictions(): Promise<number> {
    const finished = await this.matches.listFinished();
    if (finished.length === 0) return 0;
    const finishedMap = new Map(finished.map((m) => [m.id, m]));

    const predictions = await this.predictions.listForMatchIds(
      finished.map((m) => m.id),
    );

    let updated = 0;
    for (const p of predictions) {
      const match = finishedMap.get(p.matchId);
      if (!match) continue;
      const newPoints =
        calculateMatchPoints(
          {
            homeScorePred: p.homeScorePred,
            awayScorePred: p.awayScorePred,
            firstScorerPlayerId: p.firstScorerPlayerId,
          },
          {
            status: match.status,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            firstScorerPlayerId: match.firstScorerPlayerId,
          },
        ) ?? 0;
      if (newPoints !== p.pointsTotal) {
        await this.predictions.updatePoints(p.id, newPoints);
        updated++;
      }
    }
    return updated;
  }

  private async rescoreBracket(): Promise<number> {
    const finishedKnockouts = await this.matches.listFinishedKnockoutSlots();

    const winnerBySlot = new Map<string, string>();
    for (const m of finishedKnockouts) {
      if (!m.slotId || m.homeScore === null || m.awayScore === null) continue;
      const winner =
        m.homeScore > m.awayScore
          ? m.homeTeamId
          : m.awayScore > m.homeScore
            ? m.awayTeamId
            : m.homeTeamId;
      winnerBySlot.set(m.slotId, winner);
    }
    if (winnerBySlot.size === 0) return 0;

    const picks = await this.bracketPredictions.listPicksBySlots([
      ...winnerBySlot.keys(),
    ]);

    let updated = 0;
    for (const pick of picks) {
      const actualWinner = winnerBySlot.get(pick.matchSlot);
      const newPoints = actualWinner === pick.winnerTeamId ? 5 : 0;
      if (newPoints !== pick.points) {
        await this.bracketPredictions.updatePoints(pick.id, newPoints);
        updated++;
      }
    }
    return updated;
  }

  private async rescoreGroupRankings(): Promise<number> {
    const tournament = await this.tournaments.findActive();
    if (!tournament) return 0;

    const groupMatches = await this.matches.listGroupStage(tournament.id);

    const groups = new Map<string, typeof groupMatches>();
    for (const m of groupMatches) {
      if (!m.groupName) continue;
      const arr = groups.get(m.groupName) ?? [];
      arr.push(m);
      groups.set(m.groupName, arr);
    }

    let updated = 0;
    for (const [groupName, matches] of groups) {
      if (!matches.every((m) => m.status === MatchStatus.full_time)) continue;
      const ranking = computeGroupRanking(matches);

      const predictions = await this.groupPredictions.listForGroupRescore(
        tournament.id,
        groupName,
      );
      for (const p of predictions) {
        const userRanking = (p.ranking as string[]) ?? [];
        let pts = 0;
        for (let i = 0; i < ranking.length && i < userRanking.length; i++) {
          if (userRanking[i] === ranking[i]) pts += 5;
        }
        if (pts !== p.points) {
          await this.groupPredictions.updatePoints(p.id, pts);
          updated++;
        }
      }
    }
    return updated;
  }

  private async rescoreTournament(): Promise<number> {
    const tournament = await this.tournaments.findActive();
    if (!tournament) return 0;

    const finalMatch = await this.matches.findFinishedFinal(tournament.id);
    const championTeamId =
      finalMatch && finalMatch.homeScore !== null && finalMatch.awayScore !== null
        ? finalMatch.homeScore >= finalMatch.awayScore
          ? finalMatch.homeTeamId
          : finalMatch.awayTeamId
        : null;

    // Approximate Golden Boot from first-scorer occurrences. When the real
    // top-scorers feed is wired up, prefer it.
    const allFinished = await this.matches.listFinishedFirstScorers(tournament.id);
    const goalCounts = new Map<string, number>();
    for (const m of allFinished) {
      if (m.firstScorerPlayerId) {
        goalCounts.set(
          m.firstScorerPlayerId,
          (goalCounts.get(m.firstScorerPlayerId) ?? 0) + 1,
        );
      }
    }
    const goldenBootPlayerId =
      goalCounts.size > 0
        ? [...goalCounts.entries()].reduce((a, b) => (a[1] >= b[1] ? a : b))[0]
        : null;

    const predictions = await this.tournamentPredictions.listAllForRescore(
      tournament.id,
    );
    let updated = 0;
    for (const p of predictions) {
      let pts = 0;
      if (championTeamId && p.championTeamId === championTeamId) pts += 20;
      if (goldenBootPlayerId && p.goldenBootPlayerId === goldenBootPlayerId) pts += 20;
      if (pts !== p.pointsTotal) {
        await this.tournamentPredictions.updatePoints(p.id, pts);
        updated++;
      }
    }
    return updated;
  }
}

interface GroupMatchRow {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
}

interface GroupStanding {
  teamId: string;
  points: number;
  goalDiff: number;
  goalsFor: number;
}

/**
 * Standard standings: 3 pts win / 1 pt draw / 0 pts loss; tiebreakers:
 * goal difference, then goals scored. Head-to-head not implemented.
 */
export function computeGroupRanking(matches: GroupMatchRow[]): string[] {
  const stats = new Map<string, GroupStanding>();
  function bump(teamId: string, delta: Partial<GroupStanding>): void {
    const cur = stats.get(teamId) ?? { teamId, points: 0, goalDiff: 0, goalsFor: 0 };
    stats.set(teamId, {
      teamId,
      points: cur.points + (delta.points ?? 0),
      goalDiff: cur.goalDiff + (delta.goalDiff ?? 0),
      goalsFor: cur.goalsFor + (delta.goalsFor ?? 0),
    });
  }

  for (const m of matches) {
    if (m.homeScore === null || m.awayScore === null) continue;
    const diff = m.homeScore - m.awayScore;
    if (diff > 0) {
      bump(m.homeTeamId, { points: 3, goalDiff: diff, goalsFor: m.homeScore });
      bump(m.awayTeamId, { goalDiff: -diff, goalsFor: m.awayScore });
    } else if (diff < 0) {
      bump(m.awayTeamId, { points: 3, goalDiff: -diff, goalsFor: m.awayScore });
      bump(m.homeTeamId, { goalDiff: diff, goalsFor: m.homeScore });
    } else {
      bump(m.homeTeamId, { points: 1, goalsFor: m.homeScore });
      bump(m.awayTeamId, { points: 1, goalsFor: m.awayScore });
    }
  }

  return [...stats.values()]
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDiff - a.goalDiff ||
        b.goalsFor - a.goalsFor ||
        a.teamId.localeCompare(b.teamId),
    )
    .map((s) => s.teamId);
}
