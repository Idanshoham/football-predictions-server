import { Injectable, NotFoundException } from '@nestjs/common';
import { Tournament } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { nowUtc } from '../lib/time';

export type BracketLockState =
  | 'open'                // before opener kickoff — initial edit
  | 'locked-final'        // after opener, before group stage ends — sealed
  | 'edit-window'         // between group end and R32 kickoff — one re-edit
  | 'locked-permanently'; // R32 kicked off

const GROUP_MATCH_DURATION_MS = 2 * 60 * 60 * 1000; // assume each match wraps within 2h of kickoff

@Injectable()
export class TournamentService {
  constructor(private readonly prisma: PrismaService) {}

  async getActive(): Promise<Tournament> {
    const t = await this.prisma.tournament.findFirst({
      where: { isActive: true },
      orderBy: { openerKickoffAt: 'asc' },
    });
    if (!t) throw new NotFoundException('No active tournament configured');
    return t;
  }

  /**
   * Returns the global tournament-prediction lock state for the active
   * tournament. Used by champion / golden boot / group rankings, all of
   * which lock at opener kickoff.
   */
  async isLocked(): Promise<boolean> {
    const t = await this.getActive();
    return nowUtc().getTime() >= t.openerKickoffAt.getTime();
  }

  /**
   * Returns the bracket edit-window state machine.
   * Implements: opener-kickoff → locked → group-stage-ends → edit-window →
   * R32-kickoff → permanently-locked.
   */
  async getBracketLockState(): Promise<BracketLockState> {
    const t = await this.getActive();
    const now = nowUtc().getTime();
    const openerMs = t.openerKickoffAt.getTime();

    if (now < openerMs) return 'open';

    // Find the latest group-stage kickoff to estimate "end of group stage".
    const lastGroupMatch = await this.prisma.match.findFirst({
      where: { tournamentId: t.id, stage: 'group' },
      orderBy: { kickoffAt: 'desc' },
    });
    const groupEndsMs = lastGroupMatch
      ? lastGroupMatch.kickoffAt.getTime() + GROUP_MATCH_DURATION_MS
      : openerMs + 18 * 24 * 60 * 60 * 1000; // fallback: opener + 18 days

    if (now < groupEndsMs) return 'locked-final';

    // Find the first R32 (round-of-32) kickoff.
    const firstR32 = await this.prisma.match.findFirst({
      where: { tournamentId: t.id, stage: 'r32' },
      orderBy: { kickoffAt: 'asc' },
    });
    if (!firstR32) return 'edit-window'; // schedule not fully seeded yet
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
