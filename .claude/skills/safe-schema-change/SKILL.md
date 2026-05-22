---
name: safe-schema-change
description: Prisma schema migration workflow that keeps the deployed app working. Use whenever editing schema.prisma. Covers additive vs destructive changes, multi-step renames, RescoreService idempotency, and seed updates.
---

# safe-schema-change

The DB is hosted on Supabase free tier. Migrations are one-way once applied to production. A botched schema change can corrupt scoring or lock data we can't easily recover. This skill makes the change predictable.

## When to use

- Adding a column, model, or relation.
- Renaming a column or model.
- Changing a column's type or nullability.
- Dropping a column or model.
- Adjusting an index or unique constraint.

## Procedure

### 1. Classify the change

| Change | Risk | Strategy |
|---|---|---|
| Add nullable column | Low | Single migration |
| Add table | Low | Single migration |
| Add index | Low | Single migration (CONCURRENTLY in raw SQL if large) |
| Add NOT NULL column with default | Low | Single migration |
| Add NOT NULL column without default | Medium | Two-step: nullable → backfill → NOT NULL |
| Rename column | High | Three-step: add new column → backfill → switch reads → drop old |
| Rename table / model | High | Same as rename column, applied to the table |
| Drop column | Medium | Confirm no code references it FIRST, then drop in a separate migration |
| Change column type | High | Three-step: add new column with new type → backfill → switch reads → drop old |
| Add unique constraint | Medium | Pre-check data uniqueness; will fail otherwise |

For anything labeled High: **don't do it as a single migration**. Use the staged approach.

### 2. Edit `prisma/schema.prisma`

Edit the file with the additive change. For multi-step changes, the schema only reflects the *current* desired state in each step — you commit one schema state per migration.

Naming conventions in this repo:
- snake_case in the DB (`first_scorer_player_id`), camelCase in the model (`firstScorerPlayerId`), mapped with `@map`.
- All FKs end with `Id` / `_id`.
- All timestamps are `@db.Timestamptz(3)` and stored in UTC.
- Tournament-scoped tables have `tournamentId` + an index on it.

### 3. Generate the migration

```sh
npx prisma migrate dev --name <descriptive_slug>
```

The name should describe the change in words (e.g. `add_slot_id_to_matches`, not `update_schema`).

Inspect the generated SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`. Read every line. Confirm:

- No surprise `DROP COLUMN` for fields you only renamed in the model.
- No data-loss operations you didn't ask for.
- Indexes look reasonable (size estimate × Postgres bloat).

**If the SQL looks wrong, delete the whole migration folder and try again — never hand-edit the generated SQL after it's been applied locally.**

### 4. Regenerate the client

```sh
npx prisma generate
```

(The `postinstall` script also does this, but call it explicitly so TS type checks update immediately.)

### 5. Fix TypeScript compile errors

A schema change can cascade through:
- `src/predictions/predictions.service.ts` (and other services that select on the changed model)
- `src/scoring/rescore.service.ts` (especially if you added/removed a column it reads)
- `prisma/seed.ts`

Add/remove fields from `select: {}` and `include: {}` blocks as needed. Don't use `select: { ...all }`.

### 6. Update `seed.ts` if necessary

If the change adds a required field (NOT NULL without default), the seed will fail. Update `seed.ts` to provide values for new required fields. Confirm `npm run seed` succeeds locally against a clean DB.

### 7. Verify `RescoreService` is still idempotent

This is the critical check. The seed + your code + `rescoreAll()` should be deterministic:

```sh
npm run seed                         # idempotent seed
npx prisma db seed                   # alternate invocation
# Manually trigger rescore via test or REST call
```

A change is safe-for-rescore if and only if:
- The new column doesn't carry information that scoring functions read but isn't covered by the rescore methods' `select`.
- Existing rescore output unchanged for unchanged data.

If the new field IS read by scoring, update the corresponding `rescore*()` method's `select` block AND add a test in `rescore.service.spec.ts`.

### 8. Update `CLAUDE.md` schema section

If the change affects a model documented in the schema-tour section of `CLAUDE.md`, update it. Don't let CLAUDE.md drift from the schema.

### 9. Run the full test suite

```sh
npm test
```

If `predictions.service.spec.ts` or `rescore.service.spec.ts` break, fix them first — those are sacred.

### 10. Commit migration + schema + code together

One atomic commit containing:
- `prisma/schema.prisma`
- `prisma/migrations/<timestamp>_<name>/`
- All services + tests updated to use the new shape
- `prisma/seed.ts` updated
- `CLAUDE.md` updated

Commit message format: `Schema: <verb> <noun> on <table>` (e.g. `Schema: add slot_id to matches`).

### 11. Deploy

After merge, the migration runs against production Supabase via `npx prisma migrate deploy` (which Render runs as part of its build, or you trigger manually). Verify the migration applied:

```sh
# In Supabase studio, check the _prisma_migrations table
SELECT migration_name, started_at, finished_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;
```

If `finished_at IS NULL` for your migration, it's still running or failed. Investigate Render logs.

## Multi-step rename example

To rename `matches.first_scorer_player_id` to `matches.opening_goal_player_id`:

**Migration A: add new column (nullable, copy data)**
```prisma
model Match {
  ...
  firstScorerPlayerId String? @map("first_scorer_player_id")     // keep
  openingGoalPlayerId String? @map("opening_goal_player_id")     // add
}
```
Run `prisma migrate dev --name add_opening_goal_player_id`. In the generated SQL, append a backfill: `UPDATE matches SET opening_goal_player_id = first_scorer_player_id;`.

**Migration B: switch code reads** (no schema change yet)
Update services + scoring + tests to read `openingGoalPlayerId` instead. Commit and deploy.

**Migration C: drop old column**
```prisma
model Match {
  ...
  openingGoalPlayerId String? @map("opening_goal_player_id")
}
```
Run `prisma migrate dev --name drop_first_scorer_player_id`. Deploy.

Don't combine these into one migration. The point of the staging is that production is consistent at every step — if you rollback after B, the DB is fine.

## Pitfalls

- **Editing a committed migration** — never. Add a new migration that "fixes" the old one. Migrations are append-only history.
- **Dropping a column that current deployed code still reads** — sequence: deploy code change FIRST, then run drop migration.
- **Adding a UNIQUE constraint without checking existing data** — `prisma migrate dev` will fail with a duplicate-key error on the live data.
- **Forgetting `@map` for snake_case columns** — Prisma will create new columns instead of mapping existing ones.
- **Long-running migrations on a busy table** — for >100k row tables, use raw SQL with `CREATE INDEX CONCURRENTLY` or batched updates. At our scale (100 users, 104 matches) this won't bite, but worth knowing.

## When you finish

- Run [[fair-play-review]].
- Update the [[add-scoring-rule]] skill if the schema change introduced a new scoring dimension.
