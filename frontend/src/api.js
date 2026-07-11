// HTTP client for the backend (Contract 2). Owner: Human A.
const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";

/** POST /api/compose — generate (song=null) or edit (song=current). */
export async function compose(prompt, song = null) {
  const res = await fetch(`${BASE}/api/compose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, song }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `compose failed (${res.status})`);
  return data; // { song, message }
}

/** GET /api/catalog — available sounds/roles. */
export async function getCatalog() {
  const res = await fetch(`${BASE}/api/catalog`);
  return res.json();
}
