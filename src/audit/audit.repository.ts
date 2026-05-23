import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditEvent =
  | 'fetch_success'
  | 'fetch_failure'
  | 'fallback_used'
  | 'score_changed'
  | 'rescore_triggered';

@Injectable()
export class AuditRepository {
  private readonly logger = new Logger(AuditRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Audit writes are append-only and never block the calling code: a failed
   * write is logged but never thrown. Losing an audit row is better than
   * crashing a cron job mid-tick.
   */
  async record(event: AuditEvent, payload: unknown): Promise<void> {
    try {
      await this.prisma.dataAudit.create({
        data: { event, payloadJson: payload as Prisma.InputJsonValue },
      });
    } catch (e) {
      this.logger.error(
        `failed to write data_audit row (event=${event}): ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
