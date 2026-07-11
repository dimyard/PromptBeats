// Instrument registry. Owner: Human C.
// Voices are synthesized so every kit works without fetching external samples.
import * as Tone from "tone";

// note -> drum piece (mirrors the drum map in ../../../CONTRACTS.md)
export const DRUM_NOTE_MAP = Object.freeze({
  C2: "kick",
  D2: "snare",
  "D#2": "clap",
  "F#2": "closedhat",
  "A#2": "openhat",
  E2: "tom",
  "C#3": "crash",
});

export const SYNTH_SOUNDS = Object.freeze([
  "sine_bass",
  "saw_lead",
  "square_lead",
  "soft_pad",
  "pluck",
  "fm_bell",
]);

export const KIT_SOUNDS = Object.freeze(["lofi_kit", "house_kit", "trap_kit"]);

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
      return new Tone.PluckSynth({ attackNoise: 1.1, dampening: 3800, resonance: 0.78 });
    case "fm_bell":
      return new Tone.FMSynth({
        harmonicity: 3.01,
        modulationIndex: 9,
        oscillator: { type: "sine" },
        modulation: { type: "square" },
        envelope: { attack: 0.01, decay: 0.18, sustain: 0.08, release: 0.85 },
        modulationEnvelope: { attack: 0.004, decay: 0.28, sustain: 0, release: 0.55 },
      });
    default:
      return null;
  }
}

const KIT_PROFILES = {
  lofi_kit: {
    kickNote: "C1", kickOctaves: 4.5, kickDecay: 0.075, kickDuration: "8n",
    snareNoise: "pink", snareDecay: 0.2, hatNoise: "pink", hatDecay: 0.045,
    openHatDecay: 0.22, crashDecay: 0.65, tomNote: "G1", clapDelay: 0.026,
  },
  house_kit: {
    kickNote: "C1", kickOctaves: 7, kickDecay: 0.035, kickDuration: "4n",
    snareNoise: "white", snareDecay: 0.13, hatNoise: "white", hatDecay: 0.028,
    openHatDecay: 0.3, crashDecay: 0.95, tomNote: "A1", clapDelay: 0.018,
  },
  trap_kit: {
    kickNote: "C0", kickOctaves: 8, kickDecay: 0.055, kickDuration: "8n",
    snareNoise: "white", snareDecay: 0.09, hatNoise: "white", hatDecay: 0.018,
    openHatDecay: 0.16, crashDecay: 0.5, tomNote: "E1", clapDelay: 0.014,
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
  const snareNoise = new Tone.NoiseSynth({
    noise: { type: profile.snareNoise },
    envelope: { attack: 0.001, decay: profile.snareDecay, sustain: 0 },
  });
  const snareBody = new Tone.MembraneSynth({
    pitchDecay: 0.012,
    octaves: 1.5,
    envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.02 },
  });
  const clap = new Tone.NoiseSynth({
    noise: { type: profile.snareNoise },
    envelope: { attack: 0.001, decay: 0.075, sustain: 0 },
  });
  const closedHat = new Tone.NoiseSynth({
    noise: { type: profile.hatNoise },
    envelope: { attack: 0.001, decay: profile.hatDecay, sustain: 0 },
  });
  const openHat = new Tone.NoiseSynth({
    noise: { type: profile.hatNoise },
    envelope: { attack: 0.001, decay: profile.openHatDecay, sustain: 0 },
  });
  const tom = new Tone.MembraneSynth({
    pitchDecay: 0.025,
    octaves: 3.5,
    envelope: { attack: 0.001, decay: 0.19, sustain: 0.01, release: 0.04 },
  });
  const crash = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.002, decay: profile.crashDecay, sustain: 0 },
  });

  const nodes = connectAll(
    [kick, snareNoise, snareBody, clap, closedHat, openHat, tom, crash],
    output,
  );

  return {
    trigger(note, time, velocity = 0.8) {
      const vel = clampVelocity(velocity);
      const hit = DRUM_NOTE_MAP[normalizeDrumNote(note)] ?? "kick";
      const at = typeof time === "number" ? time : Tone.Time(time).toSeconds();

      switch (hit) {
        case "snare":
          snareNoise.triggerAttackRelease("16n", at, vel * 0.85);
          snareBody.triggerAttackRelease("C3", "32n", at, vel * 0.25);
          break;
        case "clap":
          clap.triggerAttackRelease("32n", at, vel * 0.62);
          clap.triggerAttackRelease("32n", at + profile.clapDelay, vel * 0.48);
          clap.triggerAttackRelease("32n", at + profile.clapDelay * 2, vel * 0.32);
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
        case "crash":
          crash.triggerAttackRelease("8n", at, vel * 0.42);
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
