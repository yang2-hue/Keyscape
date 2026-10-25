import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {createCoastalStudy} from './coastal-study';
import {buildHeightfield,findSwimLoop,HARBOR} from './harbor-layout';
import {createWaterDynamics} from './water-dynamics';
import {deformFish,fishBend,stepSpring,turnToward} from './scene-motion';
import HarborWater from './HarborWater';
import {Weather} from './weather';

export default function CoastalStudy({playing,evening,rainy}:{playing:boolean;evening:boolean;rainy:boolean}){
  const gl=useThree(state=>state.gl),time=useMemo(()=>({value:0}),[]);
  const study=useMemo(()=>createCoastalStudy(time),[time]);
  const field=useMemo(()=>buildHeightfield(study.root,HARBOR.size,112),[study]);
  const swim=useMemo(()=>findSwimLoop(field),[field]);
  const dynamics=useMemo(()=>createWaterDynamics(gl,field),[gl,field]);
  const boat=useRef({heave:{position:HARBOR.water,velocity:0},pitch:{position:0,velocity:0},roll:{position:0,velocity:0}});
  useEffect(()=>{dynamics.initialize();return()=>dynamics.dispose();},[dynamics]);
  useEffect(()=>()=>study.dispose(),[study]);
  useFrame((_,dt)=>{try{dynamics.advance(dt,playing,rainy);time.value=dynamics.time;}catch(e){if(import.meta.env.DEV){gl.domElement.dataset.advanceError=String((e as Error)?.stack??e);}throw e;}if(import.meta.env.DEV){const d=gl.domElement.dataset;d.advanceCalls=String(Number(d.advanceCalls??0)+1);d.advancePlaying=String(playing);d.advanceRainy=String(rainy);d.advanceDt=String(dt);d.advanceSteps=String(dynamics.steps);}}, -2);
  useFrame(({gl,camera},dt)=>{
    const delta=Math.min(dt,.05),t=dynamics.time,heading=-.45;
    if(playing){
      const sample=dynamics.boat;
      const forward=sample.slopeX*Math.sin(heading)+sample.slopeZ*Math.cos(heading);
      const right=sample.slopeX*Math.cos(heading)-sample.slopeZ*Math.sin(heading);
      stepSpring(boat.current.heave,HARBOR.water+sample.height,delta);
      stepSpring(boat.current.pitch,THREE.MathUtils.clamp(-Math.atan(forward)*.75,-.16,.16),delta,24,8);
      stepSpring(boat.current.roll,THREE.MathUtils.clamp(Math.atan(right)*.75,-.16,.16),delta,24,8);
    }
    study.boat.position.set(-.12,boat.current.heave.position,.49);
    study.boat.rotation.set(boat.current.pitch.position,heading,boat.current.roll.position);
    study.boat.userData.motionTime=t;
    if(swim)study.fish.children.forEach((fish,i)=>{
      const phase=i*1.47,rate=.43+i*.027,a=t*rate+phase+.12*Math.sin(t*.6+phase);
      const radius=swim.radius*(.65+i*.035+.035*Math.sin(t*.7+phase));
      const aRate=rate+.072*Math.cos(t*.6+phase),rRate=swim.radius*.0245*Math.cos(t*.7+phase);
      const vx=Math.cos(a)*rRate-Math.sin(a)*radius*aRate,vz=(Math.sin(a)*rRate+Math.cos(a)*radius*aRate)*.75;
      const yaw=Math.atan2(-vz,vx),previous=fish.rotation.y;
      if(!fish.userData.initialized){fish.rotation.y=yaw;fish.userData.initialized=true;}else if(playing)fish.rotation.y=turnToward(previous,yaw,delta);
      const turn=playing?THREE.MathUtils.clamp(Math.atan2(Math.sin(fish.rotation.y-previous),Math.cos(fish.rotation.y-previous))/Math.max(delta,.001),-.9,.9):fish.userData.turn??0;
      if(playing)fish.userData.turn=turn;
      fish.position.set(swim.x+Math.cos(a)*radius,HARBOR.water-.14-(i%2)*.025+Math.sin(t*.65+phase)*.013,swim.z+Math.sin(a)*radius*.75);
      fish.rotation.x=turn*.10;fish.rotation.z=Math.cos(t*.65+phase)*.035;
      const actor=study.fishActors[i],effort=.9+i*.045;
      if(playing||!actor.body.userData.posed){
        const positions=actor.body.geometry.attributes.position;
        const bend=deformFish(actor.rest,positions.array as Float32Array,t,phase,effort,turn);
        positions.needsUpdate=true;actor.body.geometry.computeVertexNormals();actor.body.userData.posed=true;actor.body.userData.bend=bend;
        actor.tail.position.z=fishBend(-.064,t,phase,effort,turn);
        actor.tail.rotation.y=Math.sin(t*(8.5+phase*.2)+phase+1.8)*.55*effort-turn*.18;
        actor.fins.forEach((fin,side)=>{fin.rotation.y=(side===0?-1:1)*(.35+Math.sin(t*6+phase)*.18);});
      }
    });
    study.fish.visible=Boolean(swim);study.fish.userData.motionTime=t;
    study.lanternMaterial.emissiveIntensity=THREE.MathUtils.damp(study.lanternMaterial.emissiveIntensity,evening?1.6:.18,3,delta);
    if(import.meta.env.DEV){
      const d=gl.domElement.dataset;d.boatTime=String(t);d.fishTime=String(t);d.fishCount=String(swim?4:0);d.study='procedural-v06';d.cameraKind=camera.type;d.cameraZoom=camera instanceof THREE.OrthographicCamera?String(camera.zoom):'perspective';
      d.waterHeight=String(dynamics.probe.height);d.waterSlope=String(dynamics.probe.slopeX);d.waveSteps=String(dynamics.steps);d.waveReads=String(dynamics.reads);d.waveErrors=String(dynamics.readErrors);d.waveImpulses=String(dynamics.impulses);
      d.boatHeave=String(study.boat.position.y);d.boatPitch=String(study.boat.rotation.x);d.fishTailAngle=String(study.fishActors[0].tail.rotation.y);d.fishBend=String(study.fishActors[0].body.userData.bend??0);
    }
  });
  return <group rotation={[0,HARBOR.rotation,0]} name="CoastalStudy">
    <primitive object={study.root} dispose={null}/>
    <primitive object={study.boat} dispose={null}/>
    <primitive object={study.fish} dispose={null}/>
    <HarborWater field={field} footprint={study.footprint} playing={playing} evening={evening} rainy={rainy} dynamics={dynamics}/>
    <Weather field={field} playing={playing} rainy={rainy}/>
  </group>;
}
