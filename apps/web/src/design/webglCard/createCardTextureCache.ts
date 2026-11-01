import type { Texture } from "three";
import { disposeCardTexture } from "@/design/webglCard/disposeCardTexture";
import { loadCardBitmapTexture } from "@/design/webglCard/loadCardBitmapTexture";

type Params = {
  width: number;
  budgetBytes: number;
};

type Entry = {
  promise: Promise<Texture | undefined>;
  texture: Texture | undefined;
  bytes: number;
  holders: number;
  usedAt: number;
};

export type CardTextureCache = {
  retain: (urls: readonly string[]) => Promise<Texture | undefined>;
  release: (urls: readonly string[]) => void;
  peek: (urls: readonly string[]) => Texture | undefined;
  readBytes: () => number;
  dispose: () => void;
};

const MIPMAP_FACTOR = 4 / 3;

function getCacheKey(urls: readonly string[]): string {
  return urls.join("|");
}

function measureTextureBytes(texture: Texture): number {
  const image = texture.image as { width?: number; height?: number } | undefined;
  return Math.round((image?.width ?? 0) * (image?.height ?? 0) * 4 * MIPMAP_FACTOR);
}

function releaseUploadedSource(texture: Texture) {
  const image = texture.image as { width?: number; height?: number; close?: () => void } | undefined;
  texture.onUpdate = null;
  texture.image = { width: image?.width ?? 0, height: image?.height ?? 0 };
  image?.close?.();
}

export function createCardTextureCache({ width, budgetBytes }: Params): CardTextureCache {
  const entries = new Map<string, Entry>();
  let totalBytes = 0;
  let disposed = false;

  async function loadFirst(urls: readonly string[]): Promise<Texture | undefined> {
    for (const url of urls) {
      try {
        return await loadCardBitmapTexture({ url, width });
      } catch {
        continue;
      }
    }
    return undefined;
  }

  function evictIdle() {
    if (totalBytes <= budgetBytes) {
      return;
    }
    const idle = [...entries]
      .filter(([, entry]) => entry.holders === 0 && entry.texture)
      .sort(([, a], [, b]) => a.usedAt - b.usedAt);
    for (const [key, entry] of idle) {
      if (totalBytes <= budgetBytes) {
        return;
      }
      totalBytes -= entry.bytes;
      disposeCardTexture(entry.texture!);
      entries.delete(key);
    }
  }

  function request(urls: readonly string[]): Entry {
    const key = getCacheKey(urls);
    const existing = entries.get(key);
    if (existing) {
      return existing;
    }
    const entry: Entry = {
      promise: Promise.resolve(undefined),
      texture: undefined,
      bytes: 0,
      holders: 0,
      usedAt: performance.now(),
    };
    entry.promise = loadFirst(urls).then((texture) => {
      if (!texture) {
        return undefined;
      }
      if (disposed || entries.get(key) !== entry) {
        disposeCardTexture(texture);
        return undefined;
      }
      entry.texture = texture;
      entry.bytes = measureTextureBytes(texture);
      texture.onUpdate = releaseUploadedSource;
      totalBytes += entry.bytes;
      evictIdle();
      return texture;
    });
    entries.set(key, entry);
    return entry;
  }

  return {
    retain(urls) {
      const entry = request(urls);
      entry.holders += 1;
      entry.usedAt = performance.now();
      return entry.promise;
    },
    release(urls) {
      const entry = entries.get(getCacheKey(urls));
      if (!entry) {
        return;
      }
      entry.holders = Math.max(0, entry.holders - 1);
      entry.usedAt = performance.now();
      evictIdle();
    },
    peek(urls) {
      return entries.get(getCacheKey(urls))?.texture;
    },
    readBytes() {
      return totalBytes;
    },
    dispose() {
      disposed = true;
      for (const entry of entries.values()) {
        if (entry.texture) {
          disposeCardTexture(entry.texture);
        }
      }
      entries.clear();
      totalBytes = 0;
    },
  };
}
