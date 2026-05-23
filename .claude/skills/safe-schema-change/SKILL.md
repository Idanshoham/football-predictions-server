---
name: safe-schema-change
description: Prisma schema migration workflow that keeps the deployed app working. Use whenever editing schema.prisma. Covers additive vs destructive changes, multi-step renames, RescoreService idempotency, repository propagation, and seed updates.
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
| Add index | Low | Single migration |
| Add NOT NULL column with default | Low | Single migration |
| Add NOT NULL column without default | Medium | Two-step: nullable → backfill → NOT NULL |
| Rename column | High | Three-step: add new → backfill → switch reads → drop old |
| Rename table / model | High | Same as rename column applied to the table |
| Drop column | Medium | Confirm no code references it FIRST, then drop |
| Change column type | High | Three-step staged migration |
| Add unique constraint | Medium | Pre-check data uniqueness; will fail otherwise |

For anything labeled High: **don't do it as a single migration**.

### 2. Edit `prisma/schema.prisma`

Edit the file with the desired change. For multi-step migrations the schema reflects the current desired state in each step — you commit one schema state per migration.

Naming conventions in this repo:
- snake_case in the DB, camelCase in the model, mapped with `@map`.
- All FKs end with `Id` / `_id`.
- All timestamps are `@db.Timestamptz(3)` and stored in UTC.
- Tournament-scoped tables have `tournamentId` + an index on it.

### 3. Generate the migration

```sh
npx prisma migrate dev --name <descriptive_slug>
```

Inspect the SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`. Read every line. Confirm no surprise drops or data-loss operations.

**If the SQL looks wrong, delete the whole migration folder and try again** — never hand-edit applied migrations.

### 4. Regenerate the client

```sh
npx prisma generate
```

### 5. Propagate through the layers

A schema change cascades from the bottom up — repositories first, then services. Walk the call graph:

1. **Repositories** — the only layer that talks to Prisma. Update method signatures, `select`/`include` blocks, return types. Likely files affected:
   - `src/<feature>/<feature>.repository.ts`
   - `src/scoring/rescore.service.ts`'s repository injections (the methods called, not the service)
2. **Services** — only update where signatures changed. If the repository method's input/output is the same shape, the service is untouched.
3. **Controllers** — only if the DTO or response shape changes.

If you find yourself adding a Prisma call to a service or controller, stop — add a repository method instead.

### 6. Update `seed.ts` if necessary

If the change adds a required field, the seed will fail. Update `seed.ts`. Confirm `npm run seed` succeeds locally against a clean DB.

### 7. Verify `RescoreService` is still idempotent

```sh
npm run seed                # idempotent
# Then trigger rescore via test or the /__rescore endpoint
```

A change is safe-for-rescore if and only if:
- The new column isn't read by scoring without the corresponding rescore method's `select` covering it.
- Existing rescore output is unchanged for unchanged data.

If the new field IS read by scoring: update the relevant repository method's `select` AND add a test in `rescore.service.spec.ts`.

### 8. Update `CLAUDE.md`

If the change affects a model documented in the schema-tour section, update it. Don't let CLAUDE.md drift from the schema.

### 9. Run the full test suite

```sh
npm test
```

If `predictions.service.spec.ts`, `rescore.service.spec.ts`, or `failover.spec.ts` break, fix them first — they protect sacred behaviour.

### 10. Commit migration + schema + code together

One atomic commit containing:
- `prisma/schema.prisma`
- `prisma/migrations/<timestamp>_<name>/`
- All affected repositories + services updated
- `prisma/seed.ts` updated
- `CLAUDE.md` updated

Commit message: `Schema: <verb> <noun> on <table>` (e.g. `Schema: add slot_id to matches`).

### 11. Deploy

After merge, run `npx prisma migrate deploy` against production. Verify in Supabase studio:

```sql
SELECT migration_name, started_at, finished_at
FROM _prisma_migrations
ORDER BY started_at DESC LIMIT 5;
```

## Multi-step rename example

To rename `matches.first_scorer_player_id` to `matches.opening_goal_player_id`:

**Migration A**: add nullable new column + backfill in SQL. Both columns exist; only old is read.

**Migration B (no schema change)**: update all repository methods to read/write the new column. Deploy. Old column is now write-only.

**Migration C**: drop the old column.

The point of staging is that production is consistent at every step.

## Pitfalls

- **Adding a new Prisma model and forgetting to expose it through a repository** — services and jobs can't read it without breaking the layering rule.
- **Editing a committed migration** — never. Add a new migration that fixes the old one.
- **Dropping a column that current deployed code still reads** — deploy code change FIRST.
- **Adding a UNIQUE constraint without checking existing data** — migration will fail on duplicate-key error.
- **Forgetting `@map` for snake_case columns** — Prisma will create new columns instead of mapping existing ones.

## When you finish

- Run [[fair-play-review]].
- Update [[add-scoring-rule]] if the schema change introduced a new scoring dimension.
