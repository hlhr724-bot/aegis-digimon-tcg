import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { HalfFloatType } from "three";

type Props = {
  isLight: boolean;
};

export function ArenaPostEffects({ isLight }: Props) {
  return (
    <EffectComposer frameBufferType={HalfFloatType} multisampling={0}>
      <Bloom
        mipmapBlur
        luminanceThreshold={isLight ? 1.6 : 1}
        luminanceSmoothing={0.25}
        intensity={isLight ? 0.25 : 0.7}
        radius={0.75}
      />
      <Vignette offset={0.3} darkness={isLight ? 0.18 : 0.5} />
    </EffectComposer>
  );
}
