-- =============================================================================
-- StudentAssistant / Krea — full Supabase SQL bundle (generated)
-- Apply in Supabase SQL Editor or via psql in this order (single file).
-- Sections: schema -> RLS -> indexes -> auth trigger -> migrations 0005-0009 -> optional backfill
-- =============================================================================


-- >>>>> BEGIN: supabase-schema.sql <<<<<

create extension if not exists pgcrypto;
create extension if not exists vector;

do $$
begin
  -- If legacy tables exist with incompatible structures/types, preserve them by renaming.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'concept_maps'
      and column_name = 'id'
      and udt_name <> 'uuid'
  ) then
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'concept_maps_legacy'
    ) then
      execute 'alter table public.concept_maps rename to concept_maps_legacy';
    end if;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notebook_outputs'
      and column_name = 'id'
      and udt_name <> 'uuid'
  ) then
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'notebook_outputs_legacy'
    ) then
      execute 'alter table public.notebook_outputs rename to notebook_outputs_legacy';
    end if;
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'source_type') then
    create type public.source_type as enum ('pdf', 'doc', 'txt', 'url', 'note');
  end if;
  if not exists (select 1 from pg_type where typname = 'source_status') then
    create type public.source_status as enum ('uploading', 'processing', 'ready', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'generation_mode') then
    create type public.generation_mode as enum ('ai', 'backup', 'manual');
  end if;
  if not exists (select 1 from pg_type where typname = 'review_result') then
    create type public.review_result as enum ('correct', 'incorrect');
  end if;
  if not exists (select 1 from pg_type where typname = 'section_status') then
    create type public.section_status as enum ('pending', 'in_progress', 'completed');
  end if;
  if not exists (select 1 from pg_type where typname = 'notebook_output_type') then
    create type public.notebook_output_type as enum ('source-chat', 'summary', 'study-guide', 'source-compare', 'audio-overview');
  end if;
  if not exists (select 1 from pg_type where typname = 'quiz_mode') then
    create type public.quiz_mode as enum ('quiz', 'exam');
  end if;
  if not exists (select 1 from pg_type where typname = 'quiz_difficulty') then
    create type public.quiz_difficulty as enum ('easy', 'medium', 'hard');
  end if;
  if not exists (select 1 from pg_type where typname = 'academic_output_type') then
    create type public.academic_output_type as enum ('advice', 'estimate');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_priority') then
    create type public.task_priority as enum ('low', 'medium', 'high');
  end if;
  if not exists (select 1 from pg_type where typname = 'chat_room_type') then
    create type public.chat_room_type as enum ('global', 'class', 'private');
  end if;
  if not exists (select 1 from pg_type where typname = 'member_role') then
    create type public.member_role as enum ('owner', 'member');
  end if;
  if not exists (select 1 from pg_type where typname = 'tutor_role') then
    create type public.tutor_role as enum ('user', 'assistant');
  end if;
end$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Some legacy tables may not include updated_at yet.
  if to_jsonb(new) ? 'updated_at' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_at', now()));
  end if;
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Legacy-compatible student profile table used by some API paths.
create table if not exists public.students (
  id uuid primary key references public.profiles(id) on delete cascade,
  name text not null default 'Student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.students add column if not exists created_at timestamptz not null default now();
alter table if exists public.students add column if not exists updated_at timestamptz not null default now();

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  source_type public.source_type not null,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  checksum_sha256 text,
  status public.source_status not null default 'ready',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.source_contents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null unique references public.sources(id) on delete cascade,
  raw_text text,
  cleaned_text text,
  language text,
  page_count int,
  extraction_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.source_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  chunk_index int not null check (chunk_index >= 0),
  content text not null,
  token_estimate int check (token_estimate is null or token_estimate >= 0),
  created_at timestamptz not null default now(),
  unique (source_id, chunk_index)
);

create table if not exists public.flashcard_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  name text not null,
  generation_mode public.generation_mode not null default 'ai',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.flashcard_sets(id) on delete cascade,
  question text not null,
  answer text not null,
  evidence text,
  difficulty smallint not null default 2 check (difficulty between 1 and 5),
  created_at timestamptz not null default now()
);

create table if not exists public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  flashcard_id uuid not null references public.flashcards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  result public.review_result not null,
  reviewed_at timestamptz not null default now()
);

create table if not exists public.flashcard_progress (
  flashcard_id uuid not null references public.flashcards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  right_count int not null default 0 check (right_count >= 0),
  wrong_count int not null default 0 check (wrong_count >= 0),
  streak int not null default 0,
  next_review_at timestamptz,
  last_review_at timestamptz,
  primary key (flashcard_id, user_id)
);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  name text not null,
  description text,
  order_index int not null check (order_index >= 0),
  progress_percent numeric(5,2) not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  status public.section_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.section_study_days (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  study_date date not null,
  unique (section_id, user_id, study_date)
);

