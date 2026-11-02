import { readFile } from "node:fs/promises";
import { parentPort, workerData } from "node:worker_threads";
import jpeg from "jpeg-js";
import { InferenceSession, Tensor, env } from "onnxruntime-web";
import { PNG } from "pngjs";

type Rgba = { width: number; height: number; data: Uint8Array };

type Request = { id: number; bytes: Uint8Array };

const SIDE = 384;
const NSFW_INDEX = 0;
const { modelPath } = workerData as { modelPath: string };

env.wasm.numThreads = 1;

let sessionPromise: Promise<InferenceSession> | undefined;

function session(): Promise<InferenceSession> {
  sessionPromise ??= readFile(modelPath).then((model) =>
    InferenceSession.create(model, { graphOptimizationLevel: "all" }),
  );
  return sessionPromise;
}

function decode(bytes: Uint8Array): Rgba | undefined {
  const buffer = Buffer.from(bytes);
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: png.data };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    const image = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
    return { width: image.width, height: image.height, data: image.data };
  }
  return undefined;
}

function sample(image: Rgba, x: number, y: number, channel: number): number {
  return image.data[(y * image.width + x) * 4 + channel] ?? 0;
}

function toPixelValues(image: Rgba): Float32Array {
  const pixels = new Float32Array(3 * SIDE * SIDE);
  const scaleX = image.width / SIDE;
  const scaleY = image.height / SIDE;
  for (let y = 0; y < SIDE; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const top = Math.floor(sourceY);
    const bottom = Math.min(image.height - 1, top + 1);
    const weightY = sourceY - top;
    for (let x = 0; x < SIDE; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
      const left = Math.floor(sourceX);
      const right = Math.min(image.width - 1, left + 1);
      const weightX = sourceX - left;
      for (let channel = 0; channel < 3; channel += 1) {
        const upper = sample(image, left, top, channel) * (1 - weightX) + sample(image, right, top, channel) * weightX;
        const lower =
          sample(image, left, bottom, channel) * (1 - weightX) + sample(image, right, bottom, channel) * weightX;
        pixels[channel * SIDE * SIDE + y * SIDE + x] = (upper * (1 - weightY) + lower * weightY) / 127.5 - 1;
      }
    }
  }
  return pixels;
}

function nsfwProbability(logits: Float32Array): number {
  const nsfw = logits[NSFW_INDEX] ?? 0;
  const safe = logits[1 - NSFW_INDEX] ?? 0;
  const peak = Math.max(nsfw, safe);
  const nsfwWeight = Math.exp(nsfw - peak);
  return nsfwWeight / (nsfwWeight + Math.exp(safe - peak));
}

async function classify({ id, bytes }: Request) {
  const image = decode(bytes);
  if (!image) return { id, ok: false, reason: "decode" };
  const model = await session();
  const input = new Tensor("float32", toPixelValues(image), [1, 3, SIDE, SIDE]);
  const output = await model.run({ [model.inputNames[0]!]: input });
  return { id, ok: true, nsfw: nsfwProbability(output[model.outputNames[0]!]!.data as Float32Array) };
}

parentPort?.on("message", (request: Request) => {
  classify(request)
    .then((reply) => parentPort?.postMessage(reply))
    .catch(() => parentPort?.postMessage({ id: request.id, ok: false, reason: "model" }));
});
