---
name: add-scoring-rule
description: Safely extend the scoring engine (match / tournament / bracket / group rankings) with full edge-case coverage and property-based invariants. Use when introducing or changing how points are awarded.
---

# add-scoring-rule

The scoring functions are the sacred core of this app — a bug means everyone gets wrong points and there's no admin escape hatch. This skill is the discipline for changing them safely.

## When to use

- Adding a new scoring component.
- Changing the points value of an existing rule.
- Changing a tiebreaker.
- Adding a new tournament-level award.

## Procedure

### 1. Find the right file

| Scope | File | Layer |
|---|---|---|
| Per-match (score + first scorer) | `src/scoring/match-scoring.ts` | pure |
| Champion + Golden Boot | `src/scoring/tournament-scoring.ts` | pure |
| Group rankings (points calc) | `src/scoring/tournament-scoring.ts` | pure |
| Bracket (per knockout match-winner) | `src/scoring/bracket-scoring.ts` | pure |
| Aggregate "rescore everything" | `src/scoring/rescore.service.ts` | impure (injects repos) |

The pure scoring files (`match-scoring.ts`, `tournament-scoring.ts`, `bracket-scoring.ts`) are the rules. `RescoreService` is the orchestrator — it injects repositories from other modules and runs the pure rules in a loop.

### 2. Keep pure scoring functions PURE

Non-negotiable contract for `match-scoring.ts`, `tournament-scoring.ts`, `bracket-scoring.ts`:

- No DB access. No `PrismaService` or any repository imported.
- No I/O. No `fetch`. No `console.log`.
- No `new Date()`. Time has no meaning to scoring — the input already encodes whether the match is final.
- No mutation of the input arguments.
- Deterministic: same inputs always produce the same output.

If you need data the function doesn't currently receive, expand the input type — don't reach into the DB from inside scoring.

### 3. Add the rule

Update the type signature in `src/scoring/types.ts` if the input shape changes. Then implement the rule in the appropriate pure file.

Match the existing style:
- One function per scoring concept.
- Return a number, or null for "not finalised yet".
- Use `Math.sign` for result-direction comparisons.
- Constants exported (e.g. `MATCH_POINTS_MAX`) for tests and the leaderboard.

### 4. Update the max-points constant

If the rule changes the maximum possible per-unit points, update:
- `MATCH_POINTS_MAX` in `match-scoring.ts`
- `POINTS_CHAMPION`, `POINTS_GOLDEN_BOOT`, `POINTS_PER_GROUP_SLOT` in `tournament-scoring.ts`
- `POINTS_PER_BRACKET_MATCH`, `BRACKET_MATCH_COUNT`, `BRACKET_MAX_POINTS` in `bracket-scoring.ts`

The property tests reference these — if you forget, the tests break.

### 5. Write fixture tests

At minimum:
- One test exercising the new rule alone.
- One test combining it with existing rules.
- One edge case where the input that triggers the rule is missing/null.

Use the readable `it('1-0 vs 1-2 → 1 (just home goals correct)', …)` style. The description should literally state inputs → expected output.

### 6. Write a property-based invariant

`fast-check` is a dev dep:

```ts
import fc from 'fast-check';

it('points are non-negative for any input', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }), (h, a) => {
      const result = calculateMatchPoints(pred(h, a), ft(h, a));
      expect(result!).toBeGreaterThanOrEqual(0);
    }),
  );
});
```

Invariants worth checking:
- `result >= 0`
- `result <= MAX`
- Exact-score always returns 5 + first-scorer bonus.
- Symmetry under home/away swap.

### 7. Update `RescoreService` if needed

`RescoreService` is the public face of all scoring. It's in `src/scoring/rescore.service.ts` and injects:

- `MatchesRepository`
- `PredictionsRepository`
- `TournamentRepository`
- `TournamentPredictionsRepository`
- `GroupPredictionsRepository`
- `BracketPredictionsRepository`
- `AuditRepository`

After your change:
- Confirm the relevant `rescore*()` method still pipes the right inputs.
- If your new rule reads data the rescore method doesn't fetch, add a method to the relevant repository AND update the rescore method to call it.
- Add a test in `rescore.service.spec.ts` if the rule introduces new aggregation logic.

**Never put Prisma calls in `RescoreService` directly** — always go through a repository method. If a repository method doesn't exist for what you need, add one.

### 8. Update CLAUDE.md if invariants changed

`CLAUDE.md` has a section listing locked invariants and (implicitly) the max-points contract. If you changed those, update CLAUDE.md in the same commit.

### 9. Run tests

```sh
npm test
```

All scoring tests must be green. A failing property-based test gives a concrete counter-example — that's a real bug to fix.

## Pitfalls

- **Adding Prisma calls to `match-scoring.ts`, `tournament-scoring.ts`, or `bracket-scoring.ts`** — these files MUST stay pure. If you need DB data, expose it via a repository method and pass it into the scoring function from `RescoreService`.
- **Treating the partial-score group as additive when it should override-or-skip.** Locked rule: exact → 5; otherwise sum (result, diff, home, away). First-scorer bonus is independently additive. Don't restructure without an explicit policy change.
- **Forgetting `match.status !== 'full_time'` → return null.** Scoring should only emit final numbers for finalised matches.
- **Using `match.homeScore!` (non-null assertion) without checking.** Always check `homeScore === null` first.
- **Re-using `MATCH_POINTS_MAX` as a generic ceiling everywhere.** Each scoring scope has its own max constant.
- **Storing intermediate state on the service.** Scoring is stateless. Class fields = bug.
- **Mutating the input arguments** — breaks idempotency assumptions in tests.

## Examples to copy from

- `src/scoring/match-scoring.ts` — cleanest example of exact-overrides / partials-stack.
- `src/scoring/match-scoring.spec.ts` — fixture style + fast-check invariants.
- `src/scoring/rescore.service.ts` — orchestrator that pipes repository data through pure scoring.

## When you finish

Run [[fair-play-review]]. Scoring changes are the highest-stakes diff this repo accepts.
