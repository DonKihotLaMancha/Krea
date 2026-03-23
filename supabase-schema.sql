create extension if not exists pgcrypto;

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
  new.updated_at = now();
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

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
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
