import 'dotenv/config';

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
  console.log("KEY LOADED?", process.env.GEMINI_API_KEY ? "yes" : "NO");
  console.log("Length:", data.embedding?.values?.length);
  if (data.error) console.log("ERROR:", data.error.message);
  return data.embedding?.values;
}

await embed("Force equals mass times acceleration.");