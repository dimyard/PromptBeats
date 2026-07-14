// song-io.js — pure ESM import/export module for PromptBeats (owner: A).
//
// No Tone / React / DOM beyond the download+read helpers (which use the
// standard browser Blob/URL/FileReader). The parse/validate/normalize core is
// DOM-free and runs in Node (see song-io.test.mjs).
//
// Public API (Contract 4 in CONTRACTS.md):
//   serializeSong(song): string
//   parseSong(text): { ok:true, song, warnings } | { ok:false, error }
//   validateSong(song): { ok, errors }
//   normalizeImportedSong(song): { song, warnings }
//   songFilename(song, ext): string
//   downloadBlob(blob, filename): void          // browser-only
//   readFileAsText(file): Promise<string>        // browser-only

// --- Catalog constants (keep in sync with song.schema.json) --------------
// We deliberately do NOT import player/sounds.js — it pulls in Tone. These
// enums mirror song.schema.json / CONTRACTS.md "Каталог звуков". If the schema
// changes its sound catalog, roles or instrument↔sound pairing, update here.
const ROLES = ["drums", "bass", "chords", "lead", "pad", "fx"];
const INSTRUMENTS = ["synth", "sampler"];
const SYNTH_SOUNDS = [
  "sine_bass", "saw_lead", "square_lead", "soft_pad", "pluck", "fm_bell",
  "warm_keys", "soft_piano", "acid_bass", "organ", "wide_pad",
];
const SAMPLER_SOUNDS = ["lofi_kit", "house_kit", "trap_kit", "boom_bap_kit", "techno_kit"];
const ALL_SOUNDS = [...SYNTH_SOUNDS, ...SAMPLER_SOUNDS];

