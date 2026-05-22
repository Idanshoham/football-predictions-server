import type { MatchPredictionInput, MatchResultInput } from './types';

/**
 * Pure scoring function for a single match.
 *
 * Rules (locked):
 *  - Match not full_time → returns null (points not yet finalised).
 *  - Exact score: 5 (overrides the partial-score group below).
 *  - Otherwise, sum any of these that apply:
 *      Result correct (W/D/L sign): +3
 *      Goal difference correct:     +1
 *      Home goals correct:          +1
 *      Away goals correct:          +1
 *  - First scorer correct: +5 (ALWAYS additive, independent of score outcome).
 *
 * Max per match: exact (5) + first scorer (5) = 10.
 *
 * The function is pure — no DB, no time, no I/O. This keeps testing trivial
 * and makes re-scoring an entire tournament idempotent.
 */
export function calculateMatchPoints(
  prediction: MatchPredictionInput,
  match: MatchResultInput,
): number | null {
  if (match.status !== 'full_time') return null;
  if (match.homeScore === null || match.awayScore === null) return null;

  const exact =
    prediction.homeScorePred === match.homeScore &&
    prediction.awayScorePred === match.awayScore;

  let scorePts: number;
  if (exact) {
    scorePts = 5;
  } else {
    const predDiff = prediction.homeScorePred - prediction.awayScorePred;
    const actDiff = match.homeScore - match.awayScore;
    let partial = 0;
    if (Math.sign(predDiff) === Math.sign(actDiff)) partial += 3;
    if (predDiff === actDiff) partial += 1;
    if (prediction.homeScorePred === match.homeScore) partial += 1;
    if (prediction.awayScorePred === match.awayScore) partial += 1;
    scorePts = partial;
  }

  const firstScorerPts =
    prediction.firstScorerPlayerId !== null &&
    match.firstScorerPlayerId !== null &&
    prediction.firstScorerPlayerId === match.firstScorerPlayerId
      ? 5
      : 0;

  return scorePts + firstScorerPts;
}

export const MATCH_POINTS_MAX = 10;
