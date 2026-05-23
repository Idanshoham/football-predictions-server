---
name: add-endpoint
description: Add a new HTTP endpoint to the football-predictions-server. Covers controller + service + repository + DTO + validation + auth guard + lock checks. Use whenever extending the API.
---

# add-endpoint

Use this skill whenever you add a new endpoint to the NestJS backend. It exists to prevent the "I forgot the auth guard / lock check / DTO validation" class of bug — and to enforce the controller → service → repository layering everywhere.

## When to use

- Adding a new route under any existing module (`matches`, `predictions`, `tournament`, `leaderboard`, `teams`, `players`, `internal`).
- Adding a brand-new feature module.
- Refactoring an existing endpoint that's missing a check or talks to Prisma directly.

## The three layers — never skip one

```
controller → service → repository → PrismaService
```

- **Controller**: HTTP only. Routes, guards, `@CurrentUser`, DTO binding. No business logic.
- **Service**: business rules — lock checks, roster validation, visibility, orchestration across repos.
- **Repository**: the ONLY layer that touches `PrismaService`. Narrow `select`/`include`. No domain exceptions.

If your new code injects `PrismaService` outside a `*.repository.ts` file, stop and re-route through a repository method.

## Procedure

### 1. Pick or create the module

If the endpoint belongs to an existing concept, put it in that module. Otherwise create a new module under `src/<name>/` with **four** files:

```
src/<name>/<name>.module.ts
src/<name>/<name>.controller.ts
src/<name>/<name>.service.ts
src/<name>/<name>.repository.ts
```

Add the module to `src/app.module.ts` `imports`. Forgetting this is the most common "endpoint returns 404 even though I wrote it" cause.

### 2. Repository first

Write the repository before the service. Keep methods narrow and typed:

```ts
@Injectable()
export class FoosRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Foo | null> {
    return this.prisma.foo.findUnique({ where: { id } });
  }

  upsert(data: UpsertFooData): Promise<Foo> {
    return this.prisma.foo.upsert({ /* ... */ });
  }

  // Each query gets a named method. Avoid "give me a Prisma client" generics.
}
```

Conventions:
- One method per query shape. Don't expose `findMany({ where, include, select })` raw — wrap it.
- For cross-method projection: prefer multiple narrow methods (e.g. `findByIdMinimal` vs `findByIdWithRelations`) over a giant options bag.
- Repos can use transactions internally (`this.prisma.$transaction([…])`). Services shouldn't know about transactions.
- Never throw NestJS `HttpException` from a repo. Return null / throw a low-level error; the service translates.

### 3. Service next

Write the service second. It's pure logic + repository injections.

```ts
@Injectable()
export class FoosService {
  constructor(
    private readonly foos: FoosRepository,
    private readonly matches: MatchesRepository,   // cross-module dep
    private readonly players: PlayersRepository,   // cross-module dep
  ) {}

  async upsert(user: User, dto: UpsertFooDto): Promise<Foo> {
    const match = await this.matches.findById(dto.matchId);
    if (!match) throw new NotFoundException(/* … */);
    if (isKickoffPassed(match.kickoffAt)) throw new ForbiddenException(/* … */);
    // … all the business rules go here …
    return this.foos.upsert(/* … */);
  }
}
```

Cross-module repo deps require the providing module to export the repo AND the consuming module to import the providing module. See `predictions.module.ts` for the pattern.

### 4. Controller last

Thin shell:

```ts
@Controller('foos')
@UseGuards(SupabaseAuthGuard)
export class FoosController {
  constructor(private readonly foos: FoosService) {}

  @Post()
  upsert(@CurrentUser() user: User, @Body() body: UpsertFooDto) {
    return this.foos.upsert(user, body);
  }
}
```

`@UseGuards(SupabaseAuthGuard)` is **mandatory** at the class level unless this is an unauthenticated `/health` style endpoint.

