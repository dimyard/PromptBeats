# frontend/ — web UI + player

Owners: **Human A** (UI/chat, `src/App.jsx`, `src/api.js`) and **Human C** (player, `src/player/`).

## Run
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173  (backend must run on :3001)
```

## Flow (already wired)
chat input → `api.compose(prompt, currentSong)` → `player.load(song)` → `player.play()`.
Edits reuse the same call with the current song attached.

## Your jobs
- **A:** polish chat/history, the track grid, error toasts, "example" fallback button.
- **C:** refine `src/player/` — better kits (Tone.Sampler), effects, `exportWav()` (stretch).

Contracts: `../CONTRACTS.md`. Log your work in `../IMPLEMENTATION_LOG.md`.
