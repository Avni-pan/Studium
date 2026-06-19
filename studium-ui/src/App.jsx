import { useState, useRef } from "react";
import { Send, Loader2, FileText, BookOpen, Sparkles, Plus, MessageSquare, ListChecks, Layers, RotateCw, Check, X, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function App() {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [mode, setMode] = useState("chat");

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);

  const [quiz, setQuiz] = useState([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [picks, setPicks] = useState({});

  const [cards, setCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [flipped, setFlipped] = useState({});

  const fileRef = useRef(null);
  const hasDocs = docs.length > 0;

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

  async function clearAll() {
    if (!hasDocs || clearing) return;
    setClearing(true);
    try {
      await fetch(`${API}/api/documents`, { method: "DELETE" });
      setDocs([]); setMessages([]); setQuiz([]); setCards([]); setPicks({}); setFlipped({});
    } finally {
      setClearing(false);
    }
  }

  async function ask() {
    if (!input.trim() || !hasDocs) return;
    const q = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setAsking(true);
    try {
      const res = await fetch(`${API}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: messages.slice(-6) }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "studium", text: data.answer, citations: data.citations || [] }]);
    } catch {
      setMessages((m) => [...m, { role: "studium", text: "Connection error. The backend may be waking up — try again in a moment.", citations: [] }]);
    } finally {
      setAsking(false);
    }
  }

  async function makeQuiz() {
    if (!hasDocs) return;
    setQuizLoading(true); setQuiz([]); setPicks({});
    try {
      const res = await fetch(`${API}/api/quiz`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 5 }),
      });
      const data = await res.json();
      setQuiz(Array.isArray(data.questions) ? data.questions : []);
    } catch { setQuiz([]); } finally { setQuizLoading(false); }
  }

  async function makeCards() {
    if (!hasDocs) return;
    setCardsLoading(true); setCards([]); setFlipped({});
    try {
      const res = await fetch(`${API}/api/flashcards`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 8 }),
      });
      const data = await res.json();
      setCards(Array.isArray(data.cards) ? data.cards : []);
    } catch { setCards([]); } finally { setCardsLoading(false); }
  }

  const score = quiz.length ? quiz.reduce((s, q, i) => s + (picks[i] === q.answer ? 1 : 0), 0) : 0;
  const allAnswered = quiz.length > 0 && Object.keys(picks).length === quiz.length;

  return (
    <div style={st.app}>
      <div style={st.aurora} aria-hidden />
      <div style={st.grain} aria-hidden />

      <aside style={st.sidebar}>
        <div style={st.brand}>
          <div style={st.brandMark}><BookOpen size={18} color="#16162B" /></div>
          <span style={st.brandText}>Studium</span>
        </div>

        <div style={st.sourcesHead}>
          <span style={st.sourcesLabel}>Sources</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {hasDocs && <span style={st.sourceCount}>{docs.length}</span>}
            {hasDocs && (
              <button onClick={clearAll} disabled={clearing} title="Clear all documents" style={st.clearBtn}>
                {clearing ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={13} />}
              </button>
            )}
          </div>
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

        {hasDocs && (
          <div style={st.modeGroup}>
            <ModeBtn active={mode === "chat"} onClick={() => setMode("chat")} icon={<MessageSquare size={15} />} label="Chat" />
            <ModeBtn active={mode === "quiz"} onClick={() => setMode("quiz")} icon={<ListChecks size={15} />} label="Quiz" />
            <ModeBtn active={mode === "cards"} onClick={() => setMode("cards")} icon={<Layers size={15} />} label="Flashcards" />
          </div>
        )}

        <p style={st.note}>Studium answers from all your sources, in whatever language you ask.</p>
      </aside>

      <main style={st.main}>
        {mode === "chat" && (
          <>
            {messages.length === 0 ? (
              <div style={st.empty}>
                <div style={st.emptyMark}><Sparkles size={26} color="#F5A524" /></div>
                <h2 style={st.emptyTitle}>{hasDocs ? "Ask across your sources" : "Upload notes to begin"}</h2>
                <p style={st.emptySub}>{hasDocs ? "Studium searches every PDF you've added, with citations to the source." : "Add one or more PDFs on the left, then ask away."}</p>
              </div>
            ) : (
              <div style={st.chat}>
                {messages.map((m, i) => (
                  <div key={i} style={m.role === "user" ? st.userMsg : st.botMsg}>
                    {m.role === "studium" && <div style={st.botLabel}><Sparkles size={12} color="#F5A524" /> Studium</div>}
                    {m.role === "studium"
                      ? <div style={st.msgText} className="md"><ReactMarkdown>{m.text}</ReactMarkdown></div>
                      : <div style={st.msgText}>{m.text}</div>}
                    {m.citations?.length > 0 && (
                      <div style={st.cites}>
                        {m.citations.map((c, j) => <span key={j} style={st.cite}>{c.title} · p.{c.page}</span>)}
                      </div>
                    )}
                  </div>
                ))}
                {asking && <div style={st.botMsg}><div style={st.botLabel}><Sparkles size={12} color="#F5A524" /> Studium</div><div style={st.msgText}><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> thinking...</div></div>}
              </div>
            )}
            <div style={st.composer}>
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder={hasDocs ? "Ask in any language..." : "Upload a PDF first"} disabled={!hasDocs || asking} style={st.input} />
              <button onClick={ask} disabled={!hasDocs || asking} style={st.send}><Send size={18} /></button>
            </div>
          </>
        )}

        {mode === "quiz" && (
          <div style={st.panel}>
            <div style={st.panelHead}>
              <div>
                <h2 style={st.panelTitle}>Quiz</h2>
                <p style={st.panelSub}>5 questions generated from your notes.</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {allAnswered && <span style={st.scorePill}>{score} / {quiz.length}</span>}
                <button onClick={makeQuiz} disabled={quizLoading} style={st.action}>
                  {quizLoading ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <RotateCw size={15} />}
                  {quiz.length ? "New quiz" : "Generate quiz"}
                </button>
              </div>
            </div>
            <div style={st.panelBody}>
              {quizLoading && <div style={st.loadingNote}><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Building your quiz…</div>}
              {!quizLoading && quiz.length === 0 && <div style={st.loadingNote}>Click “Generate quiz” to start.</div>}
              {quiz.map((q, qi) => {
                const picked = picks[qi];
                const answered = picked !== undefined;
                return (
                  <div key={qi} style={st.qCard}>
                    <div style={st.qText}>{qi + 1}. {q.q}</div>
                    <div style={st.options}>
                      {q.options.map((opt, oi) => {
                        const isCorrect = oi === q.answer;
                        const isPicked = oi === picked;
                        let bg = "rgba(255,255,255,0.04)", border = "rgba(255,255,255,0.10)", color = "#FBF7EE";
                        if (answered && isCorrect) { bg = "rgba(46,125,82,0.22)"; border = "rgba(126,224,168,0.5)"; color = "#9FF0C0"; }
                        else if (answered && isPicked && !isCorrect) { bg = "rgba(125,48,48,0.22)"; border = "rgba(232,144,144,0.5)"; color = "#F0AAAA"; }
                        return (
                          <button key={oi} disabled={answered}
                            onClick={() => setPicks((p) => ({ ...p, [qi]: oi }))}
                            style={{ ...st.option, background: bg, borderColor: border, color, cursor: answered ? "default" : "pointer" }}>
                            <span>{opt}</span>
                            {answered && isCorrect && <Check size={16} color="#9FF0C0" />}
                            {answered && isPicked && !isCorrect && <X size={16} color="#F0AAAA" />}
                          </button>
                        );
                      })}
                    </div>
                    {answered && q.source && <div style={st.sourceTag}>{q.source}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {mode === "cards" && (
          <div style={st.panel}>
            <div style={st.panelHead}>
              <div>
                <h2 style={st.panelTitle}>Flashcards</h2>
                <p style={st.panelSub}>Tap a card to flip it.</p>
              </div>
              <button onClick={makeCards} disabled={cardsLoading} style={st.action}>
                {cardsLoading ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <RotateCw size={15} />}
                {cards.length ? "New set" : "Generate cards"}
              </button>
            </div>
            <div style={st.panelBody}>
              {cardsLoading && <div style={st.loadingNote}><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Making flashcards…</div>}
              {!cardsLoading && cards.length === 0 && <div style={st.loadingNote}>Click “Generate cards” to start.</div>}
              <div style={st.cardGrid}>
                {cards.map((c, ci) => (
                  <div key={ci} onClick={() => setFlipped((f) => ({ ...f, [ci]: !f[ci] }))} style={st.flashcard}>
                    {flipped[ci] ? <div style={st.cardBack}>{c.back}</div> : <div style={st.cardFront}>{c.front}</div>}
                    <div style={st.cardHint}>{flipped[ci] ? "answer" : "tap to reveal"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes auroraShift { 0% { transform: translate(0,0) scale(1); } 50% { transform: translate(-4%,3%) scale(1.08); } 100% { transform: translate(0,0) scale(1); } }
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 8px; }
        input::placeholder { color: rgba(251,247,238,0.4); }
        .md p { margin: 0 0 10px; } .md p:last-child { margin-bottom: 0; }
        .md ul, .md ol { margin: 6px 0; padding-left: 20px; } .md li { margin: 3px 0; }
        .md strong { font-weight: 700; color: #FBF7EE; }
        .md code { background: rgba(245,165,36,0.15); color: #F5C067; padding: 1px 5px; border-radius: 4px; font-size: 14px; }
        .md h1, .md h2, .md h3 { font-size: 16px; margin: 10px 0 6px; }
      `}</style>
    </div>
  );
}

function ModeBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      ...st.modeBtn,
      background: active ? "linear-gradient(135deg, #F5A524, #E08A00)" : "rgba(255,255,255,0.03)",
      color: active ? "#16162B" : "#C8C8D8",
      fontWeight: active ? 700 : 500,
      border: active ? "1px solid rgba(245,165,36,0.6)" : "1px solid rgba(255,255,255,0.06)",
    }}>
      {icon}{label}
    </button>
  );
}

