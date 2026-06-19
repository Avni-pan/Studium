-- ─────────────────────────────────────────────────────────────
-- PADHO NOTEBOOK — Supabase schema (run once in the SQL editor)
-- Needs the pgvector extension for similarity search.
-- ─────────────────────────────────────────────────────────────

create extension if not exists vector;

-- One row per uploaded source (a PDF, a set of notes, etc.)
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  page_count  int  not null default 0,
  created_at  timestamptz default now()
);

-- One row per chunk. The page number rides along so citations
-- can point back to exactly where the answer came from.
-- Gemini text-embedding-004 returns 768-dimensional vectors.
create table if not exists chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid references documents(id) on delete cascade,
  content      text not null,
  page         int  not null,
  embedding    vector(768)
);

-- Approximate-nearest-neighbour index for fast retrieval.
create index if not exists chunks_embedding_idx
  on chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Retrieval function: given a query embedding, return the closest
-- chunks for one document, with their page numbers and similarity.
create or replace function match_chunks(
  query_embedding vector(768),
  doc_id uuid,
  match_count int default 6
)
returns table (id uuid, content text, page int, similarity float)
language sql stable
as $$
  select
    chunks.id,
    chunks.content,
    chunks.page,
    1 - (chunks.embedding <=> query_embedding) as similarity
  from chunks
  where chunks.document_id = doc_id
  order by chunks.embedding <=> query_embedding
  limit match_count;
$$;
