import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeCoastalMaterials,seeded,type CoastalMaterials } from './coastal-materials.ts';
import { keycapOutline } from './harbor-layout.ts';

type V=[number,number,number];
type Piece={position:V;scale:V;rotation?:V;color?:string};
const smooth=THREE.MathUtils.smoothstep;

/** Shared keycap outline, so the gate base matches the other studies. */
export function gateFootprint(){
  return keycapOutline();
}

/** Gate layout: two sandstone legs lean together into a triangular arch.
 * The triangle below the meeting point must stay open — that negative space
 * IS the letter A. The stone bridge crosses as the crossbar. */
export const GATE={apexY:1.58,apexZ:-.30,legBaseX:.88,legBaseZ:-.02,bridgeY:.92,topW:.22,baseW:.56};

/** Pure transform for leg layer t∈[0,1] (0 base → 1 apex), shared by the
 * builder and the structural tests. Legs lean linearly with a slight inward
 * bow, inner faces touching exactly at the apex. */
export function legLayerTransform(t:number,side:1|-1){
  const x=side*(GATE.legBaseX*(1-t)+(GATE.topW/2)*t-.12*t*(1-t));
  const y=t*GATE.apexY;
  const z=GATE.legBaseZ+(GATE.apexZ-GATE.legBaseZ)*t;
  const w=GATE.baseW+(GATE.topW-GATE.baseW)*t;
  const d=.44-.16*t;
  return {x,y,z,w,d};
}

/** Keep the rendered uniform and material debug state on the same value. */
export function updateGateMist(material:THREE.ShaderMaterial,rainy:boolean,evening:boolean,delta:number){
  const target=rainy?.8:evening?.62:.5;
  const value=THREE.MathUtils.damp(material.uniforms.uOpacity.value,target,2.5,delta);
  material.uniforms.uOpacity.value=value;material.opacity=value;
  return value;
}

/** Programmatic cloud gate. Legs, bridge, mist, stream, stairs, figures and
 * planting stay separately authored so each can be tuned without re-baking. */
