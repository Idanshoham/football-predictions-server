import {
  Controller,
  Get,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RescoreService } from '../scoring/rescore.service';
import { EmailRemindersCron } from '../jobs/email-reminders.cron';

/**
 * Operational endpoints, gated by a shared secret in the query string.
 * These are the only "admin" affordances in the system (the user explicitly
 * chose no admin UI; this is the recovery path from the runbook).
 *
 * Examples:
 *   curl "https://api.example.com/__rescore?secret=XXX"
 *   curl "https://api.example.com/__email-reminders?secret=XXX"
 */
@Controller()
export class InternalController {
  constructor(
    private readonly config: ConfigService,
    private readonly rescore: RescoreService,
    private readonly emailReminders: EmailRemindersCron,
  ) {}

  @Get('__rescore')
  async runRescore(@Query('secret') secret: string) {
    this.requireSecret(secret);
    return this.rescore.rescoreAll();
  }

  @Get('__email-reminders')
  async runEmailReminders(@Query('secret') secret: string) {
    this.requireSecret(secret);
    return this.emailReminders.runOnce();
  }

  private requireSecret(provided: string): void {
    const expected = this.config.get<string>('RESCORE_SECRET');
    if (!expected || !provided || provided !== expected) {
      throw new UnauthorizedException('invalid secret');
    }
  }
}
