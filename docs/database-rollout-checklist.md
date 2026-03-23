# Database Rollout and Verification

## Migration Order

1. Run `supabase-schema.sql`
2. Run `supabase-rls.sql`
3. Run `supabase-indexes.sql`
4. If upgrading existing project data, run `supabase-backfill.sql`
5. Deploy backend with dual-write enabled
6. Validate and then switch reads to normalized tables only

## Validation Checklist

- Schema:
  - All tables exist.
  - Enum types exist.
  - FK constraints valid.
- Security:
  - RLS enabled for all user-owned tables.
  - Storage bucket policies allow only owner path access.
- Performance:
  - Core indexes created.
  - Explain plans use owner/time indexes for feed queries.
- Functional:
  - Uploading a PDF creates rows in `sources` and `source_contents`.
  - Concept map write creates map + nodes + edges.
  - Notebook output persists in `notebook_outputs`.

## Smoke Tests (API)

1. `POST /api/student`
2. `POST /api/library/pdf`
3. `GET /api/library?studentId=...`
4. `POST /api/library/concept-map`
5. `POST /api/library/notebook`

Expected: all return 200 and persisted rows visible in Supabase table editor.

## Rollback Strategy

- Keep backup branch before migration deployment.
- Disable normalized-table reads behind environment flag:
  - `DB_READ_MODE=legacy|normalized`
- If migration issue:
  1. Set `DB_READ_MODE=legacy`
  2. Keep writing to legacy tables
  3. Fix schema/policies
  4. Re-enable normalized reads

## Observability

- Log Supabase error fields:
  - `message`, `details`, `hint`, `code`
- Add request correlation id in backend logs.
- Track write failures by endpoint and table target.
