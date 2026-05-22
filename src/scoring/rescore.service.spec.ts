import { computeGroupRanking } from './rescore.service';

describe('computeGroupRanking', () => {
  it('one team wins all → ranked first', () => {
    const ranking = computeGroupRanking([
      { homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 0 },
      { homeTeamId: 'A', awayTeamId: 'C', homeScore: 1, awayScore: 0 },
      { homeTeamId: 'A', awayTeamId: 'D', homeScore: 3, awayScore: 1 },
      { homeTeamId: 'B', awayTeamId: 'C', homeScore: 1, awayScore: 1 },
      { homeTeamId: 'B', awayTeamId: 'D', homeScore: 2, awayScore: 2 },
      { homeTeamId: 'C', awayTeamId: 'D', homeScore: 0, awayScore: 0 },
    ]);
    expect(ranking[0]).toBe('A');
  });

  it('tiebreaker by goal difference', () => {
    const ranking = computeGroupRanking([
      // A: 3pts, +3
      { homeTeamId: 'A', awayTeamId: 'D', homeScore: 3, awayScore: 0 },
      // B: 3pts, +1
      { homeTeamId: 'B', awayTeamId: 'C', homeScore: 1, awayScore: 0 },
      // make A and B tied on points (both 3)
      { homeTeamId: 'A', awayTeamId: 'C', homeScore: 0, awayScore: 1 }, // C beats A
      { homeTeamId: 'B', awayTeamId: 'D', homeScore: 0, awayScore: 2 }, // D beats B
    ]);
    // A: W +3 then L → 3pts, +3-1 = +2
    // B: W +1 then L 0-2 → 3pts, +1-2 = -1
    // A should come before B
    const aIdx = ranking.indexOf('A');
    const bIdx = ranking.indexOf('B');
    expect(aIdx).toBeLessThan(bIdx);
  });

  it('handles all-draw group with stable tie-break', () => {
    const ranking = computeGroupRanking([
      { homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 1 },
      { homeTeamId: 'A', awayTeamId: 'C', homeScore: 0, awayScore: 0 },
      { homeTeamId: 'A', awayTeamId: 'D', homeScore: 2, awayScore: 2 },
      { homeTeamId: 'B', awayTeamId: 'C', homeScore: 1, awayScore: 1 },
      { homeTeamId: 'B', awayTeamId: 'D', homeScore: 0, awayScore: 0 },
      { homeTeamId: 'C', awayTeamId: 'D', homeScore: 1, awayScore: 1 },
    ]);
    expect(ranking.length).toBe(4);
    // All tied → alphabetical id tiebreak
    expect(ranking).toEqual(['A', 'B', 'C', 'D']);
  });

  it('skips matches without scores', () => {
    const ranking = computeGroupRanking([
      { homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0 },
      { homeTeamId: 'A', awayTeamId: 'C', homeScore: null, awayScore: null },
    ]);
    expect(ranking[0]).toBe('A');
  });
});
