import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TournamentRepository } from '../tournament/tournament.repository';
import { MatchesRepository } from '../matches/matches.repository';
import { UsersRepository } from '../users/users.repository';
import { PredictionsRepository } from '../predictions/predictions.repository';
import { EmailNotificationsRepository } from '../email/email-notifications.repository';
import { BrevoService } from '../email/brevo.service';
import { formatIsraelTime, isWithinReminderWindow } from '../lib/time';

const NOTIFICATION_TYPE = 'pre_match_2h';

@Injectable()
export class EmailRemindersCron {
  private readonly logger = new Logger(EmailRemindersCron.name);
  private running = false;

  constructor(
    private readonly tournaments: TournamentRepository,
    private readonly matches: MatchesRepository,
    private readonly users: UsersRepository,
    private readonly predictions: PredictionsRepository,
    private readonly notifications: EmailNotificationsRepository,
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

    const tournament = await this.tournaments.findActive();
    if (!tournament) return result;

    const candidates = await this.matches.listScheduled(tournament.id);
    const due = candidates.filter((m) => isWithinReminderWindow(m.kickoffAt));
    if (due.length === 0) return result;

    const users = await this.users.listAllForReminders();

    for (const match of due) {
      const existingPredictions = await this.predictions.listMissingPredictions(match.id);
      const haveSent = await this.notifications.listRecipientsForMatch(
        match.id,
        NOTIFICATION_TYPE,
      );
      const predicted = new Set(existingPredictions.map((p) => p.userId));
      const alreadyNotified = new Set(haveSent.map((p) => p.userId));

      const targets = users.filter(
        (u) => !predicted.has(u.id) && !alreadyNotified.has(u.id),
      );

      for (const user of targets) {
        const kickoff = formatIsraelTime(match.kickoffAt, 'HH:mm');
        const date = formatIsraelTime(match.kickoffAt, 'dd/MM');
        const subject = `${match.homeTeam.nameHe} מול ${match.awayTeam.nameHe} בעוד שעתיים`;
        const text = `שלום ${user.name},\n\nהמשחק ${match.homeTeam.nameHe} - ${match.awayTeam.nameHe} מתחיל היום (${date}) בשעה ${kickoff} (שעון ישראל).\n\nעוד לא שלחת תחזית.\n\nלהגיש תחזית: ${this.publicAppUrl()}\n\nבהצלחה,\nמונדיאל 2026`;

        const sent = await this.brevo.send({
          to: { email: user.email, name: user.name },
          subject,
          textContent: text,
        });

        if (sent.ok) {
          await this.notifications.record(user.id, match.id, NOTIFICATION_TYPE);
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
