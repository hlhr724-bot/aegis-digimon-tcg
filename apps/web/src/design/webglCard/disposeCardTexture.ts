import type { Texture } from "three";

export function disposeCardTexture(texture: Texture) {
  const image = texture.image as { close?: () => void } | undefined;
  texture.dispose();
  image?.close?.();
}
