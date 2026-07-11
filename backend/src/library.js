// Shared track library store (Contract 5). Owner: B.
//
// A tiny file-backed collection of saved Song JSON tracks. Pure logic + a JSON
// file on disk; no HTTP here (server.js wires the endpoints). The file path,
// clock and id generator are injectable so tests run against a temp file with a
// deterministic clock. See CONTRACTS.md "Контракт 5".
import fs from "node:fs";
import path from "node:path";

/**
 * @param {object} opts
 * @param {string} opts.filePath   where the library JSON array lives
 * @param {() => string} [opts.clock]  returns an ISO timestamp (default: now)
 * @param {() => string} [opts.genId] returns a unique entry id
 */
export function createLibraryStore({ filePath, clock, genId } = {}) {
  if (!filePath) throw new Error("createLibraryStore requires a filePath");
  const now = clock ?? (() => new Date().toISOString());
  const nextId = genId ?? defaultGenId;

  // Serialize writes so concurrent saves don't clobber each other. Every
  // read-modify-write chains onto this promise.
  let writeChain = Promise.resolve();

  function readAll() {
    let text;
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch {
      return []; // missing file = empty library
    }
    try {
      const data = JSON.parse(text);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(`[library] corrupt store at ${filePath}, treating as empty:`, e.message);
      return [];
    }
  }

  function writeAll(entries) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entries, null, 2) + "\n");
    fs.renameSync(tmp, filePath); // atomic swap
  }

  /** Run fn as the sole writer; returns fn's result. */
  function withWriteLock(fn) {
    const run = writeChain.then(fn, fn);
    // keep the chain alive but swallow errors so one failure doesn't wedge it
    writeChain = run.then(() => {}, () => {});
    return run;
  }

  async function list() {
    const entries = readAll();
    return entries
      .slice()
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map(toMeta);
  }

  async function get(id) {
    const entry = readAll().find((e) => e.id === id);
    return entry ?? null;
  }

  async function save({ song, title, overwrite = false }) {
    return withWriteLock(() => {
      const effectiveTitle = (title ?? song?.title ?? "").toString();
      const stored = structuredClone(song);
      stored.title = effectiveTitle; // keep entry.title and song.title in sync
      const canon = canonicalize(stored);

      const entries = readAll();

      // 1. Identical content already present -> duplicate, no new entry.
      const dup = entries.find((e) => canonicalize(e.song) === canon);
      if (dup) return { status: "duplicate", track: toMeta(dup) };

      // 2. Same title, different content.
      const sameTitle = entries.find((e) => e.title === effectiveTitle);
      if (sameTitle) {
        if (!overwrite) return { status: "title_conflict", track: toMeta(sameTitle) };
        sameTitle.song = stored;
        sameTitle.title = effectiveTitle;
        sameTitle.updatedAt = now();
        writeAll(entries);
        return { status: "updated", track: toMeta(sameTitle) };
      }

      // 3. Brand new entry.
      const ts = now();
      const entry = { id: nextId(), title: effectiveTitle, createdAt: ts, updatedAt: ts, song: stored };
      entries.push(entry);
      writeAll(entries);
      return { status: "created", track: toMeta(entry) };
    });
  }

  return { list, get, save };
}

// --- helpers ---------------------------------------------------------------

/** Light list/response metadata: everything but the full song. */
function toMeta(entry) {
  const s = entry.song ?? {};
  return {
    id: entry.id,
    title: entry.title,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    summary: {
      bpm: s.bpm,
      bars: s.bars,
      key: s.key,
      tracks: Array.isArray(s.tracks) ? s.tracks.length : 0,
    },
  };
}

/**
 * Stable JSON string with object keys sorted recursively, so content identity
 * is independent of key order. Arrays keep their order (order is meaningful).
 */
export function canonicalize(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

function defaultGenId() {
  return `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
