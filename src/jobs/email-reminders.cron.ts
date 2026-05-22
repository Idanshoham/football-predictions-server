import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BrevoService } from '../email/brevo.service';
import { formatIsraelTime, isWithinReminderWindow } from '../lib/time';

const NOTIFICATION_TYPE = 'pre_match_2h';

@Injectable()
export class EmailRemindersCron {
  private readonly logger = new Logger(EmailRemindersCron.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly brevo: BrevoService,
  ) {}

  // Every 15 minutes — the 40-min reminder window means each user gets at
  // most one reminder per match.
  @Cron(CronExpression.EVERY_15_MINUTES)
  async tick(): Promise<void> {
    if (this.running) return;
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

  async runOnce(): Promise<{ sent: number; skipped: number; errors: number }> {
    const result = { sent: 0, skipped: 0, errors: 0 };

    // Candidate matches: scheduled, kickoff in 100-140 minute window.
    const candidates = await this.prisma.match.findMany({
      where: { status: MatchStatus.scheduled },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
    });
    const due = candidates.filter((m) => isWithinReminderWindow(m.kickoffAt));
    if (due.length === 0) return result;

    const users = await this.prisma.user.findMany({
      select: { id: true, email: true, name: true },
    });

    for (const match of due) {
      const existingPredictions = await this.prisma.prediction.findMany({
        where: { matchId: match.id },
        select: { userId: true },
      });
      const haveSent = await this.prisma.emailNotification.findMany({
        where: { matchId: match.id, type: NOTIFICATION_TYPE },
        select: { userId: true },
      });
      const predicted = new Set(existingPredictions.map((p) => p.userId));
      const alreadyNotified = new Set(haveSent.map((p) => p.userId));

      const targets = users.filter(
        (u) => !predicted.has(u.id) && !alreadyNotified.has(u.id),
      );

      for (const user of targets) {
        const kickoff = formatIsraelTime(match.kickoffAt, "HH:mm");
        const date = formatIsraelTime(match.kickoffAt, 'dd/MM');
        const subject = `${match.homeTeam.nameHe} מול ${match.awayTeam.nameHe} בעוד שעתיים`;
        const text = `שלום ${user.name},\n\nהמשחק ${match.homeTeam.nameHe} - ${match.awayTeam.nameHe} מתחיל היום (${date}) בשעה ${kickoff} (שעון ישראל).\n\nעוד לא שלחת תחזית.\n\nלהגיש תחזית: ${this.publicAppUrl()}\n\nבהצלחה,\nמונדיאל 2026`;

        const sent = await this.brevo.send({
          to: { email: user.email, name: user.name },
          subject,
          textContent: text,
        });

        if (sent.ok) {
          await this.prisma.emailNotification
            .create({
              data: {
                userId: user.id,
                matchId: match.id,
                type: NOTIFICATION_TYPE,
              },
            })
            .catch(() => {
              // Unique constraint may race; safe to ignore.
            });
          result.sent++;
        } else {
          result.errors++;
        }
      }
    }

    return result;
  }

  private publicAppUrl(): string {
    return (
      process.env.PUBLIC_APP_URL ??
      'https://idanshoham.github.io/football-predictions-client/'
    );
  }
}
