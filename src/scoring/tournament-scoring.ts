import type {
  GroupActualInput,
  GroupRankingPredictionInput,
  TournamentActualInput,
  TournamentPredictionInput,
} from './types';

/**
 * Champion + Golden Boot scoring. Both flat +20 awards.
 * Returns null fields for awards that can't yet be evaluated (actual still unknown).
 */
export interface ChampionGoldenBootResult {
  championPoints: number;
  goldenBootPoints: number;
  total: number;
}

export function calculateChampionAndGoldenBootPoints(
  prediction: TournamentPredictionInput,
  actual: TournamentActualInput,
): ChampionGoldenBootResult {
  const champion =
    prediction.championTeamId !== null &&
    actual.championTeamId !== null &&
    prediction.championTeamId === actual.championTeamId
      ? 20
      : 0;

  const goldenBoot =
    prediction.goldenBootPlayerId !== null &&
    actual.goldenBootPlayerId !== null &&
    prediction.goldenBootPlayerId === actual.goldenBootPlayerId
      ? 20
      : 0;

  return {
    championPoints: champion,
    goldenBootPoints: goldenBoot,
    total: champion + goldenBoot,
  };
}

/**
 * Group ranking scoring: +5 per correctly-placed team.
 *
 * Predicted and actual rankings are 4-element ordered lists of team ids (1st, 2nd, 3rd, 4th).
 * If the actual ranking isn't yet known (still group stage in progress), pass an empty array
 * for `actual.finalRanking` and points will be 0.
 */
export function calculateGroupRankingPoints(
  prediction: GroupRankingPredictionInput,
  actual: GroupActualInput,
): number {
  if (actual.finalRanking.length === 0) return 0;
  if (prediction.ranking.length !== actual.finalRanking.length) {
    throw new Error(
      `Group ranking length mismatch: predicted ${prediction.ranking.length}, actual ${actual.finalRanking.length}`,
    );
  }

  let points = 0;
  for (let i = 0; i < actual.finalRanking.length; i++) {
    if (prediction.ranking[i] === actual.finalRanking[i]) {
      points += 5;
    }
  }
  return points;
}

export const POINTS_CHAMPION = 20;
export const POINTS_GOLDEN_BOOT = 20;
export const POINTS_PER_GROUP_SLOT = 5;
