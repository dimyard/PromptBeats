// PromptBeats UI. Owner: Human A. Chat -> /api/compose -> player.load -> play.
// Minimal but end-to-end. Style/track-grid polish is A's job.
import { useEffect, useRef, useState } from "react";
import { compose } from "./api.js";
import { createPlayer } from "./player/index.js";

export default function App() {
  const [messages, setMessages] = useState([]); // {role, text}
  const [input, setInput] = useState("");
  const [song, setSong] = useState(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const playerRef = useRef(null);

  useEffect(() => {
    const p = createPlayer();
    p.on("step", setStep);
    p.on("error", (e) => console.warn("player:", e));
    playerRef.current = p;
    return () => p.dispose();
  }, []);

  async function send() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: prompt }]);
    setBusy(true);
    try {
      const { song: next, message } = await compose(prompt, song); // edit if song exists
      setSong(next);
      setMessages((m) => [...m, { role: "assistant", text: message || "Готово." }]);
      await playerRef.current.load(next);
    } catch (e) {
      setMessages((m) => [...m, { role: "error", text: e.message }]);
    } finally {
      setBusy(false);
    }
  }

  async function togglePlay() {
    const p = playerRef.current;
    if (playing) { p.stop(); setPlaying(false); }
    else { await p.play(); setPlaying(true); }
  }

  const totalSteps = song ? song.bars * 16 : 16;

  return (
    <div style={S.app}>
      <div style={S.chat}>
        <h1 style={S.h1}>PromptBeats</h1>
        <div style={S.log}>
          {messages.map((m, i) => (
            <div key={i} style={{ ...S.msg, ...S[m.role] }}>{m.text}</div>
          ))}
          {busy && <div style={{ ...S.msg, ...S.assistant }}>…</div>}
        </div>
        <div style={S.inputRow}>
          <input
            style={S.input}
            value={input}
            placeholder={song ? "Правка: «добавь пэд», «быстрее»…" : "Опиши трек: «спокойный лоу-фай, 75 BPM»"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button style={S.btn} onClick={send} disabled={busy}>➤</button>
        </div>
      </div>

      <div style={S.stage}>
        <div style={S.controls}>
          <button style={S.play} onClick={togglePlay} disabled={!song}>
            {playing ? "■ Stop" : "▶ Play"}
          </button>
          {song && <span style={S.meta}>{song.title} · {song.bpm} BPM · {song.key}</span>}
        </div>

        {/* Track grid — A: make this prettier. Shows events on the step grid. */}
        <div style={S.grid}>
          {(song?.tracks ?? []).map((t) => {
            const hit = new Set(t.events.map((e) => e.step));
            return (
              <div key={t.id} style={S.trackRow}>
                <div style={S.trackName}>{t.id}</div>
                <div style={S.steps}>
                  {Array.from({ length: totalSteps }).map((_, i) => (
                    <div key={i} style={{
                      ...S.cell,
                      background: hit.has(i) ? "#6c8cff" : "#20232e",
                      outline: i === step ? "2px solid #ffd76c" : "none",
                    }} />
                  ))}
                </div>
              </div>
            );
          })}
          {!song && <p style={S.hint}>Опиши трек слева, чтобы начать.</p>}
        </div>
      </div>
    </div>
  );
}

const S = {
  app: { display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", color: "#e8e8ef", background: "#12141c" },
  chat: { width: 360, display: "flex", flexDirection: "column", borderRight: "1px solid #262a37", padding: 16 },
  h1: { margin: "0 0 12px", fontSize: 20 },
  log: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 },
  msg: { padding: "8px 12px", borderRadius: 12, maxWidth: "90%", fontSize: 14, lineHeight: 1.35 },
  user: { alignSelf: "flex-end", background: "#6c8cff", color: "#fff" },
  assistant: { alignSelf: "flex-start", background: "#20232e" },
  error: { alignSelf: "flex-start", background: "#5a2330", color: "#ffd0d0" },
  inputRow: { display: "flex", gap: 8, marginTop: 12 },
  input: { flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #2c313f", background: "#1a1d27", color: "#fff" },
  btn: { padding: "0 16px", borderRadius: 10, border: "none", background: "#6c8cff", color: "#fff", cursor: "pointer" },
  stage: { flex: 1, padding: 24, display: "flex", flexDirection: "column", gap: 20 },
  controls: { display: "flex", alignItems: "center", gap: 16 },
  play: { padding: "10px 20px", borderRadius: 10, border: "none", background: "#2fbf71", color: "#fff", fontSize: 16, cursor: "pointer" },
  meta: { opacity: 0.8 },
  grid: { display: "flex", flexDirection: "column", gap: 8 },
  trackRow: { display: "flex", alignItems: "center", gap: 12 },
  trackName: { width: 70, fontSize: 13, opacity: 0.85 },
  steps: { display: "flex", gap: 2, flexWrap: "wrap" },
  cell: { width: 18, height: 24, borderRadius: 3 },
  hint: { opacity: 0.6 },
};
