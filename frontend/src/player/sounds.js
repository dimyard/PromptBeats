// Instrument registry. Owner: Human C.
// Drum kits and synths are built in. sampled_piano may use optional local samples
// from /samples/piano; it falls back to soft_piano while samples are unavailable.
import * as Tone from "tone";

// note -> drum piece (mirrors the drum map in ../../../CONTRACTS.md)
export const DRUM_NOTE_MAP = Object.freeze({
  C2: "kick",
  D2: "snare",
  "D#2": "clap",
  "F#2": "closedhat",
  "A#2": "openhat",
  E2: "tom",
  "C#3": "ride",
});

export const SYNTH_SOUNDS = Object.freeze([
  "sine_bass",
  "saw_lead",
  "square_lead",
  "soft_pad",
  "pluck",
  "fm_bell",
  "warm_keys",
  "soft_piano",
  "sampled_piano",
  "acid_bass",
  "organ",
  "wide_pad",
]);

export const KIT_SOUNDS = Object.freeze([
  "lofi_kit", "house_kit", "trap_kit", "boom_bap_kit", "techno_kit",
]);

const SYNTH_SOUND_SET = new Set(SYNTH_SOUNDS);
const KIT_SOUND_SET = new Set(KIT_SOUNDS);

export const isSynth = (sound) => SYNTH_SOUND_SET.has(sound);
export const isKit = (sound) => KIT_SOUND_SET.has(sound);

const clampVelocity = (velocity) => {
  const value = Number(velocity);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.8;
};

const normalizeDrumNote = (note) => {
  if (typeof note !== "string") return "";
  return note.length > 0 ? `${note[0].toUpperCase()}${note.slice(1)}` : "";
};

const MIN_TRIGGER_GAP_SECONDS = 0.0001;

export function reserveDrumTriggerTime(lastStarts, hit, time) {
  const previous = lastStarts.get(hit);
  const safeTime = previous !== undefined && time <= previous
    ? previous + MIN_TRIGGER_GAP_SECONDS
    : time;
  lastStarts.set(hit, safeTime);
  return safeTime;
}

function makeSoftPiano() {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.006, decay: 0.42, sustain: 0.18, release: 0.9 },
  });
}

function makePolyPluck() {
  const voices = Array.from({ length: 8 }, () => new Tone.PluckSynth({
    attackNoise: 1.1,
    dampening: 3800,
    resonance: 0.78,
  }));
  let voiceIndex = 0;

  return {
    connect(output) {
      voices.forEach((voice) => voice.connect(output));
      return this;
    },
    triggerAttackRelease(note, duration, time, velocity) {
      const voice = voices[voiceIndex % voices.length];
      voiceIndex += 1;
      voice.triggerAttackRelease(note, duration, time, velocity);
    },
    dispose() {
      voices.forEach((voice) => voice.dispose());
    },
  };
}

function makeNoisePool(options, size = 16) {
  const voices = Array.from({ length: size }, () => new Tone.NoiseSynth(options));
  let voiceIndex = 0;

  return {
    connect(output) {
      voices.forEach((voice) => voice.connect(output));
      return this;
    },
    triggerAttackRelease(duration, time, velocity) {
      const voice = voices[voiceIndex % voices.length];
      voiceIndex += 1;
      voice.triggerAttackRelease(duration, time, velocity);
    },
    dispose() {
      voices.forEach((voice) => voice.dispose());
    },
  };
}

export const PIANO_SAMPLE_URLS = Object.freeze({
  C1: "C1.wav",
  "F#1": "Fs1.wav",
  B1: "B1.wav",
  "D#2": "Ds2.wav",
  "F#2": "Fs2.wav",
  B2: "B2.wav",
  "D#3": "Ds3.wav",
  "F#3": "Fs3.wav",
  A3: "A3.wav",
  C4: "C4.wav",
  "D#4": "Ds4.wav",
  "F#4": "Fs4.wav",
  A4: "A4.wav",
  C5: "C5.wav",
  "D#5": "Ds5.wav",
  "F#5": "Fs5.wav",
  A5: "A5.wav",
  C6: "C6.wav",
  "D#6": "Ds6.wav",
  "F#6": "Fs6.wav",
  A6: "A6.wav",
  C7: "C7.wav",
  "D#7": "Ds7.wav",
  "F#7": "Fs7.wav",
  A7: "A7.wav",
  B7: "B7.wav",
});