const ID_RE = /^[a-zA-Z0-9_-]{1,40}$/;
const NOTE_RE = /^[A-Ga-g](#|b)?-?[0-9]$/;

// Numeric bounds (mirror song.schema.json).
const BPM_MIN = 40;
const BPM_MAX = 220;
const BARS_MIN = 1;
const BARS_MAX = 32;
const GAIN_MIN = 0;
const GAIN_MAX = 1;
const TITLE_MAX = 120;

// --- serializeSong --------------------------------------------------------

/** @param {object} song @returns {string} pretty JSON + trailing newline */
export function serializeSong(song) {
  return JSON.stringify(song, null, 2) + "\n";
}

// --- validateSong ---------------------------------------------------------

/**
 * Light-weight validation mirroring the key invariants of song.schema.json.
 * Collects ALL problems (does not stop at the first). Human-readable Russian
 * messages.
 * @param {unknown} song
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSong(song) {
  const errors = [];

  if (song === null || typeof song !== "object" || Array.isArray(song)) {
    return { ok: false, errors: ["Song должен быть объектом"] };
  }

  // version
  if (song.version !== 1) {
    errors.push(`version ${fmt(song.version)} не поддерживается, ожидался 1`);
  }

  // title (optional)
  if (song.title !== undefined) {
    if (typeof song.title !== "string") {
      errors.push("title должен быть строкой");
    } else if (song.title.length > TITLE_MAX) {
      errors.push(`title длиннее ${TITLE_MAX} символов`);
    }
  }

  // bpm
  if (typeof song.bpm !== "number" || Number.isNaN(song.bpm)) {
    errors.push("bpm должен быть числом");
  } else if (song.bpm < BPM_MIN || song.bpm > BPM_MAX) {
    errors.push(`bpm ${song.bpm} вне диапазона ${BPM_MIN}..${BPM_MAX}`);
  }

  // bars
  if (!Number.isInteger(song.bars)) {
    errors.push("bars должен быть целым числом");
  } else if (song.bars < BARS_MIN || song.bars > BARS_MAX) {
    errors.push(`bars ${song.bars} вне диапазона ${BARS_MIN}..${BARS_MAX}`);
  }

  // key (optional)
  if (song.key !== undefined && typeof song.key !== "string") {
    errors.push("key должен быть строкой");
  }

  // tracks
  if (!Array.isArray(song.tracks) || song.tracks.length < 1 || song.tracks.length > 12) {
    errors.push("tracks: ожидался массив 1..12 дорожек");
  } else {
    const totalSteps = Number.isInteger(song.bars) ? song.bars * 16 : null;
    const seenIds = new Set();
    song.tracks.forEach((t, i) => {
      validateTrack(t, i, seenIds, totalSteps, errors);
    });
  }

  return { ok: errors.length === 0, errors };
}

function validateTrack(t, i, seenIds, totalSteps, errors) {
  const where = `дорожка #${i + 1}`;
  if (t === null || typeof t !== "object" || Array.isArray(t)) {
    errors.push(`${where}: должна быть объектом`);
    return;
  }

  // id
  const idLabel = typeof t.id === "string" ? `'${t.id}'` : where;
  if (typeof t.id !== "string" || !ID_RE.test(t.id)) {
    errors.push(`${where}: id ${fmt(t.id)} не соответствует шаблону ^[a-zA-Z0-9_-]{1,40}$`);
  } else {
    if (seenIds.has(t.id)) errors.push(`id ${idLabel} дублируется, должен быть уникален`);
    seenIds.add(t.id);
  }

  // role
  if (!ROLES.includes(t.role)) {
    errors.push(`${where}: role ${fmt(t.role)} не из {${ROLES.join(",")}}`);
  }

  // instrument
  const instrOk = INSTRUMENTS.includes(t.instrument);
  if (!instrOk) {
    errors.push(`${where}: instrument ${fmt(t.instrument)} не из {${INSTRUMENTS.join(",")}}`);
  }

  // sound + instrument↔sound pairing
  if (!ALL_SOUNDS.includes(t.sound)) {
    errors.push(`${where}: sound ${fmt(t.sound)} не из каталога`);
  } else if (instrOk) {
    const allowed = t.instrument === "synth" ? SYNTH_SOUNDS : SAMPLER_SOUNDS;
    if (!allowed.includes(t.sound)) {
      errors.push(`${where}: пара ${t.instrument}↔${t.sound} недопустима`);
    }
  }

  // gain (optional)
  if (t.gain !== undefined) {
    if (typeof t.gain !== "number" || Number.isNaN(t.gain)) {
      errors.push(`${where}: gain должен быть числом`);
    } else if (t.gain < GAIN_MIN || t.gain > GAIN_MAX) {
      errors.push(`${where}: gain ${t.gain} вне диапазона ${GAIN_MIN}..${GAIN_MAX}`);
    }
  }

  // muted (optional)
  if (t.muted !== undefined && typeof t.muted !== "boolean") {
    errors.push(`${where}: muted должен быть булевым`);
  }

  // events (optional in this light validator; schema requires the key, but the
  // backend/player tolerate empty, and normalize handles it)
  if (t.events !== undefined) {
    if (!Array.isArray(t.events)) {
      errors.push(`${where}: events должен быть массивом`);
    } else {
      t.events.forEach((ev, j) => validateEvent(ev, i, j, totalSteps, errors));
    }
  }
}

function validateEvent(ev, ti, j, totalSteps, errors) {
  const where = `дорожка #${ti + 1}, событие #${j + 1}`;
  if (ev === null || typeof ev !== "object" || Array.isArray(ev)) {
    errors.push(`${where}: должно быть объектом`);
    return;
  }
  if (!Number.isInteger(ev.step) || ev.step < 0) {
    errors.push(`${where}: step ${fmt(ev.step)} должен быть целым ≥ 0`);
  }
  // События со step за концом лупа НЕ отклоняем: их мягко дропает
  // normalizeImportedSong с warning (как бэковый normalizeSong и плеер).
  if (typeof ev.note !== "string" || !NOTE_RE.test(ev.note)) {
    errors.push(`${where}: note ${fmt(ev.note)} не соответствует научной нотации`);
  }
  if (ev.dur !== undefined && (!Number.isInteger(ev.dur) || ev.dur < 1)) {
    errors.push(`${where}: dur ${fmt(ev.dur)} должен быть целым ≥ 1`);
  }
  if (ev.vel !== undefined) {
    if (typeof ev.vel !== "number" || Number.isNaN(ev.vel)) {
      errors.push(`${where}: vel должен быть числом`);
    } else if (ev.vel < 0 || ev.vel > 1) {
      errors.push(`${where}: vel ${ev.vel} вне диапазона 0..1`);
    }
  }
}

// --- normalizeImportedSong ------------------------------------------------

/**
 * Mirrors backend normalizeSong + player defensive clamps so imports "just
 * work". Does not mutate input; returns a fresh object. Idempotent: running it
 * again on an already-normalized song yields no further changes/warnings.
 * @param {object} song
 * @returns {{ song: object, warnings: string[] }}
 */
export function normalizeImportedSong(song) {
  const warnings = [];
  if (song === null || typeof song !== "object" || Array.isArray(song)) {
    return { song, warnings };
  }

  const out = clone(song);

  // Clamp bpm.
  if (typeof out.bpm === "number" && !Number.isNaN(out.bpm)) {
    out.bpm = clamp(out.bpm, BPM_MIN, BPM_MAX);
  }

  // Clamp + round bars to a valid integer (needed to compute the loop length).
  if (typeof out.bars === "number" && !Number.isNaN(out.bars)) {
    out.bars = clamp(Math.round(out.bars), BARS_MIN, BARS_MAX);
  }

  const totalSteps =
    Number.isInteger(out.bars) && out.bars >= BARS_MIN ? out.bars * 16 : 0;

  const seenIds = new Set();
  if (Array.isArray(out.tracks)) {
    for (const t of out.tracks) {
      if (t === null || typeof t !== "object") continue;

      // Dedup ids (rename duplicates x -> x-2, x-3, …).
      if (typeof t.id === "string") {
        if (seenIds.has(t.id)) {
          const base = t.id;
          let n = 2;
          let cand = `${base}-${n}`;
          while (seenIds.has(cand)) cand = `${base}-${++n}`;
          warnings.push(`id '${base}' дублируется, переименовано в '${cand}'`);
          t.id = cand;
        }
        seenIds.add(t.id);
      }

      // Clamp gain.
      if (typeof t.gain === "number" && !Number.isNaN(t.gain)) {
        t.gain = clamp(t.gain, GAIN_MIN, GAIN_MAX);
      }

      // Drop out-of-loop events + clamp dur.
      if (Array.isArray(t.events)) {
        const kept = [];
        let dropped = 0;
        for (const ev of t.events) {
          if (ev === null || typeof ev !== "object") continue;
          if (
            typeof ev.step === "number" &&
            (ev.step < 0 || ev.step > totalSteps - 1)
          ) {
            dropped++;
            continue;
          }
          if (
            typeof ev.step === "number" &&
            typeof ev.dur === "number"
          ) {
            const maxDur = totalSteps - ev.step;
            if (maxDur >= 1 && ev.dur > maxDur) ev.dur = maxDur;
          }
          kept.push(ev);
        }
        if (dropped > 0) {
          const label = typeof t.id === "string" ? t.id : "track";
          warnings.push(`${label}: удалено ${dropped} событий вне лупа`);
        }
        t.events = kept;
      }
    }
  }

  return { song: out, warnings };
}

// --- parseSong ------------------------------------------------------------

/**
 * text → JSON.parse → validateSong → normalizeImportedSong.
 * @param {string} text
 * @returns {{ ok:true, song:object, warnings:string[] } | { ok:false, error:string }}
 */
export function parseSong(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Не удалось разобрать JSON: ${e.message}` };
  }

  const v = validateSong(raw);
  if (!v.ok) {
    return { ok: false, error: v.errors.join("; ") };
  }

  const { song, warnings } = normalizeImportedSong(raw);
  return { ok: true, song, warnings };
}

// --- songFilename ---------------------------------------------------------

/**
 * slug(title || "promptbeats") + "." + ext. Latin/digits/hyphen, lowercase.
 * @param {object} song
 * @param {"json"|"wav"} ext
 * @returns {string}
 */
export function songFilename(song, ext) {
  const title = song && typeof song.title === "string" ? song.title : "";
  const base = slug(title) || "promptbeats";
  return `${base}.${ext}`;
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non [a-z0-9] runs → single hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

// --- Browser-only helpers -------------------------------------------------
// These require the DOM (document / Blob / URL / FileReader). Not tested in
// Node; only used in the browser import/export UI.

/**
 * BROWSER-ONLY. Triggers a download of `blob` as `filename` via a temporary
 * <a download>, then revokes the object URL.
 * @param {Blob} blob @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * BROWSER-ONLY. Reads a File/Blob as text via FileReader.
 * @param {File} file @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Не удалось прочитать файл"));
    reader.readAsText(file);
  });
}

// --- internal utils -------------------------------------------------------

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// Deep clone without mutating input. structuredClone is available in Node 17+
// and modern browsers; fall back to JSON round-trip just in case.
function clone(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

// Format an arbitrary value for error messages.
function fmt(v) {
  if (typeof v === "string") return `'${v}'`;
  if (v === undefined) return "(отсутствует)";
  return String(v);
}
