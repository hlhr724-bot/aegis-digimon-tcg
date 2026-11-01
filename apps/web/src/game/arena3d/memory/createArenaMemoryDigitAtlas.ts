import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";

export const ARENA_MEMORY_DIGIT_CELLS = 11;

const CELL_SIZE = 64;
const FONT = '800 40px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

export function createArenaMemoryDigitAtlas(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CELL_SIZE * ARENA_MEMORY_DIGIT_CELLS;
  canvas.height = CELL_SIZE;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#ffffff";
    context.font = FONT;
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (let digit = 0; digit < ARENA_MEMORY_DIGIT_CELLS; digit += 1) {
      const label = String(digit);
      const measured = context.measureText(label).width;
      const squeeze = Math.min(1, (CELL_SIZE * 0.86) / Math.max(1, measured));
      context.save();
      context.translate(CELL_SIZE * (digit + 0.5), CELL_SIZE * 0.53);
      context.scale(squeeze, 1);
      context.fillText(label, 0, 0);
      context.restore();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}
