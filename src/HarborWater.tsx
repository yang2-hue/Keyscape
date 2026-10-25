import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { HARBOR,roundedSquarePoint, type Heightfield } from './harbor-layout';
import type {WaterDynamics} from './water-dynamics';
import type {ThreeEvent} from '@react-three/fiber';

const UP=new THREE.Vector3(0,1,0);
/** Stable identities: passing a fresh array literal would invalidate the
 * uniforms memo on every parent render and reset the time/dusk damped values. */
const NO_SWELL:[number,number]=[0,-1];
/** Faces that can be clicked as water: all three vertices point up. */
export function surfaceUpFaces(geometry:THREE.BufferGeometry){
  const n=geometry.getAttribute('normal');let up=0;
  for(let i=0;i<n.count;i+=3)if(n.getY(i)>.5&&n.getY(i+1)>.5&&n.getY(i+2)>.5)up++;
  return up;
}
const vertex=`
  uniform sampler2D waves;
  uniform float time;uniform float swellAmp;uniform vec2 swellDir;uniform float level;
  varying vec3 waterPoint;varying vec3 worldPoint;varying vec3 waterNormal;varying vec3 viewPoint;
  varying float waveHeight;
  void main(){vec3 p=position;waterNormal=normal;
    float top=smoothstep(.5,.9,normal.y);
    float upper=smoothstep(level-.04,level-.01,p.y);
    waveHeight=texture2D(waves,(p.xz+1.6)/3.2).r*upper;
    waveHeight+=swellAmp*sin(dot(p.xz,swellDir)*2.6-time*1.15)*upper;
    p.y+=waveHeight;waterPoint=p;
    vec4 world=modelMatrix*vec4(p,1.0);worldPoint=world.xyz;
    vec4 view=modelViewMatrix*vec4(p,1.0);viewPoint=view.xyz;
    gl_Position=projectionMatrix*view;
  }`;
