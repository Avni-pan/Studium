// ─────────────────────────────────────────────────────────────
// POST /api/ingest  — upload a PDF, chunk it, embed it, store it.
// Vercel serverless function. Keys live in env vars, never client-side.
//
// Env needed:
//   GEMINI_API_KEY        (free — aistudio.google.com)
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY  (service role, server-side only)
// ─────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import pdf from "pdf-parse";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GEMINI_EMBED =
  "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent";

// Split text into ~500-word chunks. Crude but effective; upgrade to a
// sentence-aware splitter later if answers feel like they cut off mid-idea.
function chunkText(text, size = 500) {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += size) {
    const piece = words.slice(i, i + size).join(" ").trim();
    if (piece) chunks.push(piece);
  }
  return chunks;
}

async function embed(text) {
  const res = await fetch(`${GEMINI_EMBED}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/text-embedding-004",
      content: { parts: [{ text }] },
    }),
  });
  const data = await res.json();
  return data.embedding?.values; // 768-dim array
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { title, pdfBase64 } = req.body;
    if (!pdfBase64) return res.status(400).json({ error: "No PDF provided" });

    // 1. Parse the PDF. pdf-parse gives us full text; we re-derive page
    //    boundaries from form-feed markers so each chunk keeps a page number.
    const buffer = Buffer.from(pdfBase64, "base64");
    const parsed = await pdf(buffer);
    const pages = parsed.text.split("\f"); // form feed = page break

    // 2. Create the document row.
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({ title: title || "Untitled", page_count: pages.length })
      .select()
      .single();
    if (docErr) throw docErr;

    // 3. Chunk + embed each page, tagging chunks with their page number.
    const rows = [];
    for (let p = 0; p < pages.length; p++) {
      const chunks = chunkText(pages[p]);
      for (const content of chunks) {
        const embedding = await embed(content);
        if (embedding) {
          rows.push({ document_id: doc.id, content, page: p + 1, embedding });
        }
      }
    }

    // 4. Store all chunks.
    if (rows.length) {
      const { error: insErr } = await supabase.from("chunks").insert(rows);
      if (insErr) throw insErr;
    }

    return res.status(200).json({
      documentId: doc.id,
      title: doc.title,
      pages: pages.length,
      chunks: rows.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Ingestion failed", detail: String(err) });
  }
}