create table if not exists public.concept_maps (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  version int not null default 1 check (version > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.concept_map_nodes (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.concept_maps(id) on delete cascade,
  label text not null,
  description text,
  x numeric(8,2),
  y numeric(8,2),
  created_at timestamptz not null default now()
);

create table if not exists public.concept_map_edges (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.concept_maps(id) on delete cascade,
  source_node_id uuid not null references public.concept_map_nodes(id) on delete cascade,
  target_node_id uuid not null references public.concept_map_nodes(id) on delete cascade,
  label text,
  created_at timestamptz not null default now()
);

create table if not exists public.notebook_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notebook_session_sources (
  session_id uuid not null references public.notebook_sessions(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, source_id)
);

create table if not exists public.notebook_outputs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.notebook_sessions(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  output_type public.notebook_output_type not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notebook_citations (
  id uuid primary key default gen_random_uuid(),
  output_id uuid not null references public.notebook_outputs(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  quote text,
  page_ref text,
  score numeric(6,4),
  created_at timestamptz not null default now()
);

create table if not exists public.presentations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  prompt_text text,
  model text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.presentation_sources (
  presentation_id uuid not null references public.presentations(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (presentation_id, source_id)
);

create table if not exists public.presentation_slides (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.presentations(id) on delete cascade,
  slide_index int not null check (slide_index >= 0),
  title text not null,
  bullets jsonb not null default '[]'::jsonb,
  notes text,
  image_suggestion text,
  graph_suggestion text,
  chart_bars jsonb,
  created_at timestamptz not null default now(),
  unique (presentation_id, slide_index)
);

create table if not exists public.presentation_references (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.presentations(id) on delete cascade,
  ref_text text not null,
  url text,
  created_at timestamptz not null default now()
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  mode public.quiz_mode not null default 'quiz',
  difficulty public.quiz_difficulty not null default 'medium',
  question_count int not null default 10 check (question_count > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer text,
  explanation text
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score numeric(5,2),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.quiz_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  selected_answer text,
  is_correct boolean
);

create table if not exists public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  term_id uuid references public.academic_terms(id) on delete set null,
  subject text not null,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  weight numeric(6,3) not null check (weight > 0),
  recorded_at timestamptz not null default now()
);

create table if not exists public.grade_simulations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  target numeric(5,2) not null check (target >= 0 and target <= 100),
  required_final numeric(5,2) not null check (required_final >= 0 and required_final <= 100),
  final_weight numeric(6,3) not null check (final_weight > 0 and final_weight <= 1),
  created_at timestamptz not null default now()
);

create table if not exists public.academic_ai_outputs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  output_type public.academic_output_type not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  priority public.task_priority not null default 'medium',
  due_at timestamptz,
  kind text not null default 'task' check (kind in ('task', 'event')),
  reminder_1h_sent boolean not null default false,
  reminder_10m_sent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  room_type public.chat_room_type not null default 'private',
  created_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists public.tutor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.tutor_conversations(id) on delete cascade,
  role public.tutor_role not null,
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.source_embeddings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  chunk_id uuid references public.source_chunks(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  code text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_enrollments (
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'invited', 'removed')),
  created_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create table if not exists public.class_materials (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  title text not null,
  material_type text not null default 'pdf' check (material_type in ('pdf', 'doc', 'note', 'link', 'other')),
  content text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  status text not null default 'published' check (status in ('draft', 'published', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.teacher_assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  submission_text text,
  submitted_at timestamptz,
  score numeric(5,2),
  feedback text,
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create table if not exists public.teacher_announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_grades (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid references public.teacher_assignments(id) on delete set null,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  feedback text,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_generated_quizzes (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  difficulty public.quiz_difficulty not null default 'medium',
  question_count int not null default 10,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Canvas-like LMS domain (teacher + student unified model).
create table if not exists public.lms_courses (
  id uuid primary key default gen_random_uuid(),
  owner_teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  code text not null unique,
  description text,
  term_id uuid references public.academic_terms(id) on delete set null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_course_sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.lms_courses(id) on delete cascade,
  name text not null,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.lms_courses(id) on delete cascade,
  section_id uuid references public.lms_course_sections(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('teacher', 'ta', 'student', 'observer')),
  status text not null default 'active' check (status in ('active', 'invited', 'inactive', 'completed')),
  created_at timestamptz not null default now(),
  unique (course_id, user_id)
);

create table if not exists public.lms_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.lms_courses(id) on delete cascade,
  title text not null,
  description text,
  position int not null default 0,
  published boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_pages (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.lms_courses(id) on delete cascade,
  title text not null,
  body text not null default '',
  author_id uuid not null references public.profiles(id) on delete cascade,
  published boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_files (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.lms_courses(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.lms_assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.lms_courses(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  points numeric(7,2) not null default 100,
  status text not null default 'published' check (status in ('draft', 'published', 'closed')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.lms_courses(id) on delete cascade,
  title text not null,
  difficulty public.quiz_difficulty not null default 'medium',
  question_count int not null default 10 check (question_count > 0),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'published' check (status in ('draft', 'published', 'closed')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.lms_quizzes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  score numeric(7,2),
  answers jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.lms_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.lms_assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  attempt_no int not null default 1,
  submission_text text,
  file_url text,
  submitted_at timestamptz,
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'graded', 'returned')),
  grade numeric(7,2),
  feedback text,
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assignment_id, student_id, attempt_no)
);

create table if not exists public.lms_rubric_sets (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.lms_assignments(id) on delete cascade,
  title text not null,
  criteria jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.lms_rubric_scores (
  id uuid primary key default gen_random_uuid(),
  rubric_set_id uuid not null references public.lms_rubric_sets(id) on delete cascade,
  submission_id uuid not null references public.lms_submissions(id) on delete cascade,
  scorer_id uuid not null references public.profiles(id) on delete cascade,
  score numeric(7,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.lms_module_items (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.lms_modules(id) on delete cascade,
  item_type text not null check (item_type in ('page', 'file', 'assignment', 'quiz', 'discussion', 'url')),
  ref_id uuid,
  title text not null,
  position int not null default 0,
  published boolean not null default false,
  url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_discussions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.lms_courses(id) on delete cascade,
  title text not null,
  body text not null default '',
  created_by uuid not null references public.profiles(id) on delete cascade,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_discussion_replies (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.lms_discussions(id) on delete cascade,
  parent_reply_id uuid references public.lms_discussion_replies(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_inbox_threads (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.lms_courses(id) on delete set null,
  subject text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_inbox_participants (
  thread_id uuid not null references public.lms_inbox_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  primary key (thread_id, user_id)
);

create table if not exists public.lms_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.lms_inbox_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.lms_calendar_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid references public.lms_courses(id) on delete set null,
  title text not null,
  description text,
  event_type text not null default 'event' check (event_type in ('event', 'deadline', 'meeting', 'reminder')),
  start_at timestamptz not null,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  meta jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.lms_todo_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid references public.lms_courses(id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  course_id uuid references public.lms_courses(id) on delete set null,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.lms_attendance (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.lms_courses(id) on delete cascade,
  section_id uuid references public.lms_course_sections(id) on delete set null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  marked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (course_id, student_id, attendance_date)
);

create table if not exists public.lms_role_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope_type text not null check (scope_type in ('global', 'course', 'section')),
  scope_id uuid,
  role text not null check (role in ('admin', 'teacher', 'ta', 'student', 'observer')),
  created_at timestamptz not null default now(),
  unique (user_id, scope_type, scope_id, role)
);

create table if not exists public.lms_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('global', 'course', 'section')),
  scope_id uuid,
  role text not null,
  permission_key text not null,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (scope_type, scope_id, role, permission_key)
);

create table if not exists public.lms_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Legacy-compatible PDF archive table to preserve uploads across refreshes.
create table if not exists public.student_pdfs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_students_created_at on public.students(created_at desc);
create index if not exists idx_student_pdfs_student_created on public.student_pdfs(student_id, created_at desc);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_students_updated_at on public.students;
create trigger trg_students_updated_at before update on public.students for each row execute function public.set_updated_at();
drop trigger if exists trg_sources_updated_at on public.sources;
create trigger trg_sources_updated_at before update on public.sources for each row execute function public.set_updated_at();
drop trigger if exists trg_source_contents_updated_at on public.source_contents;
create trigger trg_source_contents_updated_at before update on public.source_contents for each row execute function public.set_updated_at();
drop trigger if exists trg_flashcard_sets_updated_at on public.flashcard_sets;
create trigger trg_flashcard_sets_updated_at before update on public.flashcard_sets for each row execute function public.set_updated_at();
drop trigger if exists trg_notebook_sessions_updated_at on public.notebook_sessions;
create trigger trg_notebook_sessions_updated_at before update on public.notebook_sessions for each row execute function public.set_updated_at();
drop trigger if exists trg_presentations_updated_at on public.presentations;
create trigger trg_presentations_updated_at before update on public.presentations for each row execute function public.set_updated_at();
drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
drop trigger if exists trg_teacher_classes_updated_at on public.teacher_classes;
create trigger trg_teacher_classes_updated_at before update on public.teacher_classes for each row execute function public.set_updated_at();
drop trigger if exists trg_lms_courses_updated_at on public.lms_courses;
create trigger trg_lms_courses_updated_at before update on public.lms_courses for each row execute function public.set_updated_at();
drop trigger if exists trg_lms_course_sections_updated_at on public.lms_course_sections;
create trigger trg_lms_course_sections_updated_at before update on public.lms_course_sections for each row execute function public.set_updated_at();
drop trigger if exists trg_lms_modules_updated_at on public.lms_modules;
create trigger trg_lms_modules_updated_at before update on public.lms_modules for each row execute function public.set_updated_at();
drop trigger if exists trg_lms_pages_updated_at on public.lms_pages;
create trigger trg_lms_pages_updated_at before update on public.lms_pages for each row execute function public.set_updated_at();
drop trigger if exists trg_lms_assignments_updated_at on public.lms_assignments;
create trigger trg_lms_assignments_updated_at before update on public.lms_assignments for each row execute function public.set_updated_at();
drop trigger if exists trg_lms_quizzes_updated_at on public.lms_quizzes;
create trigger trg_lms_quizzes_updated_at before update on public.lms_quizzes for each row execute function public.set_updated_at();
drop trigger if exists trg_lms_module_items_updated_at on public.lms_module_items;
create trigger trg_lms_module_items_updated_at before update on public.lms_module_items for each row execute function public.set_updated_at();
drop trigger if exists trg_lms_discussions_updated_at on public.lms_discussions;
create trigger trg_lms_discussions_updated_at before update on public.lms_discussions for each row execute function public.set_updated_at();
drop trigger if exists trg_lms_discussion_replies_updated_at on public.lms_discussion_replies;
create trigger trg_lms_discussion_replies_updated_at before update on public.lms_discussion_replies for each row execute function public.set_updated_at();
drop trigger if exists trg_lms_inbox_threads_updated_at on public.lms_inbox_threads;
create trigger trg_lms_inbox_threads_updated_at before update on public.lms_inbox_threads for each row execute function public.set_updated_at();
drop trigger if exists trg_lms_calendar_events_updated_at on public.lms_calendar_events;
create trigger trg_lms_calendar_events_updated_at before update on public.lms_calendar_events for each row execute function public.set_updated_at();
drop trigger if exists trg_lms_todo_items_updated_at on public.lms_todo_items;
create trigger trg_lms_todo_items_updated_at before update on public.lms_todo_items for each row execute function public.set_updated_at();


-- >>>>> END: supabase-schema.sql <<<<<


-- >>>>> BEGIN: supabase-rls.sql <<<<<

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.student_pdfs enable row level security;
alter table public.sources enable row level security;
alter table public.source_contents enable row level security;
alter table public.source_chunks enable row level security;
alter table public.flashcard_sets enable row level security;
alter table public.flashcards enable row level security;
alter table public.flashcard_reviews enable row level security;
alter table public.flashcard_progress enable row level security;
alter table public.sections enable row level security;
alter table public.section_study_days enable row level security;
alter table public.concept_maps enable row level security;
alter table public.concept_map_nodes enable row level security;
alter table public.concept_map_edges enable row level security;
alter table public.notebook_sessions enable row level security;
alter table public.notebook_session_sources enable row level security;
alter table public.notebook_outputs enable row level security;
alter table public.notebook_citations enable row level security;
alter table public.presentations enable row level security;
alter table public.presentation_sources enable row level security;
alter table public.presentation_slides enable row level security;
alter table public.presentation_references enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_attempt_answers enable row level security;
alter table public.academic_terms enable row level security;
alter table public.grades enable row level security;
alter table public.grade_simulations enable row level security;
alter table public.academic_ai_outputs enable row level security;
alter table public.tasks enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.tutor_conversations enable row level security;
alter table public.tutor_messages enable row level security;
alter table public.source_embeddings enable row level security;
alter table public.teacher_classes enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.class_materials enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.teacher_announcements enable row level security;
alter table public.teacher_grades enable row level security;
alter table public.teacher_generated_quizzes enable row level security;
alter table public.lms_courses enable row level security;
alter table public.lms_course_sections enable row level security;
alter table public.lms_enrollments enable row level security;
alter table public.lms_modules enable row level security;
alter table public.lms_pages enable row level security;
alter table public.lms_files enable row level security;
alter table public.lms_assignments enable row level security;
alter table public.lms_quizzes enable row level security;
alter table public.lms_quiz_attempts enable row level security;
alter table public.lms_submissions enable row level security;
alter table public.lms_rubric_sets enable row level security;
alter table public.lms_rubric_scores enable row level security;
alter table public.lms_module_items enable row level security;
alter table public.lms_discussions enable row level security;
alter table public.lms_discussion_replies enable row level security;
alter table public.lms_inbox_threads enable row level security;
alter table public.lms_inbox_participants enable row level security;
alter table public.lms_inbox_messages enable row level security;
alter table public.lms_calendar_events enable row level security;
alter table public.lms_notifications enable row level security;
alter table public.lms_todo_items enable row level security;
alter table public.lms_analytics_events enable row level security;
alter table public.lms_attendance enable row level security;
alter table public.lms_role_bindings enable row level security;
alter table public.lms_permission_overrides enable row level security;
alter table public.lms_audit_events enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists students_self on public.students;
create policy students_self on public.students
for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists student_pdfs_owner on public.student_pdfs;
create policy student_pdfs_owner on public.student_pdfs
for all using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists sources_owner on public.sources;
create policy sources_owner on public.sources
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists source_contents_owner on public.source_contents;
create policy source_contents_owner on public.source_contents
for all using (exists (
  select 1 from public.sources s where s.id = source_contents.source_id and s.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.sources s where s.id = source_contents.source_id and s.owner_id = auth.uid()
));

drop policy if exists source_chunks_owner on public.source_chunks;
create policy source_chunks_owner on public.source_chunks
for all using (exists (
  select 1 from public.sources s where s.id = source_chunks.source_id and s.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.sources s where s.id = source_chunks.source_id and s.owner_id = auth.uid()
));

drop policy if exists flashcard_sets_owner on public.flashcard_sets;
create policy flashcard_sets_owner on public.flashcard_sets
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists flashcards_owner on public.flashcards;
create policy flashcards_owner on public.flashcards
for all using (exists (
  select 1 from public.flashcard_sets fs where fs.id = flashcards.set_id and fs.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.flashcard_sets fs where fs.id = flashcards.set_id and fs.owner_id = auth.uid()
));

drop policy if exists flashcard_reviews_owner on public.flashcard_reviews;
create policy flashcard_reviews_owner on public.flashcard_reviews
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists flashcard_progress_owner on public.flashcard_progress;
create policy flashcard_progress_owner on public.flashcard_progress
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists sections_owner on public.sections;
create policy sections_owner on public.sections
for all using (exists (
  select 1 from public.sources s where s.id = sections.source_id and s.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.sources s where s.id = sections.source_id and s.owner_id = auth.uid()
));

drop policy if exists section_days_owner on public.section_study_days;
create policy section_days_owner on public.section_study_days
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists concept_maps_owner on public.concept_maps;
create policy concept_maps_owner on public.concept_maps
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists concept_nodes_owner on public.concept_map_nodes;
create policy concept_nodes_owner on public.concept_map_nodes
for all using (exists (
  select 1 from public.concept_maps cm where cm.id = concept_map_nodes.map_id and cm.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.concept_maps cm where cm.id = concept_map_nodes.map_id and cm.owner_id = auth.uid()
));

drop policy if exists concept_edges_owner on public.concept_map_edges;
create policy concept_edges_owner on public.concept_map_edges
for all using (exists (
  select 1 from public.concept_maps cm where cm.id = concept_map_edges.map_id and cm.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.concept_maps cm where cm.id = concept_map_edges.map_id and cm.owner_id = auth.uid()
));

drop policy if exists notebook_sessions_owner on public.notebook_sessions;
create policy notebook_sessions_owner on public.notebook_sessions
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists notebook_session_sources_owner on public.notebook_session_sources;
create policy notebook_session_sources_owner on public.notebook_session_sources
for all using (exists (
  select 1 from public.notebook_sessions ns where ns.id = notebook_session_sources.session_id and ns.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.notebook_sessions ns where ns.id = notebook_session_sources.session_id and ns.owner_id = auth.uid()
));

drop policy if exists notebook_outputs_owner on public.notebook_outputs;
create policy notebook_outputs_owner on public.notebook_outputs
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists notebook_citations_owner on public.notebook_citations;
create policy notebook_citations_owner on public.notebook_citations
for all using (exists (
  select 1 from public.notebook_outputs no where no.id = notebook_citations.output_id and no.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.notebook_outputs no where no.id = notebook_citations.output_id and no.owner_id = auth.uid()
));

drop policy if exists presentations_owner on public.presentations;
create policy presentations_owner on public.presentations
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists presentation_sources_owner on public.presentation_sources;
create policy presentation_sources_owner on public.presentation_sources
for all using (exists (
  select 1 from public.presentations p where p.id = presentation_sources.presentation_id and p.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.presentations p where p.id = presentation_sources.presentation_id and p.owner_id = auth.uid()
));

drop policy if exists presentation_slides_owner on public.presentation_slides;
create policy presentation_slides_owner on public.presentation_slides
for all using (exists (
  select 1 from public.presentations p where p.id = presentation_slides.presentation_id and p.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.presentations p where p.id = presentation_slides.presentation_id and p.owner_id = auth.uid()
));

drop policy if exists presentation_refs_owner on public.presentation_references;
create policy presentation_refs_owner on public.presentation_references
for all using (exists (
  select 1 from public.presentations p where p.id = presentation_references.presentation_id and p.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.presentations p where p.id = presentation_references.presentation_id and p.owner_id = auth.uid()
));

drop policy if exists quizzes_owner on public.quizzes;
create policy quizzes_owner on public.quizzes
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists quiz_questions_owner on public.quiz_questions;
create policy quiz_questions_owner on public.quiz_questions
for all using (exists (
  select 1 from public.quizzes q where q.id = quiz_questions.quiz_id and q.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.quizzes q where q.id = quiz_questions.quiz_id and q.owner_id = auth.uid()
));

drop policy if exists quiz_attempts_owner on public.quiz_attempts;
create policy quiz_attempts_owner on public.quiz_attempts
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists quiz_attempt_answers_owner on public.quiz_attempt_answers;
create policy quiz_attempt_answers_owner on public.quiz_attempt_answers
for all using (exists (
  select 1 from public.quiz_attempts qa where qa.id = quiz_attempt_answers.attempt_id and qa.user_id = auth.uid()
)) with check (exists (
  select 1 from public.quiz_attempts qa where qa.id = quiz_attempt_answers.attempt_id and qa.user_id = auth.uid()
));

drop policy if exists terms_owner on public.academic_terms;
create policy terms_owner on public.academic_terms
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists grades_owner on public.grades;
create policy grades_owner on public.grades
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists sims_owner on public.grade_simulations;
create policy sims_owner on public.grade_simulations
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists academic_ai_owner on public.academic_ai_outputs;
create policy academic_ai_owner on public.academic_ai_outputs
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists tasks_owner on public.tasks;
create policy tasks_owner on public.tasks
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists chat_rooms_member on public.chat_rooms;
create policy chat_rooms_member on public.chat_rooms
for select using (
  owner_id = auth.uid()
  or exists (select 1 from public.chat_members cm where cm.room_id = chat_rooms.id and cm.user_id = auth.uid())
);
drop policy if exists chat_rooms_owner_write on public.chat_rooms;
create policy chat_rooms_owner_write on public.chat_rooms
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists chat_members_room_member on public.chat_members;
create policy chat_members_room_member on public.chat_members
for select using (
  exists (select 1 from public.chat_members me where me.room_id = chat_members.room_id and me.user_id = auth.uid())
);
drop policy if exists chat_members_room_owner_write on public.chat_members;
create policy chat_members_room_owner_write on public.chat_members
for all using (
  exists (select 1 from public.chat_rooms cr where cr.id = chat_members.room_id and cr.owner_id = auth.uid())
) with check (
  exists (select 1 from public.chat_rooms cr where cr.id = chat_members.room_id and cr.owner_id = auth.uid())
);

drop policy if exists chat_messages_room_member on public.chat_messages;
create policy chat_messages_room_member on public.chat_messages
for select using (
  exists (select 1 from public.chat_members cm where cm.room_id = chat_messages.room_id and cm.user_id = auth.uid())
);
drop policy if exists chat_messages_sender_insert on public.chat_messages;
create policy chat_messages_sender_insert on public.chat_messages
for insert with check (
  sender_id = auth.uid()
  and exists (select 1 from public.chat_members cm where cm.room_id = chat_messages.room_id and cm.user_id = auth.uid())
);

drop policy if exists tutor_conversations_owner on public.tutor_conversations;
create policy tutor_conversations_owner on public.tutor_conversations
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists tutor_messages_owner on public.tutor_messages;
create policy tutor_messages_owner on public.tutor_messages
for all using (exists (
  select 1 from public.tutor_conversations tc where tc.id = tutor_messages.conversation_id and tc.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.tutor_conversations tc where tc.id = tutor_messages.conversation_id and tc.owner_id = auth.uid()
));

drop policy if exists source_embeddings_owner on public.source_embeddings;
create policy source_embeddings_owner on public.source_embeddings
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists teacher_classes_owner on public.teacher_classes;
create policy teacher_classes_owner on public.teacher_classes
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists class_enrollments_visible on public.class_enrollments;
create policy class_enrollments_visible on public.class_enrollments
for select using (
  student_id = auth.uid()
  or exists (
    select 1 from public.teacher_classes tc where tc.id = class_enrollments.class_id and tc.teacher_id = auth.uid()
  )
);
drop policy if exists class_enrollments_teacher_write on public.class_enrollments;
create policy class_enrollments_teacher_write on public.class_enrollments
for all using (
  exists (
    select 1 from public.teacher_classes tc where tc.id = class_enrollments.class_id and tc.teacher_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.teacher_classes tc where tc.id = class_enrollments.class_id and tc.teacher_id = auth.uid()
  )
);

drop policy if exists class_materials_access on public.class_materials;
create policy class_materials_access on public.class_materials
for select using (
  exists (
    select 1
    from public.teacher_classes tc
    left join public.class_enrollments ce on ce.class_id = tc.id and ce.student_id = auth.uid()
    where tc.id = class_materials.class_id and (tc.teacher_id = auth.uid() or ce.student_id is not null)
  )
);
drop policy if exists class_materials_teacher_write on public.class_materials;
create policy class_materials_teacher_write on public.class_materials
for all using (
  exists (
    select 1 from public.teacher_classes tc where tc.id = class_materials.class_id and tc.teacher_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.teacher_classes tc where tc.id = class_materials.class_id and tc.teacher_id = auth.uid()
  )
);

drop policy if exists teacher_assignments_access on public.teacher_assignments;
create policy teacher_assignments_access on public.teacher_assignments
for select using (
  teacher_id = auth.uid()
  or exists (
    select 1 from public.class_enrollments ce where ce.class_id = teacher_assignments.class_id and ce.student_id = auth.uid()
  )
);
drop policy if exists teacher_assignments_teacher_write on public.teacher_assignments;
create policy teacher_assignments_teacher_write on public.teacher_assignments
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists assignment_submissions_access on public.assignment_submissions;
create policy assignment_submissions_access on public.assignment_submissions
for select using (
  student_id = auth.uid()
  or exists (
    select 1
    from public.teacher_assignments ta
    where ta.id = assignment_submissions.assignment_id and ta.teacher_id = auth.uid()
  )
);
drop policy if exists assignment_submissions_student_insert on public.assignment_submissions;
create policy assignment_submissions_student_insert on public.assignment_submissions
for insert with check (student_id = auth.uid());
drop policy if exists assignment_submissions_teacher_update on public.assignment_submissions;
create policy assignment_submissions_teacher_update on public.assignment_submissions
for update using (
  exists (
    select 1 from public.teacher_assignments ta where ta.id = assignment_submissions.assignment_id and ta.teacher_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.teacher_assignments ta where ta.id = assignment_submissions.assignment_id and ta.teacher_id = auth.uid()
  )
);

drop policy if exists teacher_announcements_access on public.teacher_announcements;
create policy teacher_announcements_access on public.teacher_announcements
for select using (
  teacher_id = auth.uid()
  or exists (
    select 1 from public.class_enrollments ce where ce.class_id = teacher_announcements.class_id and ce.student_id = auth.uid()
  )
);
drop policy if exists teacher_announcements_teacher_write on public.teacher_announcements;
create policy teacher_announcements_teacher_write on public.teacher_announcements
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists teacher_grades_access on public.teacher_grades;
create policy teacher_grades_access on public.teacher_grades
for select using (
  teacher_id = auth.uid() or student_id = auth.uid()
);
drop policy if exists teacher_grades_teacher_write on public.teacher_grades;
create policy teacher_grades_teacher_write on public.teacher_grades
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists teacher_generated_quizzes_access on public.teacher_generated_quizzes;
create policy teacher_generated_quizzes_access on public.teacher_generated_quizzes
for select using (
  teacher_id = auth.uid()
  or exists (
    select 1 from public.class_enrollments ce where ce.class_id = teacher_generated_quizzes.class_id and ce.student_id = auth.uid()
  )
);
drop policy if exists teacher_generated_quizzes_teacher_write on public.teacher_generated_quizzes;
create policy teacher_generated_quizzes_teacher_write on public.teacher_generated_quizzes
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists lms_courses_access on public.lms_courses;
create policy lms_courses_access on public.lms_courses
for select using (
  owner_teacher_id = auth.uid()
  or exists (
    select 1 from public.lms_enrollments e
    where e.course_id = lms_courses.id and e.user_id = auth.uid() and e.status = 'active'
  )
);
drop policy if exists lms_courses_owner_write on public.lms_courses;
create policy lms_courses_owner_write on public.lms_courses
for all using (owner_teacher_id = auth.uid()) with check (owner_teacher_id = auth.uid());

drop policy if exists lms_sections_access on public.lms_course_sections;
create policy lms_sections_access on public.lms_course_sections
for select using (
  exists (
    select 1 from public.lms_courses c
    where c.id = lms_course_sections.course_id
      and (c.owner_teacher_id = auth.uid() or exists (
        select 1 from public.lms_enrollments e
        where e.course_id = c.id and e.user_id = auth.uid() and e.status = 'active'
      ))
  )
);
drop policy if exists lms_sections_teacher_write on public.lms_course_sections;
create policy lms_sections_teacher_write on public.lms_course_sections
for all using (
  exists (select 1 from public.lms_courses c where c.id = lms_course_sections.course_id and c.owner_teacher_id = auth.uid())
) with check (
  exists (select 1 from public.lms_courses c where c.id = lms_course_sections.course_id and c.owner_teacher_id = auth.uid())
);

drop policy if exists lms_enrollments_access on public.lms_enrollments;
create policy lms_enrollments_access on public.lms_enrollments
for select using (
  user_id = auth.uid()
  or exists (select 1 from public.lms_courses c where c.id = lms_enrollments.course_id and c.owner_teacher_id = auth.uid())
);
drop policy if exists lms_enrollments_teacher_write on public.lms_enrollments;
create policy lms_enrollments_teacher_write on public.lms_enrollments
for all using (
  exists (select 1 from public.lms_courses c where c.id = lms_enrollments.course_id and c.owner_teacher_id = auth.uid())
) with check (
  exists (select 1 from public.lms_courses c where c.id = lms_enrollments.course_id and c.owner_teacher_id = auth.uid())
);

drop policy if exists lms_modules_access on public.lms_modules;
create policy lms_modules_access on public.lms_modules
for select using (
  exists (
    select 1 from public.lms_courses c
    where c.id = lms_modules.course_id
      and (c.owner_teacher_id = auth.uid() or exists (
        select 1 from public.lms_enrollments e where e.course_id = c.id and e.user_id = auth.uid() and e.status = 'active'
      ))
  )
);
drop policy if exists lms_modules_teacher_write on public.lms_modules;
create policy lms_modules_teacher_write on public.lms_modules
for all using (
  exists (select 1 from public.lms_courses c where c.id = lms_modules.course_id and c.owner_teacher_id = auth.uid())
) with check (
  exists (select 1 from public.lms_courses c where c.id = lms_modules.course_id and c.owner_teacher_id = auth.uid())
);

drop policy if exists lms_pages_access on public.lms_pages;
create policy lms_pages_access on public.lms_pages
for select using (
  exists (
    select 1 from public.lms_courses c
    where c.id = lms_pages.course_id
      and (c.owner_teacher_id = auth.uid() or exists (
        select 1 from public.lms_enrollments e where e.course_id = c.id and e.user_id = auth.uid() and e.status = 'active'
      ))
  )
);
drop policy if exists lms_pages_teacher_write on public.lms_pages;
create policy lms_pages_teacher_write on public.lms_pages
for all using (
  exists (select 1 from public.lms_courses c where c.id = lms_pages.course_id and c.owner_teacher_id = auth.uid())
) with check (
  exists (select 1 from public.lms_courses c where c.id = lms_pages.course_id and c.owner_teacher_id = auth.uid())
);

drop policy if exists lms_files_access on public.lms_files;
create policy lms_files_access on public.lms_files
for select using (
  exists (
    select 1 from public.lms_courses c
    where c.id = lms_files.course_id
      and (c.owner_teacher_id = auth.uid() or exists (
        select 1 from public.lms_enrollments e where e.course_id = c.id and e.user_id = auth.uid() and e.status = 'active'
      ))
  )
);
drop policy if exists lms_files_teacher_write on public.lms_files;
create policy lms_files_teacher_write on public.lms_files
for all using (
  exists (select 1 from public.lms_courses c where c.id = lms_files.course_id and c.owner_teacher_id = auth.uid())
) with check (
  exists (select 1 from public.lms_courses c where c.id = lms_files.course_id and c.owner_teacher_id = auth.uid())
);

drop policy if exists lms_assignments_access on public.lms_assignments;
create policy lms_assignments_access on public.lms_assignments
for select using (
  exists (
    select 1 from public.lms_courses c
    where c.id = lms_assignments.course_id
      and (c.owner_teacher_id = auth.uid() or exists (
        select 1 from public.lms_enrollments e where e.course_id = c.id and e.user_id = auth.uid() and e.status = 'active'
      ))
  )
);
drop policy if exists lms_assignments_teacher_write on public.lms_assignments;
create policy lms_assignments_teacher_write on public.lms_assignments
for all using (
  exists (select 1 from public.lms_courses c where c.id = lms_assignments.course_id and c.owner_teacher_id = auth.uid())
) with check (
  exists (select 1 from public.lms_courses c where c.id = lms_assignments.course_id and c.owner_teacher_id = auth.uid())
);

drop policy if exists lms_quizzes_access on public.lms_quizzes;
create policy lms_quizzes_access on public.lms_quizzes
for select using (
  exists (
    select 1 from public.lms_courses c
    where c.id = lms_quizzes.course_id and (
      c.owner_teacher_id = auth.uid() or exists (
        select 1 from public.lms_enrollments e where e.course_id = c.id and e.user_id = auth.uid() and e.status = 'active'
      )
    )
  )
);
drop policy if exists lms_quizzes_teacher_write on public.lms_quizzes;
create policy lms_quizzes_teacher_write on public.lms_quizzes
for all using (
  exists (select 1 from public.lms_courses c where c.id = lms_quizzes.course_id and c.owner_teacher_id = auth.uid())
) with check (
  exists (select 1 from public.lms_courses c where c.id = lms_quizzes.course_id and c.owner_teacher_id = auth.uid())
);

drop policy if exists lms_quiz_attempts_access on public.lms_quiz_attempts;
create policy lms_quiz_attempts_access on public.lms_quiz_attempts
for select using (
  student_id = auth.uid()
  or exists (
    select 1 from public.lms_quizzes q join public.lms_courses c on c.id = q.course_id
    where q.id = lms_quiz_attempts.quiz_id and c.owner_teacher_id = auth.uid()
  )
);
drop policy if exists lms_quiz_attempts_student_insert on public.lms_quiz_attempts;
create policy lms_quiz_attempts_student_insert on public.lms_quiz_attempts
for insert with check (student_id = auth.uid());

drop policy if exists lms_submissions_access on public.lms_submissions;
create policy lms_submissions_access on public.lms_submissions
for select using (
  student_id = auth.uid()
  or exists (
    select 1
    from public.lms_assignments a
    join public.lms_courses c on c.id = a.course_id
    where a.id = lms_submissions.assignment_id and c.owner_teacher_id = auth.uid()
  )
);
drop policy if exists lms_submissions_student_insert on public.lms_submissions;
create policy lms_submissions_student_insert on public.lms_submissions
for insert with check (student_id = auth.uid());
drop policy if exists lms_submissions_teacher_update on public.lms_submissions;
create policy lms_submissions_teacher_update on public.lms_submissions
for update using (
  exists (
    select 1
    from public.lms_assignments a
    join public.lms_courses c on c.id = a.course_id
    where a.id = lms_submissions.assignment_id and c.owner_teacher_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.lms_assignments a
    join public.lms_courses c on c.id = a.course_id
    where a.id = lms_submissions.assignment_id and c.owner_teacher_id = auth.uid()
  )
);

drop policy if exists lms_rubric_sets_access on public.lms_rubric_sets;
create policy lms_rubric_sets_access on public.lms_rubric_sets
for select using (
  exists (
    select 1 from public.lms_assignments a join public.lms_courses c on c.id = a.course_id
    where a.id = lms_rubric_sets.assignment_id and (c.owner_teacher_id = auth.uid() or exists (
      select 1 from public.lms_enrollments e where e.course_id = c.id and e.user_id = auth.uid() and e.status = 'active'
    ))
  )
);
drop policy if exists lms_rubric_sets_teacher_write on public.lms_rubric_sets;
create policy lms_rubric_sets_teacher_write on public.lms_rubric_sets
for all using (
  exists (
    select 1 from public.lms_assignments a join public.lms_courses c on c.id = a.course_id
    where a.id = lms_rubric_sets.assignment_id and c.owner_teacher_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.lms_assignments a join public.lms_courses c on c.id = a.course_id
    where a.id = lms_rubric_sets.assignment_id and c.owner_teacher_id = auth.uid()
  )
);

drop policy if exists lms_rubric_scores_access on public.lms_rubric_scores;
create policy lms_rubric_scores_access on public.lms_rubric_scores
for select using (
  exists (
    select 1 from public.lms_submissions s
    where s.id = lms_rubric_scores.submission_id and (
      s.student_id = auth.uid() or exists (
        select 1 from public.lms_assignments a join public.lms_courses c on c.id = a.course_id
        where a.id = s.assignment_id and c.owner_teacher_id = auth.uid()
      )
    )
  )
);
drop policy if exists lms_rubric_scores_teacher_write on public.lms_rubric_scores;
create policy lms_rubric_scores_teacher_write on public.lms_rubric_scores
for all using (scorer_id = auth.uid()) with check (scorer_id = auth.uid());

drop policy if exists lms_module_items_access on public.lms_module_items;
create policy lms_module_items_access on public.lms_module_items
for select using (
  exists (
    select 1 from public.lms_modules m join public.lms_courses c on c.id = m.course_id
    where m.id = lms_module_items.module_id and (
      c.owner_teacher_id = auth.uid() or exists (
        select 1 from public.lms_enrollments e where e.course_id = c.id and e.user_id = auth.uid() and e.status = 'active'
      )
    )
  )
);
drop policy if exists lms_module_items_teacher_write on public.lms_module_items;
create policy lms_module_items_teacher_write on public.lms_module_items
for all using (
  exists (
    select 1 from public.lms_modules m join public.lms_courses c on c.id = m.course_id
    where m.id = lms_module_items.module_id and c.owner_teacher_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.lms_modules m join public.lms_courses c on c.id = m.course_id
    where m.id = lms_module_items.module_id and c.owner_teacher_id = auth.uid()
  )
);

drop policy if exists lms_discussions_access on public.lms_discussions;
create policy lms_discussions_access on public.lms_discussions
for select using (
  exists (
    select 1 from public.lms_courses c
    where c.id = lms_discussions.course_id and (
      c.owner_teacher_id = auth.uid() or exists (
        select 1 from public.lms_enrollments e where e.course_id = c.id and e.user_id = auth.uid() and e.status = 'active'
      )
    )
  )
);
drop policy if exists lms_discussions_member_write on public.lms_discussions;
create policy lms_discussions_member_write on public.lms_discussions
for all using (
  exists (
    select 1 from public.lms_courses c
    where c.id = lms_discussions.course_id and (
      c.owner_teacher_id = auth.uid() or exists (
        select 1 from public.lms_enrollments e where e.course_id = c.id and e.user_id = auth.uid() and e.status = 'active'
      )
    )
  )
) with check (
  exists (
    select 1 from public.lms_courses c
    where c.id = lms_discussions.course_id and (
      c.owner_teacher_id = auth.uid() or exists (
        select 1 from public.lms_enrollments e where e.course_id = c.id and e.user_id = auth.uid() and e.status = 'active'
      )
    )
  )
);

drop policy if exists lms_discussion_replies_access on public.lms_discussion_replies;
create policy lms_discussion_replies_access on public.lms_discussion_replies
for all using (
  exists (
    select 1 from public.lms_discussions d join public.lms_courses c on c.id = d.course_id
    where d.id = lms_discussion_replies.discussion_id and (
      c.owner_teacher_id = auth.uid() or exists (
        select 1 from public.lms_enrollments e where e.course_id = c.id and e.user_id = auth.uid() and e.status = 'active'
      )
    )
  )
) with check (
  exists (
    select 1 from public.lms_discussions d join public.lms_courses c on c.id = d.course_id
    where d.id = lms_discussion_replies.discussion_id and (
      c.owner_teacher_id = auth.uid() or exists (
        select 1 from public.lms_enrollments e where e.course_id = c.id and e.user_id = auth.uid() and e.status = 'active'
      )
    )
  )
);

drop policy if exists lms_inbox_threads_participant on public.lms_inbox_threads;
create policy lms_inbox_threads_participant on public.lms_inbox_threads
for select using (
  exists (select 1 from public.lms_inbox_participants p where p.thread_id = lms_inbox_threads.id and p.user_id = auth.uid())
);
drop policy if exists lms_inbox_threads_creator_write on public.lms_inbox_threads;
create policy lms_inbox_threads_creator_write on public.lms_inbox_threads
for all using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists lms_inbox_participants_access on public.lms_inbox_participants;
create policy lms_inbox_participants_access on public.lms_inbox_participants
for all using (
  user_id = auth.uid() or exists (
    select 1 from public.lms_inbox_threads t where t.id = lms_inbox_participants.thread_id and t.created_by = auth.uid()
  )
) with check (
  user_id = auth.uid() or exists (
    select 1 from public.lms_inbox_threads t where t.id = lms_inbox_participants.thread_id and t.created_by = auth.uid()
  )
);

drop policy if exists lms_inbox_messages_participant on public.lms_inbox_messages;
create policy lms_inbox_messages_participant on public.lms_inbox_messages
for all using (
  exists (select 1 from public.lms_inbox_participants p where p.thread_id = lms_inbox_messages.thread_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from public.lms_inbox_participants p where p.thread_id = lms_inbox_messages.thread_id and p.user_id = auth.uid())
  and sender_id = auth.uid()
);

drop policy if exists lms_calendar_owner on public.lms_calendar_events;
create policy lms_calendar_owner on public.lms_calendar_events
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists lms_notifications_owner on public.lms_notifications;
create policy lms_notifications_owner on public.lms_notifications
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists lms_todo_owner on public.lms_todo_items;
create policy lms_todo_owner on public.lms_todo_items
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists lms_analytics_access on public.lms_analytics_events;
create policy lms_analytics_access on public.lms_analytics_events
for select using (
  user_id = auth.uid() or exists (
    select 1 from public.lms_courses c where c.id = lms_analytics_events.course_id and c.owner_teacher_id = auth.uid()
  )
);
drop policy if exists lms_analytics_insert_self on public.lms_analytics_events;
create policy lms_analytics_insert_self on public.lms_analytics_events
for insert with check (user_id = auth.uid());

drop policy if exists lms_attendance_access on public.lms_attendance;
create policy lms_attendance_access on public.lms_attendance
for select using (
  student_id = auth.uid() or exists (
    select 1 from public.lms_courses c where c.id = lms_attendance.course_id and c.owner_teacher_id = auth.uid()
  )
);
drop policy if exists lms_attendance_teacher_write on public.lms_attendance;
create policy lms_attendance_teacher_write on public.lms_attendance
for all using (
  exists (select 1 from public.lms_courses c where c.id = lms_attendance.course_id and c.owner_teacher_id = auth.uid())
) with check (
  exists (select 1 from public.lms_courses c where c.id = lms_attendance.course_id and c.owner_teacher_id = auth.uid())
);

drop policy if exists lms_role_bindings_access on public.lms_role_bindings;
create policy lms_role_bindings_access on public.lms_role_bindings
for select using (user_id = auth.uid());
drop policy if exists lms_role_bindings_self_write on public.lms_role_bindings;
create policy lms_role_bindings_self_write on public.lms_role_bindings
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists lms_permission_overrides_read on public.lms_permission_overrides;
create policy lms_permission_overrides_read on public.lms_permission_overrides
for select using (true);
drop policy if exists lms_permission_overrides_write on public.lms_permission_overrides;
create policy lms_permission_overrides_write on public.lms_permission_overrides
for all using (
  exists (
    select 1 from public.lms_role_bindings rb
    where rb.user_id = auth.uid() and rb.scope_type = 'global' and rb.role = 'admin'
  )
) with check (
  exists (
    select 1 from public.lms_role_bindings rb
    where rb.user_id = auth.uid() and rb.scope_type = 'global' and rb.role = 'admin'
  )
);

drop policy if exists lms_audit_events_read on public.lms_audit_events;
create policy lms_audit_events_read on public.lms_audit_events
for select using (actor_id = auth.uid());
drop policy if exists lms_audit_events_insert on public.lms_audit_events;
create policy lms_audit_events_insert on public.lms_audit_events
for insert with check (actor_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('sources-private', 'sources-private', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('presentation-assets', 'presentation-assets', false)
on conflict (id) do nothing;

drop policy if exists sources_private_select on storage.objects;
create policy sources_private_select on storage.objects
for select to authenticated
using (
  bucket_id = 'sources-private'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists sources_private_insert on storage.objects;
create policy sources_private_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'sources-private'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists sources_private_update on storage.objects;
create policy sources_private_update on storage.objects
for update to authenticated
using (
  bucket_id = 'sources-private'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'sources-private'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists sources_private_delete on storage.objects;
create policy sources_private_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'sources-private'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- Node API uses SUPABASE_SERVICE_ROLE_KEY: Storage requests bypass RLS by default.
-- Explicit service_role policies document intent and help if you ever use a JWT-bound service client.
drop policy if exists sources_private_service_role_all on storage.objects;
create policy sources_private_service_role_all on storage.objects
for all
to service_role
using (bucket_id = 'sources-private')
with check (bucket_id = 'sources-private');

drop policy if exists presentation_assets_service_role_all on storage.objects;
create policy presentation_assets_service_role_all on storage.objects
for all
to service_role
using (bucket_id = 'presentation-assets')
with check (bucket_id = 'presentation-assets');


-- >>>>> END: supabase-rls.sql <<<<<


-- >>>>> BEGIN: supabase-indexes.sql <<<<<

create index if not exists idx_students_created_at on public.students(created_at desc);
create index if not exists idx_student_pdfs_student_created on public.student_pdfs(student_id, created_at desc);
create index if not exists idx_sources_owner_created on public.sources(owner_id, created_at desc);
create index if not exists idx_sources_owner_status on public.sources(owner_id, status);
create index if not exists idx_source_contents_source on public.source_contents(source_id);
create index if not exists idx_source_chunks_source_chunk on public.source_chunks(source_id, chunk_index);
create index if not exists idx_flashcard_sets_owner_created on public.flashcard_sets(owner_id, created_at desc);
create index if not exists idx_flashcards_set on public.flashcards(set_id);
create index if not exists idx_flashcard_reviews_user_time on public.flashcard_reviews(user_id, reviewed_at desc);
create index if not exists idx_flashcard_progress_user on public.flashcard_progress(user_id);
create index if not exists idx_sections_source on public.sections(source_id);
create index if not exists idx_section_days_user_date on public.section_study_days(user_id, study_date desc);
create index if not exists idx_concept_maps_owner_created on public.concept_maps(owner_id, created_at desc);
create index if not exists idx_nodes_map on public.concept_map_nodes(map_id);
create index if not exists idx_edges_map on public.concept_map_edges(map_id);
create index if not exists idx_notebook_sessions_owner_created on public.notebook_sessions(owner_id, created_at desc);
create index if not exists idx_notebook_outputs_owner_created on public.notebook_outputs(owner_id, created_at desc);
create index if not exists idx_notebook_outputs_payload_gin on public.notebook_outputs using gin (payload);
create index if not exists idx_presentations_owner_created on public.presentations(owner_id, created_at desc);
create index if not exists idx_presentation_slides_pres_idx on public.presentation_slides(presentation_id, slide_index);
create index if not exists idx_quizzes_owner_created on public.quizzes(owner_id, created_at desc);
create index if not exists idx_quiz_questions_quiz on public.quiz_questions(quiz_id);
create index if not exists idx_quiz_attempts_user_time on public.quiz_attempts(user_id, started_at desc);
create index if not exists idx_grades_owner_recorded on public.grades(owner_id, recorded_at desc);
create index if not exists idx_grade_sim_owner_created on public.grade_simulations(owner_id, created_at desc);
create index if not exists idx_academic_ai_owner_created on public.academic_ai_outputs(owner_id, created_at desc);
create index if not exists idx_academic_ai_payload_gin on public.academic_ai_outputs using gin (payload);
create index if not exists idx_tasks_owner_created on public.tasks(owner_id, created_at desc);
create index if not exists idx_chat_rooms_owner on public.chat_rooms(owner_id);
create index if not exists idx_chat_members_user_room on public.chat_members(user_id, room_id);
create index if not exists idx_chat_messages_room_created on public.chat_messages(room_id, created_at desc);
create index if not exists idx_tutor_conv_owner_created on public.tutor_conversations(owner_id, created_at desc);
create index if not exists idx_tutor_messages_conversation_created on public.tutor_messages(conversation_id, created_at desc);
create index if not exists idx_source_embeddings_owner on public.source_embeddings(owner_id, created_at desc);
create index if not exists idx_source_embeddings_source on public.source_embeddings(source_id);
create index if not exists idx_source_embeddings_vector on public.source_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists idx_teacher_classes_teacher_created on public.teacher_classes(teacher_id, created_at desc);
create index if not exists idx_teacher_classes_code on public.teacher_classes(code);
create index if not exists idx_class_enrollments_student on public.class_enrollments(student_id, class_id);
create index if not exists idx_class_materials_class_created on public.class_materials(class_id, created_at desc);
create index if not exists idx_teacher_assignments_class_due on public.teacher_assignments(class_id, due_at);
create index if not exists idx_teacher_assignments_teacher_created on public.teacher_assignments(teacher_id, created_at desc);
create index if not exists idx_assignment_submissions_assignment on public.assignment_submissions(assignment_id, created_at desc);
create index if not exists idx_assignment_submissions_student on public.assignment_submissions(student_id, created_at desc);
create index if not exists idx_teacher_announcements_class_created on public.teacher_announcements(class_id, created_at desc);
create index if not exists idx_teacher_grades_class_student on public.teacher_grades(class_id, student_id, created_at desc);
create index if not exists idx_teacher_generated_quizzes_class_created on public.teacher_generated_quizzes(class_id, created_at desc);
create index if not exists idx_lms_courses_owner_created on public.lms_courses(owner_teacher_id, created_at desc);
create index if not exists idx_lms_courses_code on public.lms_courses(code);
create index if not exists idx_lms_sections_course on public.lms_course_sections(course_id, created_at desc);
create index if not exists idx_lms_enrollments_course_user on public.lms_enrollments(course_id, user_id);
create index if not exists idx_lms_enrollments_user_course on public.lms_enrollments(user_id, course_id);
create index if not exists idx_lms_modules_course_position on public.lms_modules(course_id, position);
create index if not exists idx_lms_pages_course_updated on public.lms_pages(course_id, updated_at desc);
create index if not exists idx_lms_files_course_created on public.lms_files(course_id, created_at desc);
create index if not exists idx_lms_assignments_course_due on public.lms_assignments(course_id, due_at);
create index if not exists idx_lms_quizzes_course_created on public.lms_quizzes(course_id, created_at desc);
create index if not exists idx_lms_quiz_attempts_quiz_student on public.lms_quiz_attempts(quiz_id, student_id, started_at desc);
create index if not exists idx_lms_quiz_attempts_student_started on public.lms_quiz_attempts(student_id, started_at desc);
create index if not exists idx_lms_submissions_assignment_student on public.lms_submissions(assignment_id, student_id, submitted_at desc);
create index if not exists idx_lms_submissions_student_created on public.lms_submissions(student_id, created_at desc);
create index if not exists idx_lms_rubric_sets_assignment on public.lms_rubric_sets(assignment_id, created_at desc);
create index if not exists idx_lms_rubric_scores_submission on public.lms_rubric_scores(submission_id, created_at desc);
create index if not exists idx_lms_module_items_module_pos on public.lms_module_items(module_id, position);
create index if not exists idx_lms_discussions_course_created on public.lms_discussions(course_id, created_at desc);
create index if not exists idx_lms_discussion_replies_discussion on public.lms_discussion_replies(discussion_id, created_at);
create index if not exists idx_lms_inbox_threads_course_updated on public.lms_inbox_threads(course_id, updated_at desc);
create index if not exists idx_lms_inbox_participants_user on public.lms_inbox_participants(user_id, thread_id);
create index if not exists idx_lms_inbox_messages_thread_created on public.lms_inbox_messages(thread_id, created_at desc);
create index if not exists idx_lms_calendar_owner_start on public.lms_calendar_events(owner_id, start_at);
create index if not exists idx_lms_notifications_user_created on public.lms_notifications(user_id, created_at desc);
create index if not exists idx_lms_notifications_user_read on public.lms_notifications(user_id, read_at);
create index if not exists idx_lms_todo_user_due on public.lms_todo_items(user_id, due_at);
create index if not exists idx_lms_analytics_course_created on public.lms_analytics_events(course_id, created_at desc);
create index if not exists idx_lms_analytics_user_created on public.lms_analytics_events(user_id, created_at desc);
create index if not exists idx_lms_attendance_course_date on public.lms_attendance(course_id, attendance_date desc);
create index if not exists idx_lms_attendance_student_date on public.lms_attendance(student_id, attendance_date desc);
create index if not exists idx_lms_role_bindings_user_scope on public.lms_role_bindings(user_id, scope_type, scope_id);
create index if not exists idx_lms_permission_overrides_scope on public.lms_permission_overrides(scope_type, scope_id, role);
create index if not exists idx_lms_audit_actor_created on public.lms_audit_events(actor_id, created_at desc);
create index if not exists idx_lms_audit_entity on public.lms_audit_events(entity_type, entity_id, created_at desc);

create index if not exists idx_sources_title_fts on public.sources using gin (to_tsvector('simple', coalesce(title, '')));
create index if not exists idx_source_contents_text_fts on public.source_contents using gin (to_tsvector('english', coalesce(cleaned_text, '')));


-- >>>>> END: supabase-indexes.sql <<<<<


-- >>>>> BEGIN: supabase-auth-profile-trigger.sql <<<<<

-- Optional: auto-create public.profiles when a user signs up (avoids race with first API call).
-- Run in Supabase SQL editor after public.profiles exists.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- >>>>> END: supabase-auth-profile-trigger.sql <<<<<


-- >>>>> BEGIN: supabase\migrations\0005_teacher_window.sql <<<<<

-- Teacher Window schema, RLS and indexes.
-- Apply after core schema / policies / indexes migrations.

create table if not exists public.teacher_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  code text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_enrollments (
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'invited', 'removed')),
  created_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create table if not exists public.class_materials (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  title text not null,
  material_type text not null default 'pdf' check (material_type in ('pdf', 'doc', 'note', 'link', 'other')),
  content text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  status text not null default 'published' check (status in ('draft', 'published', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.teacher_assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  submission_text text,
  submitted_at timestamptz,
  score numeric(5,2),
  feedback text,
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create table if not exists public.teacher_announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_grades (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid references public.teacher_assignments(id) on delete set null,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  feedback text,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_generated_quizzes (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.teacher_classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  difficulty public.quiz_difficulty not null default 'medium',
  question_count int not null default 10,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.teacher_classes enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.class_materials enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.teacher_announcements enable row level security;
alter table public.teacher_grades enable row level security;
alter table public.teacher_generated_quizzes enable row level security;

drop policy if exists teacher_classes_owner on public.teacher_classes;
create policy teacher_classes_owner on public.teacher_classes
for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists class_enrollments_visible on public.class_enrollments;
create policy class_enrollments_visible on public.class_enrollments
for select using (
  student_id = auth.uid()
  or exists (
    select 1 from public.teacher_classes tc where tc.id = class_enrollments.class_id and tc.teacher_id = auth.uid()
  )
);

drop policy if exists class_enrollments_teacher_write on public.class_enrollments;
create policy class_enrollments_teacher_write on public.class_enrollments
for all using (
  exists (
    select 1 from public.teacher_classes tc where tc.id = class_enrollments.class_id and tc.teacher_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.teacher_classes tc where tc.id = class_enrollments.class_id and tc.teacher_id = auth.uid()
  )
);

create index if not exists idx_teacher_classes_teacher_created on public.teacher_classes(teacher_id, created_at desc);
create index if not exists idx_teacher_classes_code on public.teacher_classes(code);
create index if not exists idx_class_enrollments_student on public.class_enrollments(student_id, class_id);
create index if not exists idx_class_materials_class_created on public.class_materials(class_id, created_at desc);
create index if not exists idx_teacher_assignments_class_due on public.teacher_assignments(class_id, due_at);
create index if not exists idx_teacher_assignments_teacher_created on public.teacher_assignments(teacher_id, created_at desc);
create index if not exists idx_assignment_submissions_assignment on public.assignment_submissions(assignment_id, created_at desc);
create index if not exists idx_assignment_submissions_student on public.assignment_submissions(student_id, created_at desc);
create index if not exists idx_teacher_announcements_class_created on public.teacher_announcements(class_id, created_at desc);
create index if not exists idx_teacher_grades_class_student on public.teacher_grades(class_id, student_id, created_at desc);
create index if not exists idx_teacher_generated_quizzes_class_created on public.teacher_generated_quizzes(class_id, created_at desc);


-- >>>>> END: supabase\migrations\0005_teacher_window.sql <<<<<


-- >>>>> BEGIN: supabase\migrations\0006_pgvector_rag.sql <<<<<

create extension if not exists vector;

create table if not exists public.source_embeddings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  chunk_id uuid references public.source_chunks(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

alter table public.source_embeddings enable row level security;

drop policy if exists source_embeddings_owner on public.source_embeddings;
create policy source_embeddings_owner on public.source_embeddings
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index if not exists idx_source_embeddings_owner on public.source_embeddings(owner_id, created_at desc);
create index if not exists idx_source_embeddings_source on public.source_embeddings(source_id);

create index if not exists idx_source_embeddings_vector
on public.source_embeddings
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);



-- >>>>> END: supabase\migrations\0006_pgvector_rag.sql <<<<<


-- >>>>> BEGIN: supabase\migrations\0007_tasks_calendar_reminders.sql <<<<<

-- Calendar tasks/events + email reminder tracking (run in Supabase SQL editor if upgrading an existing DB)
alter table public.tasks add column if not exists kind text not null default 'task';
alter table public.tasks add column if not exists reminder_1h_sent boolean not null default false;
alter table public.tasks add column if not exists reminder_10m_sent boolean not null default false;

update public.tasks set kind = 'task' where kind is null or kind not in ('task', 'event');

alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check (kind in ('task', 'event'));


-- >>>>> END: supabase\migrations\0007_tasks_calendar_reminders.sql <<<<<


-- >>>>> BEGIN: supabase\migrations\0008_portal_hardening.sql <<<<<

-- Portal hardening patch for mixed environments.
-- This migration is idempotent and focuses on compatibility + runtime safety.

create extension if not exists pgcrypto;

create table if not exists public.students (
  id uuid primary key references public.profiles(id) on delete cascade,
  name text not null default 'Student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_pdfs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table if exists public.students add column if not exists created_at timestamptz not null default now();
alter table if exists public.students add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  if to_jsonb(new) ? 'updated_at' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_at', now()));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_students_updated_at on public.students;
create trigger trg_students_updated_at before update on public.students for each row execute function public.set_updated_at();

alter table if exists public.students enable row level security;
alter table if exists public.student_pdfs enable row level security;

drop policy if exists students_self on public.students;
create policy students_self on public.students
for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists student_pdfs_owner on public.student_pdfs;
create policy student_pdfs_owner on public.student_pdfs
for all using (student_id = auth.uid()) with check (student_id = auth.uid());

create index if not exists idx_students_created_at on public.students(created_at desc);
create index if not exists idx_student_pdfs_student_created on public.student_pdfs(student_id, created_at desc);


-- >>>>> END: supabase\migrations\0008_portal_hardening.sql <<<<<


-- >>>>> BEGIN: supabase\migrations\0009_canvas_lms_foundation.sql <<<<<

-- Canvas-like LMS foundation migration.
-- Keep this file aligned with supabase-schema.sql / supabase-rls.sql / supabase-indexes.sql.
-- Safe to run repeatedly.

create extension if not exists pgcrypto;

-- Core compatibility: ensure the updated_at trigger function handles mixed schemas.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  if to_jsonb(new) ? 'updated_at' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_at', now()));
  end if;
  return new;
end;
$$;

-- LMS table placeholders are defined canonically in supabase-schema.sql.
-- This migration exists to provide an explicit rollout checkpoint for Canvas-like domain enablement.


-- >>>>> BEGIN: supabase-backfill.sql (optional — only if migrating legacy data) <<<<<

-- Compatibility bridge from legacy tables to normalized schema.
-- Run after supabase-schema.sql, supabase-rls.sql, and supabase-indexes.sql.
--
-- Sections that reference *_legacy tables are skipped automatically if those tables do not exist.

-- Legacy tables expected (current schema uses uuid FKs; legacy dumps may use text ids):
-- students(id uuid, ...), student_pdfs(student_id uuid, ...)
-- concept_maps_legacy / notebook_outputs_legacy вЂ” optional; only used when present.

-- 1) Build profile rows for users that exist in auth.users
insert into public.profiles (id, display_name)
select au.id, coalesce(nullif(trim(s.name), ''), 'Student')
from public.students s
join auth.users au on au.id = s.id
on conflict (id) do update
set display_name = excluded.display_name;

-- 2) Create one source per legacy PDF row
with prepared_pdfs as (
  select
    gen_random_uuid() as new_source_id,
    au.id as owner_id,
    sp.name as title,
    sp.content as raw_text,
    sp.content as cleaned_text,
    sp.created_at
  from public.student_pdfs sp
  join auth.users au on au.id = sp.student_id
)
insert into public.sources (id, owner_id, title, source_type, status, created_at, updated_at)
select new_source_id, owner_id, title, 'pdf'::public.source_type, 'ready'::public.source_status, coalesce(created_at, now()), now()
from prepared_pdfs;

with prepared_pdfs as (
  select
    s.id as source_id,
    sp.content as raw_text,
    sp.content as cleaned_text
  from public.student_pdfs sp
  join auth.users au on au.id = sp.student_id
  join public.sources s
    on s.owner_id = au.id and s.title = sp.name and s.source_type = 'pdf'::public.source_type
)
insert into public.source_contents (source_id, raw_text, cleaned_text, extraction_meta)
select source_id, raw_text, cleaned_text, '{}'::jsonb
from prepared_pdfs
on conflict (source_id) do nothing;

-- 3) Concept map backfill (skipped if public.concept_maps_legacy does not exist; EXECUTE avoids parse errors when table is missing)
do $body$
begin
  if to_regclass('public.concept_maps_legacy') is not null then
    execute $ins$
      insert into public.concept_maps (owner_id, source_id, title, version, created_at)
      select
        au.id as owner_id,
        s.id as source_id,
        coalesce(nullif(trim(cm.title), ''), 'Concept Map') as title,
        1,
        coalesce(cm.created_at, now())
      from public.concept_maps_legacy cm
      join auth.users au on au.id::text = cm.student_id::text
      join public.sources s on s.owner_id = au.id and s.title = cm.source_name
      on conflict do nothing
    $ins$;
  end if;
end $body$;

-- 4) Notebook outputs backfill (single generated session per user)
insert into public.notebook_sessions (id, owner_id, title)
select gen_random_uuid(), p.id, 'Imported session'
from public.profiles p
where not exists (
  select 1 from public.notebook_sessions ns where ns.owner_id = p.id and ns.title = 'Imported session'
);

-- 4b) Import rows from notebook_outputs_legacy (skipped if table does not exist)
do $body$
begin
  if to_regclass('public.notebook_outputs_legacy') is not null then
    execute $ins$
      insert into public.notebook_outputs (session_id, owner_id, output_type, payload, created_at)
      select
        ns.id,
        au.id as owner_id,
        case
          when lower(no.output_type) = 'source-chat' then 'source-chat'::public.notebook_output_type
          when lower(no.output_type) = 'summary' then 'summary'::public.notebook_output_type
          when lower(no.output_type) = 'study-guide' then 'study-guide'::public.notebook_output_type
          when lower(no.output_type) = 'source-compare' then 'source-compare'::public.notebook_output_type
          else 'audio-overview'::public.notebook_output_type
        end,
        coalesce(no.output_json::jsonb, '{}'::jsonb),
        coalesce(no.created_at, now())
      from public.notebook_outputs_legacy no
      join auth.users au on au.id::text = no.student_id::text
      join public.notebook_sessions ns on ns.owner_id = au.id and ns.title = 'Imported session'
    $ins$;
  end if;
end $body$;


-- >>>>> END: supabase-backfill.sql <<<<<


-- >>>>> BEGIN: Ollama RAG embeddings (768-dim; matches server OLLAMA_EMBED_DIM / nomic-embed-text) <<<<<
-- Merged from supabase/migrations/0010_ollama_embeddings.sql — required for /api/library/pdf chunk embedding writes to source_embeddings_ollama.

create extension if not exists vector;

create table if not exists public.source_embeddings_ollama (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid not null references public.source_chunks(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  embedding vector(768) not null,
  model text not null default 'nomic-embed-text',
  created_at timestamptz not null default now(),
  unique (chunk_id)
);

create index if not exists idx_source_emb_ollama_owner on public.source_embeddings_ollama(owner_id);
create index if not exists idx_source_emb_ollama_source on public.source_embeddings_ollama(source_id);

alter table public.source_embeddings_ollama enable row level security;

drop policy if exists source_embeddings_ollama_owner on public.source_embeddings_ollama;
create policy source_embeddings_ollama_owner on public.source_embeddings_ollama
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- Service role (Node API) bypasses RLS for inserts from embedAndStoreChunksForSource.
-- >>>>> END: Ollama RAG embeddings <<<<<
