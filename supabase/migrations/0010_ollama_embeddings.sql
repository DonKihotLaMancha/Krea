-- Ollama embedding vectors (768 for nomic-embed-text). Separate from OpenAI-sized source_embeddings (1536).

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
-- Add HNSW/IVFFlat on embedding after you have representative data (empty IVFFlat can be finicky).

alter table public.source_embeddings_ollama enable row level security;

drop policy if exists source_embeddings_ollama_owner on public.source_embeddings_ollama;
create policy source_embeddings_ollama_owner on public.source_embeddings_ollama
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
