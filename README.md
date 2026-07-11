# PromptBeats

Веб-морда с чатом → пожелание → LLM превращает в **Song JSON** → движок **Tone.js** играет его в браузере.
Правки трека — тем же путём (промт + текущий JSON → новый JSON).

## Документы
- `PLAN.md` — замысел и распределение на троих.
- `CONTRACTS.md` — **контракты интеграции (источник правды)**: Song JSON, HTTP API, Player.
- `song.schema.json` — машинная схема Song JSON. `sample-song.json` — общий мок.
- `AGENTS.md` — правила для ИИ-агентов. `IMPLEMENTATION_LOG.md` — журнал реализаций.

## Быстрый старт
```powershell
npm run dev
```
Одна команда из корня проекта создаёт `backend/.env` из примера, если файла ещё нет, ставит зависимости
в `backend/` и `frontend/` при первом запуске, затем поднимает backend на `:3001` и frontend на `:5173`.

Если нужно запускать части отдельно:
```powershell
cd backend
npm install
Copy-Item .env.example .env
npm run dev
```

```powershell
cd frontend
npm install
npm run dev
```
Работает end-to-end уже на заглушке LLM (`backend/src/llm.js`). Human B заменяет заглушку реальной моделью.

## Структура
```
backend/   — gateway + LLM (Human B)
frontend/  — UI/чат (Human A) + player Tone.js (Human C)
```
