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
