// Tone.js player. Owner: Human C. Implements Contract 3 from ../../../CONTRACTS.md.
// Pure browser, no network. Input is only a Song JSON object.
import * as Tone from "tone";
import { makeSynth, makeKit, isKit } from "./sounds.js";

/** step index -> Tone transport time (16th-note grid). */
const stepToTime = (step) => {
  const bar = Math.floor(step / 16);
  const sixteenth = step % 16;
  const quarter = Math.floor(sixteenth / 4);
  const rem = sixteenth % 4;
  return `${bar}:${quarter}:${rem}`;
};

const DEFAULT_BPM = 120;
const DEFAULT_BARS = 1;
const DEFAULT_GAIN = 0.8;
const STOP_FADE_SECONDS = 0.005;
const MAX_BPM = 220;
const MAX_BARS = 32;

const numberInRange = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

const safeSteps = (bars) => Math.max(16, Math.floor(numberInRange(bars, DEFAULT_BARS, 1, MAX_BARS)) * 16);

export function createPlayer() {
  let parts = [];
  let voices = [];
  let trackOutputs = [];
  let stepEventId = null;
  let totalSteps = 16;
  let playing = false;
  const listeners = { step: [], ready: [], error: [] };

  const emit = (ev, payload) => (listeners[ev] || []).forEach((cb) => cb(payload));

  function teardown() {
    if (stepEventId !== null) { Tone.Transport.clear(stepEventId); stepEventId = null; }
    parts.forEach((p) => p.dispose());
    voices.forEach((v) => v.dispose?.());
    parts = [];
    voices = [];
    trackOutputs = [];
  }

  function setOutputGain(output, value, rampSeconds = 0) {
    const now = Tone.now();
    output.gain.cancelScheduledValues(now);
    if (rampSeconds) {
      output.gain.linearRampToValueAtTime(value, now + rampSeconds);
      return;
    }
    output.gain.setValueAtTime(value, now);
  }

  async function load(song) {
    try {
      const wasPlaying = playing;
      Tone.Transport.stop();
      teardown();

      Tone.Transport.bpm.value = numberInRange(song?.bpm, DEFAULT_BPM, 40, MAX_BPM);
      totalSteps = safeSteps(song?.bars);
      Tone.Transport.loop = true;
      Tone.Transport.loopStart = 0;
      Tone.Transport.loopEnd = `${totalSteps / 16}:0:0`;

      for (const track of song?.tracks ?? []) {
        const outputLevel = track.muted ? 0 : numberInRange(track.gain, DEFAULT_GAIN, 0, 1);
        const gain = new Tone.Gain(outputLevel).toDestination();
        voices.push(gain);
        trackOutputs.push({ gain, outputLevel });

        let voice;
        const wantsKit = track.instrument === "sampler";
        const kit = wantsKit && isKit(track.sound);
        if (wantsKit) {
          if (!kit) {
            emit("error", {
              code: "unknown_sound",
              message: `unknown kit \"${track.sound}\", using lofi_kit`,
              details: { track: track.id, sound: track.sound },
            });
          }
          voice = makeKit(kit ? track.sound : "lofi_kit", gain);
        } else {
          if (isKit(track.sound)) {
            emit("error", {
              code: "instrument_sound_mismatch",
              message: `synth track cannot use kit \"${track.sound}\", using pluck`,
              details: { track: track.id, instrument: track.instrument, sound: track.sound },
            });
          }
          voice = makeSynth(isKit(track.sound) ? "pluck" : track.sound);
          if (!voice) {
            emit("error", {
              code: "unknown_sound",
              message: `unknown sound "${track.sound}", using pluck`,
              details: { track: track.id, sound: track.sound },
            });
            voice = makeSynth("pluck");
          }
          voice.connect(gain);
        }
        voices.push(voice);

        // Skip/report events outside the loop; defensively clamp dur to the loop end.
        const evts = [];
        for (const e of track.events ?? []) {
          if (typeof e.step !== "number" || e.step < 0 || e.step >= totalSteps) {
            emit("error", {
              code: "event_out_of_range",
              message: `event step ${e.step} outside loop (0..${totalSteps - 1})`,
              details: { track: track.id, step: e.step },
            });
            continue;
          }
          const dur = Math.max(1, Math.min(numberInRange(e.dur, 1, 1, totalSteps), totalSteps - e.step));
          evts.push([stepToTime(e.step), { ...e, dur }]);
        }
        const part = new Tone.Part((time, e) => {
          const vel = e.vel ?? 0.8;
          if (wantsKit) {
            voice.trigger(e.note, time, vel);
          } else {
            const durSec = Tone.Time(`0:0:${e.dur}`).toSeconds();
            voice.triggerAttackRelease(e.note, durSec, time, vel);
          }
        }, evts);
        part.start(0);
        parts.push(part);
      }

      // playhead for UI
      stepEventId = Tone.Transport.scheduleRepeat((time) => {
        Tone.Draw.schedule(() => {
          const [b, q, s] = Tone.Transport.position.split(":").map(Number);
          const step = ((b * 4 + q) * 4 + Math.floor(s)) % totalSteps;
          emit("step", step);
        }, time);
      }, "16n");

      emit("ready", { totalSteps });
      if (wasPlaying) await play();
    } catch (err) {
      emit("error", { code: "load_failed", message: err.message });
      throw err;
    }
  }

  async function play() {
    await Tone.start(); // requires a user gesture the first time
    trackOutputs.forEach(({ gain, outputLevel }) => setOutputGain(gain, outputLevel));
    Tone.Transport.start();
    playing = true;
  }

  function stop() {
    Tone.Transport.stop();
    trackOutputs.forEach(({ gain }) => setOutputGain(gain, 0, STOP_FADE_SECONDS));
    Tone.Transport.position = 0;
    playing = false;
    emit("step", 0);
  }

  return {
    load,
    play,
    stop,
    isPlaying: () => playing,
    /** Subscribe to "step" | "ready" | "error". Returns an unsubscribe fn. */
    on: (event, cb) => {
      const arr = (listeners[event] ||= []);
      arr.push(cb);
      return () => {
        const i = arr.indexOf(cb);
        if (i >= 0) arr.splice(i, 1);
      };
    },
    dispose: () => {
      stop();
      teardown();
    },
    // exportWav(song) {}  // stretch goal — Tone.Offline render
  };
}
