import * as THREE from 'three';

/** Integrate a feathered density across the beam, rather than painting the
 * outer cone with a constant alpha (which reads as a flat triangular sheet).
 * This is a bounded ten-sample visual approximation, not full volumetrics. */
export function createBeaconVolume(){
  const geometry=new THREE.ConeGeometry(.48,3.8,48,1,false);
  geometry.rotateX(-Math.PI/2);geometry.translate(0,0,1.9);
  const uniforms={strength:{value:0},haze:{value:1},ray:{value:new THREE.Vector3(0,0,1)},origin:{value:new THREE.Vector3()},orthographic:{value:1}};
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.FrontSide,blending:THREE.AdditiveBlending,toneMapped:false,uniforms,
    vertexShader:'varying vec3 point;void main(){point=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`
      uniform float strength;uniform float haze;uniform vec3 ray;uniform vec3 origin;uniform float orthographic;
      varying vec3 point;
      void main(){
        if(strength<.001)discard;
        vec3 direction=orthographic>.5?ray:normalize(point-origin);
        float span=min(4.0,(.04+.96*clamp(point.z/3.8,0.0,1.0))/max(length(direction.xy),.25));
        float ds=span/10.0,density=0.0;
        for(int i=0;i<10;i++){
          vec3 q=point+direction*(float(i)+.5)*ds;
          float radius=max(q.z*.1263158,.002);
          float radial=length(q.xy)/radius;
          float soft=1.0-smoothstep(.05,1.0,radial);
          float axial=smoothstep(.02,.16,q.z)*(1.0-smoothstep(2.7,3.8,q.z));
          // Flux drops as the cone widens; otherwise its far end would look
          // brighter than the lamp, like a detached cloud.
          if(q.z>0.0&&q.z<3.8)density+=soft*axial*exp(-q.z*.15)*ds/(.18+.65*q.z*q.z);
        }
        float alpha=1.0-exp(-density*strength*haze*.45);
        gl_FragColor=vec4(1.0,.83,.57,alpha);
      }`
  });
  const beam=new THREE.Mesh(geometry,material);beam.name='LighthouseBeam';
  beam.visible=false;
  beam.castShadow=beam.receiveShadow=false;beam.userData.ignoreHeightfield=true;
  const inverse=new THREE.Matrix4();
  let suppressed=false,savedStart=0,savedCount=Infinity;
  beam.onBeforeRender=(_renderer,scene,camera,_geometry,renderMaterial)=>{
    // Override passes replace this shader, losing its strength/discard and
    // transparency. Keep the volume out of their normal/depth silhouettes.
    if(scene.overrideMaterial!==null||renderMaterial!==material){
      savedStart=geometry.drawRange.start;savedCount=geometry.drawRange.count;suppressed=true;
      geometry.setDrawRange(0,0);
      beam.userData.auxiliaryPassSkips=(beam.userData.auxiliaryPassSkips??0)+1;
      return;
    }
    inverse.copy(beam.matrixWorld).invert();
    camera.getWorldDirection(uniforms.ray.value).transformDirection(inverse);
    camera.getWorldPosition(uniforms.origin.value).applyMatrix4(inverse);
    uniforms.orthographic.value=camera instanceof THREE.OrthographicCamera?1:0;
  };
  beam.onAfterRender=()=>{
    if(suppressed){geometry.setDrawRange(savedStart,savedCount);suppressed=false;}
  };
  const setStrength=(value:number)=>{uniforms.strength.value=value;beam.visible=value>=.001;};
  return {beam,material,setStrength};
}
