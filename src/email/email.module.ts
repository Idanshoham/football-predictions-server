import { Module } from '@nestjs/common';
import { BrevoService } from './brevo.service';
import { EmailNotificationsRepository } from './email-notifications.repository';

@Module({
  providers: [BrevoService, EmailNotificationsRepository],
  exports: [BrevoService, EmailNotificationsRepository],
})
export class EmailModule {}
