import { useState, useRef } from "react";
import { Upload, Send, Loader2, FileText, BookOpen, Sparkles, Plus, MessageSquare, ListChecks, Layers, RotateCw, Check, X } from "lucide-react";
import ReactMarkdown from "react-markdown";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function App() {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState("chat"); // chat | quiz | cards

  // chat
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);

  // quiz
  const [quiz, setQuiz] = useState([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [picks, setPicks] = useState({}); // {questionIndex: optionIndex}

  // flashcards
  const [cards, setCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [flipped, setFlipped] = useState({}); // {cardIndex: true}

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
    setQuizLoading(true);
    setQuiz([]);
    setPicks({});
    try {
      const res = await fetch(`${API}/api/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 5 }),
      });
      const data = await res.json();
      setQuiz(Array.isArray(data.questions) ? data.questions : []);
    } catch {
      setQuiz([]);
    } finally {
      setQuizLoading(false);
    }
  }

  async function makeCards() {
    if (!hasDocs) return;
    setCardsLoading(true);
    setCards([]);
    setFlipped({});
    try {
      const res = await fetch(`${API}/api/flashcards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 8 }),
      });
      const data = await res.json();
      setCards(Array.isArray(data.cards) ? data.cards : []);
    } catch {
      setCards([]);
    } finally {
      setCardsLoading(false);
    }
  }

  const score = quiz.length
    ? quiz.reduce((s, q, i) => s + (picks[i] === q.answer ? 1 : 0), 0)
    : 0;
  const allAnswered = quiz.length > 0 && Object.keys(picks).length === quiz.length;

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
        {/* ---------- CHAT ---------- */}
        {mode === "chat" && (
          <>
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
          </>
        )}

        {/* ---------- QUIZ ---------- */}
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
                        let bg = "#16162B", border = "#2C2C48", color = "#FBF7EE";
                        if (answered && isCorrect) { bg = "#143524"; border = "#2E7D52"; color = "#7EE0A8"; }
                        else if (answered && isPicked && !isCorrect) { bg = "#3A1A1A"; border = "#7D3030"; color = "#E89090"; }
                        return (
                          <button key={oi} disabled={answered}
                            onClick={() => setPicks((p) => ({ ...p, [qi]: oi }))}
                            style={{ ...st.option, background: bg, borderColor: border, color, cursor: answered ? "default" : "pointer" }}>
                            <span>{opt}</span>
                            {answered && isCorrect && <Check size={16} color="#7EE0A8" />}
                            {answered && isPicked && !isCorrect && <X size={16} color="#E89090" />}
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

        {/* ---------- FLASHCARDS ---------- */}
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
                    {flipped[ci]
                      ? <div style={st.cardBack}>{c.back}</div>
                      : <div style={st.cardFront}>{c.front}</div>}
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

function ModeBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      ...st.modeBtn,
      background: active ? "#F5A524" : "transparent",
      color: active ? "#16162B" : "#C8C8D8",
      fontWeight: active ? 700 : 500,
    }}>
      {icon}{label}
    </button>
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
  modeGroup: { display: "flex", flexDirection: "column", gap: 6, paddingTop: 6, borderTop: "1px solid #2C2C48" },
  modeBtn: { display: "flex", alignItems: "center", gap: 9, border: "none", borderRadius: 10, padding: "10px 12px", fontSize: 14, cursor: "pointer", textAlign: "left", transition: "background 0.15s" },
  note: { fontSize: 12, color: "#8A8AA0", lineHeight: 1.5, marginTop: "auto" },
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
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

  // panels (quiz + cards)
  panel: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 },
  panelHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "24px 32px 16px", borderBottom: "1px solid #2C2C48", gap: 16 },
  panelTitle: { fontSize: 22, fontWeight: 700, margin: 0 },
  panelSub: { fontSize: 13, color: "#8A8AA0", margin: "4px 0 0" },
  action: { display: "flex", alignItems: "center", gap: 7, background: "#F5A524", color: "#16162B", border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  scorePill: { background: "#143524", color: "#7EE0A8", fontWeight: 700, fontSize: 15, padding: "6px 14px", borderRadius: 20, border: "1px solid #2E7D52" },
  panelBody: { flex: 1, overflowY: "auto", padding: "20px 32px", display: "flex", flexDirection: "column", gap: 16 },
  loadingNote: { display: "flex", alignItems: "center", gap: 9, color: "#8A8AA0", fontSize: 14, padding: 20 },

  // quiz
  qCard: { background: "#1F1F3A", border: "1px solid #2C2C48", borderRadius: 14, padding: 18 },
  qText: { fontSize: 15, fontWeight: 600, marginBottom: 12, lineHeight: 1.5 },
  options: { display: "flex", flexDirection: "column", gap: 8 },
  option: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid", borderRadius: 10, padding: "11px 14px", fontSize: 14, textAlign: "left", transition: "all 0.15s" },
  sourceTag: { marginTop: 12, fontSize: 12, color: "#A06800", background: "#F0E9D8", display: "inline-block", padding: "3px 9px", borderRadius: 7, fontWeight: 600, alignSelf: "flex-start" },

  // flashcards
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 },
  flashcard: { background: "#1F1F3A", border: "1px solid #2C2C48", borderRadius: 14, padding: 18, minHeight: 140, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", cursor: "pointer", position: "relative" },
  cardFront: { fontSize: 16, fontWeight: 700, lineHeight: 1.4 },
  cardBack: { fontSize: 14, lineHeight: 1.5, color: "#D8D8E8" },
  cardHint: { position: "absolute", bottom: 10, fontSize: 11, color: "#6A6A85", textTransform: "uppercase", letterSpacing: "0.05em" },
};
