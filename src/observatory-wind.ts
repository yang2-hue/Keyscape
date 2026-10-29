import * as THREE from 'three';
import { windNoise } from './observatory-materials';
import { seeded } from './coastal-materials';

/** One wind, shared by everything that moves.
 *
 * The old "wind" moment was 260 point sprites drifting through the air, which
 * is what a screensaver does, not what wind looks like. Wind is legible because
 * of what it acts on: grass leans, dust streams along the ground, grit streaks
 * past. So the moment is rebuilt around three things that all read the same
 * vector and the same clock — a terrain-hugging dust sheet, airborne streaks,
 * and a vertex-shader bend applied to the flora.
 *
 * Wind blows along local +X. The study root is rotated by OBS.rotation, so the
 * world direction differs, but keeping one axis in local space means every
 * shader below can stay trivial and still agree with every other.
 */

export type WindUniforms = {
  time: { value: number };
  strength: { value: number };
};

export function createWindUniforms(): WindUniforms {
  return { time: { value: 0 }, strength: { value: 0 } };
}

const WIND_VERTEX = `
uniform float uWindTime;
uniform float uWindStrength;
uniform float uWindHeight;
`;

/** Bends a plant away from its base.
 *
 * The displacement is computed in the instance's own space but aimed at a world
 * direction: the instance matrix's X and Z columns are the plant's local axes in
 * study space, so projecting the wind onto them (and dividing the scale back
 * out) makes every clump lean the same way no matter how it was rotated. A naive
 * displacement in local space sends half the tussocks upwind. */
export function windify(source: THREE.Material, wind: WindUniforms, height: number) {
  const material = source.clone();
  const uniforms = {
    uWindTime: wind.time,
    uWindStrength: wind.strength,
    uWindHeight: { value: Math.max(0.02, height) },
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_VERTEX}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float lift = clamp(transformed.y / uWindHeight, 0.0, 1.0);
          float bend = pow(lift, 1.7);
          vec3 aim = vec3(1.0, 0.0, 0.0);
          float phase = 0.0;
          #ifdef USE_INSTANCING
            vec3 ax = instanceMatrix[0].xyz;
            vec3 az = instanceMatrix[2].xyz;
            float sx = max(length(ax), 1e-4);
            float sz = max(length(az), 1e-4);
            aim = vec3(dot(aim, ax / sx) / sx, 0.0, dot(aim, az / sz) / sz);
            phase = instanceMatrix[3].x * 5.1 + instanceMatrix[3].z * 3.7;
          #endif
          // Two rates: a slow lean that follows the gust and a fast flutter on
          // top. A single sine reads as breathing, not as weather.
          float gust = 0.55 + 0.42 * sin(uWindTime * 1.35 + phase)
                            + 0.16 * sin(uWindTime * 4.1 + phase * 1.7);
          transformed += aim * (bend * gust * uWindStrength * uWindHeight * 0.55);
        }`);
  };
  // Keep the wind program out of the cache slot used by ordinary standard
  // materials, or the first plant drawn would lend its shader to the drum.
  material.customProgramCacheKey = () => 'q-wind';
  return material;
}

/** Stacked dust layers, not airborne quads.
 *
 * Two attempts failed before this one. Thin flat quads read as white scratches
 * from a camera 30 degrees up; standing veils read as grey panes of glass in
 * front of the drum, because a semi-transparent rectangle over a smooth wall is
 * a smudge however it is tinted.
 *
 * The fix is to stop putting dust *between* the camera and the building at all.
 * Every layer follows the terrain, offset a little higher each time, so the drum
 * always occludes them and the only place dust can appear is on the ground,
 * where it belongs. Three layers at different heights, speeds and tints give the
 * stack enough depth to read as a body of moving air rather than a decal.
 */
export function createDustLayers(terrain: THREE.BufferGeometry, wind: WindUniforms, quality: 'full' | 'software') {
  const size = quality === 'full' ? 256 : 128;
  const layers = [
    { lift: .006, alpha: .20, speed: 1.00, tint: '#cdbf9f', scale: 0.62, threshold: .36 },
    { lift: .034, alpha: .12, speed: 1.45, tint: '#d8cbb0', scale: 0.48, threshold: .42 },
    { lift: .078, alpha: .09, speed: 0.72, tint: '#e6dbc4', scale: 0.36, threshold: .46 },
  ];
  return layers.map((layer, index) => {
    const noise = windNoise(size, index === 0 ? 6 : 5, 4, 881 + index * 97);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uNoise: { value: noise },
        uTime: wind.time,
        uStrength: wind.strength,
        uTint: { value: new THREE.Color(layer.tint) },
        uLift: { value: layer.lift },
        uAlpha: { value: layer.alpha },
        uSpeed: { value: layer.speed },
        uScale: { value: layer.scale },
        uThreshold: { value: layer.threshold },
      },
      vertexShader: `
        uniform float uLift;
        varying vec2 vGround;
        void main(){
          vGround = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position + vec3(0.0, uLift, 0.0), 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uNoise;
        uniform float uTime;
        uniform float uStrength;
        uniform vec3 uTint;
        uniform float uAlpha;
        uniform float uSpeed;
        uniform float uScale;
        uniform float uThreshold;
        varying vec2 vGround;
        void main(){
          if (uStrength < 0.01) discard;
          // Features stretched along +X, the wind axis: isotropic noise reads as
          // frost patches however pale it is tinted. Dust blown across a hillside
          // is drawn out into streaks parallel to the flow.
          vec2 stretch = vec2(uScale * 0.34, uScale * 1.85);
          vec2 uv = vGround * stretch - vec2(uTime * 0.20 * uSpeed, 0.0);
          float a = texture2D(uNoise, uv).r;
          float b = texture2D(uNoise, uv * vec2(0.55, 0.75) + vec2(0.31, 0.17)
                              - vec2(uTime * 0.11 * uSpeed, 0.0)).r;
          float sheet = smoothstep(uThreshold, uThreshold + 0.42, a * 0.72 + b * 0.38);
          // A gust is a band of denser dust crossing the key, not a global fade.
          float gust = 0.55 + 0.45 * sin(vGround.x * 2.1 - uTime * 1.15 + 1.7);
          // Portable inverted smoothstep: edge0 > edge1 is undefined in GLSL.
          float edge = (1.0 - smoothstep(1.30, 1.56, abs(vGround.x)))
                     * (1.0 - smoothstep(1.00, 1.20, abs(vGround.y)));
          gl_FragColor = vec4(uTint, sheet * edge * gust * uStrength * uAlpha);
        }`,
    });
    const mesh = new THREE.Mesh(terrain, material);
    mesh.name = `QWindDust${index}`;
    mesh.renderOrder = 2 + index;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return { mesh, noise };
  });
}
