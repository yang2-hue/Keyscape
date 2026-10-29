import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {seeded} from './coastal-materials';
import type {Heightfield} from './harbor-layout';

/** Mist that actually sits in the air.
 *
 * The old night fog was `FogExp2` with a near-black colour, which cannot do
 * anything except darken the picture — on a diorama three units wide with an
 * orthographic camera, every surface is at almost the same depth, so distance
 * fog is a flat tint. Mist needs to be an object in the scene to read: soft
 * drifting cards over the water, which the island occludes, that the lighthouse
 * beam can glow through, and that pile up where the ground is cold.
 *
 * Cards are billboarded to the camera and kept low — over the lagoon and along
 * the shoreline rather than over the buildings, because a translucent rectangle
 * crossing a wall always reads as a smudge, however soft it is.
 */

function mistTexture(size=128){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d')!;
  const random=seeded(4703);
  const data=ctx.createImageData(size,size);
  // Value noise on a wrapping lattice, four octaves: one tile has to be
  // seamless because the cards are scaled and rotated independently.
  const lattice=(cells:number,seed:number)=>{
    const grid=new Float32Array(cells*cells);
    const r=seeded(seed);
    for(let i=0;i<grid.length;i++)grid[i]=r();
    return grid;
  };
  const sample=(grid:Float32Array,cells:number,u:number,v:number)=>{
    const x=u*cells,y=v*cells,xi=Math.floor(x),yi=Math.floor(y);
    const fx=x-xi,fy=y-yi,ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
    const at=(i:number,j:number)=>grid[((j%cells)+cells)%cells*cells+((i%cells)+cells)%cells];
    const a=at(xi,yi),b=at(xi+1,yi),c=at(xi,yi+1),d=at(xi+1,yi+1);
    return (a+(b-a)*ux)*(1-uy)+(c+(d-c)*ux)*uy;
  };
  const octaves=[{g:lattice(4,911),c:4},{g:lattice(8,913),c:8},{g:lattice(16,917),c:16},{g:lattice(32,919),c:32}];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size;
    let n=0,amp=.5,total=0;
    for(const {g,c} of octaves){n+=amp*sample(g,c,u,v);total+=amp;amp*=.55;}
    n/=total;
    // Radial falloff so the card has no edge, then a noise gate so it has shape.
    const dx=(u-.5)*2,dy=(v-.5)*2,r=Math.min(1,Math.hypot(dx,dy));
    const fall=Math.pow(1-r,2.3);
    // Fade the bottom of the card out too. A mist card is a vertical plane that
    // necessarily dips below the water surface, and the water clips it there:
    // without this the card shows a straight horizontal cut where it enters the
    // sea. (Canvas y runs opposite to uv.v once the texture is flipped, so the
    // bottom of the card is the high end of v.)
    const floor=Math.min(1,(1-v)/.34);
    const a=Math.max(0,Math.min(1,(n-.34)/.42))*fall*floor;
    const i=(y*size+x)*4;
    data.data[i]=data.data[i+1]=data.data[i+2]=255;
    data.data[i+3]=Math.round(a*255);
  }
  ctx.putImageData(data,0,0);
  void random;
  const texture=new THREE.CanvasTexture(canvas);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  return texture;
}

type Card={mesh:THREE.Mesh;base:number;x:number;z:number;y:number;drift:number;phase:number;spin:number};

/** `level` is a ref, not a number: the parent re-renders once per moment, but
 * the mist has to fade in over seconds, so the frame loop reads the live value. */
export default function CoastalMist({level,field,water,center}:{level:{current:number};field:Heightfield;water:number;center:readonly [number,number]}){
  const camera=useThree(s=>s.camera);
  const texture=useMemo(()=>mistTexture(),[]);
  const group=useRef<THREE.Group>(null);
  const cards=useMemo<Card[]>(()=>{
    const random=seeded(20261030);
    const geometry=new THREE.PlaneGeometry(1,1);
    const out:Card[]=[];let guard=0;
    while(out.length<26&&guard++<900){
      const angle=random()*Math.PI*2;
      const radius=.28+Math.pow(random(),.7)*1.05;
      const x=center[0]+Math.cos(angle)*radius;
      const z=center[1]+Math.sin(angle)*radius;
      // Only over open water: mist that hangs inside a hillside is a bug.
      if(field.sample(x,z)>water-.035)continue;
      const y=water+.02+Math.pow(random(),1.6)*.26;
      const size=.52+random()*.82;
      const material=new THREE.MeshBasicMaterial({
        map:texture,transparent:true,depthWrite:false,opacity:0,
        color:new THREE.Color('#bcd0dd'),side:THREE.DoubleSide,
        // Fog on a fog card would double-count the haze and wash the lagoon out.
        fog:false,
      });
      const mesh=new THREE.Mesh(geometry,material);
      mesh.position.set(x,y,z);
      mesh.scale.setScalar(size);
      mesh.renderOrder=4;
      mesh.userData.ignoreHeightfield=true;
      mesh.raycast=()=>{};
      out.push({mesh,base:.13+random()*.19,x,z,y,drift:.02+random()*.05,phase:random()*Math.PI*2,spin:(random()-.5)*.02});
    }
    return out;
  },[field,water,center,texture]);
  // Geometry and one material per card are created here, so they are also
  // released here; the GLTF cache does not own them.
  useEffect(()=>()=>{
    cards.forEach(card=>{(card.mesh.material as THREE.Material).dispose();card.mesh.geometry.dispose();});
    texture.dispose();
  },[cards,texture]);
  const elapsed=useRef(0);
  const parentQuat=new THREE.Quaternion(),billboard=new THREE.Quaternion();
  useFrame((_,dt)=>{
    const step=Math.min(dt,.05);
    elapsed.current+=step;
    const t=elapsed.current;
    group.current?.children.forEach((object,index)=>{
      const card=cards[index];if(!card)return;
      const {mesh}=card;
      const material=mesh.material as THREE.MeshBasicMaterial;
      // Each card breathes at its own rate so the field never pulses as one body.
      const breath=.72+.28*Math.sin(t*.23+card.phase);
      material.opacity=card.base*level.current*breath;
      mesh.visible=material.opacity>.004;
      mesh.position.set(
        card.x+Math.cos(t*.11+card.phase)*card.drift*3,
        card.y+Math.sin(t*.19+card.phase*.7)*.012,
        card.z+Math.sin(t*.09+card.phase)*card.drift*3,
      );
      // Billboarding has to be done in world space: these cards live inside the
      // study group, which is turned a quarter turn against the harbour, so
      // copying the camera quaternion straight onto the mesh leaves every card
      // edge-on. Undo the parent rotation, then apply the camera's.
      billboard.copy(camera.quaternion);
      if(mesh.parent){mesh.parent.getWorldQuaternion(parentQuat);billboard.premultiply(parentQuat.invert());}
      mesh.quaternion.copy(billboard);
      mesh.rotateZ(card.spin*t+card.phase);
    });
  });
  return <group ref={group} name="CoastalMist">
    {cards.map((card,index)=><primitive key={index} object={card.mesh} dispose={null}/>)}
  </group>;
}
