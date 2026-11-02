import { useEffect, useMemo } from "react";
import type { Mesh } from "three";
import type { CardTextureCache } from "@/design/webglCard/createCardTextureCache";
import { useCardTexture } from "@/design/webglCard/useCardTexture";
import { ARENA_CARD_GEOMETRY } from "@/game/arena3d/meshes/arenaCardGeometry";
import { buildArenaCardMaterial } from "@/game/arena3d/meshes/buildArenaCardMaterial";

type Props = {
  urls: readonly string[];
  cache: CardTextureCache;
  tint?: string;
  registerMesh: (mesh: Mesh | null) => void;
};

const PLACEHOLDER_COLOR = "#1d3550";

export function ArenaCardFace({ urls, cache, tint, registerMesh }: Props) {
  const material = useMemo(buildArenaCardMaterial, []);
  const texture = useCardTexture({ cache, urls });

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    material.uniforms.uMap!.value = texture ?? null;
    material.uniforms.uHasMap!.value = texture ? 1 : 0;
    material.uniforms.uBaseColor!.value.set(texture ? (tint ?? "#ffffff") : PLACEHOLDER_COLOR);
  }, [material, texture, tint]);

  return <mesh ref={registerMesh} geometry={ARENA_CARD_GEOMETRY} material={material} visible={false} />;
}
