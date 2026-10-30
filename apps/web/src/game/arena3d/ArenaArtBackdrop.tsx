import { useEffect, useState } from "react";
import { SRGBColorSpace, TextureLoader, type Texture } from "three";

type Props = {
  src: string | undefined;
  isLight: boolean;
};

const BACKDROP_WIDTH = 96;

export function ArenaArtBackdrop({ src, isLight }: Props) {
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    if (!src) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    let loaded: Texture | null = null;
    new TextureLoader().load(
      src,
      (result) => {
        result.colorSpace = SRGBColorSpace;
        loaded = result;
        if (cancelled) {
          result.dispose();
          return;
        }
        setTexture(result);
      },
      undefined,
      () => {
        if (!cancelled) {
          setTexture(null);
        }
      },
    );
    return () => {
      cancelled = true;
      loaded?.dispose();
    };
  }, [src]);

  if (!texture) {
    return null;
  }
  const image = texture.image as { width?: number; height?: number } | undefined;
  const aspect = image?.width && image.height ? image.width / image.height : 16 / 9;

  return (
    <mesh position={[0, 8, -34]} rotation-x={0.12}>
      <planeGeometry args={[BACKDROP_WIDTH, BACKDROP_WIDTH / aspect]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={isLight ? 0.55 : 0.4}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
