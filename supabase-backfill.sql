-- Compatibility bridge from legacy tables to normalized schema.
-- Run after supabase-schema.sql, supabase-rls.sql, and supabase-indexes.sql.

-- Legacy tables expected:
-- students(id text, name text, created_at timestamptz)
-- student_pdfs(student_id text, name text, content text, created_at timestamptz)
-- concept_maps(student_id text, source_name text, title text, map_json text, created_at timestamptz)
-- notebook_outputs(student_id text, source_names text, output_type text, output_json text, created_at timestamptz)

-- 1) Build profile rows for users that exist in auth.users
insert into public.profiles (id, display_name)
select au.id, coalesce(nullif(trim(s.name), ''), 'Student')
from public.students s
join auth.users au on au.id::text = s.id
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
  join auth.users au on au.id::text = sp.student_id
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
  join auth.users au on au.id::text = sp.student_id
  join public.sources s
    on s.owner_id = au.id and s.title = sp.name and s.source_type = 'pdf'::public.source_type
)
insert into public.source_contents (source_id, raw_text, cleaned_text, extraction_meta)
select source_id, raw_text, cleaned_text, '{}'::jsonb
from prepared_pdfs
on conflict (source_id) do nothing;

-- 3) Concept map backfill
insert into public.concept_maps (owner_id, source_id, title, version, created_at)
select
  au.id as owner_id,
  s.id as source_id,
  coalesce(nullif(trim(cm.title), ''), 'Concept Map') as title,
  1,
  coalesce(cm.created_at, now())
from public.concept_maps cm
join auth.users au on au.id::text = cm.student_id
join public.sources s on s.owner_id = au.id and s.title = cm.source_name
on conflict do nothing;

-- 4) Notebook outputs backfill (single generated session per user)
insert into public.notebook_sessions (id, owner_id, title)
select gen_random_uuid(), p.id, 'Imported session'
from public.profiles p
where not exists (
  select 1 from public.notebook_sessions ns where ns.owner_id = p.id and ns.title = 'Imported session'
);

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
from public.notebook_outputs no
join auth.users au on au.id::text = no.student_id
join public.notebook_sessions ns on ns.owner_id = au.id and ns.title = 'Imported session';
