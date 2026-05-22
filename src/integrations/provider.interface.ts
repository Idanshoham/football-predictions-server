import type { MatchStatus } from '@prisma/client';

export interface ScorerEvent {
  playerApiId: string;
  team: 'home' | 'away';
  minute: number;
}

export interface MatchSnapshot {
  /** The provider's own match id (we map provider ids → our match ids via `api_ids` json). */
  apiMatchId: string;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  scorers: ScorerEvent[];
  /** The first scorer's player api id, derived from `scorers` sorted by minute. */
  firstScorerPlayerApiId: string | null;
  lastUpdated: Date;
}

export interface FootballDataProvider {
  /** Human-readable name used in logs and the data_audit table. */
  readonly name: string;

  /** Lower = more trusted (used as tie-break when consensus is unreachable). */
  readonly trustRank: number;

  /** Fetch all live matches of the active tournament. Single call returns many. */
  getLiveMatches(tournamentSlug: string): Promise<MatchSnapshot[]>;

  /** Fetch a single match by this provider's id. Returns null if not found. */
  getMatch(apiMatchId: string): Promise<MatchSnapshot | null>;
}
