// ============================================================================
// LLM ADAPTER — turns a prompt (+ optional current song) into a Song JSON.
// Owner: Human B.
// ============================================================================
// Contract (do NOT change — compose.js depends on it):
//   input:  { prompt: string, song: Song|null, previousErrors: string[] }
//   output: { song: Song, message: string }
//
//   song === null  -> generate from scratch
//   song present   -> EDIT that track (return the FULL new song, not a diff)
//   previousErrors -> non-empty on retry; fed back into the prompt so the
//                     model fixes its validation mistakes. compose.js runs the
//                     retry loop + schema validation.
//
// The concrete LLM provider is swappable via env (see providers.js):
//   LLM_PROVIDER = anthropic | openai | gemini | mock
// This file only builds the prompt and parses the reply; the network call
// lives in providers.js.
// ============================================================================

import { CATALOG, SOUND_DESCRIPTIONS } from "./catalog.js";
import { callLLM } from "./providers.js";

// --- System prompt (built from the catalog so it can't drift out of sync) ---
const DRUM_MAP = [
  ["C2", "kick"],
  ["D2", "snare"],
  ["D#2", "clap"],
  ["F#2", "closed hat"],
  ["A#2", "open hat"],
  ["E2", "tom"],
  ["C#3", "ride"],
];

function buildSystemPrompt() {
  const drumRows = DRUM_MAP.map(([n, el]) => `  ${n} = ${el}`).join("\n");
  const synthRows = CATALOG.synths
    .map((sound) => `          ${sound} — ${SOUND_DESCRIPTIONS[sound]}`)
    .join("\n");
  const kitRows = CATALOG.kits
    .map((sound) => `          ${sound} — ${SOUND_DESCRIPTIONS[sound]}`)
    .join("\n");
  return `Ты — музыкальный аранжировщик PromptBeats. По текстовому пожеланию ты собираешь
короткий закольцованный трек и возвращаешь его СТРОГО как Song JSON.

ФОРМАТ ОТВЕТА (обязателен): верни ТОЛЬКО один JSON-объект-обёртку, без пояснений,
без markdown-ограждений (никаких \`\`\`), ничего до и после:
{
  "message": "1–2 коротких предложения для чата на языке пользователя",
  "song": { ...Song JSON по схеме ниже... }
}

SONG JSON:
- version: 1 (всегда).
- title: строка (короткое имя трека).
- bpm: число 40..220.
- key: человекочитаемая тональность, напр. "A minor", "F# major".
- bars: целое 1..32. Всего шагов в треке = bars*16 (16 шагов = 1 такт).
- tracks: 1..12 дорожек. У каждой:
    id — уникальная строка (буквы/цифры/дефис/подчёркивание),
    role — одно из: ${CATALOG.roles.join(", ")},
    instrument — "synth" или "sampler",
    sound — из каталога, ПАРА обязана совпадать:
        synth  -> только синты:
${synthRows}
        sampler-> только киты:
${kitRows}
    gain — 0..1 (опц., по умолчанию 0.8), muted — bool (опц.),
    events — массив нот.

EVENT:
- step: целое 0..(bars*16 - 1). НЕ выходи за конец лупа.
- note: научная нотация высоты, напр. "C2", "A#3", "Gb4" (одна цифра октавы).
- dur: целое >=1 длительность в шагах (опц., по умолчанию 1); step+dur <= bars*16.
- vel: 0..1 громкость ноты (опц., по умолчанию 0.8).

БАРАБАНЫ (дорожки instrument="sampler"): нота выбирает элемент кита —
${drumRows}
Как минимум используются kick/snare/closed hat.

ЖЁСТКИЕ ПРАВИЛА (иначе ответ будет отклонён):
- sound только из каталога; пары synth↔синты, sampler↔киты соблюдены.
- все id уникальны; все step в диапазоне 0..bars*16-1.
- при правке возвращай ПОЛНЫЙ новый Song (не дифф), сохраняя то, что менять не просили.
- message пиши на языке пользовательского пожелания.
- верни ТОЛЬКО JSON-обёртку {"message":..., "song":...}, без текста вокруг.`;
}

const SYSTEM_PROMPT = buildSystemPrompt();

// --- Few-shot examples (each song validates against song.schema.json) -------
function genUser(prompt) {
  return `Пожелание: ${prompt}\nСгенерируй новый трек с нуля.`;
}
function editUser(prompt, song) {
  return (
    `Правка существующего трека.\nТекущий Song JSON:\n` +
    `${JSON.stringify(song)}\n\n` +
    `Пожелание: ${prompt}\nВерни ПОЛНЫЙ обновлённый Song JSON (не дифф).`
  );
}

