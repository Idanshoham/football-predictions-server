# football-predictions-server

Backend for a private football-tournament prediction platform. V1 targets **World Cup 2026** (Hebrew RTL, Israel timezone, ~100 family/friends users) but the schema and code are tournament-agnostic so future tournaments (Euro 2028, Copa América, etc.) can be added without a rewrite.

Companion frontend: [football-predictions-client](https://github.com/Idanshoham/football-predictions-client).

---

## Why this project exists

I wanted a private competition for World Cup 2026 with my family and friends. Every existing predictor app is either ad-laden, English-only, paid, or both. So I built one — with a hard constraint of **zero monthly cost** (free APIs, free DB, free hosting, free email) and a launch deadline of **June 4, 2026** (one week before the opener, so users have time to fill in their tournament-level predictions before the lock).

It's also a deliberate showcase of how much real software a single developer can ship in 3 weeks by treating AI agents (Claude Code via Conductor) as the primary implementer and themselves as the architect, reviewer, and accountability layer. The README, plan, scoring rules, and architectural decisions in this repo all came from a long, opinionated planning conversation; the code is a faithful translation of those decisions.

## Architectural decisions worth knowing about

- **Backend is the only source of truth.** The frontend never decides whether a prediction is locked, never computes points, never reveals other users' predictions before kickoff. Every rule is server-enforced.
- **No in-app admin.** There is no admin UI and no `is_admin` field. If something breaks, the recovery path is direct SQL into the DB (via Supabase Studio) followed by a call to a single, secret-gated `/__rescore` endpoint that recomputes all points from raw match data. Scoring is a pure, idempotent function of match state and predictions, so this works.
- **Failover, not reconciliation, for live data.** We pull from Football-Data.org as primary and TheSportsDB as fallback. Whichever returns is treated as truth. No multi-source consensus voting — everyone is scored against the same numbers, so it's fair even if the API is occasionally wrong.
- **Polling beats WebSockets for 100 users on a free dyno.** TanStack Query polls the backend every 30 seconds during live windows. Drops Socket.IO, Redis, and an entire class of cold-start / sticky-session bugs.
- **Multi-tournament schema, single-tournament code.** Every domain table has `tournament_id`; the codebase hardcodes WC2026 specifics (12 groups, R32 entry). Adding Euro 2028 later means new seed data and adjusted constants, not a schema migration.
- **Strict lock windows.** No grace periods. The server clock is the only clock. A prediction received at `kickoff_at + 1ms` is rejected.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language / runtime | TypeScript + Node | Stable, AI-friendly, broad ecosystem |
| Framework | NestJS | Module structure maps cleanly to the domain; well-trodden by AI tools |
| ORM / DB | Prisma + Postgres (Supabase) | Free tier, type-safe queries, easy migrations |
| Auth | Supabase Auth (Google provider) | Free, takes ~1 day off the build vs. rolling our own |
| Cron | `@nestjs/schedule` | No Redis/BullMQ needed at this scale |
| Live data | Football-Data.org (primary) + TheSportsDB (fallback) | Both free; failover wrapper handles outages |
| Email | Brevo (300/day, 9k/month free) | Generous free tier; SDK is sane |
| Hosting | Render Free | Only realistic free always-on Node host; keepalive ping via cron-job.org + UptimeRobot |
| Testing | Jest + fast-check (property-based) | Scoring functions are sacred — exhaustive coverage |
| Timezone | `date-fns-tz` | Single helper in `src/lib/time.ts`; ESLint forbids raw `Date` arithmetic in business code |

Total monthly run cost: **$0**.

## Scoring rules (locked)

### Per match (max 10 pts)
- **Exact score**: 5 pts (overrides partials)
- **Result correct** (W/D/L): 3 pts
- **Goal difference correct**: 1 pt
- **Home goals correct**: 1 pt (independent of away)
- **Away goals correct**: 1 pt (independent of home)
- **First scorer correct**: 5 pts (always additive; user picks from both teams' rosters)

### Per tournament
- **Champion correct**: 20 pts
- **Golden Boot correct**: 20 pts
- **Group rankings**: 5 pts per correctly placed team per group (12 × 4 = up to 240 pts)
- **Bracket**: 5 pts per correctly predicted match-winner across R32 → R16 → QF → SF → F + 3rd-place (up to 160 pts)

### Lock windows (server-enforced, Asia/Jerusalem)
- Per-match predictions: lock at `kickoff_at`
- Group rankings, Champion, Golden Boot, initial bracket: lock at opener kickoff
- Bracket has one re-edit window between end of group stage and R32 kickoff

## Project layout (planned)

```
prisma/
  schema.prisma          # tournament-aware schema
src/
  main.ts
  app.module.ts
  health/                # /health (for keepalive pings)
  auth/                  # Supabase JWT verification, user sync
  scoring/               # pure functions; the sacred directory
    match-scoring.ts     # calculateMatchPoints (PURE)
    tournament-scoring.ts
    bracket-scoring.ts
    rescore.service.ts   # recompute every user's points from raw data
  predictions/           # write path with lock + roster validation
  matches/               # read endpoints, filtering by status
  integrations/
    provider.interface.ts
    football-data-org.provider.ts
    the-sports-db.provider.ts
    failover.ts          # try primary -> fallback -> log + skip
  jobs/
    live-sync.cron.ts    # 30s during live window, 10min idle
    email-reminders.cron.ts
  internal/
    rescore.controller.ts # /__rescore?secret=XXX (only "admin" affordance)
  lib/
    time.ts              # formatIsraelTime, isKickoffPassed, etc.
test/
  scoring/               # fixture-based + property-based (fast-check)
```

## Status

**2026-05-22**: scaffolded. Health endpoint live. Schema drafted.

Next milestones:
- Prisma migration + Supabase project provisioned
- Supabase Auth Google flow integrated
- Match-scoring engine with full edge-case coverage
- Tournament-scoring engine
- Provider adapters + failover
- Live-sync cron + scoring re-trigger
- Email reminder cron (Brevo)

See the [full plan](https://github.com/Idanshoham/football-predictions-server/blob/main/docs/PLAN.md) (will be added) for the day-by-day roadmap.

## Local development

```sh
npm install
cp .env.example .env   # fill in Supabase, Brevo, API tokens
npm run prisma:generate
npm run prisma:migrate # creates tables in your Supabase DB
npm run start:dev
```

The server listens on `PORT` (default 3000). Hit `http://localhost:3000/health` to confirm.

## Skills this project exercises

- Domain modelling under real constraints (free tier, no admin, hard deadline)
- Pure-functional scoring logic + property-based testing as a safety net
- Async failover patterns between unreliable third-party APIs
- Strict server-enforced authorisation and lock semantics (no client trust)
- TypeScript end-to-end with Prisma's type-safety leveraged at the boundary
- Working effectively with AI agents: architecting the system in human conversation, then directing AI to implement against a sharp specification

## Engineering principles applied

1. **Backend is source of truth.** No business logic on the client.
2. **Pure functions for anything that scores points.** Idempotent and re-runnable.
3. **Failover, not consensus.** Simpler, free-tier compatible, still fair.
4. **No premature abstraction.** Multi-tournament *schema*, but single-tournament *code*. Add genericity when a second tournament forces it.
5. **Strict locks.** No grace periods, no "soft" deadlines. The clock is authoritative.
6. **Trust nothing the user sends.** Validate at every boundary, especially first-scorer roster membership.
7. **Re-scoring is a single command.** Recovery from any data-quality incident: SQL fix + curl one endpoint.

## License

MIT
