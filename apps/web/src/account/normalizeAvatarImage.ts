import { encodeAvatarWithinLimit, type AvatarEncoding } from "./encodeAvatarWithinLimit";

/** What the player adjusted in the crop window: a zoom factor and where the window sits. */
export type AvatarCrop = {
  /** 1 shows as much of the picture as the square allows; larger values crop in. */
  zoom: number;
  /** -1 (left/top edge) … 1 (right/bottom edge). 0 centres the window. */
  offsetX: number;
  offsetY: number;
};

export const MIN_AVATAR_ZOOM = 1;
export const MAX_AVATAR_ZOOM = 3;

export const CENTRED_AVATAR_CROP: AvatarCrop = { zoom: MIN_AVATAR_ZOOM, offsetX: 0, offsetY: 0 };

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_AVATAR_ZOOM;
  return Math.min(MAX_AVATAR_ZOOM, Math.max(MIN_AVATAR_ZOOM, zoom));
}

export function clampOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(1, Math.max(-1, offset));
}

/** Keeps a crop inside its bounds; the UI feeds this every pointer move and slider step. */
export function clampAvatarCrop(crop: AvatarCrop): AvatarCrop {
  return { zoom: clampZoom(crop.zoom), offsetX: clampOffset(crop.offsetX), offsetY: clampOffset(crop.offsetY) };
}

/** Side of the square crop window, in source pixels. The window never leaves the picture. */
export function cropSide(width: number, height: number, zoom: number): number {
  const shortest = Math.min(width, height);
  if (shortest <= 0) throw new Error("empty_image");
  return shortest / clampZoom(zoom);
}

/**
 * Where to read from the source bitmap. `slack` is the room the picture has around the crop
 * window; a fully zoomed-out landscape picture therefore pans horizontally but not vertically.
 */
export function cropSourceRect(
  crop: AvatarCrop,
  width: number,
  height: number,
): { sx: number; sy: number; side: number } {
  const { zoom, offsetX, offsetY } = clampAvatarCrop(crop);
  const side = cropSide(width, height, zoom);
  const slackX = (width - side) / 2;
  const slackY = (height - side) / 2;
  return { sx: slackX + offsetX * slackX, sy: slackY + offsetY * slackY, side };
}

/**
 * Converts a drag in stage pixels into a change of offset. The stage shows the crop window at
 * `stageSide` pixels, so a pointer moves the window by that fraction of its slack — dragging the
 * picture right moves the window left, hence the sign flip.
 */
export function dragToOffset(
  crop: AvatarCrop,
  dragX: number,
  dragY: number,
  width: number,
  height: number,
  stageSide: number,
): { offsetX: number; offsetY: number } {
  const { zoom } = clampAvatarCrop(crop);
  const side = cropSide(width, height, zoom);
  const slackX = (width - side) / 2;
  const slackY = (height - side) / 2;
  const scale = stageSide > 0 ? side / stageSide : 0;
  return {
    offsetX: slackX > 0 ? clampOffset(crop.offsetX - (dragX * scale) / slackX) : 0,
    offsetY: slackY > 0 ? clampOffset(crop.offsetY - (dragY * scale) / slackY) : 0,
  };
}

function assertSupported(file: File): void {
  if (file.type !== "image/png" && file.type !== "image/jpeg") throw new Error("unsupported_image");
}

/** Decodes the chosen file once; the dialog pans and zooms this bitmap instead of re-reading the file. */
export async function decodeAvatarFile(file: File): Promise<ImageBitmap> {
  assertSupported(file);
  return createImageBitmap(file);
}

function canvasToBlob(
  width: number,
  height: number,
  encoding: AvatarEncoding,
  draw: (context: CanvasRenderingContext2D) => void,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  context.imageSmoothingQuality = "high";
  if (encoding.type === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  draw(context);
  const quality = encoding.type === "image/jpeg" ? encoding.quality : undefined;
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode_failed"))), encoding.type, quality),
  );
}

/**
 * Rasterises the chosen crop to a square picture under the API byte limit: PNG when it fits, then
 * JPEG at falling quality, then a smaller edge. Drawing drops EXIF, ICC and every other metadata block.
 */
export function renderAvatarCrop(image: ImageBitmap, crop: AvatarCrop): Promise<Blob> {
  const { sx, sy, side } = cropSourceRect(crop, image.width, image.height);
  return encodeAvatarWithinLimit((edge, encoding) =>
    canvasToBlob(edge, edge, encoding, (context) => context.drawImage(image, sx, sy, side, side, 0, 0, edge, edge)),
  );
}

/**
 * Re-encodes the file through a canvas before it leaves the browser: it bounds the bytes the API
 * receives and drops EXIF, ICC and every other metadata block as a side effect of rasterising.
 * Kept for callers that do not want the crop step.
 */
export async function normalizeAvatarImage(file: File): Promise<Blob> {
  const bitmap = await decodeAvatarFile(file);
  try {
    return await encodeAvatarWithinLimit((edge, encoding) => {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      return canvasToBlob(width, height, encoding, (context) => context.drawImage(bitmap, 0, 0, width, height));
    });
  } finally {
    bitmap.close();
  }
}
