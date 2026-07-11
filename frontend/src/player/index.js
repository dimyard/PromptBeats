// Tone.js player. Owner: Human C. Implements Contract 3 from ../../../CONTRACTS.md.
// Pure browser, no network. Input is only a Song JSON object.
import * as Tone from "tone";
import { makeSynth, makeKit, isKit } from "./sounds.js";
import { audioBufferToWav } from "./wav.js";

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
const MASTER_GAIN = 0.8;
const LIMITER_THRESHOLD_DB = -1;

const numberInRange = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

const safeSteps = (bars) => Math.max(16, Math.floor(numberInRange(bars, DEFAULT_BARS, 1, MAX_BARS)) * 16);

export function createPlayer() {
  let parts = [];
  let voices = [];
  let trackOutputs = [];
  let masterNodes = [];
  let stepEventId = null;
  let totalSteps = 16;
  let playing = false;
  let lastSong = null;
  const listeners = { step: [], ready: [], error: [] };

  const emit = (ev, payload) => (listeners[ev] || []).forEach((cb) => cb(payload));

  function teardown({ clearStepScheduler = false } = {}) {
    if (clearStepScheduler && stepEventId !== null) {
      Tone.Transport.clear(stepEventId);
      stepEventId = null;
    }
    parts.forEach((p) => p.dispose());
    voices.forEach((v) => v.dispose?.());
    parts = [];
    voices = [];
    trackOutputs = [];
    masterNodes.forEach((node) => node.dispose?.());
    masterNodes = [];
  }

  function createMasterBus() {
    const masterGain = new Tone.Gain(MASTER_GAIN);
    const limiter = new Tone.Limiter(LIMITER_THRESHOLD_DB).toDestination();
    masterGain.connect(limiter);
    masterNodes = [masterGain, limiter];
    return masterGain;
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

  function hasSameTrackAudioStructure(previousSong, nextSong) {
    const previousTracks = previousSong?.tracks ?? [];
    const nextTracks = nextSong?.tracks ?? [];
    return previousTracks.length === nextTracks.length
      && previousTracks.every((track, index) => {
        const nextTrack = nextTracks[index];
        return track.id === nextTrack.id
          && track.instrument === nextTrack.instrument
          && track.sound === nextTrack.sound
          && JSON.stringify(track.events ?? []) === JSON.stringify(nextTrack.events ?? []);
      });
  }

  function applyLiveMixerUpdate(song) {
    const outputsByTrackId = new Map(trackOutputs.map((output) => [output.trackId, output]));
    for (const track of song.tracks ?? []) {
      const output = outputsByTrackId.get(track.id);
      if (!output) return false;
      const outputLevel = track.muted ? 0 : numberInRange(track.gain, DEFAULT_GAIN, 0, 1);
      output.outputLevel = outputLevel;
      setOutputGain(output.gain, outputLevel, 0.01);
    }
    Tone.Transport.bpm.value = numberInRange(song?.bpm, DEFAULT_BPM, 40, MAX_BPM);
    return true;
  }

  function ensureStepScheduler() {
    if (stepEventId !== null) return;
    stepEventId = Tone.Transport.scheduleRepeat((time) => {
      Tone.Draw.schedule(() => {
        const [b, q, s] = Tone.Transport.position.split(":").map(Number);
        const step = ((b * 4 + q) * 4 + Math.floor(s)) % totalSteps;
        emit("step", step);
      }, time);
    }, "16n");
  }

  async function load(song) {
    try {
      const nextTotalSteps = safeSteps(song?.bars);
      const canApplyLiveMixer = playing
        && Tone.Transport.state === "started"
        && nextTotalSteps === totalSteps
        && hasSameTrackAudioStructure(lastSong, song);

      if (canApplyLiveMixer && applyLiveMixerUpdate(song)) {
        lastSong = song;
        emit("ready", { totalSteps });
        return;
      }

      const wasPlaying = playing;
      const preservePosition = wasPlaying
        && Tone.Transport.state === "started"
        && nextTotalSteps === totalSteps;
      lastSong = song;
      if (!preservePosition) {
        Tone.Transport.stop();
        Tone.Transport.position = 0;
      }
      teardown();

      Tone.Transport.bpm.value = numberInRange(song?.bpm, DEFAULT_BPM, 40, MAX_BPM);
      totalSteps = nextTotalSteps;
      Tone.Transport.loop = true;
      Tone.Transport.loopStart = 0;
      Tone.Transport.loopEnd = `${totalSteps / 16}:0:0`;
      const masterBus = createMasterBus();

      for (const track of song?.tracks ?? []) {
        const outputLevel = track.muted ? 0 : numberInRange(track.gain, DEFAULT_GAIN, 0, 1);
        const gain = new Tone.Gain(outputLevel);
        gain.connect(masterBus);
        voices.push(gain);
        trackOutputs.push({ trackId: track.id, gain, outputLevel });

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
              code: "unknown_sound",
              message: `synth track cannot use kit \"${track.sound}\", using pluck`,
              details: {
                track: track.id,
                instrument: track.instrument,
                sound: track.sound,
                reason: "instrument_sound_mismatch",
              },
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

      ensureStepScheduler();

      emit("ready", { totalSteps });
      if (wasPlaying && !preservePosition) await play();
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

  /**
   * Offline-render one loop of a Song to a PCM16 WAV Blob (Contract 4).
   *
   * Builds the same graph as {@link load} inside a `Tone.Offline` context, so
   * `makeSynth`/`makeKit` bind to the offline context automatically. Uses the
   * offline context's own transport (`ctx.transport`) — the live
   * `Tone.Transport`/Destination and play/stop state are never touched, so this
   * is safe to call during playback. Without a `song` argument it renders the
   * last Song passed to `load`.
   *
   * Render length is exactly one loop: `bars * 4 * 60 / bpm` seconds. Synth
   * release tails that cross the loop boundary are truncated (known MVP limit).
   *
   * @param {object} [song] Song JSON to render; defaults to the last loaded one.
   * @returns {Promise<Blob>} a `Blob` with `type: "audio/wav"`.
   */
  async function exportWav(song) {
    const source = song ?? lastSong;
    if (!source) throw new Error("exportWav: no song to render (call load first)");

    const bpm = numberInRange(source.bpm, DEFAULT_BPM, 40, MAX_BPM);
    const steps = safeSteps(source.bars);
    // One loop = steps sixteenth-notes = bars * 4 * 60 / bpm seconds.
    const durationSec = (steps * (60 / bpm)) / 4;

    const buffer = await Tone.Offline(async (ctx) => {
      const transport = ctx.transport;
      transport.bpm.value = bpm;

      for (const track of source.tracks ?? []) {
        const outputLevel = track.muted ? 0 : numberInRange(track.gain, DEFAULT_GAIN, 0, 1);
        // In an offline context toDestination() targets the offline destination.
        const gain = new Tone.Gain(outputLevel).toDestination();

        const wantsKit = track.instrument === "sampler";
        let voice;
        if (wantsKit) {
          const kit = isKit(track.sound) ? track.sound : "lofi_kit";
          voice = makeKit(kit, gain);
        } else {
          voice = makeSynth(isKit(track.sound) ? "pluck" : track.sound) ?? makeSynth("pluck");
          voice.connect(gain);
        }

        const evts = [];
        for (const e of track.events ?? []) {
          if (typeof e.step !== "number" || e.step < 0 || e.step >= steps) continue;
          const dur = Math.max(1, Math.min(numberInRange(e.dur, 1, 1, steps), steps - e.step));
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
      }

      transport.start(0);
    }, durationSec);

    // ToneAudioBuffer -> native AudioBuffer -> PCM16 WAV bytes.
    const arrayBuffer = audioBufferToWav(buffer.get());
    return new Blob([arrayBuffer], { type: "audio/wav" });
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
      teardown({ clearStepScheduler: true });
    },
    exportWav,
  };
}
