import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { HalfFloatType, WebGLRenderTarget, type Camera, type Object3D, type Scene, type WebGLRenderer } from "three";

type Props = {
  postProcessing: boolean;
};

type WarmupParams = {
  gl: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  postProcessing: boolean;
};

type ForcedObject = {
  object: Object3D;
  visible: boolean;
  frustumCulled: boolean;
};

const WarmupStage = {
  WAITING: { name: "WAITING", value: "waiting" },
  COMPILING: { name: "COMPILING", value: "compiling" },
  COMPILED: { name: "COMPILED", value: "compiled" },
  DRAWN: { name: "DRAWN", value: "drawn" },
} as const;

type WarmupStage = (typeof WarmupStage)[keyof typeof WarmupStage]["value"];

function createWarmupTarget(postProcessing: boolean): WebGLRenderTarget | null {
  return postProcessing ? new WebGLRenderTarget(1, 1, { type: HalfFloatType }) : null;
}

function compileScene({ gl, scene, camera, postProcessing }: WarmupParams): Promise<unknown> {
  const target = createWarmupTarget(postProcessing);
  const previous = gl.getRenderTarget();
  gl.setRenderTarget(target);
  const compiled = gl.compileAsync(scene, camera);
  gl.setRenderTarget(previous);
  return compiled.finally(() => target?.dispose());
}

function forceEverythingDrawn(scene: Scene): ForcedObject[] {
  const forced: ForcedObject[] = [];
  scene.traverse((object) => {
    if (object.visible && !object.frustumCulled) {
      return;
    }
    forced.push({ object, visible: object.visible, frustumCulled: object.frustumCulled });
    object.visible = true;
    object.frustumCulled = false;
  });
  return forced;
}

function drawEveryMaterialOnce({ gl, scene, camera, postProcessing }: WarmupParams) {
  const forced = forceEverythingDrawn(scene);
  const previous = gl.getRenderTarget();
  const target = createWarmupTarget(postProcessing);
  try {
    gl.setRenderTarget(target ?? previous);
    gl.render(scene, camera);
  } finally {
    gl.setRenderTarget(previous);
    target?.dispose();
    for (const { object, visible, frustumCulled } of forced) {
      object.visible = visible;
      object.frustumCulled = frustumCulled;
    }
  }
}

export function ArenaShaderWarmup({ postProcessing }: Props) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const stage = useRef<WarmupStage>(WarmupStage.WAITING.value);

  useEffect(() => {
    stage.current = WarmupStage.WAITING.value;
  }, [gl, scene, camera, postProcessing]);

  useFrame(() => {
    if (stage.current === WarmupStage.WAITING.value) {
      stage.current = WarmupStage.COMPILING.value;
      void compileScene({ gl, scene, camera, postProcessing }).then(() => {
        stage.current = WarmupStage.COMPILED.value;
      });
      return;
    }
    if (stage.current === WarmupStage.COMPILED.value) {
      stage.current = WarmupStage.DRAWN.value;
      drawEveryMaterialOnce({ gl, scene, camera, postProcessing });
    }
  });

  return null;
}
