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

