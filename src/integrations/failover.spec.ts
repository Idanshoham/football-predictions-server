import { ProviderFailover } from './failover';
import type { FootballDataProvider, MatchSnapshot } from './provider.interface';
import type { AuditRepository } from '../audit/audit.repository';
import { MatchStatus } from '@prisma/client';

function snapshot(apiMatchId: string): MatchSnapshot {
  return {
    apiMatchId,
    status: MatchStatus.live,
    homeScore: 1,
    awayScore: 0,
    scorers: [],
    firstScorerPlayerApiId: null,
    lastUpdated: new Date(),
  };
}

function makeAuditMock(): jest.Mocked<AuditRepository> {
  return { record: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditRepository>;
}

function makeProvider(name: string, trustRank: number, impl: Partial<FootballDataProvider>): FootballDataProvider {
  return {
    name,
    trustRank,
    getLiveMatches: jest.fn(),
    getMatch: jest.fn(),
    ...impl,
  } as FootballDataProvider;
}

describe('ProviderFailover.getLiveMatches', () => {
  it('uses primary when it succeeds', async () => {
    const audit = makeAuditMock();
    const primary = makeProvider('primary', 1, {
      getLiveMatches: jest.fn().mockResolvedValue([snapshot('m-1')]),
    });
    const secondary = makeProvider('secondary', 2, {
      getLiveMatches: jest.fn().mockResolvedValue([]),
    });
    const failover = new ProviderFailover(audit, primary as never, secondary as never);
    const result = await failover.getLiveMatches('wc2026');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerUsed).toBe('primary');
      expect(result.fallbackUsed).toBe(false);
      expect(result.value.length).toBe(1);
    }
    expect(secondary.getLiveMatches).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('fetch_success', expect.any(Object));
  });

  it('falls back to secondary when primary throws', async () => {
    const audit = makeAuditMock();
    const primary = makeProvider('primary', 1, {
      getLiveMatches: jest.fn().mockRejectedValue(new Error('500')),
    });
    const secondary = makeProvider('secondary', 2, {
      getLiveMatches: jest.fn().mockResolvedValue([snapshot('m-1')]),
    });
    const failover = new ProviderFailover(audit, primary as never, secondary as never);
    const result = await failover.getLiveMatches('wc2026');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerUsed).toBe('secondary');
      expect(result.fallbackUsed).toBe(true);
    }
    expect(audit.record).toHaveBeenCalledWith('fallback_used', expect.any(Object));
  });

  it('returns ok=false and logs when both providers fail', async () => {
    const audit = makeAuditMock();
    const primary = makeProvider('primary', 1, {
      getLiveMatches: jest.fn().mockRejectedValue(new Error('500')),
    });
    const secondary = makeProvider('secondary', 2, {
      getLiveMatches: jest.fn().mockRejectedValue(new Error('503')),
    });
    const failover = new ProviderFailover(audit, primary as never, secondary as never);
    const result = await failover.getLiveMatches('wc2026');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBe(2);
      expect(result.errors[0].provider).toBe('primary');
    }
    expect(audit.record).toHaveBeenCalledWith('fetch_failure', expect.any(Object));
  });
});
