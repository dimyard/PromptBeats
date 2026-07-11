// PromptBeats UI. Owner: Human A. Chat -> /api/compose -> player.load -> play.
// Stage 2: demo fallback, visible errors, chat polish, and transport state.
import { useEffect, useMemo, useRef, useState } from "react";
import { compose } from "./api.js";
import { createPlayer } from "./player/index.js";
import sampleSong from "../../sample-song.json";
import "./styles.css";

const DEMO_PROMPTS = [
  "Спокойный lo-fi бит, 75 BPM, минор",
  "Добавь мягкий pad",
  "Ускорь до 90 и сделай бас громче",
];

const ROLE_LABELS = {
  drums: "Барабаны",
  bass: "Бас",
  chords: "Аккорды",
  lead: "Лид",
  pad: "Пэд",
  fx: "FX",
};

const DRUM_LABELS = {
  C2: "K",
  D2: "S",
  "D#2": "C",
  "F#2": "H",
  "A#2": "O",
  E2: "T",
  "C#3": "R",
};

function makeMessage(role, text) {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, role, text };
}

function friendlyError(error) {
  const message = error?.message ?? String(error);
  if (message === "Failed to fetch") {
    return "Бэкенд недоступен. Можно продолжить через кнопку «Пример».";
  }
  return message;
}

function formatBars(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} такт`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${count} такта`;
  return `${count} тактов`;
}

