// PromptBeats UI. Owner: Human A. Chat -> /api/compose -> player.load -> play.
// Stage 3: manual Song JSON controls, track lanes, inspector, and beat-reactive visuals.
import { useEffect, useMemo, useRef, useState } from "react";
import { compose, getCatalog } from "./api.js";
import { listLibrary, getLibraryTrack, saveToLibrary } from "./library-api.js";
import { deriveMusicUiState } from "./musicUiState.js";
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
const VISUALIZER_VARIANTS = ["eqBars", "beatPulse", "skyline", "ruler", "shimmer"];
const LANE_VARIANTS = ["compact", "dense", "performance"];
const LAYOUT_VARIANTS = ["classic3col", "studioDominant", "performance"];
const STATE_PRESETS = ["live", "ready", "playing", "generating", "error"];
const VARIANT_LABELS = {
  eqBars: "EQ Bars",
  beatPulse: "Beat Pulse",
  skyline: "Skyline",
  ruler: "Playhead Ruler",
  shimmer: "Shimmer",
  compact: "Compact",
  dense: "Dense",
  performance: "Performance",
  classic3col: "Classic 3-col",
  studioDominant: "Studio dominant",
  live: "Live",
  ready: "Ready",
  playing: "Playing",
  generating: "Generating",
  error: "Error",
};
const DEFAULT_ADD_TRACK = {
  role: "lead",
  instrument: "synth",
  sound: "pluck",
};
const DEFAULT_PREVIEW_SETTINGS = {
  visualizerVariant: "eqBars",
  laneVariant: "compact",
  layoutVariant: "classic3col",
  statePreset: "live",
  mockCurrentStep: 0,
  mockAutoPlay: false,
  randomMeters: false,
  forceGenerating: false,
  forceError: false,
  selectCurrentStep: false,
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
    return "Бэкенд недоступен. Запусти сервер и попробуй снова.";
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

function formatSavedAt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventLabel(event) {
  return DRUM_NOTE_LABELS[event.note] ?? event.note;
}

function statusFromMusicState(musicState, song) {
  if (musicState.generationState === "generating") return { label: "Генерация", kind: "loading" };
  if (musicState.error) return { label: "Ошибка", kind: "error" };
  if (musicState.playback.isPlaying) return { label: "Играет", kind: "playing" };
  if (song) return { label: "Готово", kind: "ready" };
  return { label: "Пусто", kind: "empty" };
}

function randomMeterMap(song) {
  return Object.fromEntries((song?.tracks ?? []).map((track) => [track.id, Number((0.12 + Math.random() * 0.78).toFixed(2))]));
}

function isInteractiveTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true']"));
}

