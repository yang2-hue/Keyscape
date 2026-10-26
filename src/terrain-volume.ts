import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Close the outer boundary of the rounded rectangular heightfield. Keep its
 * authored top untouched; only add outward walls and a downward base inside
 * the keycap plinth. This is a solid cut section, not a cave or a water wall. */
export function closeTerrainVolume(surface:THREE.BufferGeometry,bottom:number,sideInset=.008){
  const top=surface.clone(),p=top.getAttribute('position'),index=top.getIndex();
  if(!index){top.dispose();throw new Error('Terrain closure requires an indexed heightfield');}
  for(let i=0;i<p.count;i++)if(p.getY(i)<=bottom){top.dispose();throw new Error('Terrain base must be below the entire top surface');}
  if(!top.getAttribute('normal'))top.computeVertexNormals();
  if(!top.getAttribute('uv'))top.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(p.count*2),2));
  if(!top.getAttribute('color'))top.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(p.count*3).fill(1),3));
  const colors=top.getAttribute('color');
  let extent=0;for(let i=0;i<p.count;i++)extent=Math.max(extent,Math.abs(p.getX(i)),Math.abs(p.getZ(i)));
  if(sideInset<0||sideInset>=extent){top.dispose();throw new Error('Invalid terrain wall inset');}
  // The top seam stays in place. Pull only the lower rim inside the resin:
  // a vertical wall at the water's exact boundary fought its opaque shader.
  const lowerScale=1-sideInset/extent;
  const edges=new Map<string,{a:number;b:number;count:number}>();
  for(let i=0;i<index.count;i+=3)for(let k=0;k<3;k++){
    const a=index.getX(i+k),b=index.getX(i+(k+1)%3),key=a<b?`${a}:${b}`:`${b}:${a}`;
    const edge=edges.get(key);if(edge)edge.count++;else edges.set(key,{a,b,count:1});
  }
  const boundary=[...edges.values()].filter(e=>e.count===1);
  if(!boundary.length){top.dispose();throw new Error('Terrain has no open outer boundary');}
  const positions:number[]=[],uv:number[]=[],rgb:number[]=[],indices:number[]=[];
  const basePositions:number[]=[0,bottom,0],baseUV:number[]=[.5,.5],baseRGB:number[]=[.45,.50,.46],baseIndices:number[]=[];
  for(const {a,b} of boundary){
    const offset=positions.length/3,baseOffset=basePositions.length/3;
    for(const [vertex,lower] of [[a,false],[a,true],[b,true],[b,false]] as const){
      const scale=lower?lowerScale:1,x=p.getX(vertex)*scale,z=p.getZ(vertex)*scale,y=lower?bottom:p.getY(vertex);
      positions.push(x,y,z);uv.push(x+z,y);
      const shade=lower?.75:1;rgb.push(colors.getX(vertex)*shade,colors.getY(vertex)*shade,colors.getZ(vertex)*shade);
    }
    indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
    for(const vertex of [a,b]){
      const x=p.getX(vertex)*lowerScale,z=p.getZ(vertex)*lowerScale;
      basePositions.push(x,bottom,z);baseUV.push(x/3.14+.5,z/3.14+.5);baseRGB.push(.45,.50,.46);
    }
    baseIndices.push(0,baseOffset+1,baseOffset);
  }
  const make=(position:number[],coords:number[],color:number[],faces:number[])=>{
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(coords,2));g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));
    g.setIndex(faces);g.computeVertexNormals();return g;
  };
  const walls=make(positions,uv,rgb,indices),base=make(basePositions,baseUV,baseRGB,baseIndices);
  const solid=mergeGeometries([top,walls,base]);top.dispose();walls.dispose();base.dispose();
  if(!solid)throw new Error('Terrain volume attributes could not be combined');
  solid.userData.boundarySegments=boundary.length;
  return solid;
}
