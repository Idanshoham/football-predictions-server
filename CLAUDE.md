# CLAUDE.md — football-predictions-server

NestJS backend for a private World Cup 2026 prediction platform. ~100 family/friends in Israel; Hebrew RTL UI on the client; server-side runs in `Asia/Jerusalem` mental model but DB stores UTC. Designed to be reusable for future tournaments (Euro 2028 etc.) without a rewrite — every domain row carries `tournament_id`.

The companion frontend repo is **football-predictions-client**.

---

## How to run

```sh
npm install                # postinstall runs `prisma generate`
cp .env.example .env       # fill in Supabase, Brevo, Football-Data.org, RESCORE_SECRET
npm run prisma:migrate     # migrate Supabase schema
npm run seed               # idempotent seed (1 tournament + 8 teams + 3 fixtures)
npm run start:dev          # nest watch mode on :3000

npm test                   # all unit + integration tests
npm run build              # prisma generate && nest build
```

Operational endpoints (gated by `RESCORE_SECRET`):
- `GET /__rescore?secret=…` — recompute every user's points from raw DB state
- `GET /__email-reminders?secret=…` — manually trigger the reminder cron

---

## Layering: controller → service → repository

Every feature module follows this three-layer split. **There are no shortcuts.** A direct `PrismaService` injection outside a `*.repository.ts` file is a regression.

```
src/<feature>/
  <feature>.module.ts           # wires deps + exports the repository for cross-module use
  <feature>.controller.ts       # HTTP shell — routes, guards, DTO binding
  <feature>.service.ts          # business logic — locks, validation, visibility
  <feature>.repository.ts       # the ONLY layer that touches PrismaService
```

Responsibilities:

| Layer | Owns | Does NOT |
|---|---|---|
| Controller | HTTP route, status codes, DTO binding, `@UseGuards`, `@CurrentUser` | Business logic, DB access |
| Service | Lock checks, roster validation, visibility rules, orchestration | HTTP concerns, raw Prisma queries |
| Repository | Prisma operations, narrow projection (`select`/`include`), transactions | Business rules, throwing domain exceptions |

Services compose: a service can inject multiple repositories — its own AND repositories from other modules (e.g. `PredictionsService` injects `PredictionsRepository`, `MatchesRepository`, `PlayersRepository`). Modules export their repositories so consumers can import them.

Some modules also have multiple repositories for related but distinct aggregates. Example: `TournamentModule` has `TournamentRepository`, `TournamentPredictionsRepository`, `GroupPredictionsRepository`, `BracketPredictionsRepository` — one per primary table.

---

## Architecture invariants — DO NOT VIOLATE

These are locked policy decisions, not preferences. Don't quietly relax them.

1. **Backend is the only source of truth.** Lock checks, point calculations, visibility rules all live here. Never trust client-supplied state about timing, ownership, or scoring.

2. **Strict time locks. No grace periods.** Predictions are rejected at `kickoff_at + 1ms`. Don't add fuzz, retries-on-late, or "soft lock" semantics. The clock is authoritative — `src/lib/time.ts` is the only place that handles time. Raw `Date` arithmetic in business code is forbidden.

3. **No in-app admin.** There is no `is_admin` flag, no admin UI, no role system. The only "admin" affordances are `/__rescore` and `/__email-reminders` in `src/internal/`. Recovery from data incidents is: SQL into Supabase Studio → curl `/__rescore`.

4. **Failover, not reconciliation.** `src/integrations/failover.ts` tries Football-Data.org first; on timeout/throw, falls back to TheSportsDB. **Never mix sources within a single poll**, never run a consensus vote, never ask a human. Whichever provider returned is treated as truth.

5. **Visibility on predictions is strict.** `getForMatch()` reveals other users' picks only once `match.status !== scheduled` or `kickoffAt` has passed. Future predictions are never returned to other users.

