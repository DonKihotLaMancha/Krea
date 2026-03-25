# Database/API Contracts

This document maps current endpoints to normalized Supabase schema and defines the v2 route contracts.

## Legacy-Compatible Routes

### `POST /api/student`
- Request: `{ studentId: string, name?: string }`
- Writes:
  - `profiles` (primary, when `studentId` is UUID from `auth.users`)
  - `students` (legacy compatibility table, optional)
- Response: `{ ok: true, studentId, name }`

### `GET /api/library?studentId=...`
- Reads:
  - `sources` + `source_contents` (primary)
  - `concept_maps` (+nodes/edges flattened to JSON)
  - `notebook_outputs`
- Optional fallback reads from legacy `student_pdfs`, `concept_maps`, `notebook_outputs`.
- Response:
  - `{ pdfs: [...], maps: [...], notebook: [...] }`

### `POST /api/library/pdf`
- Request: `{ studentId, name, content, pdfBase64? }` (legacy: client-extracted text; still supported)
- Writes:
  - `sources`
  - `source_contents`
  - optional compatibility write to `student_pdfs`

### `POST /api/library/ingest`
- Request: `{ studentId, fileName, fileBase64, mimeType? }` (JSON; base64 file body, up to server JSON limit)
- Parses PDF (pdf-parse), DOCX (mammoth), PPTX (JSZip slide XML), plaintext, or image OCR (tesseract.js).
- Dedupes by SHA-256 of raw bytes (`sources.checksum_sha256`).
- Writes:
  - `sources` (`source_type`: `pdf` | `doc` | `txt`)
  - `source_contents` (`extraction_meta` includes format, warnings, quality)
  - `source_chunks` + async embeddings
  - optional Storage upload to `sources-private`
  - legacy `student_pdfs`
- Response: `{ ok, id, deduplicated?, normalizedText, warnings[], ingestFormat, ... }`

### `POST /api/library/concept-map`
- Request: `{ studentId, sourceName, title, map }`
- Writes:
  - `concept_maps`
  - `concept_map_nodes`
  - `concept_map_edges`
  - optional compatibility write to legacy `concept_maps`

### `POST /api/library/notebook`
- Request: `{ studentId, sourceNames, outputType, output }`
- Writes:
  - `notebook_sessions` (auto-create default session)
  - `notebook_outputs`
  - optional compatibility write to legacy `notebook_outputs`

## V2 Routes

### `GET /api/v2/sources`
- Query: `limit`, `cursor`
- Reads `sources` by `owner_id`.

### `GET /api/v2/sources/:id`
- Reads source metadata + `source_contents` + `source_chunks`.

### `POST /api/v2/sources`
- Request: metadata-only source create.
- Returns source id and upload path for Storage.

### `POST /api/v2/flashcards`
- Request: `{ sourceId, cards[] }`
- Writes `flashcard_sets` + `flashcards`.

### `POST /api/v2/notebook/sessions`
- Request: `{ title, sourceIds[] }`
- Writes `notebook_sessions` + `notebook_session_sources`.

### `POST /api/v2/presentations`
- Request: presentation object with slides/references.
- Writes `presentations` + `presentation_slides` + `presentation_references`.

### `POST /api/v2/quizzes`
- Request: quiz with questions.
- Writes `quizzes` + `quiz_questions`.

### `POST /api/v2/academics/grades`
- Writes `grades`.

### `POST /api/v2/tasks`
- Writes `tasks`.

### `POST /api/v2/chat/rooms`
- Writes `chat_rooms` + `chat_members`.

## Teacher Window Routes

### `GET /api/teacher/dashboard?teacherId=...`
- Reads aggregate stats from:
  - `teacher_classes`
  - `teacher_assignments`
  - `teacher_announcements`
  - `assignment_submissions`

### `GET /api/teacher/classes?teacherId=...`
- Reads teacher-owned rows from `teacher_classes`.

### `POST /api/teacher/classes`
- Request: `{ teacherId, name, description }`
- Writes `teacher_classes`.

### `GET /api/teacher/materials?teacherId=...&classId=...`
- Reads class-scoped rows from `class_materials`.

### `POST /api/teacher/materials`
- Request: `{ teacherId, classId, title, materialType, content }`
- Writes `class_materials`.

### `GET /api/teacher/assignments?teacherId=...&classId=...`
- Reads class assignments from `teacher_assignments`.

### `POST /api/teacher/assignments`
- Request: `{ teacherId, classId, title, description, dueAt }`
- Writes `teacher_assignments`.

### `GET /api/teacher/announcements?teacherId=...&classId=...`
- Reads `teacher_announcements`.

### `POST /api/teacher/announcements`
- Request: `{ teacherId, classId, title, message }`
- Writes `teacher_announcements`.

### `POST /api/teacher/grading`
- Request: `{ teacherId, classId, studentId, assignmentId?, score, feedback }`
- Writes `teacher_grades`.

### `GET /api/teacher/progress?teacherId=...&classId=...`
- Reads aggregated class metrics from enrollments, assignments, and grades.

### `POST /api/teacher/quiz-generate`
- Request: `{ teacherId, classId, title, difficulty, count, promptText }`
- Reads `class_materials`, uses Ollama quiz generation, writes `teacher_generated_quizzes`.
