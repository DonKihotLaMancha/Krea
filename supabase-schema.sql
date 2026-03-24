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
