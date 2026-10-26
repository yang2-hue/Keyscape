import * as THREE from 'three';
import {seeded} from './coastal-materials.ts';
import {keepAccessClear,ACCESS_CENTER} from './crescent-access.ts';
import {beachInfluence} from './coastal-composition.ts';
import {roundedSquarePoint} from './harbor-layout.ts';

/** Jointed limestone: broad planes, chipped shoulders and thin bedding ledges.
 * Keep the geometry shared by instances; colour/scale still vary per outcrop. */
export function limestoneGeometry(seed:number){
  const random=seeded(seed),phase=random()*6.28;
  const g=new THREE.SphereGeometry(1,28,18),p=g.attributes.position;
  const cuts=Array.from({length:5},(_,i)=>({normal:new THREE.Vector3(Math.cos(i*1.37+phase),.25+random()*.5,Math.sin(i*1.37+phase)).normalize(),distance:.68+random()*.17}));
  for(let i=0;i<p.count;i++){
    const v=new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i));
    for(const cut of cuts){const d=v.dot(cut.normal)-cut.distance;if(d>0)v.addScaledVector(cut.normal,-d);}
    const {x,y,z}=v,bedding=Math.sin(y*14+phase+Math.sin(x*2+z*3)*.6);
    const fault=Math.sin(x*4.4+z*3.2+phase)*Math.cos(y*5-z*2);
    p.setXYZ(i,x*(1+.035*bedding+.055*fault)+y*.1,y*.78+.025*Math.sin(x*8+z*6+phase),z*(1+.045*bedding+.055*fault));
  }
  g.computeVertexNormals();return g;
}

/** A shallow cupped blade with a raised midrib, rather than a little sphere. */
export function leafBladeGeometry(){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0,0,.025,.17,.5,0,0,0,.025,-.17,0,.10,0],3));
  g.setIndex([0,1,4,1,2,4,2,3,4,3,0,4]);g.computeVertexNormals();return g;
}

/** Relief is measured from an unchanged height buffer; do not feed each
 * displaced row into the next row's slope calculation. Paths stay untouched. */
export function sculptCliffs(g:THREE.PlaneGeometry){
  const p=g.attributes.position,rest=new Float32Array(p.array),segments=g.parameters.widthSegments,row=segments+1,cell=g.parameters.width/segments;
  for(let j=1;j<segments;j++)for(let i=1;i<segments;i++){
    const k=j*row+i,x=rest[k*3],h=rest[k*3+1],z=rest[k*3+2];
    if(h>.37||h<-.4||keepAccessClear(x,z,.08))continue;
    const gx=(rest[(k+1)*3+1]-rest[(k-1)*3+1])/(2*cell),gz=(rest[(k+row)*3+1]-rest[(k-row)*3+1])/(2*cell),slope=Math.hypot(gx,gz);
    const beach=beachInfluence(Math.atan2(z-ACCESS_CENTER.z,x-ACCESS_CENTER.x));
    const weight=THREE.MathUtils.smoothstep(slope,.6,1.8)*(1-THREE.MathUtils.smoothstep(h,.31,.37))*(1-beach);
    if(weight===0)continue;
    const bedding=Math.sin(h*47+Math.sin(x*7+z*9)*.8);
    const fracture=Math.sin(x*29+z*23)*Math.cos(h*19+z*7);
    const relief=(bedding*.04+fracture*.02)*weight;
    const [px,pz]=roundedSquarePoint(x-gx/slope*relief,z-gz/slope*relief);
    p.setXYZ(k,px,h+fracture*.008*weight,pz);
  }
}

/** Shared rock shading for independent boulders and the continuous cliff. */
export function limestoneSurface(material:THREE.MeshStandardMaterial,key:string){
  const base=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    base.call(material,shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      float face=1.0-smoothstep(.3,.82,tideN.y);
      float band=sin(tideP.y*96.0+sin(tideP.x*9.0+tideP.z*11.0)*1.6);
      float joint=pow(1.0-abs(sin(tideP.x*31.0+tideP.z*23.0+sin(tideP.y*19.0)*.6)),20.0);
      float mineral=.5+.5*sin(tideP.x*13.0+sin(tideP.z*8.0))*cos(tideP.y*17.0);
      diffuseColor.rgb*=1.0-face*(smoothstep(.80,1.0,band)*.13+joint*.14)-mineral*.055;
    `);
  };
  material.customProgramCacheKey=()=>key;
}
