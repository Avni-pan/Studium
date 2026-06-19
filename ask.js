// ─────────────────────────────────────────────────────────────
// POST /api/ask  — the heart of it. Retrieve relevant chunks from the
// user's own document, then have Padho explain in Hinglish, grounded
// only in those chunks, with citations pointing to real page numbers.
//
// Env needed: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY,
//             ANTHROPIC_API_KEY
// ─────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GEMINI_EMBED =
  "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent";

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
  return data.embedding?.values;
}

// Padho's voice — but with a hard grounding rule. This is the line that
// separates a real notebook tool from a chatbot that makes things up:
// answer ONLY from the retrieved notes, and say so when they fall short.
const SYSTEM = `You are Padho — a warm, brilliant study buddy for Indian students. You explain in natural Hinglish (Hindi + English mixed, the way students actually talk: "dekh yaar", "yeh actually simple hai").

CRITICAL GROUNDING RULES:
- Answer ONLY using the provided notes below. Do not use outside knowledge.
- If the notes don't contain the answer, say so honestly in Hinglish: "Yaar, yeh tumhare notes mein nahi mila." Do not invent.
- After each key claim, cite the page like [p.3] using the page numbers given with each note.
- Break it into clear steps. Be warm and encouraging. End with one line on the underlying concept.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { question, documentId } = req.body;
    if (!question || !documentId)
      return res.status(400).json({ error: "Need question and documentId" });

    // 1. Embed the question.
    const qVec = await embed(question);
    if (!qVec) throw new Error("Embedding failed");

    // 2. Retrieve the most relevant chunks from THIS document.
    const { data: matches, error } = await supabase.rpc("match_chunks", {
      query_embedding: qVec,
      doc_id: documentId,
      match_count: 6,
    });
    if (error) throw error;

    if (!matches?.length) {
      return res.status(200).json({
        answer: "Yaar, is document mein kuch related nahi mila. Koi aur sawaal try karo?",
        citations: [],
      });
    }

    // 3. Build the grounded context, each chunk labelled with its page.
    const context = matches
      .map((m) => `[p.${m.page}] ${m.content}`)
      .join("\n\n");

    // 4. Ask Claude to explain, grounded in those chunks.
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `NOTES:\n${context}\n\nSTUDENT KA SAWAAL: ${question}`,
          },
        ],
      }),
    });
    const aiData = await aiRes.json();
    const answer = (aiData.content || [])
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n");

    // 5. Return the answer plus which pages were used (for the UI).
    const citations = [...new Set(matches.map((m) => m.page))].sort((a, b) => a - b);

    return res.status(200).json({ answer, citations });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Ask failed", detail: String(err) });
  }
}