const EX_LOFI = {
  version: 1,
  title: "lofi sketch",
  bpm: 75,
  key: "A minor",
  bars: 2,
  tracks: [
    {
      id: "drums",
      role: "drums",
      instrument: "sampler",
      sound: "lofi_kit",
      gain: 0.9,
      events: [
        { step: 0, note: "C2", vel: 0.9 },
        { step: 4, note: "F#2", vel: 0.5 },
        { step: 8, note: "D2", vel: 0.8 },
        { step: 12, note: "F#2", vel: 0.5 },
        { step: 16, note: "C2", vel: 0.9 },
        { step: 20, note: "F#2", vel: 0.5 },
        { step: 24, note: "D2", vel: 0.8 },
        { step: 28, note: "F#2", vel: 0.5 },
      ],
    },
    {
      id: "bass",
      role: "bass",
      instrument: "synth",
      sound: "sine_bass",
      gain: 0.8,
      events: [
        { step: 0, note: "A1", dur: 8, vel: 0.8 },
        { step: 16, note: "F1", dur: 8, vel: 0.8 },
      ],
    },
    {
      id: "pad",
      role: "pad",
      instrument: "synth",
      sound: "soft_pad",
      gain: 0.6,
      events: [
        { step: 0, note: "A3", dur: 16, vel: 0.5 },
        { step: 16, note: "F3", dur: 16, vel: 0.5 },
      ],
    },
  ],
};

const EX_HOUSE = {
  version: 1,
  title: "house groove",
  bpm: 124,
  key: "F minor",
  bars: 2,
  tracks: [
    {
      id: "drums",
      role: "drums",
      instrument: "sampler",
      sound: "house_kit",
      gain: 0.9,
      events: [
        { step: 0, note: "C2", vel: 0.9 },
        { step: 4, note: "C2", vel: 0.9 },
        { step: 8, note: "C2", vel: 0.9 },
        { step: 12, note: "C2", vel: 0.9 },
        { step: 16, note: "C2", vel: 0.9 },
        { step: 20, note: "C2", vel: 0.9 },
        { step: 24, note: "C2", vel: 0.9 },
        { step: 28, note: "C2", vel: 0.9 },
        { step: 8, note: "D#2", vel: 0.7 },
        { step: 24, note: "D#2", vel: 0.7 },
        { step: 2, note: "F#2", vel: 0.4 },
        { step: 6, note: "F#2", vel: 0.4 },
        { step: 10, note: "F#2", vel: 0.4 },
        { step: 14, note: "F#2", vel: 0.4 },
        { step: 18, note: "F#2", vel: 0.4 },
        { step: 22, note: "F#2", vel: 0.4 },
        { step: 26, note: "F#2", vel: 0.4 },
        { step: 30, note: "F#2", vel: 0.4 },
      ],
    },
    {
      id: "bass",
      role: "bass",
      instrument: "synth",
      sound: "sine_bass",
      gain: 0.85,
      events: [
        { step: 2, note: "F1", dur: 2, vel: 0.85 },
        { step: 6, note: "F1", dur: 2, vel: 0.8 },
        { step: 10, note: "F1", dur: 2, vel: 0.85 },
        { step: 14, note: "F1", dur: 2, vel: 0.8 },
        { step: 18, note: "C2", dur: 2, vel: 0.85 },
        { step: 22, note: "C2", dur: 2, vel: 0.8 },
        { step: 26, note: "C2", dur: 2, vel: 0.85 },
        { step: 30, note: "C2", dur: 2, vel: 0.8 },
      ],
    },
    {
      id: "stab",
      role: "chords",
      instrument: "synth",
      sound: "pluck",
      gain: 0.6,
      events: [
        { step: 4, note: "F3", dur: 1, vel: 0.6 },
        { step: 4, note: "G#3", dur: 1, vel: 0.6 },
        { step: 4, note: "C4", dur: 1, vel: 0.6 },
        { step: 20, note: "D#3", dur: 1, vel: 0.6 },
        { step: 20, note: "G3", dur: 1, vel: 0.6 },
        { step: 20, note: "A#3", dur: 1, vel: 0.6 },
      ],
    },
  ],
};

