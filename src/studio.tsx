import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** SwiftShader / llvmpipe report themselves through WEBGL_debug_renderer_info.
 * Everything expensive (MSAA, soft shadows, transmission) is dropped for them
 * so the study stays interactive instead of freezing the tab. */
export function useSoftwareRenderer() {
  const gl = useThree(state => state.gl);
  return useMemo(() => {
    const context = gl.getContext();
    const info = context.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    return /swiftshader|llvmpipe|software/i.test(renderer);
  }, [gl]);
}

/** A neutral indoor light probe: the miniature is lit like a piece in a vitrine,
 * not like an outdoor scene. */
export function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const room = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(gl);
    const target = generator.fromScene(room, 0.04);
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    scene.environment = target.texture;
    scene.environmentIntensity = 0.25;
    return () => { scene.environment = previous; scene.environmentIntensity = previousIntensity; target.dispose(); generator.dispose(); room.dispose(); };
  }, [gl, scene]);
  return null;
}
