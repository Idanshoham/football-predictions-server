# CLAUDE.md — football-predictions-server

NestJS backend for a private World Cup 2026 prediction platform. ~100 family/friends in Israel; Hebrew RTL UI on the client; everything server-side runs in `Asia/Jerusalem` mental model but DB stores UTC. Designed to be reusable for future tournaments (Euro 2028 etc.) without a rewrite — every domain row carries `tournament_id`.

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

## Architecture invariants — DO NOT VIOLATE

These are locked policy decisions, not preferences. Don't quietly relax them.

1. **Backend is the only source of truth.** Lock checks, point calculations, visibility rules all live here. Never trust client-supplied state about timing, ownership, or scoring.

2. **Strict time locks. No grace periods.** Predictions are rejected at `kickoff_at + 1ms`. Don't add fuzz, retries-on-late, or "soft lock" semantics. The clock is authoritative — `src/lib/time.ts` is the only place that handles time. Raw `Date` arithmetic in business code is forbidden.

3. **No in-app admin.** There is no `is_admin` flag, no admin UI, no role system. The only "admin" affordances are `/__rescore` and `/__email-reminders` in `src/internal/`. Recovery from data incidents is: SQL into Supabase Studio → curl `/__rescore`. Adding admin endpoints or a permissions system is out of scope.

4. **Failover, not reconciliation.** `src/integrations/failover.ts` tries Football-Data.org first; on timeout/throw, falls back to TheSportsDB. **Never mix sources within a single poll**, never run a consensus vote, never ask a human. Whichever provider returned is treated as truth. Same data for all users → fair.

5. **Visibility on predictions is strict.** `getForMatch()` reveals other users' picks only once `match.status !== scheduled` or `kickoffAt` has passed. Future predictions are never returned to other users.

6. **First-scorer roster validation.** A prediction's `firstScorerPlayerId` must belong to one of the match's two teams. The check is in `PredictionsService.upsert` — don't bypass it.

7. **Scoring is pure and idempotent.** `src/scoring/*` are pure functions over `(prediction, match)`. Re-running scoring against unchanged data must yield identical results. If you add a scoring concept, add tests in the same commit.

8. **Multi-tournament schema, single-tournament code.** Schema has `tournament_id` everywhere. Code hardcodes WC2026 specifics (12 groups → R32 entry, FIFA bracket pairings). Don't abstract group sizes or bracket shape prematurely; wait until a second tournament forces it.

---

## Codebase tour

```
prisma/
  schema.prisma            # tournament-aware schema; every domain row has tournament_id
  seed.ts                  # idempotent — re-runs safely
src/
  main.ts                  # ValidationPipe global; CORS on
  app.module.ts            # imports every feature module
  health/                  # /health for Render keepalive pings
  auth/                    # SupabaseAuthGuard + @CurrentUser() decorator
  matches/                 # GET /matches[?status=…], GET /matches/:id
  predictions/             # POST /predictions, GET /predictions/mine, GET /predictions/match/:id
  tournament/              # GET /tournament/active + all tournament-level prediction CRUD
  leaderboard/             # GET /leaderboard (5 batched queries, in-memory aggregation)
  teams/                   # GET /teams
  players/                 # GET /players
  scoring/                 # PURE — match/tournament/bracket scoring + rescore.service
  integrations/            # provider.interface + 2 adapters + ProviderFailover
  jobs/                    # LiveSyncCron + EmailRemindersCron + BrevoService
  internal/                # /__rescore + /__email-reminders (secret-gated)
  lib/time.ts              # the ONLY place that does time arithmetic
test/                      # follows src/ structure; *.spec.ts colocated with code
```

### Files that need extra care when editing

- **`src/scoring/match-scoring.ts`** — sacred. Read every line. Add tests for every change.
- **`src/scoring/tournament-scoring.ts`, `bracket-scoring.ts`, `rescore.service.ts`** — same.
- **`src/predictions/predictions.service.ts`** — sacred. Lock checks + roster validation.
- **`src/auth/supabase-auth.guard.ts`** — also sacred. It enforces sign-up closure at opener kickoff.
- **`src/integrations/failover.ts`** — don't add consensus voting. Failover only.
- **`src/lib/time.ts`** — extend here; never inline a `new Date()` somewhere else.

---

## Gotchas / non-obvious things

- **`postinstall: prisma generate`** is required because `@prisma/client` types come from the generated client. If TypeScript can't find Prisma types, run `npm run prisma:generate` first.
- **`finishedAt` is set by `LiveSyncCron` when `status` flips to `full_time`.** Other code can rely on `finishedAt` for "this match is truly done" semantics.
- **`apiIds` is a `Json` column** holding provider-keyed identifiers (e.g. `{ "football-data-org": "12345" }`). `LiveSyncCron` looks up `apiIds[providerUsed.replace(/-/g, '_')]` then falls back to `apiIds[providerUsed]`.
- **The active tournament is found by `TournamentService.getActive()`** — one row where `isActive = true`. Don't query `tournament` directly.
- **Bracket has two versions per user.** Version 1 = pre-tournament. Version 2 = post-group-stage edit window. `getMyBracket()` seeds v2 from v1 the first time the edit window opens; the controller returns the active version based on the state machine.
- **Group standings tiebreakers are points → goal-diff → goals-scored → team-id-alpha.** Head-to-head is intentionally NOT implemented — adding it requires real edge-case handling and the user accepted simpler semantics for v1.
- **Cron jobs serialize their own ticks via a `running` flag** so a slow live-sync can't pile up.

---

## When you finish a change

- Run `npm test` and make sure all green. Don't let scoring/lock/failover tests stay red.
- If you touched the schema, add a new migration; never edit a committed migration.
- Don't use `--no-verify` on commits. If a hook fails, fix the cause.
- Commit messages are descriptive; we use the `Co-Authored-By: Claude` trailer (see git log for the pattern).
