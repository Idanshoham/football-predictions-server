import type { BracketActualInput, BracketPredictionInput } from './types';

/**
 * Bracket scoring: +5 per match slot where the user's predicted winner equals
 * the actual winner. Slots without a finalised result yet are skipped.
 *
 * Slot naming convention matches MatchStage in the schema:
 *   r32_1..r32_16, r16_1..r16_8, qf_1..qf_4, sf_1, sf_2, final, third
 */
export function calculateBracketPoints(
  prediction: BracketPredictionInput,
  actual: BracketActualInput,
): number {
  let points = 0;
  for (const [slot, actualWinner] of Object.entries(actual.winnersBySlot)) {
    if (prediction.winnersBySlot[slot] === actualWinner) {
      points += 5;
    }
  }
  return points;
}

/**
 * Generate the canonical list of all 32 bracket match slots, in their natural order.
 * Useful for validating that a submitted bracket has exactly the right slots filled.
 */
export function allBracketSlots(): string[] {
  const slots: string[] = [];
  for (let i = 1; i <= 16; i++) slots.push(`r32_${i}`);
  for (let i = 1; i <= 8; i++) slots.push(`r16_${i}`);
  for (let i = 1; i <= 4; i++) slots.push(`qf_${i}`);
  slots.push('sf_1', 'sf_2');
  slots.push('final');
  slots.push('third');
  return slots;
}

export const POINTS_PER_BRACKET_MATCH = 5;
export const BRACKET_MATCH_COUNT = 32;
export const BRACKET_MAX_POINTS = POINTS_PER_BRACKET_MATCH * BRACKET_MATCH_COUNT; // 160
