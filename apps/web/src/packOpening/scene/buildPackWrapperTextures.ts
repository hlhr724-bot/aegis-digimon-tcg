import { CanvasTexture, SRGBColorSpace, type Texture } from "three";
import { PACK_STRIP_RATIO } from "@/packOpening/scene/packStripRatio";

type Params = {
  cover: HTMLImageElement | undefined;
  setId: string;
};

export interface PackWrapperTextures {
  stripFront: Texture;
  bodyFront: Texture;
  stripBack: Texture;
  bodyBack: Texture;
  stripRelief: Texture;
  bodyRelief: Texture;
}

const WIDTH = 768;
const HEIGHT = 1536;

function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

type SealParams = {
  context: CanvasRenderingContext2D;
  top: number;
  height: number;
};

function drawFoilSeal({ context, top, height }: SealParams) {
  const gradient = context.createLinearGradient(0, top, 0, top + height);
  gradient.addColorStop(0, "#566173");
  gradient.addColorStop(0.2, "#d4d9e1");
  gradient.addColorStop(0.45, "#8793a3");
  gradient.addColorStop(0.7, "#eef0f3");
  gradient.addColorStop(1, "#677587");
  context.fillStyle = gradient;
  context.fillRect(0, top, WIDTH, height);
  for (let x = 0; x < WIDTH; x += 6) {
    context.fillStyle = "rgba(15, 25, 40, 0.32)";
    context.fillRect(x, top, 2, height);
    context.fillStyle = "rgba(255, 255, 255, 0.36)";
    context.fillRect(x + 2, top, 1, height);
  }
}

function drawFoilFinish(context: CanvasRenderingContext2D) {
  const sheen = context.createLinearGradient(0, 0, WIDTH, HEIGHT * 0.2);
  sheen.addColorStop(0, "rgba(5, 14, 30, 0.24)");
  sheen.addColorStop(0.22, "rgba(255, 255, 255, 0.16)");
  sheen.addColorStop(0.38, "rgba(255, 255, 255, 0)");
  sheen.addColorStop(0.72, "rgba(255, 255, 255, 0.12)");
  sheen.addColorStop(1, "rgba(5, 14, 30, 0.28)");
  context.fillStyle = sheen;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  drawFoilSeal({ context, top: 0, height: HEIGHT * PACK_STRIP_RATIO });
  drawFoilSeal({ context, top: HEIGHT * 0.95, height: HEIGHT * 0.05 });
}

function buildFoilRelief(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }
  const random = createSeededRandom(42);
  const image = context.createImageData(WIDTH, HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const sealed = y < HEIGHT * PACK_STRIP_RATIO || y > HEIGHT * 0.95;
      const edge = Math.abs(x / WIDTH - 0.5) * 2;
      let relief = 128 + Math.sin(x * 0.035 + Math.sin(y * 0.012) * 2) * (5 + edge ** 4 * 18);
      relief += Math.sin(y * 0.085 + x * 0.02) * edge ** 6 * 14;
      if (sealed) {
        relief = 128 + Math.sin((x * Math.PI) / 3) * 55;
      }
      const value = Math.round(relief + (random() - 0.5) * 6);
      const offset = (y * WIDTH + x) * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function drawFallbackArt(context: CanvasRenderingContext2D, setId: string) {
  const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#0b2e55");
  gradient.addColorStop(1, "#06111f");
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "#e9fbff";
  context.font = "bold 54px sans-serif";
  context.textAlign = "center";
  context.fillText(setId, WIDTH / 2, HEIGHT / 2);
}

function drawFront({ cover, setId }: Params): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }
  if (cover) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.drawImage(cover, 0, HEIGHT * PACK_STRIP_RATIO, WIDTH, HEIGHT * (0.95 - PACK_STRIP_RATIO));
  } else {
    drawFallbackArt(context, setId);
  }
  drawFoilFinish(context);
  return canvas;
}

type SliceParams = {
  canvas: HTMLCanvasElement;
  bottom: number;
  height: number;
  color?: boolean;
};

function sliceTexture({ canvas, bottom, height, color = true }: SliceParams): Texture {
  const texture = new CanvasTexture(canvas);
  if (color) {
    texture.colorSpace = SRGBColorSpace;
  }
  texture.anisotropy = 8;
  texture.repeat.set(1, height);
  texture.offset.set(0, bottom);
  return texture;
}

export function buildPackWrapperTextures({ cover, setId }: Params): PackWrapperTextures {
  const front = drawFront({ cover, setId });
  const back = drawFront({ cover, setId });
  const relief = buildFoilRelief();
  const bodyHeight = 1 - PACK_STRIP_RATIO;
  return {
    stripRelief: sliceTexture({ canvas: relief, bottom: bodyHeight, height: PACK_STRIP_RATIO, color: false }),
    bodyRelief: sliceTexture({ canvas: relief, bottom: 0, height: bodyHeight, color: false }),
    stripFront: sliceTexture({ canvas: front, bottom: bodyHeight, height: PACK_STRIP_RATIO }),
    bodyFront: sliceTexture({ canvas: front, bottom: 0, height: bodyHeight }),
    stripBack: sliceTexture({ canvas: back, bottom: bodyHeight, height: PACK_STRIP_RATIO }),
    bodyBack: sliceTexture({ canvas: back, bottom: 0, height: bodyHeight }),
  };
}
