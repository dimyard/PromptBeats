// PromptBeats UI. Owner: Human A. Chat -> /api/compose -> player.load -> play.
// Stage 3: manual Song JSON controls, track lanes, inspector, and beat-reactive visuals.
import { useEffect, useMemo, useRef, useState } from "react";
import { compose, getCatalog } from "./api.js";
import { createPlayer } from "./player/index.js";
import {
  addTrack,
  DRUM_NOTE_LABELS,
  DRUM_NOTES,
  FALLBACK_CATALOG,
  moveTrack,
  normalizeSongForLoop,
  setSongBars,
  setSongBpm,
  setTrackGain,
  setTrackMuted,
  setTrackSound,
  soundsForInstrument,
  toggleDrumStep,
  totalSteps as getTotalSteps,
} from "./songEditing.js";
import {
  serializeSong,
  parseSong,
  songFilename,
  downloadBlob,
  readFileAsText,
} from "./song-io.js";
import sampleSong from "../../sample-song.json";
import "./styles.css";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

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

const BAR_OPTIONS = [1, 2, 4, 8, 16, 32];
const VISUAL_BARS = 40;
const DEFAULT_ADD_TRACK = {
  role: "lead",
  instrument: "synth",
  sound: "pluck",
};

function copySong(source) {
  return JSON.parse(JSON.stringify(source));
}

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

function songMood(song) {
  const sounds = (song?.tracks ?? []).map((track) => track.sound);
  if (sounds.includes("trap_kit")) return "sharp";
  if (sounds.includes("house_kit") || (song?.bpm ?? 0) >= 110) return "bright";
  if (sounds.includes("soft_pad")) return "warm";
  return "lofi";
}

function eventsAtStep(track, step) {
  return (track.events ?? []).filter((event) => event.step === step);
}

function eventLabel(event) {
  return DRUM_NOTE_LABELS[event.note] ?? event.note;
}

