import { Module } from '@nestjs/common';
import { LiveSyncCron } from './live-sync.cron';
import { EmailRemindersCron } from './email-reminders.cron';
import { TournamentModule } from '../tournament/tournament.module';
import { MatchesModule } from '../matches/matches.module';
import { UsersModule } from '../users/users.module';
import { PredictionsModule } from '../predictions/predictions.module';
import { EmailModule } from '../email/email.module';
import { AuditModule } from '../audit/audit.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [
    TournamentModule,
    MatchesModule,
    UsersModule,
    PredictionsModule,
    EmailModule,
    AuditModule,
    IntegrationsModule,
    ScoringModule,
  ],
  providers: [LiveSyncCron, EmailRemindersCron],
  exports: [LiveSyncCron, EmailRemindersCron],
})
export class JobsModule {}
