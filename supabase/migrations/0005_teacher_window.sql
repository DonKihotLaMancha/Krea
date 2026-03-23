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
