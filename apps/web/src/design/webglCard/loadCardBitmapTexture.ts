import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace, Texture } from "three";

type Params = {
  url: string;
  width: number;
};

async function fetchImageBlob(url: string): Promise<Blob> {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Card image request failed with ${response.status}`);
  }
  return response.blob();
}

async function decodeWithBitmap(blob: Blob, width: number): Promise<Texture> {
  const bitmap = await createImageBitmap(blob, {
    resizeWidth: width,
    resizeQuality: "high",
    imageOrientation: "flipY",
  });
  const texture = new Texture(bitmap);
  texture.flipY = false;
  return texture;
}

async function decodeWithCanvas(blob: Blob, width: number): Promise<Texture> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.max(1, Math.round((image.naturalHeight / Math.max(1, image.naturalWidth)) * width));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new CanvasTexture(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function loadCardBitmapTexture({ url, width }: Params): Promise<Texture> {
  const blob = await fetchImageBlob(url);
  const texture = await decodeWithBitmap(blob, width).catch(() => decodeWithCanvas(blob, width));
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
