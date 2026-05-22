import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PredictionsService } from './predictions.service';
import type { PrismaService } from '../prisma/prisma.service';

// Hand-rolled PrismaService mock — narrow surface area, no jest.mock magic.
function makePrismaMock(): jest.Mocked<Pick<PrismaService, 'match' | 'player' | 'prediction'>> {
  return {
    match: { findUnique: jest.fn() } as never,
    player: { findFirst: jest.fn() } as never,
    prediction: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    } as never,
  };
}

function makeUser() {
  return {
    id: 'user-1',
    supabaseUserId: 'sub-1',
    email: 'a@b',
    name: 'A',
    avatarUrl: null,
    createdAt: new Date(),
    signupLockedAt: null,
  } as never;
}

function makeMatch(overrides: Partial<{ kickoffAt: Date; status: MatchStatus }> = {}) {
  return {
    id: 'match-1',
    homeTeamId: 'home',
    awayTeamId: 'away',
    kickoffAt: new Date(Date.now() + 60 * 60 * 1000), // 1h in future
    status: MatchStatus.scheduled,
    ...overrides,
  };
}

describe('PredictionsService.upsert', () => {
  it('rejects when match is not found', async () => {
    const prisma = makePrismaMock();
    (prisma.match.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new PredictionsService(prisma as unknown as PrismaService);

    await expect(
      service.upsert(makeUser(), {
        matchId: 'missing',
        homeScorePred: 1,
        awayScorePred: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when match status is live', async () => {
    const prisma = makePrismaMock();
    (prisma.match.findUnique as jest.Mock).mockResolvedValue(
      makeMatch({ status: MatchStatus.live }),
    );
    const service = new PredictionsService(prisma as unknown as PrismaService);

    await expect(
      service.upsert(makeUser(), {
        matchId: 'match-1',
        homeScorePred: 1,
        awayScorePred: 0,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when kickoff has already passed (strict, no grace)', async () => {
    const prisma = makePrismaMock();
    (prisma.match.findUnique as jest.Mock).mockResolvedValue(
      makeMatch({ kickoffAt: new Date(Date.now() - 1) }),
    );
    const service = new PredictionsService(prisma as unknown as PrismaService);

    await expect(
      service.upsert(makeUser(), {
        matchId: 'match-1',
        homeScorePred: 1,
        awayScorePred: 0,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when first-scorer is not on either team', async () => {
    const prisma = makePrismaMock();
    (prisma.match.findUnique as jest.Mock).mockResolvedValue(makeMatch());
    (prisma.player.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new PredictionsService(prisma as unknown as PrismaService);

    await expect(
      service.upsert(makeUser(), {
        matchId: 'match-1',
        homeScorePred: 1,
        awayScorePred: 0,
        firstScorerPlayerId: 'random-player',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid prediction without first-scorer', async () => {
    const prisma = makePrismaMock();
    (prisma.match.findUnique as jest.Mock).mockResolvedValue(makeMatch());
    (prisma.prediction.upsert as jest.Mock).mockResolvedValue({ id: 'pred-1' });
    const service = new PredictionsService(prisma as unknown as PrismaService);

    const result = await service.upsert(makeUser(), {
      matchId: 'match-1',
      homeScorePred: 2,
      awayScorePred: 1,
    });
    expect(result).toEqual({ id: 'pred-1' });
    expect(prisma.prediction.upsert).toHaveBeenCalled();
  });

  it('accepts a valid prediction with first-scorer that is on a team', async () => {
    const prisma = makePrismaMock();
    (prisma.match.findUnique as jest.Mock).mockResolvedValue(makeMatch());
    (prisma.player.findFirst as jest.Mock).mockResolvedValue({ id: 'player-on-home' });
    (prisma.prediction.upsert as jest.Mock).mockResolvedValue({ id: 'pred-1' });
    const service = new PredictionsService(prisma as unknown as PrismaService);

    const result = await service.upsert(makeUser(), {
      matchId: 'match-1',
      homeScorePred: 2,
      awayScorePred: 1,
      firstScorerPlayerId: 'player-on-home',
    });
    expect(result).toEqual({ id: 'pred-1' });
  });
});

describe('PredictionsService.getForMatch (visibility)', () => {
  it('returns only mine when match is scheduled and kickoff is in the future', async () => {
    const prisma = makePrismaMock();
    (prisma.match.findUnique as jest.Mock).mockResolvedValue(makeMatch());
    (prisma.prediction.findUnique as jest.Mock).mockResolvedValue({ id: 'pred-mine' });
    const service = new PredictionsService(prisma as unknown as PrismaService);

    const result = await service.getForMatch(makeUser(), 'match-1');
    expect(result.mine).toEqual({ id: 'pred-mine' });
    expect(result.others).toEqual([]);
    expect(prisma.prediction.findMany).not.toHaveBeenCalled();
  });

  it('reveals others when match is live', async () => {
    const prisma = makePrismaMock();
    (prisma.match.findUnique as jest.Mock).mockResolvedValue(
      makeMatch({ status: MatchStatus.live }),
    );
    (prisma.prediction.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.prediction.findMany as jest.Mock).mockResolvedValue([
      {
        homeScorePred: 1,
        awayScorePred: 0,
        firstScorerPlayerId: null,
        pointsTotal: 0,
        user: { id: 'user-2', name: 'B' },
      },
    ]);
    const service = new PredictionsService(prisma as unknown as PrismaService);

    const result = await service.getForMatch(makeUser(), 'match-1');
    expect(result.others.length).toBe(1);
    expect(result.others[0].userName).toBe('B');
  });

  it('reveals others when scheduled but kickoff has passed (edge case)', async () => {
    const prisma = makePrismaMock();
    (prisma.match.findUnique as jest.Mock).mockResolvedValue(
      makeMatch({ kickoffAt: new Date(Date.now() - 1) }),
    );
    (prisma.prediction.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.prediction.findMany as jest.Mock).mockResolvedValue([]);
    const service = new PredictionsService(prisma as unknown as PrismaService);

    const result = await service.getForMatch(makeUser(), 'match-1');
    expect(prisma.prediction.findMany).toHaveBeenCalled();
    expect(result.others).toEqual([]);
  });
});
