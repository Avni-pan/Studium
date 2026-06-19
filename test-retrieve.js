import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const GEMINI_EMBED =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";

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

async function main() {
  // Change this question to test different things
  const question = "What is Newton's second law?";
  console.log("QUESTION:", question, "\n");

  // 1. Get the most recent document's id
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title")
    .order("created_at", { ascending: false })
    .limit(1);
  const docId = docs[0].id;
  console.log("Searching in document:", docs[0].title, "\n");

  // 2. Embed the question
  const qVec = await embed(question);
  if (!qVec) { console.log("Embedding failed"); return; }

  // 3. Retrieve the most similar chunks
  const { data: matches, error } = await supabase.rpc("match_chunks", {
    query_embedding: qVec,
    doc_id: docId,
    match_count: 3,
  });
  if (error) { console.log("SEARCH ERROR:", error); return; }

  // 4. Show what came back
  console.log("TOP MATCHES:\n");
  matches.forEach((m, i) => {
    console.log(`#${i + 1}  (page ${m.page}, similarity ${m.similarity.toFixed(3)})`);
    console.log(m.content.slice(0, 200) + "...\n");
  });
}

main();