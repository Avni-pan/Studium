import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

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

function chunkText(text, size = 200) {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += size) {
    const piece = words.slice(i, i + size).join(" ").trim();
    if (piece) chunks.push(piece);
  }
  return chunks;
}

// Extract text per page using pdfjs
async function extractPages(path) {
  const data = new Uint8Array(fs.readFileSync(path));
  const pdf = await getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(" ");
    pages.push(text);
  }
  return pages;
}

async function main() {
  // 1. Extract text per page
  const pages = await extractPages("./notes.pdf");
  console.log("Pages found:", pages.length);

  // 2. Create the document row
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({ title: "My Test Notes", page_count: pages.length })
    .select()
    .single();
  if (docErr) { console.log("DOC ERROR:", docErr); return; }
  console.log("Document created:", doc.id);

  // 3. Chunk + embed each page, store chunks
  let total = 0;
  for (let p = 0; p < pages.length; p++) {
    const chunks = chunkText(pages[p]);
    for (const content of chunks) {
      const embedding = await embed(content);
      if (embedding) {
        const { error } = await supabase.from("chunks").insert({
          document_id: doc.id, content, page: p + 1, embedding,
        });
        if (error) { console.log("CHUNK ERROR:", error); return; }
        total++;
        console.log(`Stored chunk on page ${p + 1}`);
      } else {
        console.log(`Embedding failed on page ${p + 1} (maybe rate limit)`);
      }
    }
  }
  console.log("Done! Chunks stored:", total);
}

main();