export default function App() {
  const [messages, setMessages] = useState([
    makeMessage(
      "assistant",
      "Опиши трек или нажми «Пример», чтобы загрузить демо без бэкенда.",
    ),
  ]);
  const [input, setInput] = useState("");
  const [song, setSong] = useState(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState("");
  const playerRef = useRef(null);
  const logRef = useRef(null);
  const toastTimerRef = useRef(null);

  const totalSteps = song ? song.bars * 16 : 16;
  const status = busy ? "Генерация" : playing ? "Играет" : song ? "Готово" : "Пусто";
  const statusKind = busy ? "loading" : playing ? "playing" : song ? "ready" : "empty";

  const songSummary = useMemo(() => {
    if (!song) return "Song JSON ещё не загружен";
    return `${song.title ?? "untitled"} · ${song.bpm} BPM · ${song.key ?? "no key"} · ${formatBars(song.bars)}`;
  }, [song]);

  useEffect(() => {
    const p = createPlayer();
    const offStep = p.on("step", setStep);
    const offErr = p.on("error", (e) => {
      showToast(e.message || "Ошибка плеера");
    });
    playerRef.current = p;
    return () => {
      offStep();
      offErr();
      p.dispose();
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function showToast(message) {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 3600);
  }

  async function loadSong(nextSong, message) {
    setSong(nextSong);
    setStep(0);
    await playerRef.current.load(nextSong);
    if (message) {
      setMessages((current) => [...current, makeMessage("assistant", message)]);
    }
  }

  async function loadExample() {
    if (busy) return;
    try {
      await loadSong(sampleSong, "Загрузил демо-трек из sample-song.json. Можно нажимать Play.");
      showToast("Пример загружен");
    } catch (error) {
      const message = friendlyError(error);
      setMessages((current) => [...current, makeMessage("error", message)]);
      showToast(message);
    }
  }

  async function send(promptOverride) {
    const prompt = (promptOverride ?? input).trim();
    if (!prompt || busy) return;
    setInput("");
    setMessages((current) => [...current, makeMessage("user", prompt)]);
    setBusy(true);
    try {
      const { song: next, message } = await compose(prompt, song);
      await loadSong(next, message || "Готово. Song JSON обновлён.");
    } catch (error) {
      const message = friendlyError(error);
      setMessages((current) => [...current, makeMessage("error", message)]);
      showToast(message);
    } finally {
      setBusy(false);
    }
  }

  async function play() {
    if (!song || busy) return;
    try {
      await playerRef.current.play();
      setPlaying(true);
    } catch (error) {
      const message = friendlyError(error);
      setMessages((current) => [...current, makeMessage("error", message)]);
      showToast(message);
    }
  }

  function stop() {
    playerRef.current?.stop();
    setPlaying(false);
  }

  return (
    <main className="app-shell">
      <section className="chat-panel" aria-label="Чат">
        <header className="brand-row">
          <div>
            <p className="eyebrow">AI beat sketcher</p>
            <h1>PromptBeats</h1>
          </div>
          <span className={`status-pill status-${statusKind}`}>{status}</span>
        </header>

        <div className="message-log" ref={logRef}>
          {messages.map((message) => (
            <article className={`message message-${message.role}`} key={message.id}>
              <span className="message-author">
                {message.role === "user" ? "Ты" : message.role === "error" ? "Ошибка" : "PromptBeats"}
              </span>
              <p>{message.text}</p>
            </article>
          ))}
          {busy && (
            <article className="message message-assistant">
              <span className="message-author">PromptBeats</span>
              <p>Собираю новый Song JSON...</p>
            </article>
          )}
        </div>

        <div className="prompt-area">
          <div className="prompt-chips" aria-label="Демо-промпты">
            {DEMO_PROMPTS.map((prompt) => (
              <button type="button" key={prompt} onClick={() => send(prompt)} disabled={busy}>
                {prompt}
              </button>
            ))}
          </div>

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <input
              value={input}
              placeholder={song ? "Правка: «добавь хэты», «быстрее»..." : "Опиши трек: «спокойный lo-fi, 75 BPM»"}
              onChange={(event) => setInput(event.target.value)}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()}>
              Отправить
            </button>
          </form>
        </div>
      </section>

      <section className="studio-panel" aria-label="Студия">
        <header className="transport">
          <div>
            <p className="eyebrow">Текущий трек</p>
            <h2>{song?.title ?? "Нет загруженного трека"}</h2>
            <p className="song-summary">{songSummary}</p>
          </div>

          <div className="transport-actions">
            <button className="secondary-button" type="button" onClick={loadExample} disabled={busy}>
              Пример
            </button>
            <button className="play-button" type="button" onClick={play} disabled={!song || busy || playing}>
              Play
            </button>
            <button className="stop-button" type="button" onClick={stop} disabled={!song || !playing}>
              Stop
            </button>
          </div>
        </header>

        <div className="meta-grid" aria-label="Метаданные трека">
          <MetaCard label="BPM" value={song?.bpm ?? "-"} />
          <MetaCard label="Key" value={song?.key ?? "-"} />
          <MetaCard label="Bars" value={song?.bars ?? "-"} />
          <MetaCard label="Step" value={song ? `${step + 1}/${totalSteps}` : "-"} />
        </div>

        <section className="track-grid" aria-label="Дорожки">
          {(song?.tracks ?? []).map((track) => (
            <TrackRow key={track.id} track={track} totalSteps={totalSteps} activeStep={step} />
          ))}
          {!song && (
            <div className="empty-state">
              <h3>Начни с промпта или примера</h3>
              <p>Кнопка «Пример» загрузит локальный Song JSON, даже если бэкенд ещё не поднят.</p>
            </div>
          )}
        </section>
      </section>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function MetaCard({ label, value }) {
  return (
    <div className="meta-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TrackRow({ track, totalSteps, activeStep }) {
  const eventsByStep = new Map();
  for (const event of track.events ?? []) {
    if (!eventsByStep.has(event.step)) eventsByStep.set(event.step, []);
    eventsByStep.get(event.step).push(event);
  }

  return (
    <article className={`track-row role-${track.role}`}>
      <div className="track-info">
        <strong>{ROLE_LABELS[track.role] ?? track.role ?? track.id}</strong>
        <span>{track.sound}</span>
        <small>
          gain {track.gain ?? 0.8}
          {track.muted ? " · muted" : ""}
        </small>
      </div>
      <div className="steps" style={{ "--steps": totalSteps }}>
        {Array.from({ length: totalSteps }).map((_, index) => {
          const events = eventsByStep.get(index) ?? [];
          const label = events
            .map((event) => DRUM_LABELS[event.note] ?? event.note)
            .slice(0, 2)
            .join(" ");
          return (
            <span
              className={`step-cell ${events.length ? "has-event" : ""} ${index === activeStep ? "is-active" : ""}`}
              key={index}
              title={events.map((event) => `${event.note}, dur ${event.dur ?? 1}, vel ${event.vel ?? 0.8}`).join("\n")}
            >
              {label}
            </span>
          );
        })}
      </div>
    </article>
  );
}