const fragment=`
  uniform sampler2D sceneColor;uniform sampler2D sceneDepth;
  uniform sampler2D waves;uniform sampler2D bedHeights;
  uniform mat4 inverseProjection;uniform mat4 inverseWater;uniform mat4 waterMatrix;
  uniform vec2 resolution;uniform float time;uniform float rain;uniform float dusk;
  uniform float level;uniform float deepTint;
  uniform float swellAmp;uniform vec2 swellDir;
  uniform float orthographic;uniform vec3 cameraRay;
  varying vec3 waterPoint;varying vec3 worldPoint;varying vec3 waterNormal;varying vec3 viewPoint;
  varying float waveHeight;
  vec3 viewAt(vec2 uv,float d){vec4 p=inverseProjection*vec4(uv*2.0-1.0,d*2.0-1.0,1.0);return p.xyz/p.w;}
  void main(){
    vec2 uv=gl_FragCoord.xy/resolution;
    float top=smoothstep(.5,.9,waterNormal.y);
    vec2 p=waterPoint.xz;
    vec4 wave=texture2D(waves,(p+1.6)/3.2);
    float swellPhase=dot(p,swellDir)*2.6-time*1.15;
    float dx=wave.b+swellDir.x*swellAmp*2.6*cos(swellPhase)+.010*cos(p.x*63.0+p.y*37.0-time*.8);
    float dz=wave.a+swellDir.y*swellAmp*2.6*cos(swellPhase)+.009*cos(p.y*59.0-p.x*43.0+time*.7);
    vec3 localN=normalize(waterNormal+vec3(-dx,0.0,-dz)*top*(1.0+rain*.45));
    vec3 N=normalize(mat3(waterMatrix)*localN),V=orthographic>.5?-cameraRay:normalize(cameraPosition-worldPoint);
    vec2 offset=vec2(dx,dz)*.014*top;
    vec2 refractedUV=clamp(uv+offset,vec2(.001),vec2(.999));
    float sampleDepth=texture2D(sceneDepth,refractedUV).r;
    vec3 behind=viewAt(refractedUV,sampleDepth);
    if(behind.z>viewPoint.z+.005){refractedUV=uv;sampleDepth=texture2D(sceneDepth,uv).r;behind=viewAt(uv,sampleDepth);}
    vec3 source=texture2D(sceneColor,refractedUV).rgb;
    vec3 ray=normalize(mat3(inverseWater)*(orthographic>.5?cameraRay:worldPoint-cameraPosition));
    vec3 farFace=mix(vec3(-1.59,-.585,-1.59),vec3(1.59,level,1.59),step(vec3(0),ray));
    vec3 axisDistance=(farFace-waterPoint)/(sign(ray)*max(abs(ray),vec3(.00001)));
    float exitDistance=max(.005,min(axisDistance.x,min(axisDistance.y,axisDistance.z)));
    float opticalDepth=sampleDepth>.9999?exitDistance:min(length(behind-viewPoint),exitDistance);
    opticalDepth=clamp(opticalDepth,.015,1.8);
    vec3 absorption=exp(-vec3(2.7,.62,.30)*opticalDepth);
    vec3 scatter=mix(vec3(.025,.32,.39),vec3(.012,.15,.22),dusk*.65+rain*.12);
    vec3 transmitted=source*absorption+scatter*(vec3(1)-absorption)*.7;
    float seaDepth=level-texture2D(bedHeights,(p+1.6)/3.2).r;
    transmitted=mix(transmitted,vec3(.018,.19,.27),deepTint*smoothstep(.32,.67,seaDepth)*.48);
    float cosV=max(dot(N,V),0.0);
    float fresnel=.02+.30*pow(1.0-cosV,5.0);
    vec3 sky=mix(mix(vec3(.50,.71,.76),vec3(.25,.44,.53),deepTint),vec3(.13,.23,.31),dusk*.8+rain*.2);
    vec3 color=mix(transmitted,sky,fresnel);
    vec3 L=normalize(vec3(-3.0,7.0,4.0)-worldPoint);
    float sun=pow(max(dot(N,normalize(L+V)),0.0),260.0);
    color+=vec3(1.0,.96,.85)*sun*.6*(1.0-rain*.8);
    float fine=pow(max(0.0,sin(p.x*63.0+p.y*14.0+time*.8)*cos(p.y*47.0-time*.5)),16.0);
    color+=vec3(.05,.075,.08)*fine*top*(1.0-deepTint*.85);
    float depth=level+waveHeight-texture2D(bedHeights,(p+1.6)/3.2).r;
    float shore=smoothstep(.0,.015,depth)*(1.0-smoothstep(.03,.10,depth));
    float broken=.5+.5*sin(p.x*107.0+sin(p.y*83.0)*2.0-time*.8);
    float crest=smoothstep(.022,.060,waveHeight)*smoothstep(.12,.45,length(wave.ba));
    color=mix(color,vec3(.89,.96,.89),top*clamp(shore*broken*.55+crest*.16,0.0,.65));
    gl_FragColor=vec4(color,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Capture the dry scene once. Both interfaces read the same capture, so they
 * never refract each other or produce a second image of the seabed. */
export default function HarborWater({ field, footprint, playing, evening, rainy, dynamics,deepTint=0,swellAmp=0,swellDir=NO_SWELL }: { field: Heightfield; footprint: THREE.Vector2[]; playing: boolean; evening: boolean; rainy: boolean; dynamics?:WaterDynamics;deepTint?:number;swellAmp?:number;swellDir?:[number,number] }) {
  const water=useRef<THREE.Group>(null);
  const size=useThree(state=>state.size);
  const gl=useThree(state=>state.gl);
  const capture=useFBO(Math.round(size.width),Math.round(size.height),{depthBuffer:true});
  const resources=useMemo(()=>{
    const shape=new THREE.Shape();
    footprint.forEach((p,i)=>i?shape.lineTo(p.x,-p.y):shape.moveTo(p.x,-p.y));shape.closePath();
    const top=new THREE.ShapeGeometry(shape,8);
    const surface=new THREE.PlaneGeometry(3.14,3.14,128,128);surface.rotateX(-Math.PI/2);surface.translate(0,HARBOR.water,0);
    const positions=surface.attributes.position;
    for(let i=0;i<positions.count;i++){
      const [x,z]=roundedSquarePoint(positions.getX(i),positions.getZ(i));
      positions.setXYZ(i,x,positions.getY(i),z);
    }
    const foot=new THREE.ExtrudeGeometry(shape,{depth:.14,bevelEnabled:true,bevelSize:.014,bevelThickness:.014,bevelSegments:3,steps:1});
    foot.rotateX(-Math.PI/2);foot.translate(0,-.75,0);
    const footMaterial=new THREE.MeshStandardMaterial({color:'#e6ddc9',roughness:.42});
    const floor=top.clone();floor.rotateX(-Math.PI/2);floor.translate(0,-.53,0);
    const floorMaterial=new THREE.MeshStandardMaterial({color:'#ddd0af',roughness:1});
    floorMaterial.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 sandPoint;');
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nsandPoint=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 sandPoint;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float grain=fract(sin(dot(floor(sandPoint.xz*650.0),vec2(127.1,311.7)))*43758.5453);
        float ripple=sin(sandPoint.x*54.0+sin(sandPoint.z*7.0)*2.0);
        diffuseColor.rgb*=.87+grain*.18+ripple*.025;
      `);
    };
    const points:number[]=[],uv:number[]=[];
    footprint.forEach((p,i)=>{
      const q=footprint[(i+1)%footprint.length],bottom=-.585;
      points.push(p.x,bottom,p.y,q.x,HARBOR.water,q.y,q.x,bottom,q.y,p.x,bottom,p.y,p.x,HARBOR.water,p.y,q.x,HARBOR.water,q.y);
      uv.push(0,0,1,1,1,0,0,0,0,1,1,1);
    });
    const sides=new THREE.BufferGeometry();sides.setAttribute('position',new THREE.Float32BufferAttribute(points,3));sides.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));sides.computeVertexNormals();
    const flat=surface.toNonIndexed();
    const volume=mergeGeometries([flat,sides]);flat.dispose();surface.dispose();sides.dispose();
    if(!volume)throw new Error('Water interfaces could not be combined');
    return {top,foot,footMaterial,floor,floorMaterial,volume};
  },[footprint]);
  const textures=useMemo(()=>{
    const bed=new THREE.DataTexture(field.heights,field.resolution,field.resolution,THREE.RedFormat,THREE.FloatType);bed.minFilter=bed.magFilter=THREE.LinearFilter;bed.needsUpdate=true;
    const blank=new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType);blank.needsUpdate=true;
    return {bed,blank};
  },[field]);
  useEffect(()=>()=>{textures.bed.dispose();textures.blank.dispose();},[textures]);
  const uniforms=useMemo(()=>({sceneColor:{value:capture.texture},sceneDepth:{value:capture.depthTexture},waves:{value:dynamics?.texture??textures.blank},bedHeights:{value:textures.bed},inverseProjection:{value:new THREE.Matrix4()},inverseWater:{value:new THREE.Matrix4()},waterMatrix:{value:new THREE.Matrix4()},resolution:{value:new THREE.Vector2()},time:{value:0},rain:{value:0},dusk:{value:0},level:{value:HARBOR.water},deepTint:{value:deepTint},swellAmp:{value:swellAmp},swellDir:{value:new THREE.Vector2(...swellDir)},orthographic:{value:0},cameraRay:{value:new THREE.Vector3()}}),[capture,textures,dynamics,deepTint,swellAmp,swellDir]);
  const background=useMemo(()=>new THREE.Color('#e9e5dc'),[]);
  useEffect(()=>{
    if(!import.meta.env.DEV)return;
    const debug=window as unknown as Record<string,unknown>;
    debug.__harborDebug={water,resources,dynamics,gl,THREE,get camera(){return cameraForDebug.current;}};
    // Drop the global on unmount, otherwise switching artworks keeps the
    // previous (already disposed) scene and its textures reachable.
    return()=>{if(debug.__harborDebug)delete debug.__harborDebug;};
  },[water,resources,dynamics,gl]);
  const cameraForDebug=useRef<THREE.Camera|null>(null);
  useFrame(({camera})=>{cameraForDebug.current=camera;});
  useEffect(()=>()=>{resources.top.dispose();resources.foot.dispose();resources.footMaterial.dispose();resources.floor.dispose();resources.floorMaterial.dispose();resources.volume.dispose();},[resources]);
  useFrame(({gl,scene,camera},dt)=>{
    if(!water.current)return;
    const delta=Math.min(dt,.05);
    uniforms.deepTint.value=deepTint;
    if(dynamics){uniforms.waves.value=dynamics.texture;uniforms.time.value=dynamics.time;}else if(playing)uniforms.time.value+=delta;
    uniforms.rain.value=THREE.MathUtils.damp(uniforms.rain.value,rainy?1:0,3,delta);
    uniforms.dusk.value=THREE.MathUtils.damp(uniforms.dusk.value,evening?1:0,3,delta);
    uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    uniforms.orthographic.value=camera instanceof THREE.OrthographicCamera?1:0;
    camera.getWorldDirection(uniforms.cameraRay.value);
    gl.getDrawingBufferSize(uniforms.resolution.value);
    water.current.updateWorldMatrix(true,false);
    uniforms.waterMatrix.value.copy(water.current.matrixWorld);
    uniforms.inverseWater.value.copy(water.current.matrixWorld).invert();
    if(import.meta.env.DEV&&!gl.domElement.dataset.geomReport){
      const n=resources.volume.attributes.normal,up=surfaceUpFaces(resources.volume);
      gl.domElement.dataset.geomReport=JSON.stringify({verts:n.count,faces:n.count/3,upFaces:up,ny0:n.getY(0),ny1:n.getY(1),ny2:n.getY(2)});
    }
    const previousTarget=gl.getRenderTarget(),previousBackground=scene.background;
    const previousVisible=water.current.visible;
    background.set(evening?(deepTint?'#243949':'#687b7c'):rainy?'#b8c9c9':'#e9e5dc');
    try {
      water.current.visible=false;scene.background=background;
      gl.setRenderTarget(capture);gl.clear();gl.render(scene,camera);
    } finally {
      water.current.visible=previousVisible;scene.background=previousBackground;gl.setRenderTarget(previousTarget);
    }
  });
  /** The water group is identity inside the rotated study root, so
   * worldToLocal already yields heightfield (study) coordinates. The previous
   * version called localToWorld on an already-world point, pushing every
   * click outside the impulse bounds (waveImpulses stayed 0). */
  function toStudy(point:THREE.Vector3){
    if(!water.current)return null;
    return water.current.worldToLocal(point.clone());
  }
  /** Only a deliberate click raises a wave. Dragging is camera orbit, and
   * treating it as dragging water made the surface shake while rotating.
   * Rays entering through the water skirt first hit a side face, so scan the
   * intersections for the first upward face before rejecting the click. */
  function splash(event:ThreeEvent<PointerEvent>){
    const c=gl.domElement.dataset;c.splashCalls=String(Number(c.splashCalls??0)+1);
    const top=event.intersections?.find(hit=>hit.face&&hit.face.normal.y>=.5)??(event.face&&event.face.normal.y>=.5?event:null);
    c.splashGate=!playing?'paused':!dynamics?'nodyn':!water.current?'nowater':!top?'notop':event.delta>6?'dragged':'ok';
    if(!playing||!dynamics||!water.current||!top)return;
    if(event.delta>6)return;
    const point=toStudy(top.point);
    if(!point)return;
    const accepted=dynamics.addImpulse(point.x,point.z,.040,.090);
    c.splashPoint=`${point.x.toFixed(2)},${point.z.toFixed(2)}`;c.splashAccepted=String(accepted);
    c.splashDepth=String(field.sample(point.x,point.z)-HARBOR.water);
  }
  return <group name="ResinSea">
    <mesh geometry={resources.foot} material={resources.footMaterial} castShadow receiveShadow />
    <mesh geometry={resources.floor} material={resources.floorMaterial} receiveShadow />
    <group ref={water}>
      <mesh geometry={resources.volume} name="CoastalWaterSurface" renderOrder={2} onClick={splash}>
        <shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} side={THREE.FrontSide} />
      </mesh>
    </group>
  </group>;
}

