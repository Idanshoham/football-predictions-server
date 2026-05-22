---
name: add-scoring-rule
description: Safely extend the scoring engine (match / tournament / bracket / group rankings) with full edge-case coverage and property-based invariants. Use when introducing or changing how points are awarded.
---

# add-scoring-rule

The scoring functions are the sacred core of this app — a bug means everyone gets wrong points and there's no admin escape hatch. This skill is the discipline for changing them safely.

## When to use

- Adding a new scoring component (e.g. "+2 for predicting both teams to score").
- Changing the points value of an existing rule.
- Changing a tiebreaker.
- Adding a new tournament-level award.

## Procedure

### 1. Find the right file

| Scope | File |
|---|---|
| Per-match prediction (score + first scorer) | `src/scoring/match-scoring.ts` |
| Champion + Golden Boot | `src/scoring/tournament-scoring.ts` (Champion+GB) |
| Group rankings | `src/scoring/tournament-scoring.ts` (Group section) |
| Bracket (per knockout match-winner) | `src/scoring/bracket-scoring.ts` |
| Aggregate "rescore everything from raw state" | `src/scoring/rescore.service.ts` |

If your rule doesn't fit any of these, you're probably introducing a new dimension — discuss the schema implications before writing code.

### 2. Keep scoring functions PURE

The non-negotiable contract:

- No DB access. No `PrismaService` injected.
- No I/O. No `fetch`. No `console.log`.
- No `new Date()`. Time has no meaning to scoring — the input already encodes whether the match is final.
- No mutation of the input arguments.
- Deterministic: same inputs always produce the same output.

If you need data the function doesn't currently receive (e.g. number of cards), expand the input type — don't reach into the DB from inside scoring.

### 3. Add the rule

Update the type signature in `src/scoring/types.ts` if the input shape changes. Then implement the rule in the appropriate function. Match the existing style:

- One function per scoring concept.
- Return a number, or null for "not finalised yet".
- Use `Math.sign` for result-direction comparisons, not chains of `>=`/`<`.
- Constants exported (e.g. `MATCH_POINTS_MAX`) for use by tests and the leaderboard.

### 4. Update the max-points constant

If the rule changes the maximum possible per-unit points, update the corresponding constant:

- `MATCH_POINTS_MAX` in `match-scoring.ts`
- `POINTS_CHAMPION`, `POINTS_GOLDEN_BOOT`, `POINTS_PER_GROUP_SLOT` in `tournament-scoring.ts`
- `POINTS_PER_BRACKET_MATCH`, `BRACKET_MATCH_COUNT`, `BRACKET_MAX_POINTS` in `bracket-scoring.ts`

The property tests reference these — if you forget, the tests break.

### 5. Write fixture tests

Add at least:

- One test that exercises the new rule alone (everything else wrong).
- One test that exercises the new rule combined with existing rules (verify additivity / override semantics).
- One test for the edge case where the input that triggers the rule is missing/null.

Match the readable `it('1-0 vs 1-2 → 1 (just home goals correct)', …)` style — the description should literally state inputs → expected output. Future readers will diff your test against the function.

### 6. Write a property-based invariant (when applicable)

`fast-check` is already a dev dep. Use it for invariants that should hold universally:

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
- Specific structural properties: e.g. "exact-score always returns 5 + first-scorer bonus."
- Symmetry: e.g. "swapping home/away of both prediction and actual yields the same score."

### 7. Check `RescoreService` still works

`RescoreService` is the public face of all scoring. After your change:

- Re-read the relevant `rescore*()` method in `src/scoring/rescore.service.ts`.
- Confirm it still pipes the input through your changed function correctly.
- If your new rule reads data the rescore method doesn't fetch, expand the rescore method's `select`.
- Add a test in `rescore.service.spec.ts` if the rule introduces new aggregation logic.

### 8. Update CLAUDE.md if invariants changed

`CLAUDE.md` has a section listing locked invariants and the max-points table. If you changed any of those, update CLAUDE.md in the same commit.

### 9. Run tests

```sh
npm test
```

All scoring tests must be green. If a property test fails with a surprising counterexample, the counterexample is real — your rule has a bug or your invariant is wrong.

## Pitfalls

- **Treating the partial-score group as additive when it should override-or-skip.** `match-scoring.ts` has the locked rule: exact → 5; otherwise sum (result, diff, home, away). The first-scorer bonus is independently additive. Don't restructure this without an explicit policy change.
- **Forgetting `match.status !== 'full_time'` → return null.** Scoring should only emit final numbers for finalised matches.
- **Using `match.homeScore!` (non-null assertion) without checking.** Always check `homeScore === null` first.
- **Re-using `MATCH_POINTS_MAX` as a generic ceiling everywhere.** Each scoring scope has its own max constant.
- **Storing intermediate state on the service.** Scoring is stateless. Class fields = bug.
- **Mutating the input arguments** — TypeScript permits it but it breaks idempotency assumptions in tests.

## Examples to copy from

- `src/scoring/match-scoring.ts` — the cleanest example of the "exact-overrides / partials-stack" pattern.
- `src/scoring/match-scoring.spec.ts` — fixture-test style + a strong set of fast-check invariants.

## When you finish

Run [[fair-play-review]]. Scoring changes are the highest-stakes diff this repo accepts; a fresh review is non-negotiable before merging.
