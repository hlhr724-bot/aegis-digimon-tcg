import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AUDIO_BANK_URL, AUDIO_CUES, PCM_AUDIO_BANK_URL } from "./audioBank";
import {
  SOUND_KINDS,
  audioRecipe,
  bankRecipes,
  cueKey,
  renderCue,
  decodeSourceWav,
  type FoleyKind,
} from "./audioRecipes";

const sourceRoot = new URL("../../public/audio/sources/", import.meta.url);
const sources = {
  sampleRate: 44100,
  paper: decodeSourceWav(readFileSync(new URL("paper-texture.wav", sourceRoot))).samples,
  impact: decodeSourceWav(readFileSync(new URL("impact-body.wav", sourceRoot))).samples,
  crystal: decodeSourceWav(readFileSync(new URL("crystal-rise.wav", sourceRoot))).samples,
};
const recordedProvenance = JSON.parse(readFileSync(new URL("recorded-provenance.json", sourceRoot), "utf8"));
Object.assign(sources, {
  recordings: Object.fromEntries(
    recordedProvenance.assets.map((asset: { id: FoleyKind; preparedFile: string; sampleRate: number }) => [
      asset.id,
      {
        samples: decodeSourceWav(readFileSync(new URL(asset.preparedFile, sourceRoot))).samples,
        sampleRate: asset.sampleRate,
      },
    ]),
  ),
});
function measures(data: Float32Array) {
  let peak = 0,
    sum = 0,
    energy = 0;
  for (const sample of data) {
    peak = Math.max(peak, Math.abs(sample));
    sum += sample;
    energy += sample ** 2;
  }
  return { peak, mean: sum / data.length, energy };
}
describe("authored original bank", () => {
  it("covers every family and variation with distinct material layers, finite headroom and faded edges", () => {
    const recipes = bankRecipes();
    expect(new Set(recipes.map((r) => r.kind))).toEqual(new Set(SOUND_KINDS));
    expect(Object.keys(AUDIO_CUES)).toHaveLength(recipes.length);
    for (const recipe of recipes) {
      const data = renderCue(recipe.kind, recipe.details, "warm", 48000, sources);
      const { peak, mean, energy } = measures(data);
      expect(peak).toBeLessThan(0.3);
      expect(energy).toBeGreaterThan(0.01);
      expect(Math.abs(mean)).toBeLessThan(0.0002);
      expect(data[0]).toBe(0);
      expect(data.at(-1)).toBeCloseTo(0, 7);
      expect(AUDIO_CUES[recipe.key]!.duration).toBe(data.length / 48000);
    }
    expect(audioRecipe("draw").duration).toBeLessThan(0.2);
    expect(() => renderCue("draw")).toThrow(/Recorded foley source required/);
    const foleyOnly = new Set(["select", "nav", "draw", "move", "shuffle"]);
    // Every cue keeps its card foley; the most frequent everyday cues stay foley only.
    expect(recipes.every((recipe) => recipe.layers.some((layer) => layer.texture === "recording"))).toBe(true);
    const toned = recipes.filter((recipe) => recipe.layers.some((layer) => layer.texture !== "recording"));
    expect(new Set(toned.map((recipe) => recipe.kind))).toEqual(
      new Set(SOUND_KINDS.filter((kind) => !foleyOnly.has(kind))),
    );
  });
  it("serves the lossless compressed bank under its content hash", () => {
    const root = new URL("../../public/audio/", import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
    const [path, version] = AUDIO_BANK_URL.split("?v=");
    const flac = readFileSync(new URL(path!.slice(7), root));
    const sha256 = createHash("sha256").update(flac).digest("hex");
    expect(flac.subarray(0, 4).toString("latin1")).toBe("fLaC");
    expect(manifest.compressedBank).toEqual({ file: path!.slice(7), bytes: flac.length, sha256 });
    expect(sha256.startsWith(version!)).toBe(true);
    expect(PCM_AUDIO_BANK_URL).toBe(`/audio/${manifest.bank.file}?v=${manifest.bank.sha256.slice(0, 12)}`);
  });
  it("compares the rejected cue version and exact natural recorded runtime slices", () => {
    const root = new URL("../../public/audio/", import.meta.url);
    const comparison = JSON.parse(readFileSync(new URL("previews/cue-comparison.json", root), "utf8"));
    expect(comparison.examples).toHaveLength(13);
    expect(comparison.current.url).toBe(PCM_AUDIO_BANK_URL);
    for (const version of ["previous", "current"]) {
      const row = comparison[version];
      const wav = readFileSync(new URL(row.url.split("?")[0].slice(7), root));
      expect(createHash("sha256").update(wav).digest("hex")).toBe(row.sha256);
      for (const example of comparison.examples) {
        const clip = example[version];
        const start = 44 + Math.round(clip.offset * 48000) * 2;
        const end = start + Math.round(clip.duration * 48000) * 2;
        expect(wav.readInt16LE(start)).toBe(0);
        expect(wav.readInt16LE(end - 2)).toBe(0);
        expect(end).toBeLessThanOrEqual(wav.length);
      }
    }
    const priorWav = readFileSync(new URL(comparison.previous.url.split("?")[0].slice(7), root));
    for (const example of comparison.examples) {
      const clip = example.previous;
      const single = readFileSync(new URL(clip.url.split("?")[0].slice(7), root));
      const start = 44 + Math.round(clip.offset * 48000) * 2;
      const end = start + Math.round(clip.duration * 48000) * 2;
      expect(createHash("sha256").update(single).digest("hex")).toBe(clip.sha256);
      expect(Buffer.compare(single.subarray(44), priorWav.subarray(start, end))).toBe(0);
      expect(example.current.offset).toBe(AUDIO_CUES[example.key]!.offset);
      expect(example.current.duration).toBe(AUDIO_CUES[example.key]!.duration);
      expect(example.current.metrics.peak).toBeLessThan(0.3);
    }
  });
  it("uses audited CC0 originals and preserves a recorded slide waveform at natural speed", () => {
    expect(
      createHash("sha256")
        .update(readFileSync(new URL("recorded-originals/kenney-casino.zip", sourceRoot)))
        .digest("hex"),
    ).toBe(recordedProvenance.archiveSha256);
    for (const asset of recordedProvenance.assets) {
      expect(asset.license).toBe("CC0-1.0");
      const original = readFileSync(new URL(asset.sourceFile, sourceRoot));
      const prepared = readFileSync(new URL(asset.preparedFile, sourceRoot));
      expect(createHash("sha256").update(original).digest("hex")).toBe(asset.sourceSha256);
      expect(createHash("sha256").update(prepared).digest("hex")).toBe(asset.sha256);
    }
    const recording = decodeSourceWav(readFileSync(new URL("recorded-slide.wav", sourceRoot))).samples;
    const drawn = renderCue("draw", {}, "warm", 48000, sources);
    let dot = 0,
      originalEnergy = 0,
      renderedEnergy = 0;
    for (let i = 96; i < recording.length - 384; i++) {
      dot += recording[i]! * drawn[i]!;
      originalEnergy += recording[i]! ** 2;
      renderedEnergy += drawn[i]! ** 2;
    }
    expect(dot / Math.sqrt(originalEnergy * renderedEnergy)).toBeGreaterThan(0.98);
    const silentSources = {
      ...sources,
      recordings: Object.fromEntries(
        recordedProvenance.assets.map((asset: { id: string }) => [
          asset.id,
          { samples: new Float32Array(1), sampleRate: 48000 },
        ]),
      ),
    };
    expect(measures(renderCue("draw", {}, "warm", 48000, silentSources)).energy).toBe(0);
  });
  it("weights actual printed cost and retains Assembly and physical level jump recipes", () => {
    const light = renderCue("cardPlay", { cost: 2 }, "warm", 48000, sources);
    const heavy = renderCue("cardPlay", { cost: 14 }, "warm", 48000, sources);
    expect(measures(heavy).energy).toBeGreaterThan(measures(light).energy);
    expect(heavy.length).toBeGreaterThan(light.length);
    expect(renderCue("cardPlay", { cost: 2, assembly: true }, "warm", 48000, sources)).not.toEqual(light);
    expect(renderCue("digivolve", { sourceLevel: 3, targetLevel: 6 }, "warm", 48000, sources)).not.toEqual(
      renderCue("digivolve", { sourceLevel: 5, targetLevel: 6 }, "warm", 48000, sources),
    );
    expect(renderCue("handTrash", {}, "warm", 48000, sources)).not.toEqual(
      renderCue("sourceTrash", {}, "warm", 48000, sources),
    );
    expect(renderCue("endTurn", {}, "warm", 48000, sources)).not.toEqual(
      renderCue("turnChange", {}, "warm", 48000, sources),
    );

    const evolution = (sourceLevel: number, targetLevel: number) =>
      audioRecipe("digivolve", { sourceLevel, targetLevel });
    const steps = [evolution(3, 4), evolution(4, 5), evolution(5, 6), evolution(6, 7)];
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.layers.length).toBeGreaterThan(steps[i - 1]!.layers.length);
      expect(steps[i]!.duration).toBeGreaterThan(steps[i - 1]!.duration);
    }
    expect(evolution(3, 5).duration).toBeGreaterThan(evolution(4, 5).duration);

    expect(cueKey("digivolve", { sourceLevel: NaN, targetLevel: Infinity })).toBe("digivolve-3-4");
    expect(cueKey("digivolve", { sourceLevel: 2, targetLevel: 6 })).toBe(
      cueKey("digivolve", { sourceLevel: 4, targetLevel: 6 }),
    );
    expect(cueKey("digivolve", { targetLevel: 6 })).toBe("digivolve-5-6");
    expect(bankRecipes().filter((recipe) => recipe.kind === "digivolve")).toHaveLength(11);
    expect(cueKey("cardPlay", { cost: Infinity })).toBe("cardPlay-5-plain");
    expect(measures(renderCue("effectActivate", {}, "crisp", 48000, sources)).energy).toBeLessThan(
      measures(renderCue("effectActivate", {}, "warm", 48000, sources)).energy,
    );
  });
  it("reproduces seeded output at 44.1 and 48 kHz and proves shipped WAVs use this exact renderer", () => {
    expect(renderCue("draw", {}, "warm", 44100, sources)).toEqual(renderCue("draw", {}, "warm", 44100, sources));
    const root = new URL("../../public/audio/", import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
    const source = readFileSync(new URL("audioRecipes.ts", import.meta.url));
    expect(manifest.rendererSha256).toBe(createHash("sha256").update(source).digest("hex"));
    const wav = readFileSync(new URL("aegis-cues-v2.wav", root));
    for (const [kind, details] of [
      ["draw", {}],
      ["cardPlay", { cost: 12 }],
      ["digivolve", { sourceLevel: 3, targetLevel: 6 }],
    ] as const) {
      const samples = renderCue(kind, details, "warm", 48000, sources);
      const offset = Math.round(AUDIO_CUES[cueKey(kind, details)]!.offset * 48000);
      for (let i = 0; i < samples.length; i += 31)
        expect(wav.readInt16LE(44 + (offset + i) * 2)).toBe(Math.round(samples[i]! * 32767) || 0);
    }
  });
});