const glass = {
  background: "rgba(28,28,52,0.45)",
  backdropFilter: "blur(20px) saturate(140%)",
  WebkitBackdropFilter: "blur(20px) saturate(140%)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const st = {
  app: { position: "relative", display: "flex", height: "100vh", overflow: "hidden", fontFamily: "system-ui, -apple-system, sans-serif", background: "#0C0C18", color: "#FBF7EE" },
  aurora: {
    position: "absolute", inset: "-30%", zIndex: 0, pointerEvents: "none",
    background:
      "radial-gradient(40% 50% at 20% 25%, rgba(99,70,200,0.55), transparent 70%)," +
      "radial-gradient(45% 55% at 80% 20%, rgba(60,90,200,0.45), transparent 70%)," +
      "radial-gradient(50% 50% at 70% 85%, rgba(245,165,36,0.30), transparent 70%)," +
      "radial-gradient(40% 45% at 30% 90%, rgba(150,60,180,0.35), transparent 70%)",
    filter: "blur(40px)", animation: "auroraShift 18s ease-in-out infinite",
  },
  grain: { position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", opacity: 0.4, background: "radial-gradient(circle at 50% 50%, transparent 60%, rgba(0,0,0,0.35))" },

  sidebar: { ...glass, position: "relative", zIndex: 1, width: 300, margin: 14, marginRight: 7, borderRadius: 22, padding: 22, display: "flex", flexDirection: "column", gap: 14 },
  brand: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 },
  brandMark: { width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, #F5A524, #E08A00)", display: "grid", placeItems: "center", boxShadow: "0 4px 14px rgba(245,165,36,0.4)" },
  brandText: { fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" },
  sourcesHead: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  sourcesLabel: { fontSize: 11, fontWeight: 700, color: "#9A9AB5", textTransform: "uppercase", letterSpacing: "0.08em" },
  sourceCount: { fontSize: 12, background: "rgba(255,255,255,0.08)", color: "#D8D8E8", padding: "1px 8px", borderRadius: 10, fontWeight: 600 },
  clearBtn: { display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 7, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#9A9AB5", cursor: "pointer" },
  sourceList: { display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", maxHeight: "40vh" },
  docCard: { display: "flex", gap: 10, alignItems: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "10px 12px" },
  docTitle: { fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  docMeta: { fontSize: 11, color: "#9A9AB5", marginTop: 1 },
  addBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, border: "1.5px dashed rgba(255,255,255,0.18)", borderRadius: 12, padding: "12px", cursor: "pointer", color: "#C8C8D8", fontSize: 13, fontWeight: 500 },
  modeGroup: { display: "flex", flexDirection: "column", gap: 7, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" },
  modeBtn: { display: "flex", alignItems: "center", gap: 9, borderRadius: 11, padding: "11px 13px", fontSize: 14, cursor: "pointer", textAlign: "left", transition: "all 0.15s" },
  note: { fontSize: 12, color: "#8A8AA0", lineHeight: 1.5, marginTop: "auto" },

  main: { ...glass, position: "relative", zIndex: 1, flex: 1, margin: 14, marginLeft: 7, borderRadius: 22, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" },
  empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: 24 },
  emptyMark: { width: 60, height: 60, borderRadius: 18, background: "rgba(245,165,36,0.12)", border: "1px solid rgba(245,165,36,0.3)", display: "grid", placeItems: "center" },
  emptyTitle: { fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" },
  emptySub: { color: "#9A9AB5", fontSize: 15, maxWidth: 380, lineHeight: 1.5 },
  chat: { flex: 1, overflowY: "auto", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16 },
  userMsg: { alignSelf: "flex-end", background: "linear-gradient(135deg, #F5A524, #E08A00)", color: "#16162B", padding: "11px 15px", borderRadius: "16px 16px 4px 16px", maxWidth: "75%", fontSize: 15, fontWeight: 600, boxShadow: "0 6px 18px rgba(245,165,36,0.25)" },
  botMsg: { alignSelf: "flex-start", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", color: "#FBF7EE", padding: "14px 16px", borderRadius: "16px 16px 16px 4px", maxWidth: "80%", backdropFilter: "blur(8px)" },
  botLabel: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#F5A524", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 },
  msgText: { lineHeight: 1.6, fontSize: 15 },
  cites: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 11 },
  cite: { fontSize: 12, background: "rgba(245,165,36,0.12)", color: "#F5C067", padding: "3px 9px", borderRadius: 7, fontWeight: 600, border: "1px solid rgba(245,165,36,0.2)" },
  composer: { display: "flex", gap: 10, padding: 18, borderTop: "1px solid rgba(255,255,255,0.08)" },
  input: { flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: "13px 16px", color: "#FBF7EE", fontSize: 15, outline: "none" },
  send: { background: "linear-gradient(135deg, #F5A524, #E08A00)", color: "#16162B", border: "none", borderRadius: 14, width: 50, display: "grid", placeItems: "center", cursor: "pointer", boxShadow: "0 6px 18px rgba(245,165,36,0.3)" },

  panel: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 },
  panelHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "24px 32px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", gap: 16 },
  panelTitle: { fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" },
  panelSub: { fontSize: 13, color: "#9A9AB5", margin: "4px 0 0" },
  action: { display: "flex", alignItems: "center", gap: 7, background: "linear-gradient(135deg, #F5A524, #E08A00)", color: "#16162B", border: "none", borderRadius: 12, padding: "10px 15px", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 6px 18px rgba(245,165,36,0.25)" },
  scorePill: { background: "rgba(46,125,82,0.22)", color: "#9FF0C0", fontWeight: 700, fontSize: 15, padding: "6px 14px", borderRadius: 20, border: "1px solid rgba(126,224,168,0.4)" },
  panelBody: { flex: 1, overflowY: "auto", padding: "20px 32px", display: "flex", flexDirection: "column", gap: 16 },
  loadingNote: { display: "flex", alignItems: "center", gap: 9, color: "#9A9AB5", fontSize: 14, padding: 20 },

  qCard: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: 18 },
  qText: { fontSize: 15, fontWeight: 600, marginBottom: 12, lineHeight: 1.5 },
  options: { display: "flex", flexDirection: "column", gap: 8 },
  option: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid", borderRadius: 11, padding: "12px 15px", fontSize: 14, textAlign: "left", transition: "all 0.15s" },
  sourceTag: { marginTop: 12, fontSize: 12, color: "#F5C067", background: "rgba(245,165,36,0.12)", display: "inline-block", padding: "3px 9px", borderRadius: 7, fontWeight: 600, alignSelf: "flex-start", border: "1px solid rgba(245,165,36,0.2)" },

  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 },
  flashcard: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: 20, minHeight: 150, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", cursor: "pointer", position: "relative", transition: "transform 0.15s, border-color 0.15s" },
  cardFront: { fontSize: 16, fontWeight: 700, lineHeight: 1.4 },
  cardBack: { fontSize: 14, lineHeight: 1.5, color: "#D8D8E8" },
  cardHint: { position: "absolute", bottom: 11, fontSize: 10, color: "#6A6A85", textTransform: "uppercase", letterSpacing: "0.06em" },
};
