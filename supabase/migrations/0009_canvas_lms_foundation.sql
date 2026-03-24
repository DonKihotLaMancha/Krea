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
