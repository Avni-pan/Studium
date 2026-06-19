const res = await fetch('http://localhost:3001/api/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: 'Newton ka second law kya hai?',
    documentId: '02ac7d8b-3c60-4df2-a4bb-b434d8478d3b',
  }),
});

console.log(await res.json());