import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export function PackStudioLighting() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const environment = useMemo(() => {
    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, 0.04);
    room.dispose();
    generator.dispose();
    return target;
  }, [gl]);

  useEffect(() => {
    const previous = scene.environment;
    scene.environment = environment.texture;
    return () => {
      scene.environment = previous;
      environment.dispose();
    };
  }, [environment, scene]);

  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight
        castShadow
        position={[2, 7, 6]}
        intensity={1}
        color="#fff3e4"
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.001}
        shadow-normalBias={0.03}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <directionalLight position={[-5, 3, 2]} intensity={0.65} color="#a8c5ff" />
      <directionalLight position={[0, 4, -4]} intensity={1} color="#ffb9df" />
      <mesh receiveShadow rotation-x={-Math.PI / 2} position-y={-0.035}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#101827" roughness={0.85} metalness={0.05} />
      </mesh>
    </>
  );
}
