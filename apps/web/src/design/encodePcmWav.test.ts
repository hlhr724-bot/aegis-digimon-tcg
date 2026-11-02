import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUDIO_CUES } from "./audioBank";
import { encodePcmWav } from "./encodePcmWav";
import { splitCueWav } from "./mediaAudio";

const bank = readFileSync("public/audio/aegis-cues-v2.wav");

function decodedLikeWebAudio(wav: Buffer) {
  const samples = new Float32Array((wav.length - 44) / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = wav.readInt16LE(44 + i * 2) / 32768;
  return {
    numberOfChannels: 1,
    sampleRate: wav.readUInt32LE(24),
    length: samples.length,
    getChannelData: () => samples,
  };
}

describe("encodePcmWav", () => {
  it("rebuilds the shipped PCM bank exactly from decoded samples", () => {
    const encoded = encodePcmWav(decodedLikeWebAudio(bank));
    expect(Buffer.from(encoded).equals(bank)).toBe(true);
    expect(splitCueWav(encoded).size).toBe(Object.keys(AUDIO_CUES).length);
  });

  it("interleaves channels and clamps samples outside the PCM16 range", () => {
    const channels = [new Float32Array([1.5, -0.5]), new Float32Array([-2, 0.25])];
    const encoded = new DataView(
      encodePcmWav({
        numberOfChannels: 2,
        sampleRate: 44100,
        length: 2,
        getChannelData: (channel) => channels[channel]!,
      }),
    );
    expect(encoded.getUint16(22, true)).toBe(2);
    expect(encoded.getUint32(28, true)).toBe(44100 * 4);
    expect([0, 1, 2, 3].map((index) => encoded.getInt16(44 + index * 2, true))).toEqual([32767, -32768, -16384, 8192]);
  });
});
