import { ProviderFailover } from './failover';
import type { FootballDataProvider, MatchSnapshot } from './provider.interface';
import type { PrismaService } from '../prisma/prisma.service';
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

function makePrismaMock(): { dataAudit: { create: jest.Mock } } {
  return { dataAudit: { create: jest.fn().mockResolvedValue({}) } };
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
    const prisma = makePrismaMock();
    const primary = makeProvider('primary', 1, {
      getLiveMatches: jest.fn().mockResolvedValue([snapshot('m-1')]),
    });
    const secondary = makeProvider('secondary', 2, {
      getLiveMatches: jest.fn().mockResolvedValue([]),
    });
    const failover = new ProviderFailover(
      prisma as unknown as PrismaService,
      primary as never,
      secondary as never,
    );
    const result = await failover.getLiveMatches('wc2026');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerUsed).toBe('primary');
      expect(result.fallbackUsed).toBe(false);
      expect(result.value.length).toBe(1);
    }
    expect(secondary.getLiveMatches).not.toHaveBeenCalled();
    expect(prisma.dataAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'fetch_success' }) }),
    );
  });

  it('falls back to secondary when primary throws', async () => {
    const prisma = makePrismaMock();
    const primary = makeProvider('primary', 1, {
      getLiveMatches: jest.fn().mockRejectedValue(new Error('500')),
    });
    const secondary = makeProvider('secondary', 2, {
      getLiveMatches: jest.fn().mockResolvedValue([snapshot('m-1')]),
    });
    const failover = new ProviderFailover(
      prisma as unknown as PrismaService,
      primary as never,
      secondary as never,
    );
    const result = await failover.getLiveMatches('wc2026');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerUsed).toBe('secondary');
      expect(result.fallbackUsed).toBe(true);
    }
    expect(prisma.dataAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'fallback_used' }) }),
    );
  });

  it('returns ok=false and logs when both providers fail', async () => {
    const prisma = makePrismaMock();
    const primary = makeProvider('primary', 1, {
      getLiveMatches: jest.fn().mockRejectedValue(new Error('500')),
    });
    const secondary = makeProvider('secondary', 2, {
      getLiveMatches: jest.fn().mockRejectedValue(new Error('503')),
    });
    const failover = new ProviderFailover(
      prisma as unknown as PrismaService,
      primary as never,
      secondary as never,
    );
    const result = await failover.getLiveMatches('wc2026');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBe(2);
      expect(result.errors[0].provider).toBe('primary');
    }
    expect(prisma.dataAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'fetch_failure' }) }),
    );
  });
});