export function getPianoSampleBaseUrl(globals = globalThis) {
  const sampleBaseUrl = globals.PROMPTBEATS_PIANO_SAMPLE_BASE_URL ?? "/samples/piano/";
  return sampleBaseUrl.endsWith("/") ? sampleBaseUrl : `${sampleBaseUrl}/`;
}

function makeSampledPiano() {
  let samplesLoaded = false;
  const fallback = makeSoftPiano();
  const sampler = new Tone.Sampler({
    urls: PIANO_SAMPLE_URLS,
    baseUrl: getPianoSampleBaseUrl(),
    release: 1.1,
    onload: () => {
      samplesLoaded = true;
    },
  });

  return {
    connect(output) {
      sampler.connect(output);
      fallback.connect(output);
      return this;
    },
    triggerAttackRelease(note, duration, time, velocity) {
      const voice = samplesLoaded ? sampler : fallback;
      voice.triggerAttackRelease(note, duration, time, velocity);
    },
    dispose() {
      sampler.dispose();
      fallback.dispose();
    },
  };
}

/** Build a pitched synth voice. Returns null for an unknown catalog sound. */
export function makeSynth(sound) {
  switch (sound) {
    case "sine_bass":
      return new Tone.MonoSynth({
        oscillator: { type: "sine" },
        filter: { Q: 1.5, type: "lowpass", rolloff: -24 },
        envelope: { attack: 0.015, decay: 0.18, sustain: 0.78, release: 0.32 },
        filterEnvelope: { attack: 0.01, decay: 0.28, sustain: 0.28, release: 0.25, baseFrequency: 45, octaves: 2.4 },
      });
    case "saw_lead":
      return new Tone.Synth({
        oscillator: { type: "fatsawtooth", count: 3, spread: 18 },
        envelope: { attack: 0.025, decay: 0.1, sustain: 0.58, release: 0.35 },
      });
    case "square_lead":
      return new Tone.Synth({
        oscillator: { type: "square", partials: [1, 0.35, 0.12] },
        envelope: { attack: 0.012, decay: 0.08, sustain: 0.48, release: 0.24 },
      });
    case "soft_pad":
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle8" },
        envelope: { attack: 0.45, decay: 0.25, sustain: 0.72, release: 1.7 },
      });
    case "pluck":
      return makePolyPluck();
    case "fm_bell":
      return new Tone.FMSynth({
        harmonicity: 3.01,
        modulationIndex: 9,
        oscillator: { type: "sine" },
        modulation: { type: "square" },
        envelope: { attack: 0.01, decay: 0.18, sustain: 0.08, release: 0.85 },
        modulationEnvelope: { attack: 0.004, decay: 0.28, sustain: 0, release: 0.55 },
      });
    case "warm_keys":
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle8" },
        envelope: { attack: 0.018, decay: 0.3, sustain: 0.48, release: 1.1 },
      });
    case "soft_piano":
      return makeSoftPiano();
    case "sampled_piano":
      return makeSampledPiano();
    case "acid_bass":
      return new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { Q: 6, type: "lowpass", rolloff: -24 },
        envelope: { attack: 0.004, decay: 0.16, sustain: 0.38, release: 0.16 },
        filterEnvelope: { attack: 0.002, decay: 0.24, sustain: 0.17, release: 0.15, baseFrequency: 55, octaves: 4.2 },
      });
    case "organ":
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "square", partials: [1, 0.8, 0.4, 0.2] },
        envelope: { attack: 0.01, decay: 0.08, sustain: 0.9, release: 0.32 },
      });
    case "wide_pad":
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 2, spread: 20 },
        envelope: { attack: 0.22, decay: 0.6, sustain: 0.62, release: 2.1 },
      });
    default:
      return null;
  }
}

const KIT_PROFILES = {
  lofi_kit: {
    kickNote: "C1", kickOctaves: 4.5, kickDecay: 0.075, kickDuration: "8n",
    snareNoise: "pink", snareDecay: 0.2, hatNoise: "pink", hatDecay: 0.045,
    openHatDecay: 0.22, rideDecay: 0.65, tomNote: "G1", clapDelay: 0.026,
  },
  house_kit: {
    kickNote: "C1", kickOctaves: 7, kickDecay: 0.035, kickDuration: "4n",
    snareNoise: "white", snareDecay: 0.13, hatNoise: "white", hatDecay: 0.028,
    openHatDecay: 0.3, rideDecay: 0.95, tomNote: "A1", clapDelay: 0.018,
  },
  trap_kit: {
    kickNote: "C0", kickOctaves: 8, kickDecay: 0.055, kickDuration: "8n",
    snareNoise: "white", snareDecay: 0.09, hatNoise: "white", hatDecay: 0.018,
    openHatDecay: 0.16, rideDecay: 0.5, tomNote: "E1", clapDelay: 0.014,
  },
  boom_bap_kit: {
    kickNote: "C1", kickOctaves: 3.8, kickDecay: 0.11, kickDuration: "8n",
    snareNoise: "pink", snareDecay: 0.25, hatNoise: "pink", hatDecay: 0.06,
    openHatDecay: 0.28, rideDecay: 0.75, tomNote: "F1", clapDelay: 0.03,
  },
  techno_kit: {
    kickNote: "C1", kickOctaves: 9, kickDecay: 0.02, kickDuration: "4n",
    snareNoise: "white", snareDecay: 0.08, hatNoise: "white", hatDecay: 0.022,
    openHatDecay: 0.2, rideDecay: 1.1, tomNote: "B1", clapDelay: 0.012,
  },
};

