import { Injectable } from '@nestjs/common';
import { Tournament } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TournamentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Single active tournament — the application is single-tournament at a time. */
  findActive(): Promise<Tournament | null> {
    return this.prisma.tournament.findFirst({
      where: { isActive: true },
      orderBy: { openerKickoffAt: 'asc' },
    });
  }
}
