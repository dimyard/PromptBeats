// Sound catalog — single source of truth for what the LLM may choose.
// Mirrors the enum in ../../song.schema.json. Keep them in sync.
export const CATALOG = {
  synths: [
    "sine_bass", "saw_lead", "square_lead", "soft_pad", "pluck", "fm_bell",
    "warm_keys", "soft_piano", "sampled_piano", "acid_bass", "organ", "wide_pad",
  ],
  kits: ["lofi_kit", "house_kit", "trap_kit", "boom_bap_kit", "techno_kit"],
  roles: ["drums", "bass", "chords", "lead", "pad", "fx"],
};

export const ALL_SOUNDS = [...CATALOG.synths, ...CATALOG.kits];

// Prompt-only descriptions. Kept out of CATALOG to preserve the /api/catalog
// response contract consumed by the frontend.
export const SOUND_DESCRIPTIONS = Object.freeze({
  sine_bass: "чистый глубокий саб-бас",
  saw_lead: "широкий пилообразный лид",
  square_lead: "яркий квадратный лид",
  soft_pad: "мягкий медленный пэд",
  pluck: "короткий щипковый звук для стэбов",
  fm_bell: "звонкий FM-колокольчик",
  warm_keys: "тёплые полифонические клавиши",
  soft_piano: "мягкое читаемое пианино для хуков и аккордов",
  sampled_piano: "более натуральное sample-based пианино для главных хуков",
  acid_bass: "резкий резонансный acid-бас",
  organ: "полифонический орган",
  wide_pad: "широкий воздушный стерео-пэд",
  lofi_kit: "приглушённый lo-fi барабанный кит",
  house_kit: "плотный ровный house-кит",
  trap_kit: "короткий резкий trap-кит",
  boom_bap_kit: "пыльный boom-bap кит с длинным снейром",
  techno_kit: "жёсткий быстрый techno-кит",
});