6. **First-scorer roster validation.** A prediction's `firstScorerPlayerId` must belong to one of the match's two teams. The check is in `PredictionsService.upsert` via `PlayersRepository.findOnMatchRoster()` — don't bypass it.

7. **Scoring is pure and idempotent.** `src/scoring/match-scoring.ts`, `tournament-scoring.ts`, and `bracket-scoring.ts` are pure functions. Re-running scoring against unchanged data yields identical results. `RescoreService` is the impure orchestrator — it injects repositories.

8. **Multi-tournament schema, single-tournament code.** Schema has `tournament_id` everywhere. Code hardcodes WC2026 specifics. Don't abstract group sizes or bracket shape prematurely.

9. **Repositories are the ONLY consumers of PrismaService.** Services and guards never inject `PrismaService`. They inject one or more repositories.

---

## Codebase tour

```
prisma/
  schema.prisma                                  # tournament-aware schema
  seed.ts                                        # idempotent
src/
  main.ts                                        # ValidationPipe global; CORS on
  app.module.ts                                  # imports every feature module
  prisma/
    prisma.service.ts                            # the only PrismaClient
    prisma.module.ts                             # @Global()
  health/health.controller.ts                    # /health for Render keepalive
  auth/                                          # @Global() module
    supabase-auth.guard.ts                       # injects UsersService
    current-user.decorator.ts
    auth.module.ts
  users/
    users.repository.ts                          # User CRUD
    users.service.ts                             # find-or-create + signup-lock policy
    users.module.ts
  audit/
    audit.repository.ts                          # data_audit append-only writes
    audit.module.ts
  email/
    brevo.service.ts                             # Brevo transactional SMTP
    email-notifications.repository.ts            # email_notifications CRUD
    email.module.ts
  matches/
    matches.controller.ts                        # GET /matches[?status=], GET /matches/:id
    matches.service.ts
    matches.repository.ts
    matches.module.ts
  predictions/
    predictions.controller.ts                    # POST + 2× GET endpoints
    predictions.service.ts                       # injects predictions/matches/players repos
    predictions.repository.ts
    predictions.module.ts
    dto/upsert-prediction.dto.ts
  tournament/
    tournament.controller.ts                     # GET /active + all tournament-level CRUD
    tournament.service.ts                        # injects tournament + matches repos
    tournament-predictions.service.ts            # injects 5+ repos
    tournament.repository.ts                     # tournaments table
    tournament-predictions.repository.ts         # tournament_predictions (champion + GB)
    group-predictions.repository.ts              # group_predictions
    bracket-predictions.repository.ts            # bracket_predictions (versions 1 + 2)
    tournament.module.ts
    dto/upsert-tournament.dto.ts
  leaderboard/
    leaderboard.controller.ts                    # GET /leaderboard
    leaderboard.service.ts                       # injects 5 repositories
    leaderboard.module.ts
  teams/
    teams.controller.ts                          # GET /teams
    teams.service.ts
    teams.repository.ts
    teams.module.ts
  players/
    players.controller.ts                        # GET /players
    players.service.ts
    players.repository.ts
    players.module.ts
  scoring/                                       # PURE functions + impure orchestrator
    match-scoring.ts                             # calculateMatchPoints (PURE)
    tournament-scoring.ts                        # champion/GB/groups (PURE)
    bracket-scoring.ts                           # bracket + allBracketSlots (PURE)
    rescore.service.ts                           # impure orchestrator: injects 6+ repos
    scoring.module.ts
    types.ts
  integrations/
    provider.interface.ts
    football-data-org.provider.ts
    the-sports-db.provider.ts
    failover.ts                                  # injects AuditRepository
    integrations.module.ts
  jobs/
    live-sync.cron.ts                            # injects repos + ProviderFailover + RescoreService
    email-reminders.cron.ts                      # injects repos + BrevoService
    jobs.module.ts
  internal/
    internal.controller.ts                       # /__rescore + /__email-reminders
    internal.module.ts
  lib/time.ts                                    # the ONLY place that does time arithmetic
test/                                            # *.spec.ts colocated with code
```