const connectAll = (nodes, output) => {
  nodes.forEach((node) => node.connect(output));
  return nodes;
};

/**
 * Build a synthesized drum kit. Unknown drum notes safely fall back to kick.
 * The returned object follows the interface consumed by player/index.js.
 */
export function makeKit(sound, output = Tone.getDestination()) {
  const profile = KIT_PROFILES[sound] ?? KIT_PROFILES.lofi_kit;
  const kick = new Tone.MembraneSynth({
    pitchDecay: profile.kickDecay,
    octaves: profile.kickOctaves,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.26, sustain: 0.01, release: 0.08 },
  });
  const snareNoise = makeNoisePool({
    noise: { type: profile.snareNoise },
    envelope: { attack: 0.001, decay: profile.snareDecay, sustain: 0 },
  });
  const snareBody = new Tone.MembraneSynth({
    pitchDecay: 0.012,
    octaves: 1.5,
    envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.02 },
  });
  const clap = makeNoisePool({
    noise: { type: profile.snareNoise },
    envelope: { attack: 0.001, decay: 0.075, sustain: 0 },
  }, 24);
  const closedHat = makeNoisePool({
    noise: { type: profile.hatNoise },
    envelope: { attack: 0.001, decay: profile.hatDecay, sustain: 0 },
  });
  const openHat = makeNoisePool({
    noise: { type: profile.hatNoise },
    envelope: { attack: 0.001, decay: profile.openHatDecay, sustain: 0 },
  });
  const tom = new Tone.MembraneSynth({
    pitchDecay: 0.025,
    octaves: 3.5,
    envelope: { attack: 0.001, decay: 0.19, sustain: 0.01, release: 0.04 },
  });
  const ride = makeNoisePool({
    noise: { type: "white" },
    envelope: { attack: 0.002, decay: profile.rideDecay, sustain: 0 },
  });

  const nodes = connectAll(
    [kick, snareNoise, snareBody, clap, closedHat, openHat, tom, ride],
    output,
  );
  const lastStarts = new Map();

  return {
    trigger(note, time, velocity = 0.8) {
      const vel = clampVelocity(velocity);
      const hit = DRUM_NOTE_MAP[normalizeDrumNote(note)] ?? "kick";
      const rawAt = typeof time === "number" ? time : Tone.Time(time).toSeconds();
      const at = reserveDrumTriggerTime(lastStarts, hit, rawAt);

      switch (hit) {
        case "snare":
          snareNoise.triggerAttackRelease("16n", at, vel * 0.85);
          snareBody.triggerAttackRelease("C3", "32n", at, vel * 0.25);
          break;
        case "clap":
          clap.triggerAttackRelease("32n", at, vel * 0.62);
          clap.triggerAttackRelease("32n", at + profile.clapDelay, vel * 0.48);
          clap.triggerAttackRelease("32n", at + profile.clapDelay * 2, vel * 0.32);
          lastStarts.set(hit, at + profile.clapDelay * 2);
          break;
        case "closedhat":
          closedHat.triggerAttackRelease("64n", at, vel * 0.7);
          break;
        case "openhat":
          openHat.triggerAttackRelease("16n", at, vel * 0.66);
          break;
        case "tom":
          tom.triggerAttackRelease(profile.tomNote, "8n", at, vel * 0.78);
          break;
        case "ride":
          ride.triggerAttackRelease("8n", at, vel * 0.42);
          break;
        case "kick":
        default:
          kick.triggerAttackRelease(profile.kickNote, profile.kickDuration, at, vel * 0.9);
      }
    },
    dispose() {
      nodes.forEach((node) => node.dispose());
    },
  };
}