### 5. DTO with class-validator (if accepting input)

Create `src/<module>/dto/<verb>-<noun>.dto.ts`:

```ts
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class FooBarDto {
  @IsString() matchId!: string;
  @IsInt() @Min(0) @Max(20) homeScorePred!: number;
  @IsOptional() @IsString() note?: string;
}
```

The global `ValidationPipe` enforces `whitelist: true, forbidNonWhitelisted: true` — unknown fields are rejected.

### 6. Sacred checks for prediction writes

If the endpoint creates or mutates a prediction, the service MUST include:

- **Kickoff lock** (per-match writes): `isKickoffPassed(match.kickoffAt)` → throw `ForbiddenException`. Use `src/lib/time.ts` — never inline `new Date()` arithmetic.
- **Tournament lock** (champion / golden boot / group): `await tournament.isLocked()` → throw `ForbiddenException`.
- **Bracket state** (bracket writes): `await tournament.getActiveBracketVersion()` throws if locked. Use the result as `version` on the upsert.
- **Roster membership** (first-scorer): `await players.findOnMatchRoster(playerId, homeTeamId, awayTeamId)`; if null, throw `BadRequestException`.
- **Tournament-team membership** (champion, group rankings): `await teams.findInTournament(teamId, tournamentId)`; if null, throw `BadRequestException`.

All these checks live in the **service**, not the repository.

### 7. Read endpoints: visibility

For any service method that returns OTHER USERS' predictions, group rankings, or bracket picks, enforce the strict visibility rule (see `PredictionsService.getForMatch`).

### 8. Wire the module

```ts
@Module({
  imports: [
    MatchesModule,                // because service injects MatchesRepository
    PlayersModule,                // because service injects PlayersRepository
  ],
  controllers: [FoosController],
  providers: [FoosService, FoosRepository],
  exports: [FoosService, FoosRepository], // export so other modules can inject your repo
})
export class FoosModule {}
```

Then add the new module to `src/app.module.ts` imports.

### 9. Test

Write a unit test for the service that mocks repositories (see `predictions.service.spec.ts` for the hand-rolled mock pattern). Cover at minimum:

- Each reject path (404, 403, 400).
- The happy path.
- Visibility branches if relevant.

```ts
const mocks = {
  foos: { upsert: jest.fn(), findById: jest.fn() } as unknown as jest.Mocked<FoosRepository>,
  matches: { findById: jest.fn() } as unknown as jest.Mocked<MatchesRepository>,
};
const service = new FoosService(mocks.foos, mocks.matches);
```

Run `npm test` before commit.

## Pitfalls

- **Injecting `PrismaService` in a service** — wrong. Add a repository method instead.
- **Writing the repository to call services back** — never. Repositories are leaves. Services orchestrate.
- **Forgetting to export the repository from the module** — other modules can't inject it.
- **Forgetting `@UseGuards(SupabaseAuthGuard)`** — endpoint is public.
- **Forgetting the lock check on writes** — strict server-time lock, no grace periods.
- **Using raw `new Date()` for the lock check** — use `isKickoffPassed`/`nowUtc` from `src/lib/time.ts`.
- **Returning Prisma rows directly with sensitive fields** (e.g. `supabaseUserId`, other users' email) — use `select` in the repository.
- **Forgetting `forwardRef` for cyclic module deps** — Teams ↔ Tournament, Players ↔ Tournament use it; new cycles need it too.

## Examples to copy from

- `src/predictions/predictions.controller.ts` + `service.ts` + `repository.ts` — the gold standard write path.
- `src/matches/matches.controller.ts` + `service.ts` + `repository.ts` — clean read pattern.
- `src/leaderboard/leaderboard.service.ts` — service that injects 5 repositories.
- `src/tournament/tournament-predictions.service.ts` — service that injects 5+ repositories with rich validation.

## When you finish

Run [[fair-play-review]] before opening a PR.
