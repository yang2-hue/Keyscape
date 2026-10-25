import {useCallback,useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree,type ThreeEvent} from '@react-three/fiber';
import * as THREE from 'three';
import {createCrescentBay,BERTH,CRESCENT} from './crescent-bay';
import {buildHeightfield,HARBOR} from './harbor-layout';
import {createWaterDynamics} from './water-dynamics';
import {deformFish,fishBend,stepSpring,turnToward} from './scene-motion';
import HarborWater from './HarborWater';
import {Weather} from './weather';
import {isWet,type WeatherKind} from './weather-model';

/** Module-level constant: an inline array literal would change identity on
 * every render, rebuild the water uniforms and reset their damped values. */
const SWELL_DIR:[number,number]=[.28,-.96];

/** Seconds the lighthouse stays lit after a click. */
const FLASH_SECONDS=3.6;
/** One slow lap of the lagoon, and how long it takes to come home again. */
const LAP_SECONDS=26;
const RETURN_SECONDS=2.6;
/** Radius the boat circles at. The hull is 0.11 wide, so it sweeps 0.29 at
 * most: well inside the lagoon, and the reef stones start at 0.52. */
const BOAT_RADIUS=.18;
/** Fish stay inside this radius and need this much water under them. */
const FISH_RADIUS=.42;
const FISH_MIN_DEPTH=.16;
/** Minimum clearance between a fish and the hull. */
const FISH_BOAT_CLEARANCE=.17;

/** The three clickable landmarks. Everything else in the study is scenery. */
type Landmark='Lighthouse'|'CrescentBoat'|'CrescentFish'|'';

/** Nearest named ancestor: a click lands on a tower window or a boat plank, and
 * what matters is which landmark it belongs to. */
function landmarkOf(object:THREE.Object3D):Landmark{
  let node:THREE.Object3D|null=object;
  while(node){
    if(node.name==='Lighthouse'||node.name==='CrescentBoat'||node.name==='CrescentFish')return node.name;
    node=node.parent;
  }
  return '';
}

const lerpAngle=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;

/** Fish wander the lagoon individually instead of riding a shared loop:
 * smooth pseudo-random turning, per-fish speed, shallow-water and boat
 * avoidance. Headings are steered back toward the lagoon center. */
