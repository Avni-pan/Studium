import { useState, useRef } from "react";
import { Upload, Send, Loader2, FileText, BookOpen, Sparkles, Plus } from "lucide-react";
import ReactMarkdown from "react-markdown";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function App() {
  const [docs, setDocs] = useState([]); // list of uploaded PDFs
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const fileRef = useRef(null);

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const pdfBase64 = reader.result.split(",")[1];
      try {
        const res = await fetch(`${API}/api/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: file.name.replace(/\.pdf$/i, ""), pdfBase64 }),
        });
        const data = await res.json();
        if (data.documents) setDocs(data.documents);
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    };
    reader.readAsDataURL(file);
  }

  async function ask() {
    if (!input.trim() || docs.length === 0) return;
    const q = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setAsking(true);
    try {
      const res = await fetch(`${API}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "studium", text: data.answer, citations: data.citations || [] }]);
    } catch {
      setMessages((m) => [...m, { role: "studium", text: "Connection error. Is the backend running?", citations: [] }]);
    } finally {
      setAsking(false);
    }
  }

  const hasDocs = docs.length > 0;

  return (
    <div style={st.app}>
      <aside style={st.sidebar}>
        <div style={st.brand}><BookOpen size={20} color="#F5A524" /><span style={st.brandText}>Studium</span></div>

        <div style={st.sourcesHead}>
          <span style={st.sourcesLabel}>Sources</span>
          {hasDocs && <span style={st.sourceCount}>{docs.length}</span>}
        </div>

        <div style={st.sourceList}>
          {docs.map((d) => (
            <div key={d.id} style={st.docCard}>
              <FileText size={16} color="#F5A524" />
              <div style={{ overflow: "hidden" }}>
                <div style={st.docTitle}>{d.title}</div>
                <div style={st.docMeta}>{d.page_count} pages</div>
              </div>
            </div>
          ))}

          <div style={st.addBtn} onClick={() => fileRef.current?.click()}>
            {uploading
              ? <><Loader2 size={16} color="#F5A524" style={{ animation: "spin 1s linear infinite" }} /> Reading...</>
              : <><Plus size={16} /> {hasDocs ? "Add another PDF" : "Upload a PDF"}</>}
          </div>
          <input ref={fileRef} type="file" accept="application/pdf" onChange={upload} style={{ display: "none" }} />
        </div>

        <p style={st.note}>Studium answers from all your sources, in whatever language you ask.</p>
      </aside>

      <main style={st.main}>
        {messages.length === 0 ? (
          <div style={st.empty}>
            <Sparkles size={28} color="#F5A524" />
            <h2 style={st.emptyTitle}>{hasDocs ? "Ask across your sources" : "Upload notes to begin"}</h2>
            <p style={st.emptySub}>{hasDocs ? "Studium searches every PDF you've added, with citations to the source." : "Add one or more PDFs on the left, then ask away."}</p>
          </div>
        ) : (
          <div style={st.chat}>
            {messages.map((m, i) => (
              <div key={i} style={m.role === "user" ? st.userMsg : st.botMsg}>
                {m.role === "studium" && <div style={st.botLabel}><Sparkles size={12} color="#E08A00" /> Studium</div>}
                {m.role === "studium"
                  ? <div style={st.msgText} className="md"><ReactMarkdown>{m.text}</ReactMarkdown></div>
                  : <div style={st.msgText}>{m.text}</div>}
                {m.citations?.length > 0 && (
                  <div style={st.cites}>
                    {m.citations.map((c, j) => (
                      <span key={j} style={st.cite}>{c.title} · p.{c.page}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {asking && <div style={st.botMsg}><div style={st.botLabel}><Sparkles size={12} color="#E08A00" /> Studium</div><div style={st.msgText}><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> thinking...</div></div>}
          </div>
        )}
        <div style={st.composer}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder={hasDocs ? "Ask in any language..." : "Upload a PDF first"} disabled={!hasDocs || asking} style={st.input} />
          <button onClick={ask} disabled={!hasDocs || asking} style={st.send}><Send size={18} /></button>
        </div>
      </main>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        body { margin: 0; }
        .md p { margin: 0 0 10px; } .md p:last-child { margin-bottom: 0; }
        .md ul, .md ol { margin: 6px 0; padding-left: 20px; } .md li { margin: 3px 0; }
        .md strong { font-weight: 700; }
        .md code { background: #EFE7D5; padding: 1px 5px; border-radius: 4px; font-size: 14px; }
        .md h1, .md h2, .md h3 { font-size: 16px; margin: 10px 0 6px; }
      `}</style>
    </div>
  );
}

const st = {
  app: { display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", background: "#16162B", color: "#FBF7EE" },
  sidebar: { width: 300, borderRight: "1px solid #2C2C48", padding: 22, display: "flex", flexDirection: "column", gap: 14, background: "#1F1F3A" },
  brand: { display: "flex", alignItems: "center", gap: 9, marginBottom: 6 },
  brandText: { fontSize: 20, fontWeight: 700 },
  sourcesHead: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  sourcesLabel: { fontSize: 12, fontWeight: 700, color: "#8A8AA0", textTransform: "uppercase", letterSpacing: "0.05em" },
  sourceCount: { fontSize: 12, background: "#2C2C48", color: "#C8C8D8", padding: "1px 8px", borderRadius: 10, fontWeight: 600 },
  sourceList: { display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" },
  docCard: { display: "flex", gap: 10, alignItems: "center", background: "#16162B", border: "1px solid #2C2C48", borderRadius: 12, padding: "10px 12px" },
  docTitle: { fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  docMeta: { fontSize: 11, color: "#8A8AA0", marginTop: 1 },
  addBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, border: "1.5px dashed #3A3A5C", borderRadius: 12, padding: "12px", cursor: "pointer", color: "#C8C8D8", fontSize: 13, fontWeight: 500 },
  note: { fontSize: 12, color: "#8A8AA0", lineHeight: 1.5, marginTop: "auto" },
  main: { flex: 1, display: "flex", flexDirection: "column" },
  empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center" },
  emptyTitle: { fontSize: 26, fontWeight: 700, margin: 0 },
  emptySub: { color: "#8A8AA0", fontSize: 15, maxWidth: 380 },
  chat: { flex: 1, overflowY: "auto", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16 },
  userMsg: { alignSelf: "flex-end", background: "#F5A524", color: "#16162B", padding: "11px 15px", borderRadius: "14px 14px 4px 14px", maxWidth: "75%", fontSize: 15, fontWeight: 500 },
  botMsg: { alignSelf: "flex-start", background: "#FBF7EE", color: "#2A2A3C", padding: "14px 16px", borderRadius: "14px 14px 14px 4px", maxWidth: "80%" },
  botLabel: { display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: "#E08A00", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 7 },
  msgText: { lineHeight: 1.6, fontSize: 15 },
  cites: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 11 },
  cite: { fontSize: 12, background: "#F0E9D8", color: "#A06800", padding: "3px 9px", borderRadius: 7, fontWeight: 600 },
  composer: { display: "flex", gap: 10, padding: 20, borderTop: "1px solid #2C2C48", background: "#1F1F3A" },
  input: { flex: 1, background: "#16162B", border: "1px solid #2C2C48", borderRadius: 12, padding: "12px 15px", color: "#FBF7EE", fontSize: 15, outline: "none" },
  send: { background: "#F5A524", color: "#16162B", border: "none", borderRadius: 12, width: 48, display: "grid", placeItems: "center", cursor: "pointer" },
};
