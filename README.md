# Padho Notebook — AI study buddy over your own notes (RAG)

Upload your PDFs → ask in Hinglish → get grounded answers with page citations.
Combines the **Padho** tutor personality with a **NotebookLM-style** retrieval engine.

## How it works (RAG)

```
Upload PDF ─► extract text per page ─► chunk (~500 words) ─► embed each chunk
                                                              │
                                                              ▼
                                                   store in Supabase (pgvector)

Ask question ─► embed question ─► vector search (top 6 chunks, with page #s)
                                                              │
                                                              ▼
                              Claude explains in Hinglish, grounded ONLY in
                              those chunks ─► answer + page citations
```

## Files

| File | What it does |
|------|--------------|
| `db/schema.sql` | Supabase tables + the `match_chunks` similarity-search function |
| `api/ingest.js` | Upload endpoint: parse → chunk → embed → store |
| `api/ask.js` | Ask endpoint: retrieve → ground → explain in Hinglish + cite |
| `src/PadhoNotebook.jsx` | The notebook UI |

## Setup (₹0, all free tiers)

1. **Supabase** (free): create a project → SQL editor → paste `db/schema.sql` → run.
2. **Gemini API key** (free): aistudio.google.com → for embeddings.
3. **Anthropic API key**: for the explanations (or swap `api/ask.js` to Gemini free tier to stay fully ₹0).
4. **Deploy to Vercel** (free): push to GitHub → import → add env vars below.

### Env vars (in Vercel project settings)
```
GEMINI_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...   # service role key, server-side only
ANTHROPIC_API_KEY=...
```

### Local install
```bash
npm install @supabase/supabase-js pdf-parse
# frontend: standard Vite + React app, drop PadhoNotebook.jsx in as the main component
```

## What's built vs. what's next

**Built (this foundation):**
- Full ingestion pipeline with page-aware chunking
- Vector retrieval scoped to one document
- Grounded Hinglish answers with a hard "don't make things up" rule
- Citations that point to real page numbers
- Working notebook UI

**Your next steps (the multi-week part):**
- Multi-document notebooks (ask across several sources at once)
- Click a citation → jump to that page in a PDF viewer
- Better chunking (sentence-aware, with overlap) for cleaner answers
- Streaming responses (so answers appear word-by-word)
- Rate limiting + a queue for large PDFs (embedding 500 pages takes time)
- *Optional, hard:* the NotebookLM "audio overview" — script + text-to-speech

## Honest notes

- **Embedding cost/time:** Gemini's free embedding tier is generous but rate-limited. A huge textbook will ingest slowly — add a progress bar and batching before launch.
- **Citations are only as good as the chunks.** If answers cite the wrong page, improve chunking first — that's almost always the culprit.
- **The grounding rule is the whole product.** The line in `api/ask.js` that says "answer ONLY from the notes" is what makes this a study tool and not a chatbot that hallucinates. Guard it.