export default function CrescentStudy({playing,night,weather}:{playing:boolean;night:boolean;weather:WeatherKind}){
  const gl=useThree(state=>state.gl),invalidate=useThree(state=>state.invalidate),camera=useThree(state=>state.camera);
  const time=useMemo(()=>({value:0}),[]);
  const study=useMemo(()=>createCrescentBay(time),[time]);
  const field=useMemo(()=>buildHeightfield(study.root,HARBOR.size,112),[study]);
  const dynamics=useMemo(()=>createWaterDynamics(gl,field,BERTH),[gl,field]);
  const boat=useRef({heave:{position:HARBOR.water,velocity:0},pitch:{position:0,velocity:0},roll:{position:0,velocity:0}});
  // Interaction state lives in refs: it changes every frame and must not
  // re-render the tree (which would rebuild the water uniforms).
  const flash=useRef(0);
  const startle=useRef(0);
  const startleAt=useRef(new THREE.Vector2(BERTH.x,BERTH.z));
  const hovering=useRef(false);
  // Boat: moored at the berth, drifting a lap of the lagoon, or coming home.
  const boatMode=useRef<'moored'|'drift'|'return'>('moored');
  const lap=useRef(0);
  const returning=useRef(0);
  const returnFrom=useRef({x:BERTH.x,z:BERTH.z,heading:BERTH.heading});
  const pose=useRef({x:BERTH.x,z:BERTH.z,heading:BERTH.heading});
  const rainy=isWet(weather);
  useEffect(()=>{dynamics.initialize();return()=>dynamics.dispose();},[dynamics]);
  useEffect(()=>()=>study.dispose(),[study]);
  useEffect(()=>()=>{document.body.style.cursor='';},[]);
  // Dev-only anchors, so the evidence harness can frame and click a landmark
  // instead of guessing where the tower landed on screen.
  useEffect(()=>{
    if(!import.meta.env.DEV)return;
    const debug=window as unknown as Record<string,unknown>;
    debug.__galleryLandmarks={
      positions(){
        const v=new THREE.Vector3(),out:Record<string,[number,number,number]>={};
        const tower=study.root.getObjectByName('Lighthouse');
        if(tower){tower.getWorldPosition(v);out.lighthouse=[v.x,v.y,v.z];}
        study.boat.getWorldPosition(v);out.boat=[v.x,v.y,v.z];
        const first=study.fish.children[0];
        if(first){first.getWorldPosition(v);out.fish=[v.x,v.y,v.z];}
        return out;
      },
      /** Where the fish are, how much water is under them, and how close they
       * are to the hull. Used to prove they stay inside the lagoon and never
       * swim through the boat. */
      audit(){
        const bx=pose.current.x,bz=pose.current.z;
        return study.fish.children.map(fish=>{
          const x=fish.position.x,z=fish.position.z;
          return {
            x:Number(x.toFixed(4)),z:Number(z.toFixed(4)),y:Number(fish.position.y.toFixed(4)),
            radius:Number(Math.hypot(x-CRESCENT.cx,z-CRESCENT.cz).toFixed(4)),
            depth:Number((HARBOR.water-field.sample(x,z)).toFixed(4)),
            toBoat:Number(Math.hypot(x-bx,z-bz).toFixed(4)),
            bed:Number(field.sample(x,z).toFixed(4)),
          };
        });
      },
      /** Where a landmark currently sits in CSS pixels, so a test can click the
       * real thing instead of hunting through the frame. */
      screen(){
        const rect=gl.domElement.getBoundingClientRect();
        const project=(x:number,y:number,z:number):[number,number]=>{
          const v=new THREE.Vector3(x,y,z).project(camera);
          return [rect.left+(v.x*.5+.5)*rect.width,rect.top+(-v.y*.5+.5)*rect.height];
        };
        const p=new THREE.Vector3(),out:Record<string,[number,number]>={};
        const tower=study.root.getObjectByName('Lighthouse');
        if(tower){tower.getWorldPosition(p);out.lighthouse=project(p.x,p.y+.45,p.z);}
        study.boat.getWorldPosition(p);out.boat=project(p.x,p.y+.06,p.z);
        const first=study.fish.children[0];
        if(first){first.getWorldPosition(p);out.fish=project(p.x,p.y,p.z);}
        return out;
      },
    };
    return ()=>{delete debug.__galleryLandmarks;};
  },[study,camera,gl]);

  function pointLandmark(event:ThreeEvent<MouseEvent>):Landmark{
    const role=landmarkOf(event.object);
    if(!role)return '';
    if(role==='Lighthouse')flash.current=FLASH_SECONDS;
    else if(role==='CrescentBoat'){
      // First click: drift. Second click: come home and moor again.
      if(boatMode.current==='moored'){boatMode.current='drift';lap.current=0;}
      else{boatMode.current='return';returning.current=0;returnFrom.current={...pose.current};}
    }else{
      // Fish bolt away from the exact spot that was tapped, in study space.
      const local=study.root.worldToLocal(event.point.clone());
      startleAt.current.set(local.x,local.z);
      startle.current=2.4;
    }
    // The scene only redraws on demand when paused, so the response has to ask
    // for a frame itself.
    invalidate();
    return role;
  }
  /** A wave raised on the lagoon frightens the fish nearby; this is the only
   * way to reach them, because they live under the water surface. */
  const scare=useCallback((x:number,z:number)=>{
    startleAt.current.set(x,z);
    startle.current=2.4;
    invalidate();
  },[invalidate]);
  function onClick(event:ThreeEvent<MouseEvent>){ if(pointLandmark(event))event.stopPropagation(); }
  function onMove(event:ThreeEvent<PointerEvent>){
    const interactive=landmarkOf(event.object)!=='';
    if(interactive!==hovering.current){hovering.current=interactive;document.body.style.cursor=interactive?'pointer':'';}
  }
  function onOut(){ if(hovering.current){hovering.current=false;document.body.style.cursor='';} }

  useFrame((_,dt)=>{try{dynamics.advance(dt,playing,rainy);time.value=dynamics.time;}catch(e){if(import.meta.env.DEV){gl.domElement.dataset.advanceError=String((e as Error)?.stack??e);}throw e;}if(import.meta.env.DEV){const d=gl.domElement.dataset;d.advanceCalls=String(Number(d.advanceCalls??0)+1);d.advancePlaying=String(playing);d.advanceRainy=String(rainy);d.advanceDt=String(dt);d.advanceSteps=String(dynamics.steps);}}, -2);

  useFrame(({gl,camera},dt)=>{
    const delta=Math.min(dt,.05),t=dynamics.time,heading=BERTH.heading;
    if(playing){
      flash.current=Math.max(0,flash.current-delta);
      startle.current=Math.max(0,startle.current-delta);
    }
    // Three quick pulses while the click is fresh; steady at night.
    const pulse=flash.current>0?Math.max(0,Math.sin(flash.current*9)):0;

    if(playing){
      const sample=dynamics.boat;
      const forward=sample.slopeX*Math.sin(heading)+sample.slopeZ*Math.cos(heading);
      const right=sample.slopeX*Math.cos(heading)-sample.slopeZ*Math.sin(heading);
      stepSpring(boat.current.heave,HARBOR.water+sample.height,delta);
      stepSpring(boat.current.pitch,THREE.MathUtils.clamp(-Math.atan(forward)*.75,-.16,.16),delta,24,8);
      stepSpring(boat.current.roll,THREE.MathUtils.clamp(Math.atan(right)*.75,-.16,.16),delta,24,8);
    }
    // Boat: moored, drifting a slow lap, or easing back to the berth.
    let bx=BERTH.x,bz=BERTH.z,bh=heading;
    if(boatMode.current==='drift'){
      if(playing){
        lap.current+=delta/LAP_SECONDS;
        if(lap.current>=1)lap.current-=1;
      }
      const p=lap.current,angle=-Math.PI/2+p*Math.PI*2;
      const cx=CRESCENT.cx+Math.cos(angle)*BOAT_RADIUS,cz=CRESCENT.cz+Math.sin(angle)*BOAT_RADIUS;
      // Ease out of the berth on the first metres instead of snapping to the circle.
      const w=THREE.MathUtils.smoothstep(p,0,.07);
      bx=THREE.MathUtils.lerp(BERTH.x,cx,w);bz=THREE.MathUtils.lerp(BERTH.z,cz,w);
      bh=lerpAngle(heading,angle+Math.PI/2,w);
    }else if(boatMode.current==='return'){
      if(playing)returning.current=Math.min(1,returning.current+delta/RETURN_SECONDS);
      const e=THREE.MathUtils.smoothstep(returning.current,0,1);
      bx=THREE.MathUtils.lerp(returnFrom.current.x,BERTH.x,e);
      bz=THREE.MathUtils.lerp(returnFrom.current.z,BERTH.z,e);
      bh=lerpAngle(returnFrom.current.heading,heading,e);
      if(returning.current>=1)boatMode.current='moored';
    }
    pose.current={x:bx,z:bz,heading:bh};
    study.boat.position.set(bx,boat.current.heave.position,bz);
    study.boat.rotation.set(boat.current.pitch.position,bh,boat.current.roll.position);
    study.boat.userData.motionTime=t;
    study.fish.children.forEach((fish,i)=>{
      const phase=i*1.47,effort=.9+i*.045;
      const st=fish.userData.wander??(fish.userData.wander={x:CRESCENT.cx+(i%2?.20:-.22),z:CRESCENT.cz+(i<2?.18:-.16),heading:i*1.9,speed:.085+i*.016,turn:0});
      if(playing){
        // Smooth wandering: two slow sines never repeat a circle.
        st.heading+=(Math.sin(t*.31+phase*3.1)*.55+Math.sin(t*.17+phase*7.3)*.4)*delta*2.4;
        const lookX=st.x+Math.cos(st.heading)*.16,lookZ=st.z+Math.sin(st.heading)*.16;
        const shallow=field.sample(lookX,lookZ)>HARBOR.water-FISH_MIN_DEPTH;
        const far=Math.hypot(lookX-CRESCENT.cx,lookZ-CRESCENT.cz)>FISH_RADIUS-.04;
        const nearBoat=Math.hypot(st.x-bx,st.z-bz)<FISH_BOAT_CLEARANCE+.06;
        if(startle.current>0){
          // Scatter: run straight away from the tap, faster than cruising.
          const away=Math.atan2(st.z-startleAt.current.y,st.x-startleAt.current.x);
          st.heading=turnToward(st.heading,away,delta*7);
        }else if(shallow||far){
          const home=Math.atan2(CRESCENT.cz-st.z,CRESCENT.cx-st.x)+Math.sin(t*.4+phase)*.5;
          st.heading=turnToward(st.heading,home,delta*3.4);
        }else if(nearBoat){
          st.heading=turnToward(st.heading,Math.atan2(st.z-bz,st.x-bx),delta*5);
        }
        const speed=st.speed*(startle.current>0?2.9:1);
        const previous=fish.rotation.y,vx=Math.cos(st.heading)*speed,vz=Math.sin(st.heading)*speed;
        st.x+=vx*delta;st.z+=vz*delta;
        fish.rotation.y=turnToward(previous,Math.atan2(-vz,vx),delta);
        st.turn=THREE.MathUtils.clamp(Math.atan2(Math.sin(fish.rotation.y-previous),Math.cos(fish.rotation.y-previous))/Math.max(delta,.001),-.9,.9);
      }
      // Hard bounds, applied every frame: steering alone let a startled fish
      // overshoot the reef and end up swimming through the island.
      const dx=st.x-CRESCENT.cx,dz=st.z-CRESCENT.cz,dist=Math.hypot(dx,dz);
      const bed=field.sample(st.x,st.z);
      const outside=dist>FISH_RADIUS,tooShallow=bed>HARBOR.water-FISH_MIN_DEPTH;
      if(outside||tooShallow){
        const target=outside?FISH_RADIUS*.97:Math.min(dist,FISH_RADIUS*.97);
        const k=dist>1e-4?target/dist:0;
        st.x=CRESCENT.cx+dx*k;st.z=CRESCENT.cz+dz*k;
        st.heading=Math.atan2(CRESCENT.cz-st.z,CRESCENT.cx-st.x);
      }
      // Never swim through the hull while it is drifting.
      const bdx=st.x-bx,bdz=st.z-bz,bd=Math.hypot(bdx,bdz);
      if(bd<FISH_BOAT_CLEARANCE){
        const k=(FISH_BOAT_CLEARANCE+.005)/Math.max(bd,1e-4);
        st.x=bx+bdx*k;st.z=bz+bdz*k;
        st.heading=Math.atan2(st.z-bz,st.x-bx);
      }
      const seabed=field.sample(st.x,st.z);
      fish.position.set(st.x,Math.min(HARBOR.water-.05,Math.max(seabed+.055,HARBOR.water-.13-(i%2)*.03+Math.sin(t*.65+phase)*.012)),st.z);
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
    // The lamp is glass by day; a click gives three deliberate pulses.
    study.lanternMaterial.emissiveIntensity=THREE.MathUtils.damp(study.lanternMaterial.emissiveIntensity,night?1.6:pulse*2.4,3,delta);
    // Evening lantern glow: light and halo breathe very slightly, never flicker hard.
    const glow=night?1.35+.06*Math.sin(t*1.7):pulse*2.6;
    study.lanternLight.intensity=THREE.MathUtils.damp(study.lanternLight.intensity,glow,3,delta);
    study.haloMaterial.opacity=THREE.MathUtils.damp(study.haloMaterial.opacity,night?.55+.05*Math.sin(t*1.7+.6):pulse*.75,3,delta);
    study.windowMaterial.emissiveIntensity=THREE.MathUtils.damp(study.windowMaterial.emissiveIntensity,night?.95:0,3,delta);
    // Beam sweeps faster while flashing, and is only visible when lit.
    study.beacon.rotation.y+=delta*(pulse>0?.95:.24);
    study.beamMaterial.uniforms.strength.value=THREE.MathUtils.damp(study.beamMaterial.uniforms.strength.value,night?1:pulse*.85,3,delta);
    study.searchLight.intensity=THREE.MathUtils.damp(study.searchLight.intensity,night?3.5:pulse*3.5,3,delta);
    if(import.meta.env.DEV){
      const d=gl.domElement.dataset;d.beaconAngle=String(study.beacon.rotation.y);d.beaconStrength=String(study.beamMaterial.uniforms.strength.value);d.lanternEmissive=String(study.lanternMaterial.emissiveIntensity);d.searchLightIntensity=String(study.searchLight.intensity);
      d.flash=String(flash.current);d.boatMode=boatMode.current;d.boatX=String(bx);d.boatZ=String(bz);d.fishScared=String(startle.current);
      d.boatTime=String(t);d.fishTime=String(t);d.fishCount='4';d.study='procedural-crescent-v09';d.cameraKind=camera.type;d.cameraZoom=camera instanceof THREE.OrthographicCamera?String(camera.zoom):'perspective';
      d.waterHeight=String(dynamics.probe.height);d.waterSlope=String(dynamics.probe.slopeX);d.waveSteps=String(dynamics.steps);d.waveReads=String(dynamics.reads);d.waveErrors=String(d.readErrors);d.waveImpulses=String(dynamics.impulses);
      d.boatHeave=String(study.boat.position.y);d.boatPitch=String(study.boat.rotation.x);d.fishTailAngle=String(study.fishActors[0].tail.rotation.y);d.fishBend=String(study.fishActors[0].body.userData.bend??0);
    }
  });
  return <group rotation={[0,HARBOR.rotation,0]} name="CrescentStudy">
    <primitive object={study.root} dispose={null} onClick={onClick} onPointerMove={onMove} onPointerOut={onOut}/>
    {/* The boat and the fish are siblings of the study root, so they need the
        same handlers: without them a click on the hull never reaches the scene. */}
    <primitive object={study.boat} dispose={null} onClick={onClick} onPointerMove={onMove} onPointerOut={onOut}/>
    <primitive object={study.fish} dispose={null} onClick={onClick} onPointerMove={onMove} onPointerOut={onOut}/>
    <HarborWater field={field} footprint={study.footprint} playing={playing} evening={night} rainy={rainy} dynamics={dynamics} deepTint={1} swellAmp={.016} swellDir={SWELL_DIR} onSplash={scare}/>
    <Weather field={field} playing={playing} rainy={rainy}/>
  </group>;
}
