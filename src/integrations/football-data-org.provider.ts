import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus } from '@prisma/client';
import type { FootballDataProvider, MatchSnapshot, ScorerEvent } from './provider.interface';

// Maps football-data.org status strings → our MatchStatus enum.
const STATUS_MAP: Record<string, MatchStatus> = {
  SCHEDULED: MatchStatus.scheduled,
  TIMED: MatchStatus.scheduled,
  IN_PLAY: MatchStatus.live,
  PAUSED: MatchStatus.halftime,
  FINISHED: MatchStatus.full_time,
  SUSPENDED: MatchStatus.postponed,
  POSTPONED: MatchStatus.postponed,
  CANCELLED: MatchStatus.cancelled,
};

interface FdMatch {
  id: number;
  status: string;
  utcDate: string;
  homeTeam: { id: number };
  awayTeam: { id: number };
  score: {
    fullTime?: { home: number | null; away: number | null };
    halfTime?: { home: number | null; away: number | null };
  };
  goals?: Array<{
    minute: number | null;
    scorer: { id: number };
    team: { id: number };
  }>;
}

@Injectable()
export class FootballDataOrgProvider implements FootballDataProvider {
  readonly name = 'football-data-org';
  readonly trustRank = 1;
  private readonly logger = new Logger(FootballDataOrgProvider.name);
  private readonly baseUrl = 'https://api.football-data.org/v4';

  constructor(private readonly config: ConfigService) {}

  async getLiveMatches(tournamentSlug: string): Promise<MatchSnapshot[]> {
    // Map our slug ("wc2026") → football-data competition code ("WC").
    // For now we only support WC; Euro will be added when needed.
    const competitionCode = tournamentSlug === 'wc2026' ? 'WC' : tournamentSlug.toUpperCase();
    const url = `${this.baseUrl}/competitions/${competitionCode}/matches?status=IN_PLAY,PAUSED`;
    const res = await this.fetch(url);
    if (!res.ok) {
      throw new Error(`football-data.org: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { matches?: FdMatch[] };
    return (data.matches ?? []).map(toSnapshot);
  }

  async getMatch(apiMatchId: string): Promise<MatchSnapshot | null> {
    const url = `${this.baseUrl}/matches/${apiMatchId}`;
    const res = await this.fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`football-data.org: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as FdMatch;
    return toSnapshot(data);
  }

  private fetch(url: string): Promise<Response> {
    const token = this.config.get<string>('FOOTBALL_DATA_ORG_TOKEN');
    if (!token) throw new Error('FOOTBALL_DATA_ORG_TOKEN not set');
    return fetch(url, { headers: { 'X-Auth-Token': token } });
  }
}

function toSnapshot(m: FdMatch): MatchSnapshot {
  const status = STATUS_MAP[m.status] ?? MatchStatus.scheduled;
  const home = m.score.fullTime?.home ?? m.score.halfTime?.home ?? null;
  const away = m.score.fullTime?.away ?? m.score.halfTime?.away ?? null;
  const scorers: ScorerEvent[] = (m.goals ?? [])
    .filter((g) => g.minute !== null)
    .map((g) => ({
      playerApiId: String(g.scorer.id),
      team: g.team.id === m.homeTeam.id ? 'home' : 'away',
      minute: g.minute!,
    }))
    .sort((a, b) => a.minute - b.minute);

  return {
    apiMatchId: String(m.id),
    status,
    homeScore: home,
    awayScore: away,
    scorers,
    firstScorerPlayerApiId: scorers[0]?.playerApiId ?? null,
    lastUpdated: new Date(),
  };
}
