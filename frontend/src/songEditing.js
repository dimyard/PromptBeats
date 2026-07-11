export const FALLBACK_CATALOG = {
  synths: ["sine_bass", "saw_lead", "square_lead", "soft_pad", "pluck", "fm_bell"],
  kits: ["lofi_kit", "house_kit", "trap_kit"],
  roles: ["drums", "bass", "chords", "lead", "pad", "fx"],
};

export const DRUM_NOTES = [
  { note: "C2", label: "Kick", short: "K" },
  { note: "D2", label: "Snare", short: "S" },
  { note: "D#2", label: "Clap", short: "C" },
  { note: "F#2", label: "Closed hat", short: "H" },
  { note: "A#2", label: "Open hat", short: "O" },
  { note: "E2", label: "Tom", short: "T" },
  { note: "C#3", label: "Ride", short: "R" },
];

export const DRUM_NOTE_LABELS = Object.fromEntries(DRUM_NOTES.map((item) => [item.note, item.short]));

export function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

export function totalSteps(song) {
  return clamp(Math.round(song?.bars ?? 1), 1, 32) * 16;
}

export function soundsForInstrument(catalog, instrument) {
  const source = catalog ?? FALLBACK_CATALOG;
  return instrument === "sampler" ? source.kits ?? FALLBACK_CATALOG.kits : source.synths ?? FALLBACK_CATALOG.synths;
}

export function normalizeSongForLoop(song) {
  const steps = totalSteps(song);
  return {
    ...song,
    bars: steps / 16,
    tracks: (song.tracks ?? []).map((track) => ({
      ...track,
      events: (track.events ?? [])
        .filter((event) => Number.isInteger(event.step) && event.step >= 0 && event.step < steps)
        .map((event) => {
          const dur = event.dur == null ? undefined : clamp(Math.round(event.dur), 1, steps - event.step);
          return dur == null ? { ...event } : { ...event, dur };
        }),
    })),
  };
}

export function setSongBpm(song, bpm) {
  return { ...song, bpm: clamp(Math.round(bpm), 40, 220) };
}

export function setSongBars(song, bars) {
  return normalizeSongForLoop({ ...song, bars: clamp(Math.round(bars), 1, 32) });
}

export function updateTrack(song, trackId, patcher) {
  return {
    ...song,
    tracks: (song.tracks ?? []).map((track) => (track.id === trackId ? patcher(track) : track)),
  };
}

function slugPart(value) {
  return String(value ?? "track")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28) || "track";
}

export function uniqueTrackId(song, preferred) {
  const base = slugPart(preferred);
  const used = new Set((song.tracks ?? []).map((track) => track.id));
  if (!used.has(base)) return base;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}_${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}_${Date.now().toString(36)}`;
}

export function createTrack(song, { role = "lead", instrument = "synth", sound } = {}, catalog = FALLBACK_CATALOG) {
  const allowedSounds = soundsForInstrument(catalog, instrument);
  const nextSound = allowedSounds.includes(sound) ? sound : allowedSounds[0];
  const id = uniqueTrackId(song, role);
  return {
    id,
    role,
    instrument,
    sound: nextSound,
    gain: instrument === "sampler" ? 0.82 : 0.7,
    muted: false,
    events: [],
  };
}

export function addTrack(song, options, catalog = FALLBACK_CATALOG) {
  const track = createTrack(song, options, catalog);
  return {
    ...song,
    tracks: [...(song.tracks ?? []), track],
  };
}

export function setTrackMuted(song, trackId, muted) {
  return updateTrack(song, trackId, (track) => ({ ...track, muted: Boolean(muted) }));
}

export function setTrackGain(song, trackId, gain) {
  return updateTrack(song, trackId, (track) => ({ ...track, gain: clamp(Number(gain), 0, 1) }));
}

export function setTrackSound(song, trackId, sound, catalog = FALLBACK_CATALOG) {
  return updateTrack(song, trackId, (track) => {
    const allowed = soundsForInstrument(catalog, track.instrument);
    return allowed.includes(sound) ? { ...track, sound } : track;
  });
}

export function toggleDrumStep(song, trackId, step, note = "C2") {
  const maxStep = totalSteps(song);
  const safeStep = Math.round(step);
  if (safeStep < 0 || safeStep >= maxStep) return song;

  return updateTrack(song, trackId, (track) => {
    if (track.instrument !== "sampler") return track;
    const events = track.events ?? [];
    const exists = events.some((event) => event.step === safeStep && event.note === note);
    const nextEvents = exists
      ? events.filter((event) => !(event.step === safeStep && event.note === note))
      : [...events, { step: safeStep, note, vel: note === "C2" ? 0.9 : 0.55 }];

    return {
      ...track,
      events: nextEvents.sort((a, b) => a.step - b.step || String(a.note).localeCompare(String(b.note))),
    };
  });
}
