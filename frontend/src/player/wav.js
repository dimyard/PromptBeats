// PCM16 WAV encoder. Owner: Human C. Implements the audio-render side of
// Contract 4 from ../../../CONTRACTS.md. Pure and dependency-free (no Tone,
// no DOM) so it can be unit-tested with a plain stub buffer.

/**
 * Encode an AudioBuffer-like object into a PCM16 WAV (RIFF/WAVE, format 1,
 * little-endian, interleaved channels, 16-bit).
 *
 * Works with any object exposing `numberOfChannels`, `length`, `sampleRate`
 * and `getChannelData(i): Float32Array` — this keeps it testable without
 * WebAudio. Float samples are clamped to [-1, 1] before conversion to int16.
 *
 * @param {{ numberOfChannels: number, length: number, sampleRate: number,
 *   getChannelData: (channel: number) => Float32Array }} audioBuffer
 * @returns {ArrayBuffer} the complete .wav file bytes
 */
export function audioBufferToWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true); // ChunkSize = 4 + (8 + fmtSize) + (8 + dataSize)
  writeString(8, "WAVE");

  // fmt subchunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size for PCM
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data subchunk
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Pre-fetch channel data once; write samples interleaved.
  const channels = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = channels[ch][i];
      // Clamp to [-1, 1] then scale to signed 16-bit range.
      sample = Math.max(-1, Math.min(1, sample));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16 | 0, true);
      offset += 2;
    }
  }

  return buffer;
}
