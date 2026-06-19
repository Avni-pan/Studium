import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// ─────────────────────────────────────────────────────────────
// STUDIUM BACKEND — production-hardened.
// Multi-doc hybrid RAG + smart query rewriting + memory + quiz/flashcards.
// ─────────────────────────────────────────────────────────────

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY } = process.env;

const missing = [];
if (!SUPABASE_URL) missing.push('SUPABASE_URL');
if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_KEY');
if (!GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
if (missing.length) {
  console.error(`\n❌ Missing env vars: ${missing.join(', ')}`);
  console.error('Add them to your .env file and restart.\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const GEMINI_EMBED =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
const GEMINI_CHAT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const EMBED_DIM = 3072;
const MAX_PDF_MB = 20;
const RETRIEVE_COUNT = 8;

const SYSTEM = `You are Studium — a grounded, source-aware study buddy for Indian students. You combine NotebookLM-style strict grounding with natural, chat-friendly explanations.

STRICT GROUNDING (most important):
- Answer ONLY from the notes provided. Never invent facts or use outside knowledge.
- If the notes don't contain the answer, say so honestly in the student's language (e.g. "Yeh information provided notes mein nahi hai.").

LANGUAGE:
- Match the student's language and style. Hindi -> Hindi. English -> English. Hinglish -> Hinglish. Natural, never robotic.

CITATIONS:
- After each key point, cite the source as [filename, p.1] using the source and page given with each note. This exact format is required.
- Keep citations lightweight and inline — no bulky reference section unless asked.

MULTI-SOURCE REASONING:
- Synthesize across notes when relevant.
- If sources disagree, flag it: "Source A yeh kehta hai…, lekin Source B disagree karta hai…".
- If the notes are incomplete on the topic, name what's missing: "Is topic pe complete info nahi hai — ___ missing hai.".

STRUCTURE (chat-optimized, NOT report-style):
- For simple questions, answer directly in 1–3 sentences. Don't force structure.
- For richer questions, you may use a light structure: a quick direct answer, then a few bullet key points, then citations. Keep it scannable, never a wall of text or formal headings.

TONE:
- Warm, clear, like a smart senior explaining — not a corporate research paper.
- For formulas: state the formula, then explain each symbol. End complex answers with one short line on the underlying concept.`;

const app = express();
app.use(cors());
app.use(express.json({ limit: `${MAX_PDF_MB + 5}mb` }));

// ── Helpers ───────────────────────────────────────────────────
const safe = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(`[${req.method} ${req.path}]`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server error', detail: String(err?.message || err) });
    }
  });

async function fetchJSON(url, options, { retries = 2, timeoutMs = 30000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        throw new Error(data?.error?.message || `HTTP ${res.status}`);
      }
      return data;
    } catch (err) {
      clearTimeout(timer);
      if (attempt < retries && (err.name === 'AbortError' || err.name === 'TypeError')) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

async function embed(text) {
  const data = await fetchJSON(`${GEMINI_EMBED}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] },
    }),
  });
  const vec = data?.embedding?.values;
  if (!vec || vec.length !== EMBED_DIM) {
    throw new Error('Embedding failed or wrong size');
  }
  return vec;
}

async function generate(contents, systemText = SYSTEM) {
  const data = await fetchJSON(`${GEMINI_CHAT}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemText }] },
      contents,
    }),
  });
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function chunkText(text, targetWords = 60, overlapSentences = 1) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  const chunks = [];
  let cur = [];
  let count = 0;
  for (const s of sentences) {
    const w = s.split(/\s+/).length;
    if (count + w > targetWords && cur.length) {
      chunks.push(cur.join(' ').trim());
      cur = overlapSentences ? cur.slice(-overlapSentences) : [];
      count = cur.reduce((sum, x) => sum + x.split(/\s+/).length, 0);
    }
    cur.push(s);
    count += w;
  }
  if (cur.length) chunks.push(cur.join(' ').trim());
  return chunks;
}

async function extractPages(buffer) {
  const data = new Uint8Array(buffer);
  const pdf = await getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  return pages;
}