### Files that need extra care when editing

- **`src/scoring/match-scoring.ts`** — sacred. Read every line. Add tests for every change.
- **`src/scoring/tournament-scoring.ts`, `bracket-scoring.ts`, `rescore.service.ts`** — same.
- **`src/predictions/predictions.service.ts`** — sacred. Lock checks + roster validation.
- **`src/users/users.service.ts`** — enforces sign-up closure at opener kickoff.
- **`src/integrations/failover.ts`** — don't add consensus voting. Failover only.
- **`src/lib/time.ts`** — extend here; never inline a `new Date()` somewhere else.
- **Every `*.repository.ts`** — narrow projection only (`select` / `include`). No business logic; no validation; no time checks.

---

## Module dependency map (read this before adding cross-module deps)

```
AppModule
├── ConfigModule, ScheduleModule
├── PrismaModule           (global)
├── AuthModule             (global) → UsersModule → TournamentModule → MatchesModule
├── AuditModule
├── EmailModule            (BrevoService + EmailNotificationsRepository)
├── UsersModule            → TournamentModule
├── MatchesModule
├── TeamsModule            → forwardRef(TournamentModule)
├── PlayersModule          → forwardRef(TournamentModule)
├── TournamentModule       → MatchesModule + forwardRef(TeamsModule) + forwardRef(PlayersModule)
├── PredictionsModule      → MatchesModule + PlayersModule
├── LeaderboardModule      → UsersModule + PredictionsModule + TournamentModule
├── IntegrationsModule     → AuditModule
├── ScoringModule          → MatchesModule + PredictionsModule + TournamentModule + AuditModule
├── JobsModule             → Tournament + Matches + Users + Predictions + Email + Audit + Integrations + Scoring
└── InternalModule
```

`forwardRef` is used for the Teams ↔ Tournament and Players ↔ Tournament cycles (mutual deps at module load; runtime wiring is fine).

---

## Gotchas / non-obvious things

- **`postinstall: prisma generate`** is required because `@prisma/client` types come from the generated client. If TypeScript can't find Prisma types, run `npm run prisma:generate`.
- **`AuthModule` is `@Global()`** so any controller can `@UseGuards(SupabaseAuthGuard)` without importing AuthModule itself.
- **`PrismaService` is injected only by repository classes.** Grep `injects PrismaService` outside `*.repository.ts` and you should find nothing. This is enforced by code review (see [[fair-play-review]] skill).
- **`apiIds` is a `Json` column** holding provider-keyed identifiers. `LiveSyncCron` looks up `apiIds[providerUsed.replace(/-/g, '_')]` then falls back to `apiIds[providerUsed]`.
- **The active tournament is found via `TournamentRepository.findActive()`** (wrapped by `TournamentService.getActive()` which throws if missing).
- **Bracket has two versions per user.** Version 1 = pre-tournament. Version 2 = post-group-stage edit. `BracketPredictionsRepository.seedV2FromV1` runs once when the edit window opens.
- **Group standings tiebreakers are points → goal-diff → goals-scored → team-id-alpha.** Head-to-head is intentionally NOT implemented.
- **Cron jobs serialize their own ticks via a `running` flag** so a slow live-sync can't pile up.
- **Audit writes never throw** — `AuditRepository.record` swallows DB errors. Losing an audit row is better than crashing a cron mid-tick.

---

## When you finish a change

- Run `npm test` — all green or roll back.
- If you touched the schema, follow [[safe-schema-change]] and never edit a committed migration.
- If you added an endpoint, run [[add-endpoint]] checklist + [[fair-play-review]].
- If you touched scoring, run [[add-scoring-rule]].
- Don't use `--no-verify` on commits.
- Commit messages descriptive; we use the `Co-Authored-By: Claude` trailer (see git log).
