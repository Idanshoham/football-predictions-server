import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FootballDataOrgProvider } from './football-data-org.provider';
import { TheSportsDbProvider } from './the-sports-db.provider';
import type { FootballDataProvider, MatchSnapshot } from './provider.interface';

export const PROVIDER_TIMEOUT_MS = 5000;

export interface FailoverResult<T> {
  ok: true;
  value: T;
  providerUsed: string;
  fallbackUsed: boolean;
}

export interface FailoverFailure {
  ok: false;
  errors: { provider: string; message: string }[];
}

/**
 * Try the primary provider first. On timeout/throw, fall back to the secondary.
 * If both fail, returns ok=false and writes a `data_audit` log entry.
 *
 * No consensus voting — failover only. This matches the locked "fair play"
 * decision: everyone is scored against the same source per poll.
 */
@Injectable()
export class ProviderFailover {
  private readonly logger = new Logger(ProviderFailover.name);
  private readonly providers: FootballDataProvider[];

  constructor(
    private readonly prisma: PrismaService,
    primary: FootballDataOrgProvider,
    secondary: TheSportsDbProvider,
  ) {
    this.providers = [primary, secondary].sort((a, b) => a.trustRank - b.trustRank);
  }

  async getLiveMatches(
    tournamentSlug: string,
  ): Promise<FailoverResult<MatchSnapshot[]> | FailoverFailure> {
    return this.tryEach((p) => p.getLiveMatches(tournamentSlug), 'getLiveMatches');
  }

  async getMatch(
    apiMatchId: string,
  ): Promise<FailoverResult<MatchSnapshot | null> | FailoverFailure> {
    return this.tryEach((p) => p.getMatch(apiMatchId), `getMatch:${apiMatchId}`);
  }

  private async tryEach<T>(
    fn: (provider: FootballDataProvider) => Promise<T>,
    op: string,
  ): Promise<FailoverResult<T> | FailoverFailure> {
    const errors: { provider: string; message: string }[] = [];

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      try {
        const value = await withTimeout(fn(provider), PROVIDER_TIMEOUT_MS);
        const fallbackUsed = i > 0;
        if (fallbackUsed) {
          this.logger.warn(
            `[${op}] primary failed; using fallback "${provider.name}"`,
          );
        }
        await this.audit(fallbackUsed ? 'fallback_used' : 'fetch_success', {
          op,
          provider: provider.name,
          previousErrors: errors,
        });
        return { ok: true, value, providerUsed: provider.name, fallbackUsed };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({ provider: provider.name, message });
        this.logger.warn(`[${op}] provider "${provider.name}" failed: ${message}`);
      }
    }

    await this.audit('fetch_failure', { op, errors });
    return { ok: false, errors };
  }

  private async audit(
    event: 'fetch_success' | 'fetch_failure' | 'fallback_used',
    payload: unknown,
  ): Promise<void> {
    try {
      await this.prisma.dataAudit.create({
        data: { event, payloadJson: payload as object },
      });
    } catch (e) {
      // Audit write failure should never propagate.
      this.logger.error(
        `failed to write data_audit row: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}