export default function App() {
  const [messages, setMessages] = useState([
    makeMessage("assistant", "Опиши трек или открой библиотеку (♫), чтобы загрузить готовый."),
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
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTracks, setLibraryTracks] = useState([]);
  const [libraryState, setLibraryState] = useState("idle"); // idle|loading|error
  const [libraryError, setLibraryError] = useState("");
  const [saveName, setSaveName] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle|saving
  const [pendingConflict, setPendingConflict] = useState(null); // { track } awaiting overwrite confirm
  const [duplicateOf, setDuplicateOf] = useState(null); // id of an existing track a save matched
  const [loadingId, setLoadingId] = useState(null); // library track currently loading
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [selectedEventStep, setSelectedEventStep] = useState(null);
  const [previewSettings, setPreviewSettings] = useState(DEFAULT_PREVIEW_SETTINGS);
  const [mockMeterLevels, setMockMeterLevels] = useState({});
  const [designLabOpen, setDesignLabOpen] = useState(false);
  const playerRef = useRef(null);
  const logRef = useRef(null);
  const toastTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0); // nested dragenter/dragleave counter
  const dragOpenedRef = useRef(false); // overlay was opened by a drag, not the button
  const importOpenRef = useRef(false); // latest importOpen for window listeners

  const previewEnabled = import.meta.env.DEV;
  const usesMockSignals = previewEnabled && previewSettings.statePreset !== "live";
  const mood = songMood(song);
  const draftSounds = soundsForInstrument(catalog, trackDraft.instrument);
  const realErrorState = lastError
    ? {
        scope: "backend",
        message: lastError,
        recoverable: true,
      }
    : undefined;
  const presetErrorState = {
    scope: "backend",
    message: "Recoverable preview error",
    recoverable: true,
  };
  const forcedError = previewEnabled && (previewSettings.forceError || previewSettings.statePreset === "error");
  const forcedGenerating = previewEnabled && (previewSettings.forceGenerating || previewSettings.statePreset === "generating");
  const previewCurrentStep = usesMockSignals ? previewSettings.mockCurrentStep : step;
  const previewIsPlaying = usesMockSignals ? previewSettings.statePreset === "playing" : playing;
  const previewGenerationState = forcedError
    ? "error"
    : forcedGenerating
      ? "generating"
      : busy
        ? "generating"
        : previewSettings.statePreset === "ready"
          ? "idle"
          : previewSettings.statePreset === "playing"
            ? "idle"
            : lastError
              ? "error"
              : "idle";
  const musicUiState = useMemo(
    () =>
      deriveMusicUiState(
        song,
        {
          isPlaying: previewIsPlaying,
          isLooping: true,
          currentStep: previewCurrentStep,
          generationState: previewGenerationState,
          errorState: forcedError ? presetErrorState : realErrorState,
        },
        {
          selectedTrackId,
          selectedEventStep: previewSettings.selectCurrentStep ? previewCurrentStep : selectedEventStep,
          meterLevelByTrack: previewEnabled && previewSettings.randomMeters ? mockMeterLevels : undefined,
        },
      ),
    [
      forcedError,
      mockMeterLevels,
      previewCurrentStep,
      previewEnabled,
      previewGenerationState,
      previewIsPlaying,
      previewSettings.randomMeters,
      previewSettings.selectCurrentStep,
      realErrorState,
      selectedEventStep,
      selectedTrackId,
      song,
    ],
  );
  const totalSteps = musicUiState.playback.totalSteps;
  const statusSnapshot = statusFromMusicState(musicUiState, song);
  const status = statusSnapshot.label;
  const statusKind = statusSnapshot.kind;

  const songSummary = useMemo(() => {
    if (!song) return "Song JSON ещё не загружен";
    return `${song.title ?? "untitled"} · ${song.bpm} BPM · ${song.key ?? "no key"} · ${formatBars(song.bars)}`;
  }, [song]);

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
    if (!previewEnabled || !previewSettings.mockAutoPlay || previewSettings.statePreset === "live") return undefined;
    const intervalMs = Math.max(80, (60000 / musicUiState.playback.bpm) / 4);
    const timer = window.setInterval(() => {
      setPreviewSettings((current) => ({
        ...current,
        mockCurrentStep: (current.mockCurrentStep + 1) % Math.max(1, musicUiState.playback.totalSteps),
      }));
      if (previewSettings.randomMeters) setMockMeterLevels(randomMeterMap(song));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [
    musicUiState.playback.bpm,
    musicUiState.playback.totalSteps,
    previewEnabled,
    previewSettings.mockAutoPlay,
    previewSettings.randomMeters,
    previewSettings.statePreset,
    song,
  ]);

  useEffect(() => {
    importOpenRef.current = importOpen;
  }, [importOpen]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.repeat || (event.code !== "Space" && event.key !== " ")) return;
      if (isInteractiveTarget(event.target) || importOpen) return;
      if (!song || busy) return;
      event.preventDefault();
      if (playing) {
        stop();
      } else {
        play();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, importOpen, playing, song]);

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

  // Esc closes the library drawer.
  useEffect(() => {
    if (!libraryOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") closeLibrary();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [libraryOpen]);

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

  // --- Shared library -------------------------------------------------------

  function openLibrary() {
    setSaveName(song?.title ?? "");
    setPendingConflict(null);
    setDuplicateOf(null);
    setLibraryOpen(true);
    refreshLibrary();
  }

  function closeLibrary() {
    setLibraryOpen(false);
    setPendingConflict(null);
    setDuplicateOf(null);
  }

  async function refreshLibrary() {
    setLibraryState("loading");
    setLibraryError("");
    try {
      const { tracks } = await listLibrary();
      setLibraryTracks(tracks);
      setLibraryState("idle");
    } catch (error) {
      setLibraryError(friendlyError(error));
      setLibraryState("error");
    }
  }

  // Save the current song. Backend replies with a status:
  //   created | updated -> saved, refresh list
  //   duplicate         -> identical track already there, highlight it
  //   title_conflict    -> same name, different content -> ask to overwrite
  async function saveCurrent(overwrite = false) {
    if (!song || saveState === "saving") return;
    const name = saveName.trim();
    if (!name) return;
    setSaveState("saving");
    setDuplicateOf(null);
    try {
      const { status, track } = await saveToLibrary({
        song: { ...song, title: name },
        title: name,
        overwrite,
      });
      if (status === "title_conflict") {
        setPendingConflict({ track });
      } else if (status === "duplicate") {
        setPendingConflict(null);
        setDuplicateOf(track.id);
        showToast(`Такой трек уже есть: «${track.title}»`);
        await refreshLibrary();
        setDuplicateOf(track.id);
      } else {
        setPendingConflict(null);
        showToast(status === "updated" ? "Трек обновлён" : "Сохранено в библиотеку");
        await refreshLibrary();
      }
    } catch (error) {
      showToast(friendlyError(error));
    } finally {
      setSaveState("idle");
    }
  }

  async function loadFromLibrary(id, { autoPlay = false } = {}) {
    if (loadingId) return;
    setLoadingId(id);
    try {
      const { track } = await getLibraryTrack(id);
      await loadSong(track.song, `Загрузил «${track.title}» из библиотеки.`);
      setLastError("");
      showToast(`Загружено: «${track.title}»`);
      if (autoPlay) {
        // Graph is already loaded (loadSong awaited player.load); this click is
        // the user gesture, so drive the player directly (avoids the stale
        // `song` guard in play() on the very first load).
        await playerRef.current.play();
        setPlaying(true);
      }
    } catch (error) {
      const message = friendlyError(error);
      setLastError(message);
      showToast(message);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <main
      className={`app-shell theme-${mood} layout-${previewEnabled ? previewSettings.layoutVariant : "classic3col"} ${leftCollapsed ? "is-left-collapsed" : ""} ${rightCollapsed ? "is-right-collapsed" : ""}`}
      style={{
        "--active-opacity": 0.45 + Math.min(1, musicUiState.tracks.reduce((sum, track) => sum + track.meterLevel, 0)) * 0.4,
      }}
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
            {previewEnabled && (
              <button
                className={`icon-button lab-toggle ${designLabOpen ? "is-on" : ""}`}
                type="button"
                onClick={() => setDesignLabOpen((value) => !value)}
                title="Design Lab"
                aria-label="Design Lab"
                aria-expanded={designLabOpen}
                aria-controls="design-lab-panel"
              >
                Lab
              </button>
            )}
            <button
              className={`icon-button secondary ${libraryOpen ? "is-on" : ""}`}
              type="button"
              onClick={openLibrary}
              title="Библиотека"
              aria-label="Библиотека"
            >
              ♫
            </button>
            <button className={`icon-button play ${musicUiState.playback.isPlaying ? "is-on" : ""}`} type="button" onClick={play} disabled={!song || busy || musicUiState.playback.isPlaying} title="Play">
              ▶
            </button>
            <button className="icon-button stop" type="button" onClick={stop} disabled={!song || (!playing && !musicUiState.playback.isPlaying)} title="Stop">
              ■
            </button>
          </div>
        </header>

        <div className="control-strip" aria-label="Ручные контролы песни">
          <BpmControl
            value={musicUiState.playback.bpm}
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
          <MetaCard label="Step" value={song ? `${musicUiState.playback.currentStep + 1}/${totalSteps}` : "-"} />
        </div>

        <LiveVisualizer musicState={musicUiState} variant={previewEnabled ? previewSettings.visualizerVariant : "eqBars"} />

        <section className={`track-grid lane-variant-${previewEnabled ? previewSettings.laneVariant : "compact"}`} aria-label="Дорожки">
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
              trackActivity={musicUiState.tracks.find((item) => item.trackId === track.id)}
              totalSteps={totalSteps}
              activeStep={musicUiState.playback.currentStep}
              selected={musicUiState.selectedTrackId === track.id}
              selectedEventStep={musicUiState.selectedEventStep}
              busy={busy}
              catalog={catalog}
              selectedDrumNote={drumNotes[track.id] ?? "C2"}
              dragged={draggedTrackId === track.id}
              dropTarget={dropTargetTrackId === track.id && draggedTrackId !== track.id}
              onSelectedDrumNoteChange={(note) => setDrumNotes((current) => ({ ...current, [track.id]: note }))}
              onSelectTrack={() => setSelectedTrackId(track.id)}
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
              onToggleDrumStep={(index, note) => {
                setSelectedTrackId(track.id);
                setSelectedEventStep(index);
                applySongEdit((current) => toggleDrumStep(current, track.id, index, note));
              }}
            />
          ))}
          {!song && (
            <div className="empty-state">
              <h3>Начни с промпта или библиотеки</h3>
              <p>Опиши трек в чате или открой библиотеку (♫) в панели транспорта и выбери готовый.</p>
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
        musicState={musicUiState}
      />

      {libraryOpen && (
        <LibraryDrawer
          song={song}
          tracks={libraryTracks}
          state={libraryState}
          error={libraryError}
          saveName={saveName}
          saveState={saveState}
          pendingConflict={pendingConflict}
          duplicateOf={duplicateOf}
          loadingId={loadingId}
          onSaveNameChange={setSaveName}
          onSave={() => saveCurrent(false)}
          onConfirmOverwrite={() => saveCurrent(true)}
          onCancelOverwrite={() => setPendingConflict(null)}
          onPlay={(id) => {
            closeLibrary();
            loadFromLibrary(id, { autoPlay: true });
          }}
          onRefresh={refreshLibrary}
          onClose={closeLibrary}
        />
      )}

      {previewEnabled && designLabOpen && (
        <PreviewControls
          settings={previewSettings}
          musicState={musicUiState}
          onChange={(patch) => setPreviewSettings((current) => ({ ...current, ...patch }))}
          onRandomizeMeters={() => setMockMeterLevels(randomMeterMap(song))}
          onClose={() => setDesignLabOpen(false)}
        />
      )}

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

function LibraryDrawer({
  song,
  tracks,
  state,
  error,
  saveName,
  saveState,
  pendingConflict,
  duplicateOf,
  loadingId,
  onSaveNameChange,
  onSave,
  onConfirmOverwrite,
  onCancelOverwrite,
  onPlay,
  onRefresh,
  onClose,
}) {
  const saving = saveState === "saving";
  const canSave = Boolean(song) && Boolean(saveName.trim()) && !saving;

  return (
    <div className="library-overlay" onClick={onClose} role="presentation">
      <aside
        className="library-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Библиотека треков"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="library-head">
          <div className="sidebar-title">
            <p className="eyebrow">Shared</p>
            <h3>Библиотека</h3>
          </div>
          <button className="import-close" type="button" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <section className="library-save" aria-label="Сохранить текущий трек">
          <p className="eyebrow">Сохранить текущий</p>
          {song ? (
            <>
              <form
                className="library-save-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSave();
                }}
              >
                <input
                  value={saveName}
                  onChange={(event) => onSaveNameChange(event.target.value)}
                  placeholder="Название трека"
                  disabled={saving}
                  aria-label="Название трека"
                />
                <button className="library-save-btn" type="submit" disabled={!canSave}>
                  {saving ? "…" : "Сохранить"}
                </button>
              </form>
              {pendingConflict && (
                <div className="library-conflict" role="alert">
                  <p>
                    Трек «{pendingConflict.track.title}» уже есть. Перезаписать?
                  </p>
                  <div className="library-conflict-actions">
                    <button type="button" className="library-overwrite" onClick={onConfirmOverwrite} disabled={saving}>
                      Перезаписать
                    </button>
                    <button type="button" className="library-cancel" onClick={onCancelOverwrite} disabled={saving}>
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="library-hint">Загрузи или сгенерируй трек, чтобы сохранить его.</p>
          )}
        </section>

        <section className="library-list" aria-label="Треки в библиотеке">
          <div className="library-list-head">
            <p className="eyebrow">Треки{tracks.length ? ` · ${tracks.length}` : ""}</p>
            <button
              className="library-refresh"
              type="button"
              onClick={onRefresh}
              disabled={state === "loading"}
              title="Обновить"
              aria-label="Обновить"
            >
              ↻
            </button>
          </div>

          {state === "loading" && <p className="library-hint">Загрузка…</p>}
          {state === "error" && (
            <div className="library-error-box">
              <p className="import-error">{error}</p>
              <button type="button" className="library-cancel" onClick={onRefresh}>
                Повторить
              </button>
            </div>
          )}
          {state === "idle" && tracks.length === 0 && (
            <p className="library-hint">Библиотека пуста — сохрани первый трек.</p>
          )}

          {state === "idle" &&
            tracks.map((track) => {
              const summary = track.summary ?? {};
              const isLoading = loadingId === track.id;
              return (
                <article
                  className={`library-card ${duplicateOf === track.id ? "is-duplicate" : ""}`}
                  key={track.id}
                >
                  <div className="library-card-main">
                    <strong>{track.title || "без названия"}</strong>
                    <span className="library-card-meta">
                      {summary.bpm} BPM · {summary.bars} bars · {summary.key || "—"} · {summary.tracks} дор.
                    </span>
                    <span className="library-card-date">{formatSavedAt(track.updatedAt)}</span>
                  </div>
                  <div className="library-card-actions">
                    <button
                      type="button"
                      className="library-play"
                      onClick={() => onPlay(track.id)}
                      disabled={Boolean(loadingId)}
                      title="Загрузить и играть"
                      aria-label={`Загрузить и играть «${track.title || "без названия"}»`}
                    >
                      {isLoading ? "…" : "▶"}
                    </button>
                  </div>
                </article>
              );
            })}
        </section>
      </aside>
    </div>
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

function PreviewControls({ settings, musicState, onChange, onRandomizeMeters }) {
  const update = (key, value) => onChange({ [key]: value });
  return (
    <section className="preview-controls" aria-label="Music reactive preview">
      <label>
        <span>visual</span>
        <select value={settings.visualizerVariant} onChange={(event) => update("visualizerVariant", event.target.value)}>
          {VISUALIZER_VARIANTS.map((variant) => (
            <option value={variant} key={variant}>
              {variant}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>lane</span>
        <select value={settings.laneVariant} onChange={(event) => update("laneVariant", event.target.value)}>
          {LANE_VARIANTS.map((variant) => (
            <option value={variant} key={variant}>
              {variant}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>layout</span>
        <select value={settings.layoutVariant} onChange={(event) => update("layoutVariant", event.target.value)}>
          {LAYOUT_VARIANTS.map((variant) => (
            <option value={variant} key={variant}>
              {variant}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>state</span>
        <select value={settings.statePreset} onChange={(event) => update("statePreset", event.target.value)}>
          {STATE_PRESETS.map((preset) => (
            <option value={preset} key={preset}>
              {preset}
            </option>
          ))}
        </select>
      </label>
      <label className="preview-step">
        <span>step {musicState.playback.currentStep + 1}</span>
        <input
          type="range"
          min="0"
          max={Math.max(0, musicState.playback.totalSteps - 1)}
          value={settings.mockCurrentStep}
          onChange={(event) => update("mockCurrentStep", Number(event.target.value))}
          disabled={settings.statePreset === "live"}
        />
      </label>
      <label className="preview-check">
        <input type="checkbox" checked={settings.mockAutoPlay} onChange={(event) => update("mockAutoPlay", event.target.checked)} />
        <span>auto</span>
      </label>
      <label className="preview-check">
        <input type="checkbox" checked={settings.randomMeters} onChange={(event) => update("randomMeters", event.target.checked)} />
        <span>meters</span>
      </label>
      <button type="button" onClick={onRandomizeMeters}>
        Random
      </button>
      <label className="preview-check">
        <input type="checkbox" checked={settings.forceGenerating} onChange={(event) => update("forceGenerating", event.target.checked)} />
        <span>gen</span>
      </label>
      <label className="preview-check">
        <input type="checkbox" checked={settings.forceError} onChange={(event) => update("forceError", event.target.checked)} />
        <span>error</span>
      </label>
      <label className="preview-check">
        <input type="checkbox" checked={settings.selectCurrentStep} onChange={(event) => update("selectCurrentStep", event.target.checked)} />
        <span>select</span>
      </label>
    </section>
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

function visualizerBars(musicState) {
  const energy = Math.min(1, musicState.tracks.reduce((sum, track) => sum + track.meterLevel, 0));
  return Array.from({ length: VISUAL_BARS }, (_, index) => {
    const phase = Math.sin((index + 1) * 1.73 + musicState.playback.currentStep * 0.51);
    const centerBias = 1 - Math.abs(index - VISUAL_BARS / 2) / (VISUAL_BARS / 2) * 0.36;
    const idle = 8 + Math.abs(phase) * 8;
    const active = musicState.playback.isPlaying ? 18 + (Math.abs(phase) * 42 + energy * 38) * centerBias : idle;
    const generating = musicState.generationState === "generating" ? 26 + Math.abs(Math.sin(index * 0.64)) * 42 : active;
    return Math.min(96, generating);
  });
}

function LiveVisualizer({ musicState, variant }) {
  const bars = visualizerBars(musicState);
  const activeTracks = musicState.tracks
    .filter((track) => track.meterLevel > 0.02)
    .map((track) => ({ ...track, label: ROLE_LABELS[track.role] ?? track.trackId }));
  const isGenerating = musicState.generationState === "generating";
  const isError = Boolean(musicState.error);
  const isPlaying = musicState.playback.isPlaying;
  const beatIndex = musicState.playback.currentStep % musicState.playback.stepsPerBar;

  return (
    <section className={`visualizer variant-${variant} ${isGenerating ? "is-generating" : ""} ${isPlaying ? "is-playing" : ""} ${isError ? "is-error" : ""}`} aria-label="Live output">
      <header>
        <div>
          <p className="eyebrow">Live output</p>
          <h3>{isGenerating ? "Генерация" : isPlaying ? "Играет" : isError ? "Ошибка" : "Ready"}</h3>
        </div>
        <div className="active-track-list" aria-label="Активные дорожки">
          {activeTracks.length ? activeTracks.slice(0, 4).map((track) => <span key={track.trackId}>{track.label}</span>) : <span>idle</span>}
        </div>
      </header>
      {variant === "beatPulse" && (
        <div className="beat-pulse-grid" aria-hidden="true">
          {Array.from({ length: musicState.playback.stepsPerBar }).map((_, index) => (
            <i className={index === beatIndex ? "is-current" : ""} key={index} style={{ "--cell-level": `${bars[index % bars.length]}%` }} />
          ))}
        </div>
      )}
      {variant === "ruler" && (
        <div className="visual-ruler" aria-hidden="true">
          {Array.from({ length: musicState.playback.stepsPerBar }).map((_, index) => (
            <i className={`${index % 4 === 0 ? "is-beat" : ""} ${index === beatIndex ? "is-current" : ""}`} key={index} />
          ))}
        </div>
      )}
      {variant !== "beatPulse" && variant !== "ruler" && (
        <div className={`eq-bars ${variant === "skyline" ? "is-skyline" : ""} ${variant === "shimmer" ? "is-shimmer" : ""}`} aria-hidden="true">
          {bars.map((height, index) => (
            <i key={index} style={{ "--bar-height": `${height}%`, "--bar-delay": `${index * 18}ms` }} />
          ))}
        </div>
      )}
    </section>
  );
}

function TrackRow({
  track,
  trackActivity,
  totalSteps,
  activeStep,
  selected,
  selectedEventStep,
  busy,
  catalog,
  selectedDrumNote,
  dragged,
  dropTarget,
  onSelectedDrumNoteChange,
  onSelectTrack,
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
  const activity = trackActivity ?? { activeEventSteps: [], meterLevel: 0, peakLevel: 0, muted: Boolean(track.muted) };
  const activeEventSteps = new Set(activity.activeEventSteps ?? []);
  const energy = activity.meterLevel ?? 0;
  const laneStyle = { "--steps": totalSteps, "--lane-min-width": `${totalSteps * 1.45}rem` };
  const eventsByStep = new Map();
  for (const event of track.events ?? []) {
    if (!eventsByStep.has(event.step)) eventsByStep.set(event.step, []);
    eventsByStep.get(event.step).push(event);
  }

  return (
    <article
      className={`track-row role-${track.role} ${activity.muted ? "is-muted" : ""} ${energy ? "is-hot" : ""} ${selected ? "is-selected" : ""} ${dragged ? "is-dragging" : ""} ${dropTarget ? "is-drop-target" : ""}`}
      style={{ "--meter-height": `${8 + energy * 92}%` }}
      onPointerDown={onSelectTrack}
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
        <button className={`track-toggle ${activity.muted ? "is-on" : ""}`} type="button" onClick={onToggleMute} disabled={busy} aria-pressed={Boolean(activity.muted)} title="Mute">
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
        <div className="lane">
          <div className="lane-sampler" style={laneStyle}>
            {Array.from({ length: totalSteps }).map((_, index) => {
              const events = eventsByStep.get(index) ?? [];
              const label = events.map(eventLabel).slice(0, 2).join(" ");
              return (
                <button
                  className={`step-button ${events.length ? "has-event" : ""} ${activeEventSteps.has(index) ? "is-event-active" : ""} ${index === activeStep ? "is-active" : ""} ${selected && selectedEventStep === index ? "is-selected" : ""}`}
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
        </div>
      ) : (
        <div className="lane">
          <div className="lane-notes" style={laneStyle}>
            {Array.from({ length: totalSteps }).map((_, index) => (
              <i className={`${index === activeStep ? "is-active" : ""} ${selected && selectedEventStep === index ? "is-selected" : ""}`} key={index} />
            ))}
            {(track.events ?? []).map((event, index) => {
              const dur = event.dur ?? 1;
              return (
                <span
                  className={`note-block ${activeEventSteps.has(event.step) ? "is-event-active" : ""} ${selected && selectedEventStep === event.step ? "is-selected" : ""}`}
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
  musicState,
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
            <Chip label="state" value={musicState.generationState} />
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

        <section className="inspector-section">
          <p className="eyebrow">Runtime</p>
          <div className="validation-list">
            <span className={musicState.playback.isPlaying ? "is-ok" : "is-muted"}>
              <i aria-hidden="true" />
              step {musicState.playback.currentStep + 1}/{musicState.playback.totalSteps}
            </span>
            <span className={musicState.error ? "is-bad" : "is-ok"}>
              <i aria-hidden="true" />
              {musicState.error ? musicState.error.message : "no runtime error"}
            </span>
          </div>
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
