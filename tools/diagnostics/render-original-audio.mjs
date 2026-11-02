import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import ts from "typescript-api";
import { gunzipSync } from "node:zlib";

const licensedMusic = JSON.parse(
  await readFile(new URL("../../apps/web/public/audio/music/manifest.json", import.meta.url), "utf8"),
);
const licensedDefault = licensedMusic.tracks[licensedMusic.defaultTrack];

// Exactly the renderer used to author the shipped bank, not an approximation of browser oscillators.
const source = await readFile(new URL("../../apps/web/src/design/audioRecipes.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const {
  bankRecipes,
  renderCue,
  decodeSourceWav,
  cueKey: audioKey,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const directory = path.resolve(process.argv[2] ?? "apps/web/public/audio");
const sampleRate = Number(process.env.AUDIO_SAMPLE_RATE ?? 48000);
if (![44100, 48000].includes(sampleRate)) throw new Error("Choose 44100 or 48000 Hz");
await mkdir(path.join(directory, "previews"), { recursive: true });
function metrics(samples) {
  let peak = 0,
    sum = 0,
    square = 0,
    maximumStep = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    peak = Math.max(peak, Math.abs(value));
    sum += value;
    square += value * value;
    if (i) maximumStep = Math.max(maximumStep, Math.abs(value - samples[i - 1]));
  }
  return {
    seconds: samples.length / sampleRate,
    peak,
    peakDbFS: 20 * Math.log10(peak),
    rms: Math.sqrt(square / samples.length),
    dc: sum / samples.length,
    maximumStep,
    boundaryStep: Math.abs(samples.at(-1) - samples[0]),
  };
}
async function wav(name, samples) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sampleRate, 24);
  data.writeUInt32LE(sampleRate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
  await writeFile(path.join(directory, name), data);
  return {
    ...metrics(decodeSourceWav(data).samples),
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}
async function flac(input, name) {
  const encoded = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path.join(directory, input),
      "-map_metadata",
      "-1",
      "-fflags",
      "+bitexact",
      "-flags:a",
      "+bitexact",
      "-compression_level",
      "12",
      "-f",
      "flac",
      "pipe:1",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (encoded.error || encoded.status !== 0) {
    throw new Error(`ffmpeg could not encode ${name}: ${encoded.error?.message ?? encoded.stderr}`);
  }
  await writeFile(path.join(directory, name), encoded.stdout);
  return { bytes: encoded.stdout.length, sha256: createHash("sha256").update(encoded.stdout).digest("hex") };
}
const sourcesDirectory = new URL("../../apps/web/public/audio/sources/", import.meta.url);
const sourceFiles = {
  paper: "paper-texture.wav",
  impact: "impact-body.wav",
  crystal: "crystal-rise.wav",
};
const sources = { sampleRate: 44100 };
const sourceHashes = {};
for (const [key, file] of Object.entries(sourceFiles)) {
  const bytes = await readFile(new URL(file, sourcesDirectory));
  sources[key] = decodeSourceWav(bytes).samples;
  sourceHashes[file] = createHash("sha256").update(bytes).digest("hex");
}
const recordedProvenance = JSON.parse(await readFile(new URL("recorded-provenance.json", sourcesDirectory), "utf8"));
sources.recordings = {};
for (const asset of recordedProvenance.assets) {
  const bytes = await readFile(new URL(asset.preparedFile, sourcesDirectory));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== asset.sha256) throw new Error(`Recorded source identity changed: ${asset.id}`);
  sources.recordings[asset.id] = {
    samples: decodeSourceWav(bytes).samples,
    sampleRate: asset.sampleRate,
  };
  sourceHashes[asset.preparedFile] = sha256;
}
const recipes = bankRecipes();
const clips = recipes.map((r) => renderCue(r.kind, r.details, "warm", sampleRate, sources));
const gap = Math.round(sampleRate * 0.025);
const bank = new Float32Array(clips.reduce((length, clip) => length + clip.length + gap, 0));
let frame = 0;
const cues = {};
const manifestClips = [];
for (let i = 0; i < clips.length; i++) {
  const clip = clips[i],
    recipe = recipes[i];
  bank.set(clip, frame);
  cues[recipe.key] = {
    offset: frame / sampleRate,
    duration: clip.length / sampleRate,
  };
  manifestClips.push({
    ...recipe,
    ...cues[recipe.key],
    metrics: metrics(clip),
  });
  frame += clip.length + gap;
}
const bankMetrics = await wav("aegis-cues-v2.wav", bank);
const compressedBank = await flac("aegis-cues-v2.wav", "aegis-cues-v2.flac");
// Preserve prior original renderer for a reproducible, identical-source comparison.
const priorSource = gunzipSync(await readFile(new URL("prior-audio-recipes.ts.gz", sourcesDirectory))).toString("utf8");
const priorCompiled = ts.transpileModule(priorSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const { renderCue: renderPriorCue } = await import(
  `data:text/javascript;base64,${Buffer.from(priorCompiled).toString("base64")}`
);
const comparisonExamples = [
  ["draw", {}, "Draw"],
  ["cardPlay", { cost: 2 }, "Light play"],
  ["cardPlay", { cost: 12 }, "Heavy play"],
  ["effectFocus", {}, "Focus"],
  ["effectActivate", {}, "Effect"],
  ["endTurn", {}, "End turn"],
  ["handTrash", {}, "Hand trash"],
  ["sourceTrash", {}, "Stack trash"],
  ["deDigivolve", {}, "De-digivolution"],
  ["digivolve", { sourceLevel: 3, targetLevel: 4 }, "Evolution 3 to 4"],
  ["digivolve", { sourceLevel: 4, targetLevel: 5 }, "Evolution 4 to 5"],
  ["digivolve", { sourceLevel: 5, targetLevel: 6 }, "Evolution 5 to 6"],
  ["digivolve", { sourceLevel: 3, targetLevel: 6 }, "Evolution 3 to 6"],
];
const priorClips = comparisonExamples.map(([kind, details]) =>
  renderPriorCue(kind, details, "warm", sampleRate, sources),
);
const priorBank = new Float32Array(priorClips.reduce((length, clip) => length + clip.length + gap, 0));
let priorFrame = 0;
const comparisonRows = comparisonExamples.map(([kind, details, label], i) => {
  const key = audioKey(kind, details),
    clip = priorClips[i];
  priorBank.set(clip, priorFrame);
  const row = {
    key,
    kind,
    details,
    label,
    previous: {
      offset: priorFrame / sampleRate,
      duration: clip.length / sampleRate,
      metrics: metrics(clip),
    },
    current: {
      ...cues[key],
      metrics: manifestClips.find((entry) => entry.key === key).metrics,
    },
  };
  priorFrame += clip.length + gap;
  return row;
});
for (let i = 0; i < comparisonRows.length; i++) {
  const file = `previews/prior-${comparisonRows[i].key}.wav`;
  const measured = await wav(file, priorClips[i]);
  Object.assign(comparisonRows[i].previous, {
    url: `/audio/${file}?v=${measured.sha256.slice(0, 12)}`,
    sha256: measured.sha256,
    bytes: measured.bytes,
  });
}
const priorMetrics = await wav("previews/prior-cues.wav", priorBank);
await writeFile(
  path.join(directory, "previews/cue-comparison.json"),
  JSON.stringify(
    {
      version: 1,
      sampleRate,
      channels: 1,
      priorFullBankSha256: "5700989d78a56b4500e5741d3ca06b85fab6e0bcb267c4c341b154b9f3faf420",
      priorRevision: "fd80df166bc38a25df184b729a73eeea6113e56b",
      priorRendererSha256: createHash("sha256").update(priorSource).digest("hex"),
      previous: {
        url: `/audio/previews/prior-cues.wav?v=${priorMetrics.sha256.slice(0, 12)}`,
        ...priorMetrics,
      },
      current: {
        url: `/audio/aegis-cues-v2.wav?v=${bankMetrics.sha256.slice(0, 12)}`,
        ...bankMetrics,
      },
      examples: comparisonRows,
      listeningStatus: "Comparison prepared for listening; no subjective acceptance claimed",
    },
    null,
    2,
  ) + "\n",
);
const examples = [
  ["draw", {}],
  ["cardPlay", { cost: 12 }],
  ["effectActivate", {}],
  ["digivolve", { sourceLevel: 3, targetLevel: 6 }],
  ["impact", {}],
  ["securityHit", {}],
];
const previewMetrics = {};
for (const direction of ["warm", "crisp"]) {
  const preview = new Float32Array(sampleRate * 12);
  for (let i = 0; i < examples.length; i++)
    preview.set(renderCue(...examples[i], direction, sampleRate, sources), Math.round((i * 2 + 0.15) * sampleRate));
  previewMetrics[direction] = await wav(`previews/${direction}-six-cues.wav`, preview);
}
const manifest = {
  version: 2,
  original: false,
  arrangement: "Aegis arrangements of licensed CC0 recorded card/object foley under original tuned tone accents",
  recordedSourceProvenance: "sources/recorded-provenance.json",
  renderer: "apps/web/src/design/audioRecipes.ts",
  rendererSha256: createHash("sha256").update(source).digest("hex"),
  sampleRate,
  channels: 1,
  seedMethod: "FNV-1a cue identity followed by xorshift32",
  selectedDirection: "warm",
  sourceHashes,
  sourceProvenance: "sources/provenance.json",
  directionReason:
    "Natural-rate recorded card flicks, slides, cuts and placements, with original tone accents in A matching the score; the most frequent everyday cues stay foley only",
  bank: { file: "aegis-cues-v2.wav", ...bankMetrics },
  compressedBank: { file: "aegis-cues-v2.flac", ...compressedBank },
  music: {
    ...licensedDefault,
    file: `music/${licensedDefault.file}`,
    original: false,
    originalScore: false,
    selectedId: licensedMusic.defaultTrack,
    alternativeIds: Object.keys(licensedMusic.tracks).filter((id) => id !== licensedMusic.defaultTrack),
    sourceProvenance: "music/manifest.json",
    ...licensedDefault.metrics,
  },
  previews: previewMetrics,
  clips: manifestClips,
};
await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
// Static offsets are bundled; no manifest request or recipe rendering happens at cue time.
if (!process.argv[2])
  await writeFile(
    new URL("../../apps/web/src/design/audioBank.ts", import.meta.url),
    `// Generated by tools/diagnostics/render-original-audio.mjs; do not edit offsets.\nexport const AUDIO_BANK_URL = "/audio/aegis-cues-v2.flac?v=${compressedBank.sha256.slice(0, 12)}";\nexport const PCM_AUDIO_BANK_URL = "/audio/aegis-cues-v2.wav?v=${bankMetrics.sha256.slice(0, 12)}";\nexport { MUSIC_URL } from "./musicTracks";\nexport const AUDIO_CUES: Record<string, { offset: number; duration: number }> = ${JSON.stringify(
      cues,
      null,
      2,
    )
      .replace(/"([A-Za-z][A-Za-z0-9]*)":/g, "$1:")
      .replace(/(duration: [^\n]+)(\n  })/g, "$1,$2")
      .replace(/\n  }(,?)/g, "\n  },")};\n`,
  );
const trackPreviews = Object.values(licensedMusic.tracks)
  .map(
    (track) =>
      `<h2>${track.title}</h2><audio controls loop src="..${track.url.slice(6)}"></audio><p><a href="${track.sourceUrl}">${track.artist}</a> · <a href="${track.licenseUrl}">${track.license}</a> · ${track.modifications}</p>`,
  )
  .join("");
await writeFile(
  path.join(directory, "previews/index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Aegis music and card sounds</title><style>body{background:#0b1020;color:#dceaff;font:16px system-ui;max-width:760px;margin:48px auto;padding:24px}audio{width:100%}a{color:inherit}</style><h1>Aegis music and card sounds</h1><p>Six card cues at two-second intervals. Set the music volume near 25% to approximate the default music bus.</p><h2>Warm tactile</h2><audio controls src="warm-six-cues.wav?v=${previewMetrics.warm.sha256.slice(0, 12)}"></audio><h2>Crisp restrained</h2><audio controls src="crisp-six-cues.wav?v=${previewMetrics.crisp.sha256.slice(0, 12)}"></audio>${trackPreviews}<p><a href="../music/manifest.json">Music sources and licenses</a></p></html>`,
);
console.log(
  JSON.stringify(
    {
      directory,
      clipCount: clips.length,
      bank: bankMetrics,
      music: licensedDefault.metrics,
      previews: previewMetrics,
    },
    null,
    2,
  ),
);
