import { useEffect, useState } from "react";
import type { Texture } from "three";
import type { CardTextureCache } from "@/design/webglCard/createCardTextureCache";

type Params = {
  cache: CardTextureCache;
  urls: readonly string[];
};

type LoadedTexture = {
  cache: CardTextureCache;
  key: string;
  texture: Texture | undefined;
};

export function useCardTexture({ cache, urls }: Params): Texture | undefined {
  const key = urls.join("|");
  const [loaded, setLoaded] = useState<LoadedTexture>(() => ({ cache, key, texture: cache.peek(urls) }));

  useEffect(() => {
    if (urls.length === 0) {
      return;
    }
    let active = true;
    void cache.retain(urls).then((texture) => {
      if (active) {
        setLoaded({ cache, key, texture });
      }
    });
    return () => {
      active = false;
      cache.release(urls);
    };
  }, [cache, key]);

  return loaded.cache === cache && loaded.key === key ? loaded.texture : cache.peek(urls);
}
