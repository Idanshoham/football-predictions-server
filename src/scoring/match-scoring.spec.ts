import fc from 'fast-check';
import { calculateMatchPoints, MATCH_POINTS_MAX } from './match-scoring';
import type { MatchPredictionInput, MatchResultInput } from './types';

function pred(home: number, away: number, scorer: string | null = null): MatchPredictionInput {
  return { homeScorePred: home, awayScorePred: away, firstScorerPlayerId: scorer };
}

function ft(home: number, away: number, scorer: string | null = null): MatchResultInput {
  return {
    status: 'full_time',
    homeScore: home,
    awayScore: away,
    firstScorerPlayerId: scorer,
  };
}

describe('calculateMatchPoints', () => {
  describe('returns null when match is not final', () => {
    it.each(['scheduled', 'live', 'halftime', 'postponed', 'cancelled'] as const)(
      'status=%s',
      (status) => {
        const result = calculateMatchPoints(pred(1, 1), {
          status,
          homeScore: 1,
          awayScore: 1,
          firstScorerPlayerId: null,
        });
        expect(result).toBeNull();
      },
    );

    it('full_time but scores still null returns null', () => {
      const result = calculateMatchPoints(pred(1, 1), {
        status: 'full_time',
        homeScore: null,
        awayScore: null,
        firstScorerPlayerId: null,
      });
      expect(result).toBeNull();
    });
  });

  describe('exact score overrides partials', () => {
    it('0-0 vs 0-0 → 5', () => {
      expect(calculateMatchPoints(pred(0, 0), ft(0, 0))).toBe(5);
    });
    it('1-1 vs 1-1 → 5', () => {
      expect(calculateMatchPoints(pred(1, 1), ft(1, 1))).toBe(5);
    });
    it('3-2 vs 3-2 → 5', () => {
      expect(calculateMatchPoints(pred(3, 2), ft(3, 2))).toBe(5);
    });
    it('exact + first scorer correct → 10', () => {
      expect(calculateMatchPoints(pred(1, 0, 'player-X'), ft(1, 0, 'player-X'))).toBe(10);
    });
  });

  describe('canonical edge cases from the plan', () => {
    it('1-0 vs 1-2 → 1 (just home goals correct)', () => {
      expect(calculateMatchPoints(pred(1, 0), ft(1, 2))).toBe(1);
    });
    it('2-3 vs 1-3 → 4 (result + away goals)', () => {
      // result: both away wins, +3. diff: -1 vs -2 wrong. home: 2≠1 wrong. away: 3=3 +1. total 4.
      expect(calculateMatchPoints(pred(2, 3), ft(1, 3))).toBe(4);
    });
    it('2-1 vs 3-2 → 4 (result + diff)', () => {
      // result: both home wins +3. diff: +1=+1 +1. home: 2≠3. away: 1≠2. total 4.
      expect(calculateMatchPoints(pred(2, 1), ft(3, 2))).toBe(4);
    });
    it('1-1 vs 2-2 → 4 (result + diff)', () => {
      // result: both draws +3. diff: 0=0 +1. home: 1≠2. away: 1≠2. total 4.
      expect(calculateMatchPoints(pred(1, 1), ft(2, 2))).toBe(4);
    });
    it('1-1 vs 0-0 → 4 (result + diff)', () => {
      expect(calculateMatchPoints(pred(1, 1), ft(0, 0))).toBe(4);
    });
  });

  describe('result-only paths', () => {
    it('3-1 vs 5-0 → 3 (result correct, nothing else)', () => {
      // result: both home wins +3. diff +2 vs +5 wrong. home 3≠5. away 1≠0. total 3.
      expect(calculateMatchPoints(pred(3, 1), ft(5, 0))).toBe(3);
    });
  });

  describe('wrong-result paths', () => {
    it('2-1 vs 1-2 → 0', () => {
      // result: home win vs away win → wrong. diff +1 vs -1 wrong. home 2≠1. away 1≠2. total 0.
      expect(calculateMatchPoints(pred(2, 1), ft(1, 2))).toBe(0);
    });
    it('3-1 vs 0-0 → 0', () => {
      expect(calculateMatchPoints(pred(3, 1), ft(0, 0))).toBe(0);
    });
  });

  describe('first scorer (independent rule)', () => {
    it('wrong score, correct first scorer → 5', () => {
      expect(calculateMatchPoints(pred(2, 1, 'p1'), ft(1, 2, 'p1'))).toBe(5);
    });
    it('correct score (partial) + correct first scorer → partial + 5', () => {
      // 2-1 vs 3-2: partial = 4. +5 first scorer = 9.
      expect(calculateMatchPoints(pred(2, 1, 'p1'), ft(3, 2, 'p1'))).toBe(9);
    });
    it('wrong first scorer → 0 first-scorer points', () => {
      expect(calculateMatchPoints(pred(1, 0, 'p1'), ft(1, 0, 'p2'))).toBe(5); // exact score only
    });
    it('user predicted nobody, match had a scorer → no first-scorer points', () => {
      expect(calculateMatchPoints(pred(0, 0, null), ft(0, 0, 'p1'))).toBe(5);
    });
    it('user predicted a scorer, match had no scorer (0-0) → no first-scorer points', () => {
      expect(calculateMatchPoints(pred(0, 0, 'p1'), ft(0, 0, null))).toBe(5);
    });
  });

  describe('property-based invariants', () => {
    const sane = fc.integer({ min: 0, max: 9 });

    it('always returns >= 0', () => {
      fc.assert(
        fc.property(sane, sane, sane, sane, (ph, pa, ah, aa) => {
          const r = calculateMatchPoints(pred(ph, pa), ft(ah, aa));
          expect(r).not.toBeNull();
          expect(r!).toBeGreaterThanOrEqual(0);
        }),
      );
    });

    it('always returns <= MATCH_POINTS_MAX', () => {
      fc.assert(
        fc.property(sane, sane, sane, sane, (ph, pa, ah, aa) => {
          const r = calculateMatchPoints(
            pred(ph, pa, 'p1'),
            ft(ah, aa, 'p1'),
          );
          expect(r!).toBeLessThanOrEqual(MATCH_POINTS_MAX);
        }),
      );
    });

    it('exact score always yields exactly 5 (no first scorer prediction)', () => {
      fc.assert(
        fc.property(sane, sane, (h, a) => {
          expect(calculateMatchPoints(pred(h, a), ft(h, a))).toBe(5);
        }),
      );
    });

    it('exact score + correct first scorer always yields exactly 10', () => {
      fc.assert(
        fc.property(sane, sane, (h, a) => {
          expect(
            calculateMatchPoints(pred(h, a, 'p1'), ft(h, a, 'p1')),
          ).toBe(10);
        }),
      );
    });

    it('first scorer correctness is additive: result_with_scorer - result_without_scorer == 0 or 5', () => {
      fc.assert(
        fc.property(sane, sane, sane, sane, (ph, pa, ah, aa) => {
          const withMatch = calculateMatchPoints(pred(ph, pa, 'p1'), ft(ah, aa, 'p1'));
          const without = calculateMatchPoints(pred(ph, pa, null), ft(ah, aa, null));
          expect(withMatch! - without!).toBe(5);
        }),
      );
    });

    it('swapping (home,away) of both prediction and actual produces same score', () => {
      // Symmetry: reflecting the match across the home/away axis is a relabelling.
      fc.assert(
        fc.property(sane, sane, sane, sane, (ph, pa, ah, aa) => {
          const a = calculateMatchPoints(pred(ph, pa), ft(ah, aa));
          const b = calculateMatchPoints(pred(pa, ph), ft(aa, ah));
          expect(a).toBe(b);
        }),
      );
    });
  });
});
