---
name: fair-play-review
description: Pre-merge checklist that audits a diff against the nine locked architectural invariants of this project. Use before opening a PR or merging to main.
---

# fair-play-review

The nine invariants in `CLAUDE.md` are not preferences — they're locked decisions. A single accidental regression on any of them (admin endpoint slipped in, raw `new Date()` in a service, grace period added "just to be nice", `PrismaService` injected outside a repository) compromises either fairness or the layering discipline. This skill is the gating review.

## When to use

- Before opening any PR.
- After accepting AI-generated code in `src/scoring/`, `src/predictions/`, `src/auth/`, `src/integrations/`, or any `*.repository.ts`.
- After a manual edit that touches lock-state, visibility, or scoring.
- As part of [[add-endpoint]], [[add-scoring-rule]], or [[safe-schema-change]] completion.

## The nine invariants

1. **Backend is the only source of truth.**
2. **Strict time locks. No grace periods.**
3. **No in-app admin.**
4. **Failover, not reconciliation.**
5. **Visibility on predictions is strict.**
6. **First-scorer roster validation.**
7. **Scoring is pure and idempotent.**
8. **Multi-tournament schema, single-tournament code.**
9. **Repositories are the ONLY consumers of PrismaService.**

## Checklist

Run these greps. The expected result is **no surprising matches**.

### Invariant 1: no client-trusted business logic

```sh
# Are any controllers reading match state from the request body?
git diff main -- 'src/**/*.controller.ts' | grep -i 'body.*\(status\|kickoff\|score\)'
```

### Invariant 2: no grace periods or soft locks

```sh
git diff main | grep -iE '(grace|fuzz|soft.lock|leeway|tolerance|allow.*after|buffer.*minute)'
```

Lock checks should be `if (isKickoffPassed(kickoffAt)) throw …` — no math on `kickoffAt`.

### Invariant 3: no admin role / privileged endpoints

```sh
git diff main | grep -iE '(isAdmin|is_admin|adminRole|@Role|hasPermission)'
git diff main -- 'src/**/*.controller.ts' | grep -E '@(Post|Put|Patch|Delete)' | grep -iE '(admin|moderate)'
```

Only `/__rescore` and `/__email-reminders` in `src/internal/` are legal admin affordances.

### Invariant 4: failover, not reconciliation

```sh
git diff main -- 'src/integrations/**' | grep -iE '(consensus|vote|majority|merge.*provider|reconcil)'
```

### Invariant 5: visibility is strict

```sh
# New return paths that include other users' predictions
git diff main -- 'src/predictions/**' 'src/tournament/**' | grep -iE '(findMany|select)' | grep -i 'prediction'
```

Trace each new path: does the caller see other users' picks for a match whose `kickoffAt` is in the future? If yes, leak.

### Invariant 6: first-scorer roster validation

```sh
git diff main -- 'src/predictions/**' 'src/tournament/**' | grep -i 'firstScorerPlayerId'
```

Pattern: `await this.players.findOnMatchRoster(playerId, homeTeamId, awayTeamId)`. Any new write path setting `firstScorerPlayerId` without that check is a violation.

### Invariant 7: scoring is pure

```sh
# Pure scoring files should NEVER import a repository, service, or PrismaService
git diff main -- 'src/scoring/match-scoring.ts' 'src/scoring/tournament-scoring.ts' 'src/scoring/bracket-scoring.ts' | grep -E '(Repository|PrismaService|@Injectable|new Date|fetch\(|console)'
```

`RescoreService` IS injectable (impure orchestrator) but the rule files must stay pure.

Also, no business code should use raw `new Date()`:

```sh
git diff main -- 'src/**/*.ts' ':(exclude)src/lib/time.ts' ':(exclude)**/*.spec.ts' | grep 'new Date()'
```

### Invariant 8: multi-tournament safety

```sh
git diff main | grep -iE '(wc2026|world_cup|world cup|tournament.*=.*[\\'"])'
```

Hardcoded tournament IDs in queries are not allowed. Use `TournamentService.getActive()` or `TournamentRepository.findActive()`.

### Invariant 9: PrismaService confined to repositories

```sh
# PrismaService imports outside *.repository.ts
git diff main -- 'src/**/*.ts' ':(exclude)src/**/*.repository.ts' ':(exclude)src/prisma/**' | grep -E '(PrismaService|prisma\\.service)'
```

The only legal references to `PrismaService` outside the prisma module itself are in `*.repository.ts` files. If you see PrismaService injected into a `.service.ts`, `.controller.ts`, `.guard.ts`, `.cron.ts`, or any other file — it's a regression. Add a repository method instead.

Also: any new service should inject one or more repositories, not `PrismaService`:

```sh
git diff main -- 'src/**/*.service.ts' 'src/**/*.cron.ts' 'src/**/*.guard.ts' | grep -E 'constructor\\(' -A 5 | grep 'PrismaService'
```

### Cross-cutting: tests still pass

```sh
npm test
```

Scoring/lock/visibility/failover tests red = stop the line.

### Cross-cutting: no `--no-verify`

```sh
git log --oneline main..HEAD | head -20
git diff main | grep -iE '(no-verify|skip-ci|\\[ci skip\\])'
```

## Reading the results

The checklist is a **prompt to look**, not a verdict. When a grep matches:

1. Read the surrounding code.
2. Ask: does this actually violate the invariant, or is it a docs/comment/test fixture?
3. If it violates: fix it.
4. If it doesn't: move on.

After running every grep, the change is cleared. `npm test`, then commit.

## Pitfalls

- **Skipping this skill because "it's a small change."** Most invariant regressions look small — that's exactly when this skill is fastest.
- **Treating the greps as authoritative.** Read the diff manually too.
- **Running it after the PR is open.** Run before — saves a round-trip.

## When you finish

If the change passes: commit + push. Open PR with a body summarising which invariants you re-verified.

If it fails: fix the violation, re-run this skill, then PR.