async function retrieve(question, count = RETRIEVE_COUNT) {
  const qVec = await embed(question);
  const { data: matches, error } = await supabase.rpc('hybrid_match_all', {
    query_embedding: qVec,
    query_text: question,
    match_count: count,
  });
  if (error) throw new Error(error.message);
  return matches || [];
}

// ── Routes ────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'Studium backend is alive', features: ['rag', 'memory', 'quiz', 'flashcards'] });
});

app.get('/api/documents', safe(async (req, res) => {
  const { data, error } = await supabase
    .from('documents').select('id, title, page_count').order('created_at');
  if (error) throw new Error(error.message);
  res.json({ documents: data || [] });
}));

// Clear all documents (and their chunks). Used by the "Clear all" button.
app.delete('/api/documents', safe(async (req, res) => {
  // Delete chunks first (foreign key), then documents.
  const { error: chunkErr } = await supabase
    .from('chunks').delete().not('id', 'is', null);
  if (chunkErr) throw new Error(chunkErr.message);
  const { error: docErr } = await supabase
    .from('documents').delete().not('id', 'is', null);
  if (docErr) throw new Error(docErr.message);
  res.json({ documents: [] });
}));

// ── Ingest ────────────────────────────────────────────────────
app.post('/api/ingest', safe(async (req, res) => {
  const { title, pdfBase64 } = req.body || {};
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    return res.status(400).json({ error: 'No PDF provided' });
  }

  const buffer = Buffer.from(pdfBase64, 'base64');
  const sizeMb = buffer.length / (1024 * 1024);
  if (sizeMb > MAX_PDF_MB) {
    return res.status(413).json({ error: `PDF too large (${sizeMb.toFixed(1)}MB). Max ${MAX_PDF_MB}MB.` });
  }

  let pages;
  try {
    pages = await extractPages(buffer);
  } catch {
    return res.status(422).json({ error: 'Could not read this PDF. Is it a valid, text-based PDF?' });
  }

  const text = pages.join('').trim();
  if (!text) {
    return res.status(422).json({
      error: 'No text found. This looks like a scanned/image PDF — Studium needs a text-based PDF.',
    });
  }

  const cleanTitle = (title || 'Untitled').toString().slice(0, 200);
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({ title: cleanTitle, page_count: pages.length })
    .select().single();
  if (docErr) throw new Error(docErr.message);

  let total = 0;
  let failed = 0;
  for (let p = 0; p < pages.length; p++) {
    for (const content of chunkText(pages[p])) {
      try {
        const embedding = await embed(content);
        await supabase.from('chunks').insert({
          document_id: doc.id, content, page: p + 1, embedding,
        });
        total++;
      } catch {
        failed++;
      }
    }
  }

  const { data: allDocs } = await supabase
    .from('documents').select('id, title, page_count').order('created_at');

  res.json({
    documents: allDocs || [],
    justAdded: doc.title,
    chunks: total,
    ...(failed ? { warning: `${failed} chunks skipped (likely rate limit)` } : {}),
  });
}));

// ── Ask (smart query rewriting + conversation memory) ─────────
app.post('/api/ask', safe(async (req, res) => {
  const { question, history } = req.body || {};
  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Need a question' });
  }

  let searchQuery = question.trim();
  const hist = Array.isArray(history) ? history.slice(-4) : [];

  // Only rewrite short, context-dependent follow-ups. Full standalone
  // questions skip the extra call and stay fast.
  const q = question.trim().toLowerCase();
  const looksLikeFollowup =
    hist.length > 0 &&
    (q.split(/\s+/).length <= 5 ||
     /\b(that|this|it|them|those|these|more|again|simpler|example|explain|elaborate)\b/.test(q));

  if (looksLikeFollowup) {
    try {
      const convo = hist.map((m) => `${m.role === 'user' ? 'Student' : 'Studium'}: ${m.text}`).join('\n');
      const rewritten = await generate(
        [{ role: 'user', parts: [{ text: `Conversation so far:\n${convo}\n\nThe student now asks: "${question}"\n\nRewrite this as a single, standalone search query that captures the actual topic (resolve words like "that", "it", "this" using the conversation). Return ONLY the rewritten query, nothing else.` }] }],
        'You rewrite follow-up questions into standalone search queries. Output only the query text.'
      );
      if (rewritten && rewritten.trim()) {
        searchQuery = rewritten.trim().slice(0, 300);
      }
    } catch {
      // Rewrite failed — fall back to original question
    }
  }

  const matches = await retrieve(searchQuery);
  if (!matches.length) {
    return res.json({ answer: "Yaar, is sawaal se related kuch nahi mila notes mein.", citations: [] });
  }

  const context = matches.map((m) => `[${m.title}, p.${m.page}] ${m.content}`).join('\n\n');

  const priorTurns = hist.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: String(m.text || '').slice(0, 4000) }],
  }));

  const answer = await generate([
    ...priorTurns,
    { role: 'user', parts: [{ text: `NOTES:\n${context}\n\nSTUDENT'S QUESTION: ${question}` }] },
  ]);

  const citations = [...new Map(
    matches.map((m) => [`${m.title}|${m.page}`, { title: m.title, page: m.page }])
  ).values()];

  res.json({ answer: answer || 'Could not generate an answer. Try rephrasing.', citations });
}));