function ShoreFoam({ field, geometry, playing }: { field: Heightfield; geometry: THREE.BufferGeometry; playing: boolean }) {
  const resources=useMemo(()=>{
    const heights=new THREE.DataTexture(field.heights,field.resolution,field.resolution,THREE.RedFormat,THREE.FloatType);
    heights.minFilter=heights.magFilter=THREE.LinearFilter;heights.needsUpdate=true;
    const uniforms={heights:{value:heights},time:{value:0},level:{value:HARBOR.water}};
    return {heights,uniforms};
  },[field]);
  useEffect(()=>()=>resources.heights.dispose(),[resources]);
  useFrame((_,dt)=>{if(playing)resources.uniforms.time.value+=Math.min(dt,.05);});
  return <mesh geometry={geometry} rotation={[-Math.PI/2,0,0]} position={[0,HARBOR.water+.006,0]} renderOrder={4}>
    <shaderMaterial transparent depthWrite={false} uniforms={resources.uniforms}
      vertexShader={'varying vec2 point;void main(){point=vec2(position.x,-position.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'}
      fragmentShader={`uniform sampler2D heights;uniform float time;uniform float level;varying vec2 point;
      void main(){float d=level-texture2D(heights,(point+1.6)/3.2).r;
      float coast=1.0-smoothstep(-.25,.10,point.y);
      float edge=smoothstep(0.0,.012,d)*(1.0-smoothstep(.025,.085,d))*coast;
      float broken=.5+.5*sin(point.x*127.0+sin(point.y*91.0)*2.0);
      float ripple=pow(.5+.5*sin(d*180.0-time*.7+point.x*5.0),10.0);
      gl_FragColor=vec4(.87,.97,.94,edge*(.25+.65*ripple)*broken);}`}
    />
  </mesh>;
}
