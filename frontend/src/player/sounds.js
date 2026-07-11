// Instrument registry. Owner: Human C.
// Synths are asset-free Tone.js voices. Kits are synthesized (no sample files)
// so the demo plays out of the box — C can later swap kits for Tone.Sampler.
import * as Tone from "tone";

// note -> drum piece (mirrors the drum map in ../../../CONTRACTS.md)
export const DRUM_NOTE_MAP = {
  C2: "kick",
  D2: "snare",
  "D#2": "clap",
  "F#2": "closedhat",
  "A#2": "openhat",
  E2: "tom",
  "C#3": "crash",
};

const KIT_SOUNDS = new Set(["lofi_kit", "house_kit", "trap_kit"]);
export const isKit = (sound) => KIT_SOUNDS.has(sound);

/** Build a pitched synth voice. Returns null for unknown sound. */
export function makeSynth(sound) {
  switch (sound) {
    case "sine_bass":
      return new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.3 } });
    case "saw_lead":
      return new Tone.Synth({ oscillator: { type: "sawtooth" }, envelope: { attack: 0.02, release: 0.3 } });
    case "square_lead":
      return new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.02, release: 0.3 } });
    case "soft_pad":
      return new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.6, decay: 0.3, sustain: 0.7, release: 1.4 } });
    case "pluck":
      return new Tone.PluckSynth();
    case "fm_bell":
      return new Tone.FMSynth({ harmonicity: 3, modulationIndex: 10, envelope: { attack: 0.01, release: 0.6 } });
    default:
      return null;
  }
}

/**
 * Build a synthesized drum kit. Returns { trigger(note, time, vel), dispose() }.
 * All variants share the same synth voices for now; distinguish them later.
 */
export function makeKit(_sound, output) {
  const kick = new Tone.MembraneSynth({ octaves: 6, pitchDecay: 0.05 }).connect(output);
  const snare = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.2, sustain: 0 } }).connect(output);
  const clap = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.001, decay: 0.15, sustain: 0 } }).connect(output);
  const hat = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } }).connect(output);
  const openhat = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.25, sustain: 0 } }).connect(output);

  return {
    trigger(note, time, vel = 0.8) {
      switch (DRUM_NOTE_MAP[note]) {
        case "kick": kick.triggerAttackRelease("C1", "8n", time, vel); break;
        case "snare": snare.triggerAttackRelease("8n", time, vel); break;
        case "clap": clap.triggerAttackRelease("8n", time, vel); break;
        case "closedhat": hat.triggerAttackRelease("16n", time, vel); break;
        case "openhat": openhat.triggerAttackRelease("8n", time, vel); break;
        case "tom": kick.triggerAttackRelease("G1", "8n", time, vel); break;
        case "crash": openhat.triggerAttackRelease("4n", time, vel); break;
        default: kick.triggerAttackRelease("C1", "8n", time, vel); // unknown -> kick
      }
    },
    dispose() {
      [kick, snare, clap, hat, openhat].forEach((n) => n.dispose());
    },
  };
}
