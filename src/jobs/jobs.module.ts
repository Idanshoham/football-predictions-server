import { Module } from '@nestjs/common';
import { LiveSyncCron } from './live-sync.cron';
import { EmailRemindersCron } from './email-reminders.cron';
import { BrevoService } from '../email/brevo.service';

@Module({
  providers: [LiveSyncCron, EmailRemindersCron, BrevoService],
  exports: [LiveSyncCron, EmailRemindersCron, BrevoService],
})
export class JobsModule {}
