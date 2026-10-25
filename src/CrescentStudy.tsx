import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {createCrescentBay,BERTH,CRESCENT} from './crescent-bay';
import {buildHeightfield,HARBOR} from './harbor-layout';
import {createWaterDynamics} from './water-dynamics';
import {deformFish,fishBend,stepSpring,turnToward} from './scene-motion';
import HarborWater from './HarborWater';
import {Weather} from './weather';

/** Module-level constant: an inline array literal would change identity on
 * every render, rebuild the water uniforms and reset their damped values. */
const SWELL_DIR:[number,number]=[.28,-.96];

/** Fish wander the lagoon individually instead of riding a shared loop:
 * smooth pseudo-random turning, per-fish speed, shallow-water and boat
 * avoidance. Headings are steered back toward the lagoon center. */
export default function CrescentStudy({playing,evening,rainy}:{playing:boolean;evening:boolean;rainy:boolean}){
  const gl=useThree(state=>state.gl),time=useMemo(()=>({value:0}),[]);
  const study=useMemo(()=>createCrescentBay(time),[time]);
  const field=useMemo(()=>buildHeightfield(study.root,HARBOR.size,112),[study]);
  const dynamics=useMemo(()=>createWaterDynamics(gl,field,BERTH),[gl,field]);
  const boat=useRef({heave:{position:HARBOR.water,velocity:0},pitch:{position:0,velocity:0},roll:{position:0,velocity:0}});
  useEffect(()=>{dynamics.initialize();return()=>dynamics.dispose();},[dynamics]);
  useEffect(()=>()=>study.dispose(),[study]);
  useFrame((_,dt)=>{try{dynamics.advance(dt,playing,rainy);time.value=dynamics.time;}catch(e){if(import.meta.env.DEV){gl.domElement.dataset.advanceError=String((e as Error)?.stack??e);}throw e;}if(import.meta.env.DEV){const d=gl.domElement.dataset;d.advanceCalls=String(Number(d.advanceCalls??0)+1);d.advancePlaying=String(playing);d.advanceRainy=String(rainy);d.advanceDt=String(dt);d.advanceSteps=String(dynamics.steps);}}, -2);
  useFrame(({gl,camera},dt)=>{
    const delta=Math.min(dt,.05),t=dynamics.time,heading=BERTH.heading;
    if(playing){
      const sample=dynamics.boat;
      const forward=sample.slopeX*Math.sin(heading)+sample.slopeZ*Math.cos(heading);
      const right=sample.slopeX*Math.cos(heading)-sample.slopeZ*Math.sin(heading);
      stepSpring(boat.current.heave,HARBOR.water+sample.height,delta);
      stepSpring(boat.current.pitch,THREE.MathUtils.clamp(-Math.atan(forward)*.75,-.16,.16),delta,24,8);
      stepSpring(boat.current.roll,THREE.MathUtils.clamp(Math.atan(right)*.75,-.16,.16),delta,24,8);
    }
    study.boat.position.set(BERTH.x,boat.current.heave.position,BERTH.z);
    study.boat.rotation.set(boat.current.pitch.position,heading,boat.current.roll.position);
    study.boat.userData.motionTime=t;
    study.fish.children.forEach((fish,i)=>{
      const phase=i*1.47,effort=.9+i*.045;
      const st=fish.userData.wander??(fish.userData.wander={x:CRESCENT.cx+(i%2?.22:-.26),z:CRESCENT.cz+(i<2?.22:-.18),heading:i*1.9,speed:.085+i*.016,turn:0});
      if(playing){
        // Smooth wandering: two slow sines never repeat a circle.
        st.heading+=(Math.sin(t*.31+phase*3.1)*.55+Math.sin(t*.17+phase*7.3)*.4)*delta*2.4;
        const lookX=st.x+Math.cos(st.heading)*.16,lookZ=st.z+Math.sin(st.heading)*.16;
        const shallow=field.sample(lookX,lookZ)>HARBOR.water-.12;
        const far=Math.hypot(lookX-CRESCENT.cx,lookZ-CRESCENT.cz)>.48;
        if(shallow||far){
          const home=Math.atan2(CRESCENT.cz-st.z,CRESCENT.cx-st.x)+Math.sin(t*.4+phase)*.5;
          st.heading=turnToward(st.heading,home,delta*3.4);
        }else if(Math.hypot(st.x-BERTH.x,st.z-BERTH.z)<.40){
          st.heading=turnToward(st.heading,Math.atan2(st.z-BERTH.z,st.x-BERTH.x),delta*5);
        }
        const previous=fish.rotation.y,vx=Math.cos(st.heading)*st.speed,vz=Math.sin(st.heading)*st.speed;
        st.x+=vx*delta;st.z+=vz*delta;
        fish.rotation.y=turnToward(previous,Math.atan2(-vz,vx),delta);
        st.turn=THREE.MathUtils.clamp(Math.atan2(Math.sin(fish.rotation.y-previous),Math.cos(fish.rotation.y-previous))/Math.max(delta,.001),-.9,.9);
      }
      fish.position.set(st.x,HARBOR.water-.13-(i%2)*.03+Math.sin(t*.65+phase)*.012,st.z);
      fish.rotation.x=st.turn*.10;fish.rotation.z=Math.cos(t*.65+phase)*.035;
      const actor=study.fishActors[i];
      if(playing||!actor.body.userData.posed){
        const positions=actor.body.geometry.attributes.position;
        const bend=deformFish(actor.rest,positions.array as Float32Array,t,phase,effort,st.turn);
        positions.needsUpdate=true;actor.body.geometry.computeVertexNormals();actor.body.userData.posed=true;actor.body.userData.bend=bend;
        actor.tail.position.z=fishBend(-.064,t,phase,effort,st.turn);
        actor.tail.rotation.y=Math.sin(t*(8.5+phase*.2)+phase+1.8)*.55*effort-st.turn*.18;
        actor.fins.forEach((fin,side)=>{fin.rotation.y=(side===0?-1:1)*(.35+Math.sin(t*6+phase)*.18);});
      }
    });
    study.fish.userData.motionTime=t;
    study.lanternMaterial.emissiveIntensity=THREE.MathUtils.damp(study.lanternMaterial.emissiveIntensity,evening?1.6:.18,3,delta);
    // Evening lantern glow: light and halo breathe very slightly, never flicker hard.
    const glow=evening?1.35+.06*Math.sin(t*1.7):0;
    study.lanternLight.intensity=THREE.MathUtils.damp(study.lanternLight.intensity,glow,3,delta);
    study.haloMaterial.opacity=THREE.MathUtils.damp(study.haloMaterial.opacity,evening?.55+.05*Math.sin(t*1.7+.6):0,3,delta);
    study.windowMaterial.emissiveIntensity=THREE.MathUtils.damp(study.windowMaterial.emissiveIntensity,evening?.95:0,3,delta);
    study.beacon.rotation.y=t*.24-1.8;
    study.beamMaterial.uniforms.strength.value=THREE.MathUtils.damp(study.beamMaterial.uniforms.strength.value,evening?1:0,3,delta);
    study.searchLight.intensity=THREE.MathUtils.damp(study.searchLight.intensity,evening?3.5:0,3,delta);
    if(import.meta.env.DEV){
      const d=gl.domElement.dataset;d.beaconAngle=String(study.beacon.rotation.y);d.beaconStrength=String(study.beamMaterial.uniforms.strength.value);d.boatTime=String(t);d.fishTime=String(t);d.fishCount='4';d.study='procedural-crescent-v09';d.cameraKind=camera.type;d.cameraZoom=camera instanceof THREE.OrthographicCamera?String(camera.zoom):'perspective';
      d.waterHeight=String(dynamics.probe.height);d.waterSlope=String(dynamics.probe.slopeX);d.waveSteps=String(dynamics.steps);d.waveReads=String(dynamics.reads);d.waveErrors=String(dynamics.readErrors);d.waveImpulses=String(dynamics.impulses);
      d.boatHeave=String(study.boat.position.y);d.boatPitch=String(study.boat.rotation.x);d.fishTailAngle=String(study.fishActors[0].tail.rotation.y);d.fishBend=String(study.fishActors[0].body.userData.bend??0);
    }
  });
  return <group rotation={[0,HARBOR.rotation,0]} name="CrescentStudy">
    <primitive object={study.root} dispose={null}/>
    <primitive object={study.boat} dispose={null}/>
    <primitive object={study.fish} dispose={null}/>
    <HarborWater field={field} footprint={study.footprint} playing={playing} evening={evening} rainy={rainy} dynamics={dynamics} deepTint={1} swellAmp={.016} swellDir={SWELL_DIR}/>
    <Weather field={field} playing={playing} rainy={rainy}/>
  </group>;
}