export function createCloudGate(time:{value:number}){
  const palette=makeCoastalMaterials(time,.08,.0),m=palette.materials;
  m.rock.color.set('#e8d3ac');
  const root=new THREE.Group();root.name='CloudGateStudy';
  const geometries=new Set<THREE.BufferGeometry>();
  const box=new RoundedBoxGeometry(1,1,1,2,.035);
  const leaf=new THREE.SphereGeometry(1,6,4),cylinder=new THREE.CylinderGeometry(1,1,1,12);
  [box,leaf,cylinder].forEach(g=>geometries.add(g));
  const batches=new Map<string,{geometry:THREE.BufferGeometry;material:THREE.Material;pieces:Piece[]}>();
  const add=(name:string,geometry:THREE.BufferGeometry,material:THREE.Material,piece:Piece)=>{
    if(!batches.has(name))batches.set(name,{geometry,material,pieces:[]});
    batches.get(name)!.pieces.push(piece);
  };
  const cube=(position:V,scale:V,kind:keyof CoastalMaterials='stone',rotation:V=[0,0,0],color?:string)=>add('box-'+kind,box,m[kind],{position,scale,rotation,color});
  const mesh=(geometry:THREE.BufferGeometry,material:THREE.Material,position:V=[0,0,0],parent:THREE.Object3D=root)=>{
    geometries.add(geometry);const object=new THREE.Mesh(geometry,material);object.position.fromArray(position);object.castShadow=object.receiveShadow=true;parent.add(object);return object;
  };
  const random=seeded(5407);
  const strata=['#e5c08a','#d9a86c','#cf9a5f','#c08a52','#e8cf9f','#d4a873'];

  // Cream resin base and the sandstone plaza ground.
  const shape=new THREE.Shape();gateFootprint().forEach((p,i)=>i?shape.lineTo(p.x,-p.y):shape.moveTo(p.x,-p.y));shape.closePath();
  const baseGeometry=new THREE.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:true,bevelSize:.014,bevelThickness:.014,bevelSegments:3,steps:1});
  baseGeometry.rotateX(-Math.PI/2);baseGeometry.translate(0,-.17,0);
  mesh(baseGeometry,m.ivory).name='GateBase';
  const ground=mesh(box,m.rock,[0,-.012,0]);ground.scale.set(2.88,.035,2.88);ground.name='GateGround';

  // Two leaning legs built from strata slabs; the triangle between them stays
  // open below the meeting point.
  for(const side of [1,-1] as const)for(let k=0;k<17;k++){
    const t=k/16,{x,y,z,w,d}=legLayerTransform(t,side);
    add('gate-legs',box,m.rock,{position:[x,y+.05,z],scale:[w+ (random()-.5)*.03,.105,d+(random()-.5)*.03],rotation:[0,(random()-.5)*.05,side*-.06],color:strata[k%strata.length]});
  }
  // Apex cap where the legs meet, plus ledge stones on both inner faces.
  const apexCap=mesh(box,m.rock,[0,GATE.apexY+.13,GATE.apexZ]);apexCap.scale.set(.34,.10,.30);apexCap.rotation.y=Math.PI/4;
  for(const side of [1,-1] as const)for(let k=3;k<12;k+=3){
    const t=k/16,{x,y,z,w}=legLayerTransform(t,side);
    add('gate-legs',box,m.rock,{position:[x-side*(w/2-.02),y+.10,z+.02],scale:[.08,.05,.14],rotation:[0,random(),0],color:'#c08a52'});
  }

  // Stone bridge crossing as the crossbar — mounted proud of the legs' front
  // faces so the bar reads clearly, with an arched soffit and parapets.
  const bridgeZ=.10;
  for(const x of [-.40,-.14,.14,.40])cube([x,GATE.bridgeY,bridgeZ],[.255,.038,.30],'stone',[0,0,0],Math.abs(x)<.2?'#dcc9a4':'#d2bd97');
  for(let i=0;i<7;i++){
    const u=i/6,arcX=-.40+.80*u,arcY=GATE.bridgeY-.14+.10*Math.sin(Math.PI*u);
    const tangent=Math.atan2(.10*Math.PI*Math.cos(Math.PI*u),.80);
    cube([arcX,arcY,bridgeZ],[.115,.052,.24],'stone',[0,-tangent,0],'#cbb693');
  }
  for(const s of [-1,1])cube([0,GATE.bridgeY+.045,bridgeZ+s*.13],[1.06,.026,.035],'stone',[0,0,0],'#e2d2ac');
  // Lantern posts on both bridge ends; they warm up at dusk.
  const lanternMaterial=new THREE.MeshStandardMaterial({color:'#f4dfa4',emissive:'#ffb066',emissiveIntensity:.15,roughness:.55});
  for(const s of [-1,1]){
    const px=s*.50,pz=bridgeZ;
    cube([px,GATE.bridgeY+.06,pz],[.028,.10,.028],'stone',[0,0,0]);
    const lamp=mesh(new THREE.SphereGeometry(.018,10,8),lanternMaterial,[px,GATE.bridgeY+.125,pz]);
    lamp.name='GateLantern';
    mesh(new THREE.ConeGeometry(.024,.018,8),m.roof,[px,GATE.bridgeY+.146,pz]);
  }

  // Cool canyon far wall behind the arch, veiled by drifting mist cards.
  for(const [z,h,w,shade] of [[-1.42,.22,2.3,'#b7c4cd'],[-1.52,.17,1.7,'#c5d1d8']] as const){
    add('canyon-wall',box,m.rock,{position:[0,h/2-.14,z],scale:[w,h,.10],rotation:[0,(random()-.5)*.03,0],color:shade});
  }
  // A fog bank behind the arch: a shader-gradient plane (soft on all edges)
  // drifting very slowly, veiling the low distant walls.
  const mistMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
    uniforms:{uOpacity:{value:.5},uColor:{value:new THREE.Color('#cfe2ea')}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec2 vUv;uniform float uOpacity;uniform vec3 uColor;
    void main(){
      float a=smoothstep(.02,.42,vUv.y)*(1.0-smoothstep(.72,.98,vUv.y));
      a*=smoothstep(0.0,.18,vUv.x)*(1.0-smoothstep(.82,1.0,vUv.x));
      gl_FragColor=vec4(uColor,a*uOpacity);
    }`});
  const mistPlane=new THREE.Mesh(new THREE.PlaneGeometry(2.2,.55),mistMaterial);
  mistPlane.position.set(0,.16,-1.18);mistPlane.name='GateMist';root.add(mistPlane);

  // A shallow stream curls across the front sand, with foam dots.
  const streamShape=new THREE.Shape();
  const streamPts:THREE.Vector2[]=[];
  for(let i=0;i<=14;i++){const u=i/14;streamPts.push(new THREE.Vector2(-.62+.95*u+.06*Math.sin(u*5.2),.92-.30*u-.05*Math.sin(u*3.1)));}
  streamPts.forEach((p,i)=>{const w=.075+.02*Math.sin(i*1.3);i?streamShape.lineTo(p.x+w,p.y+w*.4):streamShape.moveTo(p.x-w,p.y-w*.4);});
  [...streamPts].reverse().forEach((p,i)=>{const w=.075+.02*Math.sin((14-i)*1.3);i?streamShape.lineTo(p.x-w,p.y-w*.4):streamShape.lineTo(p.x+w,p.y+w*.4);});
  streamShape.closePath();
  const streamGeometry=new THREE.ShapeGeometry(streamShape,6);streamGeometry.rotateX(-Math.PI/2);
  const streamMaterial=new THREE.MeshStandardMaterial({color:'#7fb8ac',roughness:.16,metalness:.05});
  const stream=mesh(streamGeometry,streamMaterial,[0,.024,0]);stream.name='GateStream';
  for(let i=1;i<12;i+=2){
    const p=streamPts[i];
    mesh(new THREE.SphereGeometry(.014,8,6),m.ivory,[p.x,.032,p.y]).scale.set(1.6,.3,1);
  }

  // Stone steps climb the left leg's outer face toward a ledge.
  for(let i=0;i<9;i++){
    const t=.06+.62*i/8,{x,y,z,w}=legLayerTransform(t,-1);
    cube([x-Math.cos(.35)*(w/2+.05),y+.02,z+.06],[.13,.026,.10],'stone',[0,.3,0],i%2?'#dcc9a4':'#cbb693');
  }
  // Three tiny hikers give the gate its scale.
  const figure=(position:V,coat:string)=>{
    add('gate-figures',cylinder,m.plaster,{position:[position[0],position[1]+.024,position[2]],scale:[.011,.048,.011],color:coat});
    add('gate-figures',cylinder,m.plaster,{position:[position[0],position[1]+.058,position[2]],scale:[.008,.008,.008],color:'#e8c9a0'});
  };
  figure([-.02,GATE.bridgeY+.02,bridgeZ],'#3b7274');
  figure([-.66,.10,.30],'#c27550');
  figure([-.60,.11,.36],'#5e8a73');
  // Shrubbery pockets on ledges and plaza corners.
  for(const [x,y,z,s] of [[-.55,.42,-.18,.6],[.58,.46,-.12,.7],[-.72,.06,.42,1],[.74,.05,.30,.9],[.05,.03,.62,.8],[-.35,.028,.55,.7]] as const){
    for(let i=0;i<10;i++){
      const a=i*2.399963,rr=.05*s*Math.sqrt(random());
      add('gate-shrubs',leaf,m.leaf,{position:[x+Math.cos(a)*rr,y+.03*s+random()*.02,z+Math.sin(a)*rr],scale:[.03*s,.02*s,.026*s],rotation:[random(),a,random()],color:['#75835b','#8b9870','#657954','#a2a780'][i%4]});
    }
  }

  for(const [name,batch] of batches){
    const instanced=new THREE.InstancedMesh(batch.geometry,batch.material,batch.pieces.length),dummy=new THREE.Object3D();
    instanced.name=name;
    batch.pieces.forEach((p,i)=>{dummy.position.fromArray(p.position);dummy.scale.fromArray(p.scale);dummy.rotation.fromArray(p.rotation??[0,0,0]);dummy.updateMatrix();instanced.setMatrixAt(i,dummy.matrix);instanced.setColorAt(i,new THREE.Color(p.color??'#ffffff'));});
    instanced.castShadow=instanced.receiveShadow=true;root.add(instanced);
  }
  root.updateMatrixWorld(true);
  return {root,footprint:gateFootprint(),lanternMaterial,mistMaterial,mistPlane,streamMaterial,dispose(){root.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});geometries.forEach(g=>g.dispose());palette.dispose();lanternMaterial.dispose();mistMaterial.dispose();streamMaterial.dispose();}};
}
