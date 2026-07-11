import { test } from "node:test";
import assert from "node:assert/strict";
import { audioBufferToWav } from "./wav.js";

const SAMPLE_RATE = 44100;
const LENGTH = 100;
const NUM_CHANNELS = 2;

// Known per-channel values, including clipping ones (>1 and <-1).
// left[0]  =  0     -> 0
// left[1]  =  1     -> +32767
// left[2]  =  2     -> clamps to 1 -> +32767
// left[3]  = -1     -> -32768
// left[4]  = -2     -> clamps to -1 -> -32768
// left[5]  =  0.5   -> 0.5 * 32767 = 16383.5 truncated by | 0 to 16383
//                      (right[5] = -0.5 -> -0.5 * 32768 = -16384 exact)
// right[i] = -left[i]
function makeStubBuffer() {
  const left = new Float32Array(LENGTH);
  const right = new Float32Array(LENGTH);
  left[0] = 0;
  left[1] = 1;
  left[2] = 2;
  left[3] = -1;
  left[4] = -2;
  left[5] = 0.5;
  for (let i = 0; i < LENGTH; i++) right[i] = -left[i];
  return {
    numberOfChannels: NUM_CHANNELS,
    length: LENGTH,
    sampleRate: SAMPLE_RATE,
    getChannelData(channel) {
      return channel === 0 ? left : right;
    },
  };
}

const readString = (view, offset, len) => {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
};

test("audioBufferToWav writes a valid PCM16 RIFF/WAVE header", () => {
  const ab = audioBufferToWav(makeStubBuffer());
  assert.ok(ab instanceof ArrayBuffer, "returns an ArrayBuffer");
  const view = new DataView(ab);

  const bytesPerSample = 2;
  const blockAlign = NUM_CHANNELS * bytesPerSample;
  const dataSize = LENGTH * blockAlign;

  // Signatures.
  assert.equal(readString(view, 0, 4), "RIFF");
  assert.equal(readString(view, 8, 4), "WAVE");
  assert.equal(readString(view, 12, 4), "fmt ");
  assert.equal(readString(view, 36, 4), "data");

  // fmt subchunk fields.
  assert.equal(view.getUint32(16, true), 16, "Subchunk1Size == 16 (PCM)");
  assert.equal(view.getUint16(20, true), 1, "AudioFormat == 1 (PCM)");
  assert.equal(view.getUint16(22, true), NUM_CHANNELS, "numChannels == 2");
  assert.equal(view.getUint32(24, true), SAMPLE_RATE, "sampleRate == 44100");
  assert.equal(view.getUint32(28, true), SAMPLE_RATE * blockAlign, "byteRate");
  assert.equal(view.getUint16(32, true), blockAlign, "blockAlign");
  assert.equal(view.getUint16(34, true), 16, "bitsPerSample == 16");

  // Chunk sizes.
  assert.equal(view.getUint32(40, true), dataSize, "data chunk size == length*numChannels*2");
  assert.equal(view.getUint32(4, true), 36 + dataSize, "RIFF chunk size == 36 + dataSize");
  assert.equal(ab.byteLength, 44 + dataSize, "total file size == 44 + dataSize");
});

test("audioBufferToWav clamps and interleaves samples to int16 bounds", () => {
  const ab = audioBufferToWav(makeStubBuffer());
  const view = new DataView(ab);

  // Interleaved: frame i -> [left, right] at offset 44 + i*4.
  const leftAt = (i) => view.getInt16(44 + i * 4, true);
  const rightAt = (i) => view.getInt16(44 + i * 4 + 2, true);

  const MAX = 32767; // 0x7fff
  const MIN = -32768; // -0x8000

  // 0 -> 0
  assert.equal(leftAt(0), 0);
  assert.equal(rightAt(0), 0);

  // 1 -> +MAX ; right = -1 -> MIN
  assert.equal(leftAt(1), MAX);
  assert.equal(rightAt(1), MIN);

  // 2 clamps to 1 -> +MAX ; right = -2 clamps to -1 -> MIN
  assert.equal(leftAt(2), MAX);
  assert.equal(rightAt(2), MIN);

  // -1 -> MIN ; right = 1 -> +MAX
  assert.equal(leftAt(3), MIN);
  assert.equal(rightAt(3), MAX);

  // -2 clamps to -1 -> MIN ; right = 2 clamps to 1 -> +MAX
  assert.equal(leftAt(4), MIN);
  assert.equal(rightAt(4), MAX);

  // Positive uses 0x7fff scale: 0.5 * 32767 = 16383.5 truncated to 16383.
  // Negative uses 0x8000 scale: -0.5 * 32768 = -16384 (exact).
  assert.equal(leftAt(5), 16383);
  assert.equal(rightAt(5), -16384);
});
