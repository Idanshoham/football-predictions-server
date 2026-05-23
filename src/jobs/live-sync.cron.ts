import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MatchStatus } from '@prisma/client';
import { TournamentRepository } from '../tournament/tournament.repository';
import { MatchesRepository } from '../matches/matches.repository';
import { AuditRepository } from '../audit/audit.repository';
import { ProviderFailover } from '../integrations/failover';
import { RescoreService } from '../scoring/rescore.service';
import { isInLiveWindow } from '../lib/time';

@Injectable()
export class LiveSyncCron {
  private readonly logger = new Logger(LiveSyncCron.name);
  private running = false;

  constructor(
    private readonly tournaments: TournamentRepository,
    private readonly matches: MatchesRepository,
    private readonly audit: AuditRepository,
    private readonly failover: ProviderFailover,
    private readonly rescore: RescoreService,
  ) {}

  // Runs every 30 seconds. The job itself decides whether to call providers
  // based on whether any match is in its live window.
  @Cron(CronExpression.EVERY_30_SECONDS)
  async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('previous tick still running; skipping');
      return;
    }
    this.running = true;
    try {
      await this.runOnce();
    } catch (e) {
      this.logger.error(
        `tick failed: ${e instanceof Error ? e.message : e}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async runOnce(): Promise<void> {
    const tournament = await this.tournaments.findActive();
    if (!tournament) return;

    const candidates = await this.matches.listLiveCandidates(tournament.id);
    const liveOrAboutToStart = candidates.filter((m) => isInLiveWindow(m.kickoffAt));
    if (liveOrAboutToStart.length === 0) return;

    const result = await this.failover.getLiveMatches(tournament.slug);
    if (!result.ok) return; // already audit-logged

    const byApiId = new Map<string, (typeof result.value)[number]>();
    for (const snap of result.value) {
      byApiId.set(snap.apiMatchId, snap);
    }

    let anyChanged = false;
    for (const m of liveOrAboutToStart) {
      const apiIds = (m.apiIds as Record<string, string>) ?? {};
      const providerKey = result.providerUsed.replace(/-/g, '_');
      const providerMatchId =
        apiIds[providerKey] ?? apiIds[result.providerUsed] ?? null;
      if (!providerMatchId) continue;

      const snap = byApiId.get(providerMatchId);
      if (!snap) continue;

      const sameScore = m.homeScore === snap.homeScore && m.awayScore === snap.awayScore;
      const sameStatus = m.status === snap.status;
      const sameScorer = m.firstScorerPlayerId === snap.firstScorerPlayerApiId;
      if (sameScore && sameStatus && sameScorer) continue;

      await this.matches.update(m.id, {
        homeScore: snap.homeScore,
        awayScore: snap.awayScore,
        status: snap.status,
        firstScorerPlayerId: snap.firstScorerPlayerApiId ?? m.firstScorerPlayerId,
        finishedAt: snap.status === MatchStatus.full_time ? new Date() : null,
      });
      await this.audit.record('score_changed', {
        matchId: m.id,
        from: { status: m.status, homeScore: m.homeScore, awayScore: m.awayScore },
        to: { status: snap.status, homeScore: snap.homeScore, awayScore: snap.awayScore },
        provider: result.providerUsed,
      });
      anyChanged = true;
    }

    if (anyChanged) {
      await this.rescore.rescoreAll();
    }
  }
}
