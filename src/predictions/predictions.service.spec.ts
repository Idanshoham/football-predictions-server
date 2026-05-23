import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PredictionsService } from './predictions.service';
import type { PredictionsRepository } from './predictions.repository';
import type { MatchesRepository } from '../matches/matches.repository';
import type { PlayersRepository } from '../players/players.repository';

function makeMocks() {
  return {
    predictions: {
      upsert: jest.fn(),
      findMine: jest.fn(),
      findMineForMatch: jest.fn(),
      findOthersForMatch: jest.fn(),
    } as unknown as jest.Mocked<PredictionsRepository>,
    matches: {
      findById: jest.fn(),
    } as unknown as jest.Mocked<MatchesRepository>,
    players: {
      findOnMatchRoster: jest.fn(),
    } as unknown as jest.Mocked<PlayersRepository>,
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
    kickoffAt: new Date(Date.now() + 60 * 60 * 1000),
    status: MatchStatus.scheduled,
    ...overrides,
  };
}

describe('PredictionsService.upsert', () => {
  it('rejects when match is not found', async () => {
    const mocks = makeMocks();
    mocks.matches.findById.mockResolvedValue(null);
    const service = new PredictionsService(mocks.predictions, mocks.matches, mocks.players);

    await expect(
      service.upsert(makeUser(), {
        matchId: 'missing',
        homeScorePred: 1,
        awayScorePred: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when match status is live', async () => {
    const mocks = makeMocks();
    mocks.matches.findById.mockResolvedValue(makeMatch({ status: MatchStatus.live }) as never);
    const service = new PredictionsService(mocks.predictions, mocks.matches, mocks.players);

    await expect(
      service.upsert(makeUser(), {
        matchId: 'match-1',
        homeScorePred: 1,
        awayScorePred: 0,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when kickoff has already passed (strict, no grace)', async () => {
    const mocks = makeMocks();
    mocks.matches.findById.mockResolvedValue(
      makeMatch({ kickoffAt: new Date(Date.now() - 1) }) as never,
    );
    const service = new PredictionsService(mocks.predictions, mocks.matches, mocks.players);

    await expect(
      service.upsert(makeUser(), {
        matchId: 'match-1',
        homeScorePred: 1,
        awayScorePred: 0,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when first-scorer is not on either team', async () => {
    const mocks = makeMocks();
    mocks.matches.findById.mockResolvedValue(makeMatch() as never);
    mocks.players.findOnMatchRoster.mockResolvedValue(null);
    const service = new PredictionsService(mocks.predictions, mocks.matches, mocks.players);

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
    const mocks = makeMocks();
    mocks.matches.findById.mockResolvedValue(makeMatch() as never);
    mocks.predictions.upsert.mockResolvedValue({ id: 'pred-1' } as never);
    const service = new PredictionsService(mocks.predictions, mocks.matches, mocks.players);

    const result = await service.upsert(makeUser(), {
      matchId: 'match-1',
      homeScorePred: 2,
      awayScorePred: 1,
    });
    expect(result).toEqual({ id: 'pred-1' });
    expect(mocks.predictions.upsert).toHaveBeenCalled();
  });

  it('accepts a valid prediction with first-scorer on a team', async () => {
    const mocks = makeMocks();
    mocks.matches.findById.mockResolvedValue(makeMatch() as never);
    mocks.players.findOnMatchRoster.mockResolvedValue({ id: 'p-home' } as never);
    mocks.predictions.upsert.mockResolvedValue({ id: 'pred-1' } as never);
    const service = new PredictionsService(mocks.predictions, mocks.matches, mocks.players);

    const result = await service.upsert(makeUser(), {
      matchId: 'match-1',
      homeScorePred: 2,
      awayScorePred: 1,
      firstScorerPlayerId: 'p-home',
    });
    expect(result).toEqual({ id: 'pred-1' });
  });
});

describe('PredictionsService.getForMatch (visibility)', () => {
  it('returns only mine when match is scheduled and kickoff is in the future', async () => {
    const mocks = makeMocks();
    mocks.matches.findById.mockResolvedValue(makeMatch() as never);
    mocks.predictions.findMineForMatch.mockResolvedValue({ id: 'pred-mine' } as never);
    const service = new PredictionsService(mocks.predictions, mocks.matches, mocks.players);

    const result = await service.getForMatch(makeUser(), 'match-1');
    expect(result.mine).toEqual({ id: 'pred-mine' });
    expect(result.others).toEqual([]);
    expect(mocks.predictions.findOthersForMatch).not.toHaveBeenCalled();
  });

  it('reveals others when match is live', async () => {
    const mocks = makeMocks();
    mocks.matches.findById.mockResolvedValue(
      makeMatch({ status: MatchStatus.live }) as never,
    );
    mocks.predictions.findMineForMatch.mockResolvedValue(null);
    mocks.predictions.findOthersForMatch.mockResolvedValue([
      {
        homeScorePred: 1,
        awayScorePred: 0,
        firstScorerPlayerId: null,
        pointsTotal: 0,
        user: { id: 'user-2', name: 'B' },
      },
    ] as never);
    const service = new PredictionsService(mocks.predictions, mocks.matches, mocks.players);

    const result = await service.getForMatch(makeUser(), 'match-1');
    expect(result.others.length).toBe(1);
    expect(result.others[0].userName).toBe('B');
  });

  it('reveals others when scheduled but kickoff has passed (edge case)', async () => {
    const mocks = makeMocks();
    mocks.matches.findById.mockResolvedValue(
      makeMatch({ kickoffAt: new Date(Date.now() - 1) }) as never,
    );
    mocks.predictions.findMineForMatch.mockResolvedValue(null);
    mocks.predictions.findOthersForMatch.mockResolvedValue([] as never);
    const service = new PredictionsService(mocks.predictions, mocks.matches, mocks.players);

    const result = await service.getForMatch(makeUser(), 'match-1');
    expect(mocks.predictions.findOthersForMatch).toHaveBeenCalled();
    expect(result.others).toEqual([]);
  });
});
