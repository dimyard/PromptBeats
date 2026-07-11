// Sound catalog — single source of truth for what the LLM may choose.
// Mirrors the enum in ../../song.schema.json. Keep them in sync.
export const CATALOG = {
  synths: ["sine_bass", "saw_lead", "square_lead", "soft_pad", "pluck", "fm_bell"],
  kits: ["lofi_kit", "house_kit", "trap_kit"],
  roles: ["drums", "bass", "chords", "lead", "pad", "fx"],
};

export const ALL_SOUNDS = [...CATALOG.synths, ...CATALOG.kits];
