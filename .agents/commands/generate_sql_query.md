---
name: generate_sql_query
description: Generate raw PostgreSQL SQL from a natural-language request
input: User request in natural language
output: PostgreSQL statement
---

## 1. Inspect schema

Read all of the following pages:

- `packages/db/src/schema/customerSchema.ts` - Customer entities (patients, tasks, phone calls, referrals)
- `packages/db/src/schema/globalSchema.ts` - Reference data (providers, organizations, insurance, specialties)
- `packages/db/src/schema/authSchema.ts` - Authentication tables (users, sessions)

Use `codebase_search_agent` or `Grep` as needed to view definitions and existing query patterns.

## 3. Compose SQL (checklist)

- Correct table/column names, explicit JOINs
- Apply WHERE filters, UUID casting, date-time zones
- Handle JSON/JSONB with `->`, `->>`, `@>`, `?` operators
- Use CTEs or subqueries for clarity; add window functions if analytics needed
- Order and limit results sensibly; alias tables
- Parameterize values (`$1`, `$2`, ...) when possible

IMPORTANT: In the typescript schema, tables are defined in camelCase, but in the underlying Postgres database, they are all mapped to snake_case so always make sure to use snake_case sql query.

IMPORTANT: Always use lowercase text for your SQL

## 4. Return response

By default output ONLY the formatted SQL block.

If the user requests "explain" add:

1. Brief natural-language explanation
2. SQL block
3. Bullet breakdown of main clauses
4. Performance tips (indexes, jsonb_path_ops etc.)

## Strict requirements

- Match schema exactly
- Use explicit JOINs
- Validate that query returns requested data shape
- PostgreSQL 15 syntax compliant
