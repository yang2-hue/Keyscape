import {useEffect,useMemo} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {createCloudGate,updateGateMist} from './cloud-gate';

/** A / 云门: two sandstone legs leaning into a triangular arch, a stone
 * bridge as the crossbar, canyon mist drifting behind, a stream and stone
 * steps for scale. Dynamics are slow (mist drift, dusk lanterns) and never
 * cover the A structure. */
export default function CloudGateStudy({playing,evening,rainy}:{playing:boolean;evening:boolean;rainy:boolean}){
  const gl=useThree(state=>state.gl),time=useMemo(()=>({value:0}),[]);
  const study=useMemo(()=>createCloudGate(time),[time]);
  useEffect(()=>()=>{study.dispose();},[study]);
  useFrame((_,dt)=>{
    const delta=Math.min(dt,.05);
    if(playing)time.value+=delta;
    const t=time.value;
    if(playing)study.mistPlane.position.x=Math.sin(t*.11)*.06;
    updateGateMist(study.mistMaterial,rainy,evening,delta);
    study.lanternMaterial.emissiveIntensity=THREE.MathUtils.damp(study.lanternMaterial.emissiveIntensity,evening?1.45:.15,3,delta);
    if(import.meta.env.DEV){
      const d=gl.domElement.dataset;d.gateTime=String(t);d.study='cloudgate-v01';d.lanternIntensity=String(study.lanternMaterial.emissiveIntensity.toFixed(3));d.mistOpacity=String(study.mistMaterial.uniforms.uOpacity.value.toFixed(3));
    }
  });
  return <group rotation={[0,0,0]} name="CloudGateStudy">
    <primitive object={study.root} dispose={null}/>
  </group>;
}
