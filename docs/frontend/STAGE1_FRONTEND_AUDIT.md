# Этап 1 — ревизия фронта A

Дата: 2026-07-11  
Роль: A — фронт / чат-UX  
Цель этапа: понять стартовое состояние `frontend/`, сверить его с актуальными контрактами и подготовить очередь работ без изменения кода.

## Что проверено

- `frontend/src/App.jsx`
- `frontend/src/api.js`
- `frontend/README.md`
- `frontend/package.json`
- `frontend/src/player/index.js` как внешний контракт C, без правок
- `sample-song.json`
- `CONTRACTS.md`
- `briefs/BRIEF_A_FRONTEND.md`

## Текущее состояние фронта

`frontend/src/App.jsx` уже даёт минимальный end-to-end поток:

- хранит `messages`, `input`, `song`, `busy`, `playing`, `step`;
- создаёт player через `createPlayer()`;
- подписывается на `step` и `error`;
- отправляет prompt через `compose(prompt, song)`;
- кладёт ответный `song` в состояние;
- вызывает `player.load(next)`;
- умеет Play/Stop;
- рисует простой grid по `song.tracks[].events`.

`frontend/src/api.js` соответствует HTTP-контракту:

- `compose(prompt, song)` → `POST /api/compose`;
- `getCatalog()` → `GET /api/catalog`.

## Сверка с контрактами

Соответствует:

- Используется `tracks[].events`, а не старые `pattern`/`notes`.
- Текущий prompt-flow уже отправляет `currentSong` на правках.
- Player используется как чёрный ящик через `createPlayer()`.
- `on("step")` уже возвращает unsubscribe и отписывается при размонтировании.
- `player.load(song)` вызывается после получения нового Song JSON.

Не закрыто или требует доработки:

- Нет кнопки fallback «Пример» для загрузки `sample-song.json`.
- Ошибки player сейчас только `console.warn`, пользователю не видны.
- Нет toast/error surface для backend/player ошибок.
- Нет автоскролла истории сообщений.
- Нет ручных контролов дорожек: `muted`, `gain`, `sound`, редактирование `events`.
- Grid показывает только наличие event на step, без `role`, `sound`, `gain`, `muted`, длительности `dur`.
- Нет каталога звуков из `GET /api/catalog`.
- UI пока сырой inline-style, без демо-полировки.

## Важные ограничения

- Не трогать `frontend/src/player/`: это зона C.
- Не менять `Song JSON`, HTTP API или Player API без отдельного изменения `CONTRACTS.md`.
- Ручные контролы MVP должны работать через правку `currentSong` и повторный `player.load(updatedSong)`.
- Для sampler-дорожек использовать Drum note map из `CONTRACTS.md`.

## Очередь этапа 2

Минимальный порядок работ:

1. Добавить загрузку `sample-song.json` по кнопке «Пример».
2. Сделать нормальные error states: backend error в историю/toast, player error в toast.
3. Улучшить chat UX: автоскролл, loading state, demo prompt chips.
4. Перерисовать track grid:
   - показывать `role`, `sound`, `gain`, `muted`;
   - рисовать `bars * 16` шагов;
   - показывать активный playhead;
   - учитывать `dur` для melodic events.
5. Добавить ручные контролы:
   - mute/unmute;
   - gain slider;
   - базовый step toggle для sampler/drums;
   - позже, если успеваем, выбор `sound` из каталога.
6. Привести внешний вид к демо-готовой тёмной студии.

## Быстрая проверка после этапа 2

- «Пример» загружает `sample-song.json`.
- Play запускает звук.
- Prompt отправляется в `/api/compose`.
- Правка prompt отправляется вместе с текущим `song`.
- Grid строится только из `tracks[].events`.
- Mute/gain/step edit меняют `currentSong` и вызывают `player.load(updatedSong)`.
- Ошибки backend/player видны пользователю и не ломают экран.