export default function App() {
  const [messages, setMessages] = useState([
    makeMessage("assistant", "Опиши трек или нажми «Пример», чтобы загрузить демо без бэкенда."),
  ]);
  const [input, setInput] = useState("");
  const [song, setSong] = useState(null);
  const [catalog, setCatalog] = useState(FALLBACK_CATALOG);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [lastError, setLastError] = useState("");
  const [drumNotes, setDrumNotes] = useState({});
  const [trackDraft, setTrackDraft] = useState(DEFAULT_ADD_TRACK);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importState, setImportState] = useState("idle"); // idle|dragover|parsing|success|error
  const [rendering, setRendering] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [draggedTrackId, setDraggedTrackId] = useState("");
  const [dropTargetTrackId, setDropTargetTrackId] = useState("");
  const playerRef = useRef(null);
  const logRef = useRef(null);
  const toastTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0); // nested dragenter/dragleave counter
  const dragOpenedRef = useRef(false); // overlay was opened by a drag, not the button
  const importOpenRef = useRef(false); // latest importOpen for window listeners

  const totalSteps = song ? getTotalSteps(song) : 16;
  const status = busy ? "Генерация" : playing ? "Играет" : song ? "Готово" : "Пусто";
  const statusKind = busy ? "loading" : playing ? "playing" : song ? "ready" : "empty";
  const mood = songMood(song);
  const draftSounds = soundsForInstrument(catalog, trackDraft.instrument);

  const songSummary = useMemo(() => {
    if (!song) return "Song JSON ещё не загружен";
    return `${song.title ?? "untitled"} · ${song.bpm} BPM · ${song.key ?? "no key"} · ${formatBars(song.bars)}`;
  }, [song]);

  const activeSnapshot = useMemo(() => {
    if (!song || !playing) return { energy: 0, tracks: [] };
    const tracks = song.tracks
      .map((track) => {
        if (track.muted) return null;
        const events = eventsAtStep(track, step);
        if (!events.length) return null;
        const velocity = events.reduce((sum, event) => sum + (event.vel ?? 0.8), 0) / events.length;
        return {
          id: track.id,
          role: track.role,
          label: ROLE_LABELS[track.role] ?? track.id,
          energy: Math.min(1, velocity * (track.gain ?? 0.8)),
        };
      })
      .filter(Boolean);
    const energy = Math.min(1, tracks.reduce((sum, track) => sum + track.energy, 0));
    return { energy, tracks };
  }, [playing, song, step]);

  const visualBars = useMemo(() => {
    return Array.from({ length: VISUAL_BARS }, (_, index) => {
      const phase = Math.sin((index + 1) * 1.73 + step * 0.51);
      const centerBias = 1 - Math.abs(index - VISUAL_BARS / 2) / (VISUAL_BARS / 2) * 0.36;
      const idle = 8 + Math.abs(phase) * 8;
      const active = playing ? 18 + (Math.abs(phase) * 42 + activeSnapshot.energy * 38) * centerBias : idle;
      const generating = busy ? 26 + Math.abs(Math.sin(index * 0.64 + Date.now() / 600)) * 42 : active;
      return Math.min(96, generating);
    });
  }, [activeSnapshot.energy, busy, playing, step]);

  const validation = useMemo(() => {
    if (!song) return [];
    const steps = getTotalSteps(song);
    return [
      {
        label: "Schema shape",
        ok: song.version === 1 && Number.isInteger(song.bars) && Array.isArray(song.tracks),
      },
      {
        label: "role present",
        ok: song.tracks.every((track) => Boolean(track.role)),
      },
      {
        label: "events only",
        ok: song.tracks.every((track) => Array.isArray(track.events) && !("pattern" in track) && !("notes" in track)),
      },
      {
        label: "sound pairs",
        ok: song.tracks.every((track) => soundsForInstrument(catalog, track.instrument).includes(track.sound)),
      },
      {
        label: "loop bounds",
        ok: song.tracks.every((track) =>
          track.events.every((event) => event.step >= 0 && event.step < steps && event.step + (event.dur ?? 1) <= steps),
        ),
      },
    ];
  }, [catalog, song]);

  useEffect(() => {
    const player = createPlayer();
    const offStep = player.on("step", setStep);
    const offErr = player.on("error", (error) => {
      const message = error.message || "Ошибка плеера";
      setLastError(message);
      showToast(message);
    });
    playerRef.current = player;
    return () => {
      offStep();
      offErr();
      player.dispose();
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCatalog()
      .then((nextCatalog) => {
        if (!cancelled && nextCatalog?.synths?.length && nextCatalog?.kits?.length) {
          setCatalog(nextCatalog);
        }
      })
      .catch(() => {
        if (!cancelled) setCatalog(FALLBACK_CATALOG);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    importOpenRef.current = importOpen;
  }, [importOpen]);

  // Dragging a file anywhere over the app opens the (full-screen) import overlay;
  // a nested dragenter/dragleave counter closes it again if the file leaves
  // without being dropped. The overlay itself catches the actual drop.
  useEffect(() => {
    const hasFiles = (event) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const onDragEnter = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      if (!importOpenRef.current) {
        dragOpenedRef.current = true;
        setImportOpen(true);
      }
      setImportState((current) => (current === "parsing" ? current : "dragover"));
    };
    const onDragOver = (event) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDragLeave = (event) => {
      if (!hasFiles(event)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        if (dragOpenedRef.current) {
          dragOpenedRef.current = false;
          closeImport();
        } else {
          setImportState((current) => (current === "dragover" ? "idle" : current));
        }
      }
    };
    const onDrop = (event) => {
      event.preventDefault(); // overlay handles real drops; keep the browser from navigating
      dragDepthRef.current = 0;
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  // Esc closes the import overlay.
  useEffect(() => {
    if (!importOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") closeImport();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [importOpen]);

  function showToast(message) {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 3600);
  }

  async function loadSong(nextSong, message, { resetStep = true } = {}) {
    const normalized = normalizeSongForLoop(copySong(nextSong));
    setSong(normalized);
    if (resetStep) setStep(0);
    await playerRef.current.load(normalized);
    if (message) {
      setMessages((current) => [...current, makeMessage("assistant", message)]);
    }
  }

  async function applySongEdit(updater, successMessage) {
    if (!song || busy) return;
    try {
      const nextSong = updater(song);
      await loadSong(nextSong, null, { resetStep: false });
      if (successMessage) showToast(successMessage);
    } catch (error) {
      const message = friendlyError(error);
      setLastError(message);
      setMessages((current) => [...current, makeMessage("error", message)]);
      showToast(message);
    }
  }

  async function loadExample() {
    if (busy) return;
    try {
      await loadSong(sampleSong, "Загрузил демо-трек из sample-song.json. Можно нажимать Play.");
      setLastError("");
      showToast("Пример загружен");
    } catch (error) {
      const message = friendlyError(error);
      setLastError(message);
      setMessages((current) => [...current, makeMessage("error", message)]);
      showToast(message);
    }
  }

  async function send(promptOverride) {
    const prompt = (promptOverride ?? input).trim();
    if (!prompt || busy) return;
    setInput("");
    setLastPrompt(prompt);
    setMessages((current) => [...current, makeMessage("user", prompt)]);
    setBusy(true);
    try {
      const { song: next, message } = await compose(prompt, song);
      await loadSong(next, message || "Готово. Song JSON обновлён.");
      setLastError("");
    } catch (error) {
      const message = friendlyError(error);
      setLastError(message);
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
      setLastError(message);
      setMessages((current) => [...current, makeMessage("error", message)]);
      showToast(message);
    }
  }

  function stop() {
    playerRef.current?.stop();
    setPlaying(false);
    setStep(0);
  }

  function updateTrackDraft(patch) {
    setTrackDraft((current) => {
      const next = { ...current, ...patch };
      const sounds = soundsForInstrument(catalog, next.instrument);
      return {
        ...next,
        sound: sounds.includes(next.sound) ? next.sound : sounds[0],
        role: next.instrument === "sampler" && !patch.role ? "drums" : next.role,
      };
    });
  }

  function addDraftTrack() {
    applySongEdit(
      (current) => addTrack(current, trackDraft, catalog),
      `Добавлена дорожка ${ROLE_LABELS[trackDraft.role] ?? trackDraft.role}`,
    );
  }

  function reorderTrack(fromTrackId, toTrackId) {
    if (!fromTrackId || !toTrackId || fromTrackId === toTrackId || busy) return;
    applySongEdit((current) => moveTrack(current, fromTrackId, toTrackId), "Порядок дорожек обновлён");
  }

  function openImport() {
    setImportError("");
    setImportState("idle");
    setImportOpen(true);
  }

  function closeImport() {
    setImportOpen(false);
    setImportState("idle");
    setImportError("");
    setImportText("");
  }

  // Shared import pipeline: raw text -> parse/validate/normalize -> load.
  async function runImport(rawText) {
    const text = (rawText ?? "").trim();
    if (!text) {
      setImportError("Пусто: вставь JSON или выбери файл.");
      setImportState("error");
      return;
    }
    const result = parseSong(text);
    if (!result.ok) {
      setImportError(result.error);
      setImportState("error");
      return;
    }
    setImportError("");
    setImportState("success");
    try {
      if (!prefersReducedMotion()) await delay(200); // let the success flash paint
      await loadSong(result.song, "Импортировал трек. Можно нажимать Play.");
      setLastError("");
      showToast(result.warnings?.[0] ?? "Импортировано");
      closeImport();
    } catch (error) {
      setImportError(friendlyError(error));
      setImportState("error");
    }
  }

  async function importFromFile(file) {
    if (!file) return;
    setImportState("parsing");
    try {
      await runImport(await readFileAsText(file));
    } catch (error) {
      setImportError("Не удалось прочитать файл.");
      setImportState("error");
    }
  }

  function onOverlayDragOver(event) {
    event.preventDefault();
    setImportState((current) => (current === "parsing" ? current : "dragover"));
  }

  async function onOverlayDrop(event) {
    event.preventDefault();
    dragDepthRef.current = 0;
    dragOpenedRef.current = false; // a drop commits the overlay
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      await importFromFile(file);
      return;
    }
    setImportState("parsing");
    await runImport(event.dataTransfer?.getData("text") ?? "");
  }

  function onFileChosen(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file
    importFromFile(file);
  }

  function exportJson() {
    if (!song) return;
    try {
      const blob = new Blob([serializeSong(song)], { type: "application/json" });
      downloadBlob(blob, songFilename(song, "json"));
      showToast("JSON сохранён");
    } catch (error) {
      showToast(friendlyError(error));
    }
  }

  async function exportWavFile() {
    if (!song || rendering) return;
    setRendering(true);
    try {
      const blob = await playerRef.current.exportWav(song);
      downloadBlob(blob, songFilename(song, "wav"));
      showToast("WAV сохранён");
    } catch (error) {
      console.error("exportWav failed:", error);
      showToast("Не удалось сохранить аудио");
    } finally {
      setRendering(false);
    }
  }

  return (
    <main
      className={`app-shell theme-${mood} ${leftCollapsed ? "is-left-collapsed" : ""} ${rightCollapsed ? "is-right-collapsed" : ""}`}
      style={{ "--active-opacity": 0.45 + activeSnapshot.energy * 0.4 }}
    >
      <section className="chat-panel" aria-label="Чат">
        <header className="brand-row">
          <div className="logo-mark" aria-hidden="true">
            PB
          </div>
          <div className="sidebar-title">
            <p className="eyebrow">AI beat sketcher</p>
            <h1>PromptBeats</h1>
          </div>
          <span className={`status-pill status-${statusKind}`}>
            <span className="status-dot" aria-hidden="true" />
            {status}
          </span>
          <button
            className="sidebar-toggle"
            type="button"
            onClick={() => setLeftCollapsed((value) => !value)}
            aria-label={leftCollapsed ? "Показать чат" : "Скрыть чат"}
            title={leftCollapsed ? "Показать чат" : "Скрыть чат"}
          >
            {leftCollapsed ? "›" : "‹"}
          </button>
        </header>

        <div className="message-log sidebar-body" ref={logRef}>
          {messages.map((message) => (
            <article className={`message message-${message.role}`} key={message.id}>
              <span className="message-author">
                {message.role === "user" ? "Ты" : message.role === "error" ? "Ошибка" : "PromptBeats"}
              </span>
              <p>{message.text}</p>
            </article>
          ))}
          {busy && (
            <article className="message message-assistant message-typing">
              <span className="message-author">PromptBeats</span>
              <p>
                <span />
                <span />
                <span />
              </p>
            </article>
          )}
        </div>

        <div className="prompt-area sidebar-body">
          <div className="prompt-chips" aria-label="Демо-промпты">
            {DEMO_PROMPTS.map((prompt) => (
              <button type="button" key={prompt} onClick={() => send(prompt)} disabled={busy}>
                {prompt}
              </button>
            ))}
          </div>

          <form
            className={`composer ${busy ? "is-disabled" : ""}`}
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
            <button type="submit" disabled={busy || !input.trim()} aria-label="Отправить prompt">
              ↗
            </button>
          </form>
        </div>
      </section>

      <section className="studio-panel" aria-label="Студия">
        <header className="transport">
          <div className="transport-title">
            <p className="eyebrow">Текущий трек</p>
            <h2>{song?.title ?? "Нет загруженного трека"}</h2>
            <p className="song-summary">{songSummary}</p>
          </div>

          <div className="transport-actions" aria-label="Transport">
            <button className="icon-button secondary" type="button" onClick={loadExample} disabled={busy} title="Пример">
              ◇
            </button>
            <button className={`icon-button play ${playing ? "is-on" : ""}`} type="button" onClick={play} disabled={!song || busy || playing} title="Play">
              ▶
            </button>
            <button className="icon-button stop" type="button" onClick={stop} disabled={!song || !playing} title="Stop">
              ■
            </button>
          </div>
        </header>

        <div className="control-strip" aria-label="Ручные контролы песни">
          <BpmControl
            value={song?.bpm ?? ""}
            disabled={!song || busy}
            onDec={() => applySongEdit((current) => setSongBpm(current, current.bpm - 1))}
            onInc={() => applySongEdit((current) => setSongBpm(current, current.bpm + 1))}
            onCommit={(nextBpm) => applySongEdit((current) => setSongBpm(current, nextBpm), "BPM обновлён")}
          />
          <label className="meta-card meta-select">
            <span>Bars</span>
            <select
              value={song?.bars ?? 2}
              disabled={!song || busy}
              onChange={(event) => applySongEdit((current) => setSongBars(current, Number(event.target.value)), "Длина лупа обновлена")}
            >
              {BAR_OPTIONS.map((bars) => (
                <option value={bars} key={bars}>
                  {bars}
                </option>
              ))}
            </select>
          </label>
          <MetaCard label="Key" value={song?.key ?? "-"} />
          <MetaCard label="Step" value={song ? `${step + 1}/${totalSteps}` : "-"} />
        </div>

        <LiveVisualizer busy={busy} playing={playing} bars={visualBars} activeTracks={activeSnapshot.tracks} />

        <section className="track-grid" aria-label="Дорожки">
          <div className="track-toolbar">
            <div>
              <p className="eyebrow">Tracks</p>
              <h3>{song ? `${song.tracks.length} дорожки` : "Дорожки"}</h3>
            </div>
            <div className="add-track-controls" aria-label="Добавить дорожку">
              <label>
                <span>role</span>
                <select value={trackDraft.role} onChange={(event) => updateTrackDraft({ role: event.target.value })} disabled={!song || busy}>
                  {(catalog.roles ?? FALLBACK_CATALOG.roles).map((role) => (
                    <option value={role} key={role}>
                      {ROLE_LABELS[role] ?? role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>instrument</span>
                <select
                  value={trackDraft.instrument}
                  onChange={(event) =>
                    updateTrackDraft({
                      instrument: event.target.value,
                      role: event.target.value === "sampler" ? "drums" : trackDraft.role,
                    })
                  }
                  disabled={!song || busy}
                >
                  <option value="synth">synth</option>
                  <option value="sampler">sampler</option>
                </select>
              </label>
              <label>
                <span>sound</span>
                <select value={trackDraft.sound} onChange={(event) => updateTrackDraft({ sound: event.target.value })} disabled={!song || busy}>
                  {draftSounds.map((sound) => (
                    <option value={sound} key={sound}>
                      {sound}
                    </option>
                  ))}
                </select>
              </label>
              <button className="add-track-button" type="button" onClick={addDraftTrack} disabled={!song || busy}>
                + Дорожка
              </button>
            </div>
          </div>
          {(song?.tracks ?? []).map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              totalSteps={totalSteps}
              activeStep={step}
              playing={playing}
              busy={busy}
              catalog={catalog}
              selectedDrumNote={drumNotes[track.id] ?? "C2"}
              dragged={draggedTrackId === track.id}
              dropTarget={dropTargetTrackId === track.id && draggedTrackId !== track.id}
              onSelectedDrumNoteChange={(note) => setDrumNotes((current) => ({ ...current, [track.id]: note }))}
              onDragStart={(event) => {
                setDraggedTrackId(track.id);
                setDropTargetTrackId("");
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-promptbeats-track", track.id);
                event.dataTransfer.setData("text/plain", track.id);
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                setDropTargetTrackId(track.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTargetTrackId(track.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const fromTrackId = event.dataTransfer.getData("application/x-promptbeats-track") || draggedTrackId;
                setDraggedTrackId("");
                setDropTargetTrackId("");
                reorderTrack(fromTrackId, track.id);
              }}
              onDragEnd={() => {
                setDraggedTrackId("");
                setDropTargetTrackId("");
              }}
              onToggleMute={() =>
                applySongEdit((current) => setTrackMuted(current, track.id, !track.muted), track.muted ? "Дорожка включена" : "Дорожка muted")
              }
              onGainChange={(gain) => applySongEdit((current) => setTrackGain(current, track.id, gain))}
              onSoundChange={(sound) => applySongEdit((current) => setTrackSound(current, track.id, sound, catalog), "Sound обновлён")}
              onToggleDrumStep={(index, note) => applySongEdit((current) => toggleDrumStep(current, track.id, index, note))}
            />
          ))}
          {!song && (
            <div className="empty-state">
              <h3>Начни с промпта или примера</h3>
              <p>Кнопка «Пример» загрузит локальный Song JSON, даже если бэкенд ещё не поднят.</p>
            </div>
          )}
        </section>
      </section>

      <Inspector
        song={song}
        validation={validation}
        lastPrompt={lastPrompt}
        lastError={lastError}
        rendering={rendering}
        onImport={openImport}
        onExportJson={exportJson}
        onExportWav={exportWavFile}
        collapsed={rightCollapsed}
        onToggle={() => setRightCollapsed((value) => !value)}
      />

      {importOpen && (
        <div
          className={`import-overlay state-${importState}`}
          onClick={closeImport}
          onDragOver={onOverlayDragOver}
          onDrop={onOverlayDrop}
          role="presentation"
        >
          <div
            className="import-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Импорт трека"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="import-head">
              <h3>Импорт трека</h3>
              <button className="import-close" type="button" onClick={closeImport} aria-label="Закрыть">
                ✕
              </button>
            </header>

            <div className={`drop-zone state-${importState}`} aria-label="Зона перетаскивания файла или текста">
              <p>
                <span className="drop-hint-strong">Перетащи сюда</span> .json или текст
              </p>
              <button className="import-file-btn" type="button" onClick={() => fileInputRef.current?.click()}>
                Выбрать файл
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={onFileChosen}
                hidden
              />
            </div>

            <p className="import-or">или вставь JSON</p>
            <textarea
              className="import-textarea"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder='{ "version": 1, "bpm": 75, "bars": 8, "tracks": [ ... ] }'
              spellCheck={false}
            />

            {importError && <p className="import-error">{importError}</p>}

            <div className="import-actions">
              <button className="import-cancel" type="button" onClick={closeImport}>
                Отмена
              </button>
              <button className="import-submit" type="button" onClick={() => runImport(importText)}>
                Импортировать
              </button>
            </div>
          </div>
        </div>
      )}

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

function BpmControl({ value, disabled, onDec, onInc, onCommit }) {
  const [draft, setDraft] = useState(value === "" ? "" : String(value));

  useEffect(() => {
    setDraft(value === "" ? "" : String(value));
  }, [value]);

  function commit() {
    if (disabled) return;
    const nextValue = Number(draft);
    if (!Number.isFinite(nextValue)) {
      setDraft(value === "" ? "" : String(value));
      return;
    }
    onCommit(nextValue);
  }

  return (
    <div className="meta-card meta-stepper meta-bpm">
      <span>BPM</span>
      <div>
        <button type="button" onClick={onDec} disabled={disabled} aria-label="BPM минус">
          −
        </button>
        <input
          type="number"
          min="40"
          max="220"
          step="1"
          inputMode="numeric"
          value={draft}
          disabled={disabled}
          aria-label="BPM"
          onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
          onBlur={commit}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setDraft(value === "" ? "" : String(value));
              event.currentTarget.blur();
            }
          }}
        />
        <button type="button" onClick={onInc} disabled={disabled} aria-label="BPM плюс">
          +
        </button>
      </div>
    </div>
  );
}

function LiveVisualizer({ busy, playing, bars, activeTracks }) {
  return (
    <section className={`visualizer ${busy ? "is-generating" : ""} ${playing ? "is-playing" : ""}`} aria-label="Live output">
      <header>
        <div>
          <p className="eyebrow">Live output</p>
          <h3>{busy ? "Генерация" : playing ? "Играет" : "Ready"}</h3>
        </div>
        <div className="active-track-list" aria-label="Активные дорожки">
          {activeTracks.length ? activeTracks.slice(0, 4).map((track) => <span key={track.id}>{track.label}</span>) : <span>idle</span>}
        </div>
      </header>
      <div className="eq-bars" aria-hidden="true">
        {bars.map((height, index) => (
          <i key={index} style={{ "--bar-height": `${height}%`, "--bar-delay": `${index * 18}ms` }} />
        ))}
      </div>
    </section>
  );
}

function TrackRow({
  track,
  totalSteps,
  activeStep,
  playing,
  busy,
  catalog,
  selectedDrumNote,
  dragged,
  dropTarget,
  onSelectedDrumNoteChange,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDrop,
  onDragEnd,
  onToggleMute,
  onGainChange,
  onSoundChange,
  onToggleDrumStep,
}) {
  const isSampler = track.instrument === "sampler";
  const sounds = soundsForInstrument(catalog, track.instrument);
  const activeEvents = eventsAtStep(track, activeStep);
  const energy = track.muted
    ? 0
    : Math.min(1, activeEvents.reduce((sum, event) => sum + (event.vel ?? 0.8), 0) * (track.gain ?? 0.8));
  const laneStyle = { "--steps": totalSteps, "--lane-min-width": `${totalSteps * 1.45}rem` };
  const eventsByStep = new Map();
  for (const event of track.events ?? []) {
    if (!eventsByStep.has(event.step)) eventsByStep.set(event.step, []);
    eventsByStep.get(event.step).push(event);
  }

  return (
    <article
      className={`track-row role-${track.role} ${track.muted ? "is-muted" : ""} ${energy ? "is-hot" : ""} ${dragged ? "is-dragging" : ""} ${dropTarget ? "is-drop-target" : ""}`}
      style={{ "--meter-height": `${8 + energy * 92}%` }}
      onDragEnter={(event) => {
        event.stopPropagation();
        onDragEnter(event);
      }}
      onDragOver={(event) => {
        event.stopPropagation();
        onDragOver(event);
      }}
      onDrop={(event) => {
        event.stopPropagation();
        onDrop(event);
      }}
    >
      <div className="track-info">
        <button
          className="track-drag-handle"
          type="button"
          draggable={!busy}
          disabled={busy}
          aria-label={`Переместить дорожку ${track.id}`}
          title="Перетащить дорожку"
          onDragStart={(event) => {
            event.stopPropagation();
            onDragStart(event);
          }}
          onDragEnd={(event) => {
            event.stopPropagation();
            onDragEnd(event);
          }}
        >
          ⋮⋮
        </button>
        <div className="track-name">
          <strong>{ROLE_LABELS[track.role] ?? track.role ?? track.id}</strong>
          <span>{track.id}</span>
        </div>
        <button className={`track-toggle ${track.muted ? "is-on" : ""}`} type="button" onClick={onToggleMute} disabled={busy} aria-pressed={Boolean(track.muted)} title="Mute">
          M
        </button>
        <label className="sound-control">
          <span>sound</span>
          <select value={track.sound} onChange={(event) => onSoundChange(event.target.value)} disabled={busy}>
            {sounds.map((sound) => (
              <option value={sound} key={sound}>
                {sound}
              </option>
            ))}
          </select>
        </label>
        {isSampler && (
          <label className="sound-control drum-control">
            <span>pad</span>
            <select value={selectedDrumNote} onChange={(event) => onSelectedDrumNoteChange(event.target.value)} disabled={busy}>
              {DRUM_NOTES.map((item) => (
                <option value={item.note} key={item.note}>
                  {item.short} {item.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="gain-control">
          <span>{Math.round((track.gain ?? 0.8) * 100)}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={track.gain ?? 0.8}
            onChange={(event) => onGainChange(Number(event.target.value))}
            disabled={busy}
            aria-label={`Gain ${track.id}`}
          />
        </label>
        <div className="track-meter" aria-hidden="true">
          <i />
        </div>
      </div>

      {isSampler ? (
        <div className="lane lane-sampler" style={laneStyle}>
          {Array.from({ length: totalSteps }).map((_, index) => {
            const events = eventsByStep.get(index) ?? [];
            const label = events.map(eventLabel).slice(0, 2).join(" ");
            return (
              <button
                className={`step-button ${events.length ? "has-event" : ""} ${index === activeStep ? "is-active" : ""}`}
                key={index}
                type="button"
                disabled={busy}
                onClick={() => onToggleDrumStep(index, selectedDrumNote)}
                title={events.map((event) => `${event.note}, vel ${event.vel ?? 0.8}`).join("\n") || `Step ${index + 1}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="lane lane-notes" style={laneStyle}>
          {Array.from({ length: totalSteps }).map((_, index) => (
            <i className={index === activeStep ? "is-active" : ""} key={index} />
          ))}
          {(track.events ?? []).map((event, index) => {
            const dur = event.dur ?? 1;
            return (
              <span
                className="note-block"
                key={`${event.step}-${event.note}-${index}`}
                style={{
                  "--left": `${(event.step / totalSteps) * 100}%`,
                  "--width": `${(dur / totalSteps) * 100}%`,
                  "--note-opacity": 0.38 + (event.vel ?? 0.8) * 0.62,
                }}
                title={`${event.note}, step ${event.step}, dur ${dur}, vel ${event.vel ?? 0.8}`}
              >
                {event.note}
              </span>
            );
          })}
        </div>
      )}
    </article>
  );
}

function Inspector({
  song,
  validation,
  lastPrompt,
  lastError,
  rendering,
  onImport,
  onExportJson,
  onExportWav,
  collapsed,
  onToggle,
}) {
  return (
    <aside className={`inspector ${collapsed ? "is-collapsed" : ""}`} aria-label="Song inspector">
      <header className="inspector-header">
        <div className="sidebar-title">
          <p className="eyebrow">Inspector</p>
          <h2>Song JSON</h2>
        </div>
        <button
          className="sidebar-toggle"
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Показать инспектор" : "Скрыть инспектор"}
          title={collapsed ? "Показать инспектор" : "Скрыть инспектор"}
        >
          {collapsed ? "‹" : "›"}
        </button>
      </header>

      <div className="inspector-content">
        <section className="inspector-section">
          <p className="eyebrow">Song JSON</p>
          <div className="kv-chips">
            <Chip label="version" value={song?.version ?? "-"} />
            <Chip label="bpm" value={song?.bpm ?? "-"} />
            <Chip label="key" value={song?.key ?? "-"} />
            <Chip label="bars" value={song?.bars ?? "-"} />
            <Chip label="tracks" value={song?.tracks?.length ?? "-"} />
          </div>
        </section>

        <section className="inspector-section">
          <p className="eyebrow">Validation</p>
          <div className="validation-list">
            {validation.length ? (
              validation.map((item) => (
                <span className={item.ok ? "is-ok" : "is-bad"} key={item.label}>
                  <i aria-hidden="true" />
                  {item.label}
                </span>
              ))
            ) : (
              <span className="is-muted">
                <i aria-hidden="true" />
                waiting for song
              </span>
            )}
          </div>
        </section>

        <section className="inspector-section">
          <p className="eyebrow">Request payload</p>
          <pre className="payload-preview">
{JSON.stringify(
  {
    prompt: lastPrompt || null,
    song: song ? { title: song.title, bpm: song.bpm, bars: song.bars, tracks: song.tracks.length } : null,
  },
  null,
  2,
)}
          </pre>
        </section>

        <section className="inspector-section inspector-json">
          <details open>
            <summary>JSON preview</summary>
            <pre>{song ? JSON.stringify(song, null, 2) : "null"}</pre>
          </details>
        </section>

        <section className="inspector-section">
          <p className="eyebrow">Импорт / экспорт</p>
          <div className="export-actions">
            <button className="export-button" type="button" onClick={onImport}>
              Импорт трека
            </button>
            <button className="export-button" type="button" onClick={onExportJson} disabled={!song}>
              Экспорт JSON
            </button>
            <button
              className={`export-button ${rendering ? "is-rendering" : ""}`}
              type="button"
              onClick={onExportWav}
              disabled={!song || rendering}
            >
              {rendering ? "Рендер…" : "Сохранить WAV"}
            </button>
          </div>
          {lastError && <p className="last-error">{lastError}</p>}
        </section>
      </div>
    </aside>
  );
}

function Chip({ label, value }) {
  return (
    <span className="kv-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}
