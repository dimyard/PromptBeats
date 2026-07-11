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

export function createPlayer() {
  let parts = [];
  let voices = [];
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
    Tone.Transport.cancel(0);
  }

  async function load(song) {
    try {
      const wasPlaying = playing;
      Tone.Transport.stop();
      teardown();

      Tone.Transport.bpm.value = song.bpm ?? 120;
      totalSteps = (song.bars ?? 1) * 16;
      Tone.Transport.loop = true;
      Tone.Transport.loopStart = 0;
      Tone.Transport.loopEnd = `${song.bars ?? 1}:0:0`;

      for (const track of song.tracks ?? []) {
        if (track.muted) continue;
        const gain = new Tone.Gain(track.gain ?? 0.8).toDestination();
        voices.push(gain);

        let voice;
        const kit = isKit(track.sound);
        if (kit) {
          voice = makeKit(track.sound, gain);
        } else {
          voice = makeSynth(track.sound);
          if (!voice) {
            emit("error", { track: track.id, reason: `unknown sound "${track.sound}", using pluck` });
            voice = makeSynth("pluck");
          }
          voice.connect(gain);
        }
        voices.push(voice);

        const evts = (track.events ?? []).map((e) => [stepToTime(e.step), e]);
        const part = new Tone.Part((time, e) => {
          const vel = e.vel ?? 0.8;
          if (kit) {
            voice.trigger(e.note, time, vel);
          } else {
            const durSec = Tone.Time(`0:0:${e.dur ?? 1}`).toSeconds();
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
      emit("error", { reason: err.message });
      throw err;
    }
  }

  async function play() {
    await Tone.start(); // requires a user gesture the first time
    Tone.Transport.start();
    playing = true;
  }

  function stop() {
    Tone.Transport.stop();
    Tone.Transport.position = 0;
    playing = false;
    emit("step", 0);
  }

  return {
    load,
    play,
    stop,
    isPlaying: () => playing,
    on: (event, cb) => { (listeners[event] ||= []).push(cb); },
    dispose: () => { teardown(); },
    // exportWav(song) {}  // stretch goal — Tone.Offline render
  };
}
