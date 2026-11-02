export type PcmSource = Pick<AudioBuffer, "numberOfChannels" | "sampleRate" | "length" | "getChannelData">;

export function encodePcmWav(source: PcmSource): ArrayBuffer {
  const channels = Array.from({ length: source.numberOfChannels }, (_, channel) => source.getChannelData(channel));
  const frameBytes = channels.length * 2;
  const dataBytes = source.length * frameBytes;
  const wav = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(wav);
  const text = (at: number, value: string) =>
    [...value].forEach((letter, i) => view.setUint8(at + i, letter.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, source.sampleRate, true);
  view.setUint32(28, source.sampleRate * frameBytes, true);
  view.setUint16(32, frameBytes, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let frame = 0; frame < source.length; frame++) {
    channels.forEach((samples, channel) => {
      const sample = Math.max(-32768, Math.min(32767, Math.round(samples[frame]! * 32768)));
      view.setInt16(44 + frame * frameBytes + channel * 2, sample, true);
    });
  }
  return wav;
}
