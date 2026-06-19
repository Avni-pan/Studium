import { useState, useRef } from "react";
import { Upload, Send, Loader2, FileText, Sparkles, BookOpen } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// PADHO NOTEBOOK — frontend.
// Upload your own notes → ask in Hinglish → grounded, cited answers.
// Talks to /api/ingest and /api/ask (the serverless functions).
// ─────────────────────────────────────────────────────────────

export default function PadhoNotebook() {
  const [doc, setDoc] = useState(null); // { documentId, title, pages, chunks }
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState([]); // { role, text, citations }
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
        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: file.name.replace(/\.pdf$/i, ""), pdfBase64 }),
        });
        const data = await res.json();
        if (data.documentId) setDoc(data);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function ask() {
    if (!input.trim() || !doc) return;
    const q = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setAsking(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, documentId: doc.documentId }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "padho", text: data.answer, citations: data.citations || [] },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "padho", text: "Network issue. Phir se try karo.", citations: [] },
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div style={S.app}>
      <style>{FONTS}</style>

      <aside style={S.sidebar}>
        <div style={S.brand}>
          <BookOpen size={20} color="#F5A524" strokeWidth={2.5} />
          <span style={S.brandText}>Padho Notebook</span>
        </div>

        {!doc ? (
          <div style={S.uploadZone} onClick={() => fileRef.current?.click()}>
            {uploading ? (
              <>
                <Loader2 size={26} className="spin" color="#F5A524" />
                <p style={S.uploadText}>Padho rha hoon tumhare notes...</p>
              </>
            ) : (
              <>
                <Upload size={26} color="#8A8AA0" />
                <p style={S.uploadText}>Apne notes ka PDF daalo</p>
                <span style={S.uploadHint}>Click to upload</span>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              onChange={upload}
              style={{ display: "none" }}
            />
          </div>
        ) : (
          <div style={S.docCard}>
            <FileText size={18} color="#F5A524" />
            <div>
              <div style={S.docTitle}>{doc.title}</div>
              <div style={S.docMeta}>
                {doc.pages} pages · {doc.chunks} chunks ready
              </div>
            </div>
          </div>
        )}

        <p style={S.sidebarNote}>
          Padho sirf tumhare notes se jawaab dega — aur har baat ke saath page number
          [p.x] dikhayega.
        </p>
      </aside>

      <main style={S.main}>
        {messages.length === 0 ? (
          <div style={S.empty}>
            <Sparkles size={30} color="#F5A524" />
            <h2 style={S.emptyTitle}>
              {doc ? "Ab kuch bhi poocho" : "Pehle notes upload karo"}
            </h2>
            <p style={S.emptySub}>
              {doc
                ? "Tumhare apne notes se, Hinglish mein, page citations ke saath."
                : "Left side se apna PDF daalo, phir sawaal pooch sakte ho."}
            </p>
          </div>
        ) : (
          <div style={S.chat}>
            {messages.map((m, i) => (
              <div key={i} style={m.role === "user" ? S.userMsg : S.padhoMsg}>
                {m.role === "padho" && (
                  <div style={S.padhoLabel}>
                    <Sparkles size={13} color="#E08A00" /> Padho
                  </div>
                )}
                <div style={S.msgText}>{m.text}</div>
                {m.citations?.length > 0 && (
                  <div style={S.citations}>
                    {m.citations.map((p) => (
                      <span key={p} style={S.citation}>
                        page {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {asking && (
              <div style={S.padhoMsg}>
                <div style={S.padhoLabel}>
                  <Sparkles size={13} color="#E08A00" /> Padho
                </div>
                <div style={S.msgText}>
                  <Loader2 size={16} className="spin" /> notes mein dhoond raha hoon...
                </div>
              </div>
            )}
          </div>
        )}

        <div style={S.composer}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder={doc ? "Apna sawaal likho..." : "Pehle notes upload karo"}
            disabled={!doc || asking}
            style={S.input}
          />
          <button onClick={ask} disabled={!doc || asking} style={S.sendBtn}>
            <Send size={18} />
          </button>
        </div>
      </main>
    </div>
  );
}

const S = {
  app: {
    display: "flex",
    height: "100vh",
    fontFamily: "Inter, system-ui, sans-serif",
    background: "#16162B",
    color: "#FBF7EE",
  },
  sidebar: {
    width: 300,
    borderRight: "1px solid #2C2C48",
    padding: 22,
    display: "flex",
    flexDirection: "column",
    gap: 18,
    background: "#1F1F3A",
  },
  brand: { display: "flex", alignItems: "center", gap: 9 },
  brandText: { fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600 },
  uploadZone: {
    border: "1.5px dashed #3A3A5C",
    borderRadius: 16,
    padding: "32px 18px",
    textAlign: "center",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  uploadText: { fontSize: 14, color: "#C8C8D8", margin: 0 },
  uploadHint: { fontSize: 12, color: "#8A8AA0" },
  docCard: {
    display: "flex",
    gap: 11,
    alignItems: "center",
    background: "#16162B",
    border: "1px solid #2C2C48",
    borderRadius: 14,
    padding: 14,
  },
  docTitle: { fontSize: 14, fontWeight: 600 },
  docMeta: { fontSize: 12, color: "#8A8AA0", marginTop: 2 },
  sidebarNote: { fontSize: 12, color: "#8A8AA0", lineHeight: 1.5, marginTop: "auto" },
  main: { flex: 1, display: "flex", flexDirection: "column" },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    textAlign: "center",
    padding: 20,
  },
  emptyTitle: { fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 600, margin: 0 },
  emptySub: { color: "#8A8AA0", fontSize: 15, maxWidth: 360, margin: 0 },
  chat: { flex: 1, overflowY: "auto", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16 },
  userMsg: {
    alignSelf: "flex-end",
    background: "#F5A524",
    color: "#16162B",
    padding: "11px 15px",
    borderRadius: "14px 14px 4px 14px",
    maxWidth: "75%",
    fontSize: 15,
    fontWeight: 500,
  },
  padhoMsg: {
    alignSelf: "flex-start",
    background: "#FBF7EE",
    color: "#2A2A3C",
    padding: "14px 16px",
    borderRadius: "14px 14px 14px 4px",
    maxWidth: "80%",
  },
  padhoLabel: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    color: "#E08A00",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: 7,
  },
  msgText: { whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 15 },
  citations: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 11 },
  citation: {
    fontSize: 12,
    background: "#F0E9D8",
    color: "#A06800",
    padding: "3px 9px",
    borderRadius: 7,
    fontWeight: 600,
  },
  composer: {
    display: "flex",
    gap: 10,
    padding: 20,
    borderTop: "1px solid #2C2C48",
    background: "#1F1F3A",
  },
  input: {
    flex: 1,
    background: "#16162B",
    border: "1px solid #2C2C48",
    borderRadius: 12,
    padding: "12px 15px",
    color: "#FBF7EE",
    fontSize: 15,
    outline: "none",
  },
  sendBtn: {
    background: "#F5A524",
    color: "#16162B",
    border: "none",
    borderRadius: 12,
    width: 48,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },
};

const FONTS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;500;600&display=swap');
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
`;
