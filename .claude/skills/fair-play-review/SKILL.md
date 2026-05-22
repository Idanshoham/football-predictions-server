---
name: fair-play-review
description: Pre-merge checklist that audits a diff against the eight locked architectural invariants of this project. Use before opening a PR or merging to main.
---

# fair-play-review

The eight invariants in `CLAUDE.md` are not preferences — they're locked decisions that downstream code depends on. A single accidental regression on any of them (admin endpoint slipped in, raw `new Date()` in a service, grace period added "just to be nice") can compromise fairness for ~100 users with no admin escape hatch.

This skill is the gating review.

## When to use

- Before opening any PR.
- After accepting AI-generated code in `src/scoring/`, `src/predictions/`, `src/auth/`, or `src/integrations/`.
- After a manual edit that touches lock-state, visibility, or scoring.
- As part of [[add-endpoint]], [[add-scoring-rule]], or [[safe-schema-change]] completion.

## The eight invariants

1. **Backend is the only source of truth.** No business logic survives a client tampering with its requests.
2. **Strict time locks. No grace periods.** Predictions rejected at `kickoff_at + 1ms`.
3. **No in-app admin.** No role/permission system. Recovery is SQL + `/__rescore`.
4. **Failover, not reconciliation.** Try primary → fall back → never mix or vote.
5. **Visibility on predictions is strict.** Other users' picks only after kickoff.
6. **First-scorer roster validation.** Player must be on one of the match's two teams.
7. **Scoring is pure and idempotent.** No DB, no time, no mutation.
8. **Multi-tournament schema, single-tournament code.** Schema has `tournament_id`; code hardcodes WC2026 specifics until a second tournament is real.

## Checklist

Run these greps before declaring a change ready. The expected result for each is **no surprising matches** — if you see something that looks new or wrong, investigate.

### Invariant 1: no client-trusted business logic

```sh
# Are any controllers reading match state from the request body?
git diff main -- 'src/*.controller.ts' | grep -i 'body.*\(status\|kickoff\|score\|matchStatus\)'
```

If a controller body has a `status` or `kickoff` field, that's almost certainly wrong — the client shouldn't be telling the server those values.

### Invariant 2: no grace periods or soft locks

```sh
# Hunt for terms that signal "fuzzy lock"
git diff main | grep -iE '(grace|fuzz|soft.lock|leeway|tolerance|slack|buffer.*minute|allow.*after)'
```

Lock checks should be `if (isKickoffPassed(kickoffAt)) throw ...` — no math on `kickoffAt`.

### Invariant 3: no admin role / privileged endpoints

```sh
# No is_admin / role / admin endpoints should be added
git diff main | grep -iE '(isAdmin|is_admin|adminRole|@Role|role:|hasPermission)'
git diff main -- 'src/**/*.controller.ts' | grep -E '@(Post|Put|Patch|Delete)' | grep -iE '(admin|moderate)'
```

The only legal "admin" affordances are `/__rescore` and `/__email-reminders` in `src/internal/`. Anything else is a violation.

### Invariant 4: failover, not reconciliation

```sh
# No consensus, voting, or merging between providers
git diff main -- 'src/integrations/**' | grep -iE '(consensus|vote|majority|merge.*provider|reconcil)'
```

The contract: `ProviderFailover.getLiveMatches()` tries primary, falls back on throw/timeout, logs to `data_audit`. Never combines values from two sources within one poll.

### Invariant 5: visibility is strict

```sh
# Find any new endpoint or service method that returns predictions
git diff main -- 'src/predictions/**' | grep -iE '(findMany|select)' | grep -i 'prediction'
```

For any new return path, mentally trace: does the caller see other users' picks for a match whose `kickoffAt` is in the future? If yes, that's a leak.

### Invariant 6: first-scorer roster validation

```sh
# Any prediction write that touches firstScorerPlayerId must validate it
git diff main -- 'src/predictions/**' 'src/tournament/**' | grep -i 'firstScorerPlayerId'
```

The pattern is `prisma.player.findFirst({ where: { id, teamId: { in: [home, away] } } })`. If you see a write path setting `firstScorerPlayerId` without that check upstream, fix it.

### Invariant 7: scoring is pure

```sh
# Scoring files should never import PrismaService or use new Date
git diff main -- 'src/scoring/match-scoring.ts' 'src/scoring/tournament-scoring.ts' 'src/scoring/bracket-scoring.ts' | grep -E '(PrismaService|@Injectable|new Date|fetch\(|console)'
```

The scoring trio is pure. `RescoreService` IS injectable (it does DB work) but the rules it calls into must remain pure.

Also, no business code should use raw `new Date()`:
```sh
git diff main -- 'src/**/*.ts' ':(exclude)src/lib/time.ts' ':(exclude)**/*.spec.ts' | grep 'new Date()'
```

The only legal `new Date()` in business code lives in `src/lib/time.ts`. Tests can use `new Date(...)` freely.

### Invariant 8: multi-tournament safety

```sh
# Look for any newly hardcoded tournament identifier
git diff main | grep -iE '(wc2026|world_cup|world cup|tournament.*=.*[\\'"])' 
```

Some hardcoding is fine in code (the FIFA bracket pairings, the group count). Hardcoding in DB queries is not — every query should derive `tournamentId` from `TournamentService.getActive()` or be passed it explicitly.

### Cross-cutting: tests still pass

```sh
npm test
```

If scoring/lock/visibility/failover tests are red, this is a stop-the-line situation.

### Cross-cutting: no `--no-verify`

```sh
git log --oneline main..HEAD | head -20
git log main..HEAD --format='%H %s' --all | xargs -I{} git show --no-patch --format='%H %ce %ae' {}
```

If you've used `--no-verify` to bypass hooks, the change is not ready. Investigate the underlying failure.

### Cross-cutting: no `--no-verify` mentions in diff either

```sh
git diff main | grep -iE '(no-verify|skip-ci|\\[ci skip\\])'
```

## Reading the results

The checklist is a **prompt to look**, not a verdict. False positives happen — the grep for "admin" could match a legitimate comment like "no admin role here". When you see a match:

1. Read the surrounding code.
2. Ask: does this actually violate the invariant, or is it docs / a comment / a test fixture?
3. If it violates: fix it.
4. If it doesn't: move on.

After running every grep, the change is cleared. Now run `npm test` one more time, then commit.

## Pitfalls

- **Skipping this skill because "it's a small change."** Most invariant regressions look like small changes ("just adding a flag", "just exposing one more field"). The skill is fastest exactly when the change is small.
- **Treating the greps as authoritative.** They're heuristic. Read the diff manually too.
- **Running it after the PR is open.** Better to run before — saves a round-trip.

## When you finish

If the change passes:
- Commit + push.
- Open PR with a body that summarizes which invariants you re-verified.

If the change fails:
- Fix the violation.
- Re-run this skill.
- Don't open the PR yet.
