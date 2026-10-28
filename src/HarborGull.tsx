import {useCallback,useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree,type ThreeEvent} from '@react-three/fiber';
import {useGLTF} from '@react-three/drei';
import * as THREE from 'three';
import {CRESCENT,PIER_ANGLE,PIER_HEAD} from './crescent-bay';
import {HARBOR} from './harbor-layout';
import {advanceGull,gullPose,type GullPoint} from './harbor-gull-motion';

// Match the real Blender dock: shore-local post X=.132, Z=.25, top Y=.15.
const shoreR=CRESCENT.rIn-.01;
const shoreX=CRESCENT.cx+Math.cos(PIER_ANGLE)*shoreR;
const shoreZ=CRESCENT.cz+Math.sin(PIER_ANGLE)*shoreR;
const headX=CRESCENT.cx+Math.cos(PIER_ANGLE)*PIER_HEAD;
const headZ=CRESCENT.cz+Math.sin(PIER_ANGLE)*PIER_HEAD;
const dockYaw=Math.atan2(headX-shoreX,headZ-shoreZ);
export const GULL_PERCH:GullPoint=[shoreX+.132*Math.cos(dockYaw)+.25*Math.sin(dockYaw),HARBOR.water+.05+.15,shoreZ-.132*Math.sin(dockYaw)+.25*Math.cos(dockYaw)];
const CENTER:readonly [number,number]=[CRESCENT.cx,CRESCENT.cz];

type Props={playing:boolean;trigger:number;anchor?:GullPoint};

/** Mount inside the same HARBOR.rotation group as the dock. Increment trigger
 * from a deliberate dock click. Flights in progress cannot be queued, and a
 * trigger received while paused/hidden is consumed without launching later. */
export default function HarborGull({playing,trigger,anchor=GULL_PERCH}:Props){
  const asset=useGLTF(`${import.meta.env.BASE_URL}models/harbor/harbor-gull.glb`);
  const gl=useThree(s=>s.gl),invalidate=useThree(s=>s.invalidate);
  const rig=useMemo(()=>{
    const root=asset.scene.clone(true);root.name='HarborGull';
    root.userData.ignoreHeightfield=true;
    root.traverse(o=>{o.userData.ignoreHeightfield=true;if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
    const left=root.getObjectByName('GullWingLeft'),right=root.getObjectByName('GullWingRight');
    if(!left||!right)throw new Error('Harbor gull asset is missing shoulder pivots');
    return {root,left,right};
  },[asset.scene]);
  const state=useRef({flying:false,elapsed:0,completed:0});
  const lastTrigger=useRef(trigger),hover=useRef(false),previousCursor=useRef('');
  const clearCursor=useCallback(()=>{if(hover.current){gl.domElement.style.cursor=previousCursor.current;hover.current=false;}},[gl]);
  const launch=useCallback(()=>{
    if(!playing||document.hidden||state.current.flying)return false;
    state.current.flying=true;state.current.elapsed=0;clearCursor();invalidate();return true;
  },[playing,clearCursor,invalidate]);
  useEffect(()=>{
    if(trigger!==lastTrigger.current){lastTrigger.current=trigger;launch();}
  },[trigger,launch]);
  useEffect(()=>{if(!playing)clearCursor();},[playing,clearCursor]);
  useEffect(()=>()=>clearCursor(),[clearCursor]);

  const applyPose=useCallback(()=>{
    const s=state.current,p=gullPose(s.elapsed,s.flying,anchor,CENTER);
    rig.root.position.set(p.x,p.y,p.z);rig.root.rotation.set(p.pitch,p.yaw,p.bank,'YXZ');
    rig.left.rotation.set(0,-p.wingSweep,p.wingFlap,'ZYX');
    rig.right.rotation.set(0,p.wingSweep,-p.wingFlap,'ZYX');
    if(import.meta.env.DEV){
      const d=gl.domElement.dataset;d.gullMode=s.flying?'flying':'perched';d.gullPhase=p.phase;d.gullTime=String(s.elapsed);
      d.gullX=String(p.x);d.gullY=String(p.y);d.gullZ=String(p.z);
      d.gullWing=String(p.wingFlap);d.gullFlights=String(s.completed);
    }
  },[anchor,rig,gl]);
  useEffect(()=>{applyPose();invalidate();},[applyPose,invalidate]);
  useFrame((_,dt)=>{
    const s=state.current;
    advanceGull(s,dt,playing,!document.hidden);
    applyPose();
  });
  const click=(e:ThreeEvent<MouseEvent>)=>{
    if(e.delta>6)return;
    if(launch())e.stopPropagation();
  };
  const pointer=(e:ThreeEvent<PointerEvent>)=>{
    if(!playing||state.current.flying)return;
    if(!hover.current){previousCursor.current=gl.domElement.style.cursor;hover.current=true;gl.domElement.style.cursor='pointer';}
    e.stopPropagation();
  };
  // The GLTF cache owns geometry/materials. The clone only owns its transforms.
  return <primitive object={rig.root} dispose={null} onClick={click} onPointerOver={pointer} onPointerOut={clearCursor}/>;
}
