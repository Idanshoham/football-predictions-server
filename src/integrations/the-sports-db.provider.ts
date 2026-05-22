import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus } from '@prisma/client';
import type { FootballDataProvider, MatchSnapshot } from './provider.interface';

const STATUS_MAP: Record<string, MatchStatus> = {
  'Not Started': MatchStatus.scheduled,
  '1H': MatchStatus.live,
  'Halftime': MatchStatus.halftime,
  '2H': MatchStatus.live,
  'Match Finished': MatchStatus.full_time,
  'Postponed': MatchStatus.postponed,
  'Cancelled': MatchStatus.cancelled,
};

interface TsdbEvent {
  idEvent: string;
  strStatus: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  dateEvent: string;
  strTime: string;
}

@Injectable()
export class TheSportsDbProvider implements FootballDataProvider {
  readonly name = 'the-sports-db';
  readonly trustRank = 2;
  private readonly logger = new Logger(TheSportsDbProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    const key = this.config.get<string>('THE_SPORTS_DB_KEY') ?? '3';
    return `https://www.thesportsdb.com/api/v1/json/${key}`;
  }

  async getLiveMatches(_tournamentSlug: string): Promise<MatchSnapshot[]> {
    // TheSportsDB doesn't have a strict "live" endpoint on the free key;
    // we query today's events and filter on the status string.
    const today = new Date().toISOString().slice(0, 10);
    const url = `${this.baseUrl}/eventsday.php?d=${today}&s=Soccer`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`thesportsdb: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { events?: TsdbEvent[] | null };
    return (data.events ?? [])
      .filter((e) => ['1H', '2H', 'Halftime'].includes(e.strStatus))
      .map(toSnapshot);
  }

  async getMatch(apiMatchId: string): Promise<MatchSnapshot | null> {
    const url = `${this.baseUrl}/lookupevent.php?id=${apiMatchId}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { events?: TsdbEvent[] | null };
    if (!data.events || data.events.length === 0) return null;
    return toSnapshot(data.events[0]);
  }
}

function toSnapshot(e: TsdbEvent): MatchSnapshot {
  return {
    apiMatchId: e.idEvent,
    status: STATUS_MAP[e.strStatus] ?? MatchStatus.scheduled,
    homeScore: e.intHomeScore !== null ? parseInt(e.intHomeScore, 10) : null,
    awayScore: e.intAwayScore !== null ? parseInt(e.intAwayScore, 10) : null,
    scorers: [], // TheSportsDB free tier doesn't expose detailed events reliably
    firstScorerPlayerApiId: null,
    lastUpdated: new Date(),
  };
}
