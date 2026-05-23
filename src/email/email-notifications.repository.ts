import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailNotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns userIds that have already received this type of notification for this match. */
  listRecipientsForMatch(matchId: string, type: string) {
    return this.prisma.emailNotification.findMany({
      where: { matchId, type },
      select: { userId: true },
    });
  }

  /**
   * Record that an email was sent. The unique constraint (userId, matchId,
   * type) protects against a duplicate even if two ticks race; we swallow
   * conflict errors so the cron stays robust.
   */
  async record(userId: string, matchId: string, type: string): Promise<void> {
    try {
      await this.prisma.emailNotification.create({
        data: { userId, matchId, type },
      });
    } catch {
      // Unique constraint race — safe to ignore.
    }
  }
}
