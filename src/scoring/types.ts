// Shared types for the scoring engines.
// Kept narrow on purpose — these are the only inputs scoring needs.
// Prisma types are not used here so scoring stays pure and trivially testable.

export type MatchStatus =
  | 'scheduled'
  | 'live'
  | 'halftime'
  | 'full_time'
  | 'postponed'
  | 'cancelled';

export interface MatchPredictionInput {
  homeScorePred: number;
  awayScorePred: number;
  firstScorerPlayerId: string | null;
}

export interface MatchResultInput {
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  firstScorerPlayerId: string | null;
}

export interface GroupRankingPredictionInput {
  // 4-element array of team ids: index 0 is predicted 1st place, etc.
  ranking: readonly string[];
}

export interface GroupActualInput {
  // 4-element array of team ids in their actual final order.
  finalRanking: readonly string[];
}

export interface BracketPredictionInput {
  // Map of match slot ("r32_1", "r16_1", ..., "final", "third") → predicted winner team id.
  winnersBySlot: Readonly<Record<string, string>>;
}

export interface BracketActualInput {
  // Same shape, but with the actual winner. Slots without a result yet are omitted.
  winnersBySlot: Readonly<Record<string, string>>;
}

export interface TournamentPredictionInput {
  championTeamId: string | null;
  goldenBootPlayerId: string | null;
}

export interface TournamentActualInput {
  championTeamId: string | null;
  goldenBootPlayerId: string | null;
}
