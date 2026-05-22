import {
  calculateChampionAndGoldenBootPoints,
  calculateGroupRankingPoints,
} from './tournament-scoring';

describe('calculateChampionAndGoldenBootPoints', () => {
  it('both correct → +40 (20 + 20)', () => {
    const r = calculateChampionAndGoldenBootPoints(
      { championTeamId: 'BR', goldenBootPlayerId: 'mbappe' },
      { championTeamId: 'BR', goldenBootPlayerId: 'mbappe' },
    );
    expect(r).toEqual({ championPoints: 20, goldenBootPoints: 20, total: 40 });
  });

  it('only champion correct → +20', () => {
    const r = calculateChampionAndGoldenBootPoints(
      { championTeamId: 'BR', goldenBootPlayerId: 'mbappe' },
      { championTeamId: 'BR', goldenBootPlayerId: 'haaland' },
    );
    expect(r.total).toBe(20);
  });

  it('only golden boot correct → +20', () => {
    const r = calculateChampionAndGoldenBootPoints(
      { championTeamId: 'BR', goldenBootPlayerId: 'mbappe' },
      { championTeamId: 'AR', goldenBootPlayerId: 'mbappe' },
    );
    expect(r.total).toBe(20);
  });

  it('neither correct → 0', () => {
    const r = calculateChampionAndGoldenBootPoints(
      { championTeamId: 'BR', goldenBootPlayerId: 'mbappe' },
      { championTeamId: 'AR', goldenBootPlayerId: 'haaland' },
    );
    expect(r.total).toBe(0);
  });

  it('user predicted nothing → 0', () => {
    const r = calculateChampionAndGoldenBootPoints(
      { championTeamId: null, goldenBootPlayerId: null },
      { championTeamId: 'AR', goldenBootPlayerId: 'mbappe' },
    );
    expect(r.total).toBe(0);
  });

  it('actual not known yet → 0', () => {
    const r = calculateChampionAndGoldenBootPoints(
      { championTeamId: 'BR', goldenBootPlayerId: 'mbappe' },
      { championTeamId: null, goldenBootPlayerId: null },
    );
    expect(r.total).toBe(0);
  });
});

describe('calculateGroupRankingPoints', () => {
  it('all 4 correct → 20', () => {
    expect(
      calculateGroupRankingPoints(
        { ranking: ['A', 'B', 'C', 'D'] },
        { finalRanking: ['A', 'B', 'C', 'D'] },
      ),
    ).toBe(20);
  });

  it('2 of 4 correct → 10', () => {
    expect(
      calculateGroupRankingPoints(
        { ranking: ['A', 'B', 'C', 'D'] },
        { finalRanking: ['A', 'X', 'C', 'Y'] },
      ),
    ).toBe(10);
  });

  it('all wrong → 0', () => {
    expect(
      calculateGroupRankingPoints(
        { ranking: ['A', 'B', 'C', 'D'] },
        { finalRanking: ['W', 'X', 'Y', 'Z'] },
      ),
    ).toBe(0);
  });

  it('only the qualifying spots correct → 10', () => {
    // Player got top 2 right but 3rd/4th wrong
    expect(
      calculateGroupRankingPoints(
        { ranking: ['A', 'B', 'C', 'D'] },
        { finalRanking: ['A', 'B', 'D', 'C'] },
      ),
    ).toBe(10);
  });

  it('actual not yet known → 0', () => {
    expect(
      calculateGroupRankingPoints(
        { ranking: ['A', 'B', 'C', 'D'] },
        { finalRanking: [] },
      ),
    ).toBe(0);
  });

  it('throws on length mismatch (defensive)', () => {
    expect(() =>
      calculateGroupRankingPoints(
        { ranking: ['A', 'B'] },
        { finalRanking: ['A', 'B', 'C', 'D'] },
      ),
    ).toThrow();
  });
});
