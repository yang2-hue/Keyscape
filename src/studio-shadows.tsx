import * as React from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';

type Props = {
  scale?: number | [number, number];
  frames?: number;
  opacity?: number;
  blur?: number;
  far?: number;
  resolution?: number;
  smooth?: boolean;
  color?: string;
  depthWrite?: boolean;
  renderOrder?: number;
  position?: [number, number, number];
};

const horizontalBlurShader = {
  uniforms: {tDiffuse: {value: null as THREE.Texture | null}, h: {value: 1 / 512}},
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float h;varying vec2 vUv;
  void main(){
    vec4 sum=vec4(0.0);
    sum+=texture2D(tDiffuse,vec2(vUv.x-4.0*h,vUv.y))*.051;
    sum+=texture2D(tDiffuse,vec2(vUv.x-3.0*h,vUv.y))*.0918;
    sum+=texture2D(tDiffuse,vec2(vUv.x-2.0*h,vUv.y))*.12245;
    sum+=texture2D(tDiffuse,vec2(vUv.x-1.0*h,vUv.y))*.1531;
    sum+=texture2D(tDiffuse,vec2(vUv.x,vUv.y))*.1633;
    sum+=texture2D(tDiffuse,vec2(vUv.x+1.0*h,vUv.y))*.1531;
    sum+=texture2D(tDiffuse,vec2(vUv.x+2.0*h,vUv.y))*.12245;
    sum+=texture2D(tDiffuse,vec2(vUv.x+3.0*h,vUv.y))*.0918;
    sum+=texture2D(tDiffuse,vec2(vUv.x+4.0*h,vUv.y))*.051;
    gl_FragColor=sum;
  }`,
};
const verticalBlurShader = {
  uniforms: {tDiffuse: {value: null as THREE.Texture | null}, v: {value: 1 / 512}},
  vertexShader: horizontalBlurShader.vertexShader,
  fragmentShader: `uniform sampler2D tDiffuse;uniform float v;varying vec2 vUv;
  void main(){
    vec4 sum=vec4(0.0);
    sum+=texture2D(tDiffuse,vec2(vUv.x,vUv.y-4.0*v))*.051;
    sum+=texture2D(tDiffuse,vec2(vUv.x,vUv.y-3.0*v))*.0918;
    sum+=texture2D(tDiffuse,vec2(vUv.x,vUv.y-2.0*v))*.12245;
    sum+=texture2D(tDiffuse,vec2(vUv.x,vUv.y-1.0*v))*.1531;
    sum+=texture2D(tDiffuse,vec2(vUv.x,vUv.y))*.1633;
    sum+=texture2D(tDiffuse,vec2(vUv.x,vUv.y+1.0*v))*.1531;
    sum+=texture2D(tDiffuse,vec2(vUv.x,vUv.y+2.0*v))*.12245;
    sum+=texture2D(tDiffuse,vec2(vUv.x,vUv.y+3.0*v))*.0918;
    sum+=texture2D(tDiffuse,vec2(vUv.x,vUv.y+4.0*v))*.051;
    gl_FragColor=sum;
  }`,
};

/** Drop-in replacement for drei's ContactShadows with full resource disposal.
 * The upstream component allocates two render targets, a plane geometry and
 * three materials in a useMemo and never frees them, so every remount (our
 * work switcher recaptures via `key`) leaks GPU memory. Everything here is
 * released when the component unmounts. */
export function StudioShadows({ scale = 10, frames = Infinity, opacity = 1, blur = 1, far = 10, resolution = 512, smooth = true, color = '#000000', depthWrite = false, renderOrder, position }: Props) {
  const ref = React.useRef<THREE.Group>(null);
  const scene = useThree(state => state.scene);
  const gl = useThree(state => state.gl);
  const shadowCamera = React.useRef<THREE.OrthographicCamera>(null);
  const width = 1 * (Array.isArray(scale) ? scale[0] : scale || 1);
  const height = 1 * (Array.isArray(scale) ? scale[1] : scale || 1);
  const resources = React.useMemo(() => {
    const renderTarget = new THREE.WebGLRenderTarget(resolution, resolution);
    const renderTargetBlur = new THREE.WebGLRenderTarget(resolution, resolution);
    renderTargetBlur.texture.generateMipmaps = renderTarget.texture.generateMipmaps = false;
    const planeGeometry = new THREE.PlaneGeometry(width, height).rotateX(Math.PI / 2);
    const blurPlane = new THREE.Mesh(planeGeometry);
    const depthMaterial = new THREE.MeshDepthMaterial();
    depthMaterial.depthTest = depthMaterial.depthWrite = false;
    depthMaterial.onBeforeCompile = shader => {
      shader.uniforms = {...shader.uniforms, ucolor: {value: new THREE.Color(color)}};
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform vec3 ucolor;\n           void main() {');
      shader.fragmentShader = shader.fragmentShader.replace('vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'vec4( ucolor * fragCoordZ * 2.0, ( 1.0 - fragCoordZ ) * 1.0 );');
    };
    const horizontalBlurMaterial = new THREE.ShaderMaterial(horizontalBlurShader);
    const verticalBlurMaterial = new THREE.ShaderMaterial(verticalBlurShader);
    verticalBlurMaterial.depthTest = horizontalBlurMaterial.depthTest = false;
    return {renderTarget, renderTargetBlur, planeGeometry, blurPlane, depthMaterial, horizontalBlurMaterial, verticalBlurMaterial};
  }, [resolution, width, height, color]);
  React.useEffect(() => {
    const r = resources;
    return () => {
      r.renderTarget.dispose(); r.renderTargetBlur.dispose(); r.planeGeometry.dispose();
      r.depthMaterial.dispose(); r.horizontalBlurMaterial.dispose(); r.verticalBlurMaterial.dispose();
    };
  }, [resources]);
  const blurShadows = (blur: number) => {
    const r = resources;
    if (!shadowCamera.current) return;
    r.blurPlane.visible = true;
    r.blurPlane.material = r.horizontalBlurMaterial;
    r.horizontalBlurMaterial.uniforms.tDiffuse.value = r.renderTarget.texture;
    r.horizontalBlurMaterial.uniforms.h.value = blur * 1 / 256;
    gl.setRenderTarget(r.renderTargetBlur);
    gl.render(r.blurPlane, shadowCamera.current);
    r.blurPlane.material = r.verticalBlurMaterial;
    r.verticalBlurMaterial.uniforms.tDiffuse.value = r.renderTargetBlur.texture;
    r.verticalBlurMaterial.uniforms.v.value = blur * 1 / 256;
    gl.setRenderTarget(r.renderTarget);
    gl.render(r.blurPlane, shadowCamera.current);
    r.blurPlane.visible = false;
  };
  const count = React.useRef(0);
  useFrame(() => {
    const r = resources;
    if (shadowCamera.current && count.current < frames) {
      count.current++;
      const initialBackground = scene.background, initialOverrideMaterial = scene.overrideMaterial;
      ref.current!.visible = false;
      scene.background = null;
      scene.overrideMaterial = r.depthMaterial;
      gl.setRenderTarget(r.renderTarget);
      gl.render(scene, shadowCamera.current);
      blurShadows(blur);
      if (smooth) blurShadows(blur * .4);
      gl.setRenderTarget(null);
      ref.current!.visible = true;
      scene.overrideMaterial = initialOverrideMaterial;
      scene.background = initialBackground;
    }
  });
  return <group rotation-x={Math.PI / 2} position={position} ref={ref}>
    <mesh renderOrder={renderOrder} geometry={resources.planeGeometry} scale={[1, -1, 1]} rotation={[-Math.PI / 2, 0, 0]}>
      <meshBasicMaterial transparent map={resources.renderTarget.texture} opacity={opacity} depthWrite={depthWrite} />
    </mesh>
    <orthographicCamera ref={shadowCamera} args={[-width / 2, width / 2, height / 2, -height / 2, 0, far]} />
  </group>;
}
