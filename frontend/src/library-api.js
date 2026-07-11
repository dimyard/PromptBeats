// HTTP client for the shared library (Contract 5). Owner: Human A.
// Same BASE + error convention as api.js.
const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";

async function jsonOrThrow(res, fallback) {
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? `${fallback} (${res.status})`);
  return data;
}

/** GET /api/library — light metadata list, newest first. */
export async function listLibrary() {
  const res = await fetch(`${BASE}/api/library`);
  return jsonOrThrow(res, "не удалось загрузить библиотеку"); // { tracks: Meta[] }
}

/** GET /api/library/:id — full entry with the song. */
export async function getLibraryTrack(id) {
  const res = await fetch(`${BASE}/api/library/${encodeURIComponent(id)}`);
  return jsonOrThrow(res, "не удалось загрузить трек"); // { track: { …, song } }
}

/**
 * POST /api/library — save the current song.
 * @param {{ song: object, title?: string, overwrite?: boolean }} body
 * @returns {Promise<{ status: "created"|"duplicate"|"title_conflict"|"updated", track: object }>}
 */
export async function saveToLibrary({ song, title, overwrite = false }) {
  const res = await fetch(`${BASE}/api/library`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ song, title, overwrite }),
  });
  return jsonOrThrow(res, "не удалось сохранить трек"); // { status, track }
}
