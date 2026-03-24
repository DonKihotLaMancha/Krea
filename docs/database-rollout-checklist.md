# Database Rollout and Verification

## Migration Order

1. Run `supabase-schema.sql`
2. Run `supabase-rls.sql`
3. Run `supabase-indexes.sql`
4. If upgrading existing project data, run `supabase-backfill.sql`
5. Deploy backend with dual-write enabled
6. Validate and then switch reads to normalized tables only
7. Deploy edge function: `supabase functions deploy ai-jobs`
8. Apply vector migration: `supabase/migrations/0006_pgvector_rag.sql`
9. **Tasks calendar / email reminders:** apply `supabase/migrations/0007_tasks_calendar_reminders.sql` (adds `kind`, `reminder_1h_sent`, `reminder_10m_sent` on `public.tasks`).
10. **Portal hardening compatibility patch:** apply `supabase/migrations/0008_portal_hardening.sql` (legacy compatibility tables, safe `updated_at` trigger behavior, RLS/indexes for legacy tables).
11. **Canvas-like LMS foundation:** apply `supabase/migrations/0009_canvas_lms_foundation.sql` and then re-run canonical SQL files to provision `lms_*` tables/policies/indexes.

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
  - Uploading a PDF also creates compatibility rows in `student_pdfs`.
  - Concept map write creates map + nodes + edges.
  - Notebook output persists in `notebook_outputs`.
  - Flashcard generation persists to `flashcard_sets` + `flashcards`.
  - Quiz generation persists to `quizzes` + `quiz_questions`.
  - Presentation generation persists to `presentations` + `presentation_slides` + `presentation_references`.
  - Chat messages persist to `chat_rooms` + `chat_members` + `chat_messages`.
  - AI tutor exchanges persist to `tutor_conversations` + `tutor_messages`.
  - Academics inputs persist to `grades` + `grade_simulations` + `academic_ai_outputs`.
  - Section extraction/progress persists to `sections`.
  - Teacher dashboard/materials/assignments/announcements/grades/quizzes persist and reload.
  - Edge AI queue endpoint returns job id (`POST /api/ai-job`).
  - Vector table accepts embeddings (`source_embeddings`).

## Smoke Tests (API)

1. `POST /api/student`
2. `POST /api/library/pdf`
3. `GET /api/library?studentId=...`
4. `POST /api/library/concept-map`
5. `POST /api/library/notebook`
6. `POST /api/library/flashcards`
7. `POST /api/library/sections`
8. `POST /api/library/quiz`
9. `POST /api/library/presentation`
10. `POST /api/library/grade`
11. `POST /api/library/simulation`
12. `POST /api/library/academic-ai`
13. `POST /api/library/chat-message`
14. `POST /api/library/tutor-message`
15. `GET /api/teacher/dashboard?teacherId=...`
16. `GET /api/teacher/classes?teacherId=...`
17. `POST /api/teacher/classes`
18. `GET /api/teacher/enrollments?teacherId=...&classId=...`
19. `POST /api/teacher/enrollments`
20. `GET/POST /api/teacher/materials`
21. `GET/POST /api/teacher/assignments`
22. `GET/POST /api/teacher/announcements`
23. `POST /api/teacher/grading`
24. `GET /api/teacher/progress?teacherId=...&classId=...`
25. `POST /api/teacher/quiz-generate`
26. `GET /api/teacher/quizzes?teacherId=...&classId=...`
27. `GET/POST /api/courses`
28. `GET/POST /api/modules`
29. `GET/POST /api/assignments`
30. `GET/POST /api/submissions`
31. `GET/POST /api/discussions`
32. `GET/POST /api/messages`
33. `GET/POST /api/calendar`
34. `GET/POST /api/notifications`
35. `GET/POST /api/analytics`
36. `GET/POST /api/grades`

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
