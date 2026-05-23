import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchStage, Tournament } from '@prisma/client';
import { nowUtc } from '../lib/time';
import { TournamentRepository } from './tournament.repository';
import { MatchesRepository } from '../matches/matches.repository';

export type BracketLockState =
  | 'open'                // before opener kickoff — initial edit
  | 'locked-final'        // after opener, before group stage ends — sealed
  | 'edit-window'         // between group end and R32 kickoff — one re-edit
  | 'locked-permanently'; // R32 kicked off

const GROUP_MATCH_DURATION_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class TournamentService {
  constructor(
    private readonly tournaments: TournamentRepository,
    private readonly matches: MatchesRepository,
  ) {}

  async getActive(): Promise<Tournament> {
    const t = await this.tournaments.findActive();
    if (!t) throw new NotFoundException('No active tournament configured');
    return t;
  }

  async isLocked(): Promise<boolean> {
    const t = await this.getActive();
    return nowUtc().getTime() >= t.openerKickoffAt.getTime();
  }

  /**
   * Bracket edit-window state machine: opener-kickoff → locked → end-of-
   * group-stage → edit-window → R32-kickoff → permanently-locked.
   */
  async getBracketLockState(): Promise<BracketLockState> {
    const t = await this.getActive();
    const now = nowUtc().getTime();
    const openerMs = t.openerKickoffAt.getTime();

    if (now < openerMs) return 'open';

    const lastGroupMatch = await this.matches.findLatestGroupStageKickoff(t.id);
    const groupEndsMs = lastGroupMatch
      ? lastGroupMatch.kickoffAt.getTime() + GROUP_MATCH_DURATION_MS
      : openerMs + 18 * 24 * 60 * 60 * 1000;

    if (now < groupEndsMs) return 'locked-final';

    const firstR32 = await this.matches.findEarliestKickoffByStage(t.id, MatchStage.r32);
    if (!firstR32) return 'edit-window';
    if (now < firstR32.kickoffAt.getTime()) return 'edit-window';

    return 'locked-permanently';
  }

  /** Returns the active bracket version a write should target (1 = initial, 2 = post-group edit). */
  async getActiveBracketVersion(): Promise<1 | 2> {
    const state = await this.getBracketLockState();
    if (state === 'open') return 1;
    if (state === 'edit-window') return 2;
    throw new Error('Bracket is locked');
  }
}
