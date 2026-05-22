import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderFailover } from '../integrations/failover';
import { RescoreService } from '../scoring/rescore.service';
import { isInLiveWindow } from '../lib/time';

@Injectable()
export class LiveSyncCron {
  private readonly logger = new Logger(LiveSyncCron.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly failover: ProviderFailover,
    private readonly rescore: RescoreService,
  ) {}

  // Runs every 30 seconds. The job itself decides whether to call out to
  // providers based on whether any match is in its live window.
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
    const tournament = await this.prisma.tournament.findFirst({
      where: { isActive: true },
    });
    if (!tournament) return;

    // Cheap pre-check: is anything actually live?
    const candidates = await this.prisma.match.findMany({
      where: {
        tournamentId: tournament.id,
        status: { in: [MatchStatus.scheduled, MatchStatus.live, MatchStatus.halftime] },
      },
      select: {
        id: true,
        status: true,
        kickoffAt: true,
        homeScore: true,
        awayScore: true,
        firstScorerPlayerId: true,
        apiIds: true,
      },
    });
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

      // Only update if something changed.
      const sameScore = m.homeScore === snap.homeScore && m.awayScore === snap.awayScore;
      const sameStatus = m.status === snap.status;
      const sameScorer = m.firstScorerPlayerId === snap.firstScorerPlayerApiId;
      if (sameScore && sameStatus && sameScorer) continue;

      await this.prisma.match.update({
        where: { id: m.id },
        data: {
          homeScore: snap.homeScore,
          awayScore: snap.awayScore,
          status: snap.status,
          firstScorerPlayerId: snap.firstScorerPlayerApiId ?? m.firstScorerPlayerId,
          finishedAt: snap.status === MatchStatus.full_time ? new Date() : null,
        },
      });
      await this.prisma.dataAudit.create({
        data: {
          event: 'score_changed',
          payloadJson: {
            matchId: m.id,
            from: {
              status: m.status,
              homeScore: m.homeScore,
              awayScore: m.awayScore,
            },
            to: {
              status: snap.status,
              homeScore: snap.homeScore,
              awayScore: snap.awayScore,
            },
            provider: result.providerUsed,
          },
        },
      });
      anyChanged = true;
    }

    if (anyChanged) {
      await this.rescore.rescoreAll();
    }
  }
}
