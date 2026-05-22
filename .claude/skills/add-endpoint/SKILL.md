---
name: add-endpoint
description: Add a new HTTP endpoint to the football-predictions-server. Covers controller + service + DTO + validation + auth guard + lock checks. Use whenever extending the API.
---

# add-endpoint

Use this skill whenever you add a new endpoint to the NestJS backend. It exists to prevent the "I forgot the auth guard / lock check / DTO validation" class of bug — every endpoint here either reads from or mutates a privileged resource and a missed guard is a security hole.

## When to use

- Adding a new route under any module (`matches`, `predictions`, `tournament`, `leaderboard`, `teams`, `players`, `internal`).
- Adding a brand-new feature module (e.g. `notifications`, `groups`, etc).
- Refactoring an existing endpoint that's missing a check.

## Procedure

### 1. Pick or create the module

If the endpoint belongs to an existing concept (e.g. another prediction operation), put it in that module. Otherwise create a new module under `src/<name>/` with three files:

```
src/<name>/<name>.module.ts
src/<name>/<name>.service.ts
src/<name>/<name>.controller.ts
```

Add the module to `src/app.module.ts` `imports`. Forgetting this is the most common "endpoint returns 404 even though I wrote it" cause.

### 2. Service first, controller last

Write the service first because it's pure logic + Prisma. The controller is a thin shell that decorates HTTP semantics on top.

Service responsibilities:
- All Prisma access.
- All business rules (lock checks, roster validation, visibility).
- All input validation that can't be expressed declaratively in the DTO.
- Throws `BadRequestException` / `NotFoundException` / `ForbiddenException` as appropriate.

Controller responsibilities:
- Route mapping (`@Get`, `@Post`, etc).
- `@UseGuards(SupabaseAuthGuard)` — **mandatory** unless this is an unauthenticated `/health` style endpoint.
- `@CurrentUser()` to pull the user off the request.
- DTO binding via `@Body()`.

### 3. DTO with class-validator (if accepting input)

Create `src/<module>/dto/<verb>-<noun>.dto.ts` with `class-validator` decorators. The global `ValidationPipe` (configured in `main.ts`) will enforce them:

```ts
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class FooBarDto {
  @IsString() matchId!: string;
  @IsInt() @Min(0) @Max(20) homeScorePred!: number;
  @IsOptional() @IsString() note?: string;
}
```

The pipe options in `main.ts` are `whitelist: true, forbidNonWhitelisted: true` — unknown fields are rejected. Don't add a fallback "accept anything" pipe.

### 4. Sacred checks for prediction writes

If the endpoint creates or mutates a prediction (per-match, group, bracket, tournament-level), you MUST include these checks in the service. Use the patterns from `PredictionsService.upsert`:

- **Kickoff lock** (per-match writes): `isKickoffPassed(match.kickoffAt)` → throw `ForbiddenException`. Use `src/lib/time.ts` — never inline `new Date()` arithmetic.
- **Tournament lock** (champion / golden boot / group): `await tournament.isLocked()` → throw `ForbiddenException`.
- **Bracket state** (bracket writes): `await tournament.getActiveBracketVersion()` — this throws if locked. Use the result as `version` on the upsert.
- **Roster membership** (first-scorer): query `player` filtered by `id` and `teamId IN (homeTeamId, awayTeamId)`; if not found, throw `BadRequestException`.
- **Tournament-team membership** (champion, group rankings): query `team` filtered by `tournamentId` and id; if not found, throw `BadRequestException`.

### 5. Read endpoints: visibility

For any endpoint that returns predictions, group rankings, or bracket picks for users OTHER than the caller, you must enforce the strict visibility rule:

- Other users' per-match predictions: only visible when the match is past kickoff (or status is live/halftime/full_time/postponed/cancelled). See `PredictionsService.getForMatch`.
- Other users' tournament-level / group / bracket predictions: only after the tournament has finished (or after the lock window passed). Default: don't expose them at all.

Always include only the necessary fields in the response. Never `select: *` other users' rows.

### 6. Wire the module

In `src/app.module.ts`:

```ts
import { FooModule } from './foo/foo.module';

@Module({
  imports: [
    // ... existing modules
    FooModule,
  ],
})
```

If the new module needs `TournamentService`, import `TournamentModule` (which re-exports it). Don't try to inject `TournamentService` without importing the module.

### 7. Test

Write a unit test for the service that mocks `PrismaService` (see `predictions.service.spec.ts` for the hand-rolled mock pattern — no `jest.mock` magic). Cover at minimum:

- Each reject path (404, 403, 400).
- The happy path.
- Visibility: behaviour before vs after kickoff if relevant.

Run `npm test` and confirm green before commit.

### 8. Manual smoke test (optional but recommended)

If you have a local Supabase running:

```sh
TOKEN=<your supabase access token>
curl -X POST http://localhost:3000/<route> \
  -H "authorization: bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"...":"..."}'
```

## Pitfalls

- **Forgetting `@UseGuards(SupabaseAuthGuard)`** → the endpoint is public. Every authenticated controller should have it at the class level. If you need an exception (rare), document it.
- **Forgetting the lock check on writes** → a user can submit a prediction after kickoff. Strict server-time lock, no grace periods.
- **Using raw `new Date()` for the lock check** → ESLint will not catch this in the server repo (no rule wired yet). Use `isKickoffPassed`/`nowUtc` from `src/lib/time.ts`.
- **Skipping the DTO + ValidationPipe** → garbage input reaches the service.
- **Returning Prisma rows directly with sensitive fields** (e.g. supabaseUserId, email of other users) → use `select` to narrow.
- **Not invalidating relevant data** in the frontend hook after a mutation → cache stays stale. (Handled in the client repo; mention in PR description if your server change affects what should be invalidated.)

## Examples to copy from

- `src/predictions/predictions.controller.ts` + `predictions.service.ts` — the gold standard write path with lock + roster validation.
- `src/matches/matches.controller.ts` — clean read endpoint with status filter.
- `src/leaderboard/leaderboard.service.ts` — batched-query aggregation pattern.

## When you finish

Run [[fair-play-review]] before opening a PR — it catches the kinds of mistakes this skill is designed to prevent.
