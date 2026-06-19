import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import readline from 'readline';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const GEMINI_EMBED =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";
const GEMINI_CHAT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

async function embed(text) {
  const res = await fetch(`${GEMINI_EMBED}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text }] },
    }),
  });
  const data = await res.json();
  return data.embedding?.values;
}

const SYSTEM = `You are Studium — a warm, brilliant study buddy for Indian students.

LANGUAGE RULE (most important):
- Reply in the SAME language the student asked in. If they ask in Hindi, answer in Hindi. If English, answer in English. If Hinglish (Hindi+English mixed), answer in Hinglish. Match their style and tone naturally.

OTHER RULES:
- Answer ONLY using the notes provided below. Do not use outside knowledge.
- If the notes don't contain the answer, say so honestly in the student's language. Do not invent.
- After each key point, cite the page like [p.1] using the page numbers given with each note.
- Break it into clear steps. Be warm and encouraging. End with one line on the underlying concept.`;

async function ask(question) {
  const { data: docs } = await supabase
    .from("documents").select("id, title")
    .order("created_at", { ascending: false }).limit(1);
  if (!docs?.length) { console.log("No document found. Ingest a PDF first."); return; }
  const docId = docs[0].id;

  const qVec = await embed(question);
  const { data: matches } = await supabase.rpc("match_chunks", {
    query_embedding: qVec, doc_id: docId, match_count: 4,
  });
  if (!matches?.length) { console.log("Nothing relevant found."); return; }

  const context = matches.map((m) => `[p.${m.page}] ${m.content}`).join("\n\n");

  const res = await fetch(`${GEMINI_CHAT}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: [{
        parts: [{ text: `NOTES:\n${context}\n\nSTUDENT'S QUESTION: ${question}` }],
      }],
    }),
  });
  const data = await res.json();
  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;

  console.log("\nSTUDIUM:\n");
  console.log(answer || "Error: " + JSON.stringify(data));
  console.log("\n" + "─".repeat(50));
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function loop() {
  rl.question("\nAsk anything (or 'exit'): ", async (q) => {
    if (q.trim().toLowerCase() === "exit") { console.log("Bye! 📚"); rl.close(); return; }
    if (q.trim()) await ask(q);
    loop();
  });
}

console.log("📚 Studium ready! Ask in any language.\n");
loop();