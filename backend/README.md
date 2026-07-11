# backend/ — gateway (owner: Human B)

Implements the HTTP contract from `../CONTRACTS.md` (Contract 2).

## Run
```bash
cd backend
npm install
cp .env.example .env   # fill in your LLM key
npm run dev            # http://localhost:3001
```

## Endpoints
- `POST /api/compose` — `{ prompt, song? }` → `{ song, message }`
- `GET /api/catalog` — available sounds/roles

## What's done vs. your job
- ✅ Server, routing, error codes, CORS.
- ✅ `compose.js` orchestration: validate LLM output against the schema + retry (up to 2).
- ✅ `validate.js`: JSON Schema + semantic checks (steps within `bars*16`, unique ids).
- 🔨 **Your job (`src/llm.js`):** replace the STUB `generateSong()` with a real LLM call.
  Build the system prompt from the schema + catalog, demand JSON-only output, add few-shot examples.
  The orchestration already re-prompts with validation errors on retry — pass them into your prompt.

Log what you build in `../IMPLEMENTATION_LOG.md`.
