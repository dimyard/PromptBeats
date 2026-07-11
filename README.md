# PromptBeats

Веб-морда с чатом → пожелание → LLM превращает в **Song JSON** → движок **Tone.js** играет его в браузере.
Правки трека — тем же путём (промт + текущий JSON → новый JSON).

## Документы
- `PLAN.md` — замысел и распределение на троих.
- `CONTRACTS.md` — **контракты интеграции (источник правды)**: Song JSON, HTTP API, Player.
- `song.schema.json` — машинная схема Song JSON. `sample-song.json` — общий мок.
- `AGENTS.md` — правила для ИИ-агентов. `IMPLEMENTATION_LOG.md` — журнал реализаций.

## Быстрый старт
```bash
# терминал 1
cd backend && npm install && cp .env.example .env && npm run dev     # :3001

# терминал 2
cd frontend && npm install && npm run dev                            # :5173
```
Работает end-to-end уже на заглушке LLM (`backend/src/llm.js`). Human B заменяет заглушку реальной моделью.

## Структура
```
backend/   — gateway + LLM (Human B)
frontend/  — UI/чат (Human A) + player Tone.js (Human C)
```
