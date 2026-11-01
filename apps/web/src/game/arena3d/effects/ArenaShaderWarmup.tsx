import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { HalfFloatType, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from "three";

type Props = {
  postProcessing: boolean;
};

type CompileParams = {
  gl: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  postProcessing: boolean;
};

function compileScene({ gl, scene, camera, postProcessing }: CompileParams) {
  const target = postProcessing ? new WebGLRenderTarget(1, 1, { type: HalfFloatType }) : null;
  const previous = gl.getRenderTarget();
  gl.setRenderTarget(target);
  const compiled = gl.compileAsync(scene, camera);
  gl.setRenderTarget(previous);
  void compiled.finally(() => target?.dispose());
}

export function ArenaShaderWarmup({ postProcessing }: Props) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => compileScene({ gl, scene, camera, postProcessing }));
    });
    return () => cancelAnimationFrame(frame);
  }, [gl, scene, camera, postProcessing]);

  return null;
}