// Edit example: a pad-less base -> add a soft pad and nudge tempo up.
const EX_EDIT_BASE = {
  version: 1,
  title: "lofi sketch",
  bpm: 75,
  key: "A minor",
  bars: 2,
  tracks: [
    {
      id: "drums",
      role: "drums",
      instrument: "sampler",
      sound: "lofi_kit",
      events: [
        { step: 0, note: "C2", vel: 0.9 },
        { step: 8, note: "D2", vel: 0.8 },
      ],
    },
    {
      id: "bass",
      role: "bass",
      instrument: "synth",
      sound: "sine_bass",
      events: [
        { step: 0, note: "A1", dur: 8, vel: 0.8 },
        { step: 16, note: "F1", dur: 8, vel: 0.8 },
      ],
    },
  ],
};
const EX_EDIT_RESULT = {
  ...structuredClone(EX_EDIT_BASE),
  bpm: 84,
  tracks: [
    ...structuredClone(EX_EDIT_BASE.tracks),
    {
      id: "pad",
      role: "pad",
      instrument: "synth",
      sound: "soft_pad",
      gain: 0.6,
      events: [
        { step: 0, note: "A3", dur: 16, vel: 0.4 },
        { step: 16, note: "F3", dur: 16, vel: 0.4 },
      ],
    },
  ],
};

/** Few-shot as role-alternating turns: user -> assistant(wrapper JSON). */
const FEW_SHOT = [
  {
    role: "user",
    content: genUser("спокойный лоу-фай бит, 75 BPM, ля минор"),
  },
  {
    role: "assistant",
    content: JSON.stringify({
      message: "Собрал спокойный лоу-фай на 75 BPM в ля-миноре: мягкий бит, тёплый бас и пэд.",
      song: EX_LOFI,
    }),
  },
  {
    role: "user",
    content: genUser("энергичный хаус, 124 BPM, фа минор"),
  },
  {
    role: "assistant",
    content: JSON.stringify({
      message: "Сделал хаус-грув на 124 BPM: ровный бит четыре-на-полу, пружинистый бас и стэбы.",
      song: EX_HOUSE,
    }),
  },
  {
    role: "user",
    content: editUser("добавь мягкий пэд и сделай чуть быстрее", EX_EDIT_BASE),
  },
  {
    role: "assistant",
    content: JSON.stringify({
      message: "Добавил мягкий пэд (soft_pad) и поднял темп до 84 BPM.",
      song: EX_EDIT_RESULT,
    }),
  },
];

// Exported for tests: verify few-shot songs pass the schema.
export const FEW_SHOT_SONGS = [EX_LOFI, EX_HOUSE, EX_EDIT_RESULT, EX_EDIT_BASE];

// --- Parsing ----------------------------------------------------------------
/** Strips markdown fences / surrounding prose, returns the JSON substring. */
export function extractJson(text) {
  let t = String(text ?? "").trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last > first) t = t.slice(first, last + 1);
  return t;
}

/** Parses a raw model reply into { song, message }. Throws if no song found. */
export function parseResponse(raw) {
  const obj = JSON.parse(extractJson(raw));
  if (obj && typeof obj === "object" && obj.song && typeof obj.song === "object") {
    return {
      song: obj.song,
      message: typeof obj.message === "string" ? obj.message : "",
    };
  }
  // Tolerate a bare Song object (no wrapper).
  if (obj && typeof obj === "object" && Array.isArray(obj.tracks)) {
    return { song: obj, message: "" };
  }
  throw new Error("LLM reply did not contain a song object");
}

// --- Public API -------------------------------------------------------------
/**
 * @param {{ prompt: string, song: object|null, previousErrors?: string[] }} args
 * @returns {Promise<{ song: object, message: string }>}
 */
export async function generateSong({ prompt, song = null, previousErrors = [] }) {
  let userContent = song ? editUser(prompt, song) : genUser(prompt);
  if (previousErrors.length) {
    userContent +=
      `\n\nВНИМАНИЕ: твой предыдущий JSON не прошёл валидацию:\n` +
      previousErrors.map((e) => `- ${e}`).join("\n") +
      `\nИсправь эти ошибки и верни валидный JSON-обёртку целиком.`;
  }

  const messages = [...FEW_SHOT, { role: "user", content: userContent }];
  const raw = await callLLM({ system: SYSTEM_PROMPT, messages });
  const { song: outSong, message } = parseResponse(raw);

  return {
    song: outSong,
    message:
      message ||
      `Готово: ${outSong.title ?? "трек"}, ${outSong.bpm ?? "?"} BPM.`,
  };
}