// ── Quiz ──────────────────────────────────────────────────────
app.post('/api/quiz', safe(async (req, res) => {
  const { topic, count } = req.body || {};
  const n = Math.min(Math.max(parseInt(count) || 5, 1), 10);
  const seed = (topic && topic.trim()) || 'the key concepts in these notes';

  const matches = await retrieve(seed, 10);
  if (!matches.length) {
    return res.json({ questions: [], note: 'No material found to make a quiz from.' });
  }
  const context = matches.map((m) => `[${m.title}, p.${m.page}] ${m.content}`).join('\n\n');

  const quizSystem = `You are a quiz generator for Indian students. Create multiple-choice questions ONLY from the provided notes. Return STRICT JSON, no markdown, no commentary. Format:
{"questions":[{"q":"question text","options":["A","B","C","D"],"answer":0,"source":"filename, p.1"}]}
"answer" is the index (0-3) of the correct option. Make questions clear and exam-relevant.`;

  const raw = await generate(
    [{ role: 'user', parts: [{ text: `NOTES:\n${context}\n\nMake ${n} multiple-choice questions about: ${seed}` }] }],
    quizSystem
  );

  let parsed;
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return res.status(502).json({ error: 'Quiz generation returned an unexpected format. Try again.' });
  }
  res.json({ questions: Array.isArray(parsed?.questions) ? parsed.questions.slice(0, n) : [] });
}));

// ── Flashcards ────────────────────────────────────────────────
app.post('/api/flashcards', safe(async (req, res) => {
  const { topic, count } = req.body || {};
  const n = Math.min(Math.max(parseInt(count) || 8, 1), 15);
  const seed = (topic && topic.trim()) || 'the key terms in these notes';

  const matches = await retrieve(seed, 10);
  if (!matches.length) {
    return res.json({ cards: [], note: 'No material found to make flashcards from.' });
  }
  const context = matches.map((m) => `[${m.title}, p.${m.page}] ${m.content}`).join('\n\n');

  const cardSystem = `You are a flashcard generator for Indian students. Create term/definition flashcards ONLY from the provided notes. Return STRICT JSON, no markdown. Format:
{"cards":[{"front":"term or question","back":"clear concise definition","source":"filename, p.1"}]}
Keep the back side short and memorable.`;

  const raw = await generate(
    [{ role: 'user', parts: [{ text: `NOTES:\n${context}\n\nMake ${n} flashcards about: ${seed}` }] }],
    cardSystem
  );

  let parsed;
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return res.status(502).json({ error: 'Flashcard generation returned an unexpected format. Try again.' });
  }
  res.json({ cards: Array.isArray(parsed?.cards) ? parsed.cards.slice(0, n) : [] });
}));

// ── 404 + global error nets ───────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `No route: ${req.method} ${req.path}` }));
process.on('unhandledRejection', (e) => console.error('UnhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('UncaughtException:', e));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n⚡ Studium backend running on http://localhost:${PORT}`);
  console.log(`   Features: RAG · memory · quiz · flashcards`);
  console.log(`   Health:   http://localhost:${PORT}/api/health\n`);
});
