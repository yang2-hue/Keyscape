import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeCoastalMaterials,seeded,type CoastalMaterials } from './coastal-materials';
import { HARBOR,keycapOutline } from './harbor-layout';

type V=[number,number,number];
type Piece={position:V;scale:V;rotation?:V;color?:string};
const smooth=THREE.MathUtils.smoothstep;
export function shoreLine(x:number){return -.25+.13*Math.sin(x*2.3)+.06*Math.cos(x*4.7);}
export function studyHeight(x:number,z:number){
  const bed=-.53+.10*Math.exp(-((x+.65)**2/1.3+(z-.22)**2/.8))+.006*Math.sin(x*34+Math.sin(z*9));
  const land=1-smooth(z,shoreLine(x)-.53,shoreLine(x)+.20);
  const hill=.23*Math.exp(-((x+.2)**2/1.2+(z+1.25)**2/.25));
  return bed+land*(.94+hill)+.009*Math.sin(x*14)*Math.cos(z*17)*land;
}
/** Shared keycap outline from the layout module. */
export function studyFootprint(){
  return keycapOutline();
}
function tileGeometry(){
  const g=new THREE.CylinderGeometry(.028,.028,.092,10,1,true,-Math.PI/2,Math.PI);
  g.rotateX(-Math.PI/2);return g;
}
function boulderGeometry(){
  const g=new THREE.SphereGeometry(1,24,18),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const v=1+.13*Math.sin(x*3.3+z*2.1)*Math.cos(y*3.7-z)+.045*Math.sin(x*8+y*5)*Math.cos(z*7-y);
    p.setXYZ(i,x*v,y*v,z*v);
  }g.computeVertexNormals();return g;
}

export function createCoastalStudy(time:{value:number}){
  const palette=makeCoastalMaterials(time,HARBOR.water),m=palette.materials;
  const root=new THREE.Group();root.name='HandbuiltCoastalStudy';
  const geometries=new Set<THREE.BufferGeometry>();
  const box=new RoundedBoxGeometry(1,1,1,2,.045),rock=boulderGeometry(),tile=tileGeometry();
  const slopeTile=tile.clone();slopeTile.rotateY(Math.PI/2);
  const leaf=new THREE.SphereGeometry(1,6,4),cylinder=new THREE.CylinderGeometry(1,1,1,12);
  [box,rock,tile,slopeTile,leaf,cylinder].forEach(g=>geometries.add(g));
  const batches=new Map<string,{geometry:THREE.BufferGeometry;material:THREE.Material;pieces:Piece[];heightfield:boolean}>();
  const add=(name:string,geometry:THREE.BufferGeometry,material:THREE.Material,piece:Piece,heightfield=true)=>{
    if(!batches.has(name))batches.set(name,{geometry,material,pieces:[],heightfield});
    batches.get(name)!.pieces.push(piece);
  };
  const cube=(position:V,scale:V,kind:keyof CoastalMaterials='stone',rotation:V=[0,0,0],color?:string)=>add('box-'+kind,box,m[kind],{position,scale,rotation,color});
  const stone=(x:number,y:number,z:number,sx:number,sy:number,sz:number,angle:number,color?:string)=>add('boulders',rock,m.rock,{position:[x,y,z],scale:[sx,sy,sz],rotation:[Math.sin(angle)*.18,angle,Math.cos(angle)*.13],color});
  const mesh=(geometry:THREE.BufferGeometry,material:THREE.Material,position:V=[0,0,0],parent:THREE.Object3D=root)=>{
    geometries.add(geometry);const object=new THREE.Mesh(geometry,material);object.position.fromArray(position);object.castShadow=object.receiveShadow=true;parent.add(object);return object;
  };
  const tube=(points:V[],radius:number,material:THREE.Material,parent:THREE.Object3D=root)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(curve,Math.max(12,points.length*6),radius,5,false),material,[0,0,0],parent);
  };
  // Continuous sand and land share one height function, with closed back/sides.
  const floor=new THREE.PlaneGeometry(3.14,3.14,112,112);floor.rotateX(-Math.PI/2);
  const fp=floor.attributes.position;
  for(let i=0;i<fp.count;i++){
    let x=fp.getX(i),z=fp.getZ(i),dx=Math.max(0,Math.abs(x)-1.41),dz=Math.max(0,Math.abs(z)-1.41);
    const length=Math.hypot(dx,dz);if(length>.16){x=Math.sign(x)*(Math.min(Math.abs(x),1.41)+dx/length*.16);z=Math.sign(z)*(Math.min(Math.abs(z),1.41)+dz/length*.16);}
    fp.setXYZ(i,x,studyHeight(x,z),z);
  }floor.computeVertexNormals();const landscape=mesh(floor,m.sand);landscape.name='ContinuousShore';
  const footprint=studyFootprint(),wallPoints:number[]=[];
  footprint.forEach((p,i)=>{
    const next=footprint[(i+1)%footprint.length],segments=Math.max(1,Math.ceil(p.distanceTo(next)/.08));
    for(let j=0;j<segments;j++){
      const a=p.clone().lerp(next,j/segments),b=p.clone().lerp(next,(j+1)/segments);
      wallPoints.push(a.x,-.59,a.y,a.x,studyHeight(a.x,a.y),a.y,b.x,studyHeight(b.x,b.y),b.y,a.x,-.59,a.y,b.x,studyHeight(b.x,b.y),b.y,b.x,-.59,b.y);
    }
  });
  const wall=new THREE.BufferGeometry();wall.setAttribute('position',new THREE.Float32BufferAttribute(wallPoints,3));wall.computeVertexNormals();
  const core=mesh(wall,m.rock);core.scale.set(.88,1,.88);
  const random=seeded(7341);
  // Rock strata follow the shore; open water is kept free of a perimeter rim.
  for(let i=0;i<98;i++){
    const x=-1.43+random()*2.86,z=shoreLine(x)-.10-random()*.22;
    const s=.073+random()*.08;
    stone(x,studyHeight(x,z)-.025,z,s*(1.0+random()*.5),s*(.65+random()*.45),s,random()*6);
  }
  for(let i=0;i<45;i++){
    const side=i<23?-1:1,x=side*(1.37+random()*.10),z=-1.42+random()*1.07;
    const s=.09+random()*.06;stone(x,studyHeight(x,z)-.055,z,s,s*.85,s*.95,random()*6);
  }
  // Carry the rock strata down the exposed sides, so rotation reveals a
  // geological cutaway rather than the smooth wall of a height-field block.
  for(const side of [-1,1])for(let j=0;j<10;j++){
    const x=side*1.45,z=-1.43+j*.145,top=studyHeight(x,z);
    for(let y=-.43+random()*.10;y<top-.025;y+=.16+random()*.10){const s=.10+random()*.045;stone(x,y,z+(random()-.5)*.045,s,s*(.80+random()*.35),s*1.15,random()*6);}
  }
  for(let j=0;j<19;j++){
    const x=-1.40+j*.155+(random()-.5)*.045,z=-1.46,top=studyHeight(x,z);
    for(let y=-.43+random()*.10;y<top-.025;y+=.16+random()*.10)stone(x,y,z,.10+random()*.04,.10+random()*.05,.11,random()*6);
  }
  for(let i=0;i<18;i++){
    const x=-1.3+random()*2.6,z=.15+random()*1.13,s=.045+random()*.11;
    stone(x,studyHeight(x,z)+s*.15,z,s*1.3,s*.7,s,random()*6,'#c1c7b4');
  }
  for(let i=0;i<260;i++){
    const x=-1.45+random()*2.9,z=-.38+random()*1.8,s=.005+random()*.013;
    add('pebbles',rock,m.stone,{position:[x,studyHeight(x,z)+s*.3,z],scale:[s*1.3,s*.6,s],rotation:[0,random()*6,0],color:random()>.5?'#e8dec6':'#c1bba7'},false);
  }
  const houses=[
    {x:-.61,z:-.93,w:.57,d:.48,h:.51},
    {x:.25,z:-1.13,w:.61,d:.54,h:.65},
    {x:1.04,z:-.82,w:.41,d:.41,h:.43},
  ];
  const floors:number[]=[];
  function window(x:number,y:number,z:number,w=.105,h=.16,angle=0){
    // A small local coordinate transform keeps side and rear windows editable.
    const local=(a:number,b:number,c:number):V=>[x+a*Math.cos(angle)+c*Math.sin(angle),y+b,z-a*Math.sin(angle)+c*Math.cos(angle)];
    cube(local(0,0,0),[w+.035,h+.035,.021],'stone',[0,angle,0]);
    cube(local(0,0,.014),[w,h,.012],'glass',[0,angle,0]);
    cube(local(0,0,.025),[.007,h,.007],'wood',[0,angle,0]);
    cube(local(0,0,.025),[w,.007,.007],'wood',[0,angle,0]);
    for(const side of [-1,1]){
      cube(local(side*(w*.5+.024),0,.022),[.035,h+.01,.016],'teal',[0,angle,0]);
      for(let j=0;j<6;j++)cube(local(side*(w*.5+.024),-h*.42+j*h*.16,.034),[.029,.006,.008],'teal',[0,angle,0],'#d6e0ca');
    }
    cube(local(0,-h*.5-.021,.019),[w+.065,.016,.047],'stone',[0,angle,0]);
  }
  for(const [n,h] of houses.entries()){
    const samples=[-.5,.5].flatMap(a=>[-.5,.5].map(b=>studyHeight(h.x+a*h.w,h.z+b*h.d)));
    const base=Math.max(...samples)+.015;floors.push(base);
    const front=h.z+h.d*.5,foundation=base-studyHeight(h.x,front+.10)+.035;
    cube([h.x,base-foundation/2,h.z],[h.w+.12,foundation,h.d+.12],'stone');
    const rows=Math.max(2,Math.ceil(foundation/.055));
    for(let row=0;row<rows;row++)for(let col=0;col<7;col++){
      const pitch=(h.w+.13)/7;
      cube([h.x-h.w/2-.05+(col+.5)*pitch,base-foundation+(row+.5)*foundation/rows,front+.067],[pitch-.004,foundation/rows-.004,.018],'stone',[0,0,0],['#fff8e8','#e1d9c4','#eee7d5'][(row+col)%3]);
    }
    cube([h.x,base+h.h/2,h.z],[h.w,h.h,h.d],'plaster');
    const rise=h.w*.34,shape=new THREE.Shape();shape.moveTo(-h.w/2,0);shape.lineTo(h.w/2,0);shape.lineTo(0,rise);shape.closePath();
    const gable=new THREE.ExtrudeGeometry(shape,{depth:h.d,bevelEnabled:false});mesh(gable,m.plaster,[h.x,base+h.h,h.z-h.d/2]);
    const overhang=.045,half=h.w/2+overhang,slope=Math.atan2(rise,half),slopeLength=Math.hypot(half,rise);
    for(const side of [-1,1]){
      cube([h.x+side*half/2,base+h.h+rise/2,h.z],[slopeLength,.024,h.d+overhang*2],'darkwood',[0,0,-side*slope]);
      const rows=Math.ceil(half/.072),columns=Math.ceil((h.d+overhang*2)/.053);
      for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
        const u=(row+.5)/rows;
        add('barrel-tiles',slopeTile,m.roof,{position:[h.x+side*half*u,base+h.h+rise*(1-u)+.012,h.z-(h.d+overhang*2)/2+(col+.5)*(h.d+overhang*2)/columns],scale:[1,.60,1],rotation:[0,0,-side*slope],color:['#ffe7cc','#efc5a1','#f7d6b2','#e8b694'][(row*3+col+n)%4]},false);
      }
      cube([h.x+side*half,base+h.h-.005,h.z],[.022,.031,h.d+.10],'darkwood');
    }
    for(let z=-h.d/2-.025;z<h.d/2+.08;z+=.085)add('ridge-tiles',tile,m.roof,{position:[h.x,base+h.h+rise+.028,h.z+z],scale:[.75,.75,1],color:'#efc5a5'},false);
    const chimneyX=h.x+h.w*.28;
    cube([chimneyX,base+h.h+rise*.65+.08,h.z-.07],[.066,.22,.075],'stone');
    cube([chimneyX,base+h.h+rise*.65+.20,h.z-.07],[.087,.022,.092],'roof');
    cube([chimneyX,base+h.h+rise*.65+.213,h.z-.07],[.045,.006,.049],'glass');
    window(h.x-h.w*.24,base+h.h*.67,front+.012,.095,.155);
    if(n===1)window(h.x+h.w*.25,base+h.h*.72,front+.012,.10,.16);
    window(h.x+h.w/2+.008,base+h.h*.65,h.z,.09,.145,Math.PI/2);
    window(h.x-h.w/2-.008,base+h.h*.65,h.z,.09,.145,-Math.PI/2);
    if(n===1)window(h.x-h.w/2-.008,base+h.h*.28,h.z,.085,.13,-Math.PI/2);
    window(h.x,base+h.h*.66,h.z-h.d/2-.008,.095,.15,Math.PI);
    cube([h.x+h.w*.20,base+.145,front+.012],[.115,.29,.026],'stone');
    cube([h.x+h.w*.20,base+.135,front+.031],[.085,.26,.018],'teal');
    for(let i=0;i<5;i++)cube([h.x+h.w*.20-.032+i*.016,base+.135,front+.043],[.003,.245,.005],'darkwood');
    for(let r=0;r<Math.floor(h.h/.075);r++)for(const side of [-1,1])cube([h.x+side*(h.w/2-.018),base+.045+r*.075,front+.005],[.072,.052,.018],'stone',[0,0,0],r%2?'#eee6d4':'#d3c5aa');
    for(let i=0;i<16;i++){
      const x=h.x-h.w/2+.06+random()*(h.w-.12),y=.045+random()*h.h*.65;
      if(Math.abs(x-(h.x+h.w*.20))<.08&&y<.32)continue;
      if(Math.abs(x-(h.x-h.w*.24))<.08&&Math.abs(y-h.h*.67)<.11)continue;
      cube([x,base+y,front+.006],[.045+random()*.035,.033,.009],'stone',[0,0,0],i%3?'#f4eddf':'#ded2bc');
    }
    // Door terrace and stepping stones are anchored to this house's own level.
    for(let i=0;i<7;i++)cube([h.x-h.w/2+.045+i*(h.w/7),base-.015,front+.11],[h.w/7-.007,.025,.17],'stone',[0,(i%2)*.04,0]);
    for(let i=0;i<5;i++){
      const z=front+.20+i*.055,top=THREE.MathUtils.lerp(base-.03,studyHeight(h.x+h.w*.20,z)+.025,(i+1)/5);
      cube([h.x+h.w*.20,top-.025,z],[.17,.05,.07],'stone');
    }
    for(const side of [-1,1]){
      const x=h.x+side*h.w*.45,z=front+.12;
      const pot=new THREE.LatheGeometry([new THREE.Vector2(.019,0),new THREE.Vector2(.031,.045),new THREE.Vector2(.035,.048),new THREE.Vector2(.035,.055),new THREE.Vector2(.025,.055),new THREE.Vector2(.023,.043)],16);
      mesh(pot,m.terra,[x,base,z]);
      for(let j=0;j<28;j++){
        const a=j*2.399,s=.011+random()*.005;
        add('flowers',leaf,m.leaf,{position:[x+Math.cos(a)*random()*.04,base+.065+random()*.027,z+Math.sin(a)*random()*.03],scale:[s,s*.65,s],color:j%4?'#8b9b5e':'#bf6d81'},false);
      }
    }
  }
  // A low curved stair links the keeper's upper terrace to the shore.
  for(let i=0;i<13;i++){
    const u=i/12,x=.35+Math.sin(u*Math.PI)*.16,z=-.76+u*.57;
    const top=THREE.MathUtils.lerp(floors[1]-.02,HARBOR.water+.06,u);
    cube([x,top-.035,z],[.25,.07,.075],'stone');
  }
  // Lighthouse: stepped stone plinth, tapered shaft, open gallery and lantern.
  const tower=new THREE.Group(),tx=-1.03,tz=-1.24,ty=studyHeight(tx,tz)+.035;tower.position.set(tx,ty,tz);root.add(tower);
  mesh(new THREE.CylinderGeometry(.17,.19,.055,48),m.stone,[0,.027,0],tower);
  mesh(new THREE.CylinderGeometry(.075,.114,.62,48),m.plaster,[0,.36,0],tower);
  for(const y of [.10,.30,.50]){
    const o=mesh(box,m.glass,[0,y,.117-y*.052],tower);o.scale.set(.029,.055,.012);
  }
  mesh(new THREE.CylinderGeometry(.14,.12,.035,48),m.stone,[0,.685,0],tower);
  mesh(new THREE.CylinderGeometry(.067,.067,.15,16),m.glass,[0,.78,0],tower);
  const lanternMaterial=new THREE.MeshStandardMaterial({color:'#f4dfa4',emissive:'#ffbf65',emissiveIntensity:.2,roughness:.55});
  const lantern=mesh(new THREE.SphereGeometry(.04,12,8),lanternMaterial,[0,.78,0],tower);lantern.name='StudyLantern';
  for(let i=0;i<10;i++){
    const a=i*Math.PI/5;
    mesh(new THREE.CylinderGeometry(.0025,.0025,.07,6),m.metal,[Math.cos(a)*.12,.735,Math.sin(a)*.12],tower);
    if(i%2===0)mesh(new THREE.CylinderGeometry(.003,.003,.17,6),m.metal,[Math.cos(a)*.074,.78,Math.sin(a)*.074],tower);
  }
  for(const y of [.715,.765]){const ring=mesh(new THREE.TorusGeometry(.12,.0025,5,48),m.metal,[0,y,0],tower);ring.rotation.x=Math.PI/2;}
  mesh(new THREE.ConeGeometry(.108,.095,24),m.roof,[0,.9,0],tower);
  // Wooden jetty: independent deck, bearers, pilings and diagonal struts.
  const dockX=.33,start=-.12,end=.61,deck=HARBOR.water+.095;
  for(let i=0;i<20;i++)cube([dockX,deck,start+(i+.5)*(end-start)/20],[.33,.019,(end-start)/20-.003],'wood',[0,0,Math.sin(i)*.005],i%3?'#f1e4c7':'#c8b89a');
  for(const side of [-1,1]){
    cube([dockX+side*.125,deck-.030,(start+end)/2],[.028,.045,end-start+.04],'darkwood');
    for(const z of [start+.02,.24,end-.02]){
      const bottom=studyHeight(dockX+side*.17,z)-.03,top=deck+.095;
      add('pier-posts',cylinder,m.darkwood,{position:[dockX+side*.17,(top+bottom)/2,z],scale:[.017,top-bottom,.017]});
      mesh(new THREE.CylinderGeometry(.021,.021,.008,12),m.wood,[dockX+side*.17,top+.003,z]);
    }
    const a=new THREE.Vector3(dockX+side*.14,deck-.20,.28),b=new THREE.Vector3(dockX+side*.14,deck-.04,.57);
    const brace=mesh(new THREE.CylinderGeometry(.008,.008,a.distanceTo(b),8),m.darkwood,a.clone().add(b).multiplyScalar(.5).toArray() as V);brace.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize());
  }
  // Coiled rope is flat on the deck, rather than a stack of tori.
  const coil:V[]=[];for(let i=0;i<120;i++){const u=i/119,a=u*Math.PI*8,r=.012+u*.042;coil.push([dockX+Math.cos(a)*r,deck+.014,.47+Math.sin(a)*r]);}tube(coil,.002,m.rope);
  // Groundcover and individual olive leaves keep the silhouette airy.
  for(let i=0;i<1300;i++){
    const x=-1.45+random()*2.9,z=-1.43+random()*1.17;
    if(houses.some(h=>Math.abs(x-h.x)<h.w*.6&&Math.abs(z-h.z)<h.d*.6)||Math.hypot(x-tx,z-tz)<.21||Math.abs(x-.40)<.17&&z>-.8)continue;
    const y=studyHeight(x,z);if(y<HARBOR.water+.12)continue;
    const s=.008+random()*.014;
    add('groundcover',leaf,m.leaf,{position:[x,y+.012+random()*.018,z],scale:[s*1.6,s*.7,s],rotation:[random(),random()*6,random()],color:['#75835b','#8b9870','#a2a780','#657954'][i%4]},false);
  }
  for(const [x,z] of [[-1.31,-1.02],[-1.30,-.38],[-.16,-.80],[.65,-1.37],[.73,-.64],[1.30,-1.14],[1.31,-.44],[-.35,-1.40]]){
    const y=studyHeight(x,z);
    for(let i=0;i<85;i++){
      const a=i*2.399963,r=Math.sqrt(random())*.13;
      add('coastal-shrubs',leaf,m.leaf,{position:[x+Math.cos(a)*r,y+.05+random()*.065,z+Math.sin(a)*r*.72],scale:[.024,.012,.015],rotation:[random(),a,random()],color:['#486236','#6e8751','#8e9b68','#587740'][i%4]},false);
    }
  }
  for(const [x,z] of [[-.10,-1.43],[.88,-1.35]]){
    const y=studyHeight(x,z);
    for(let i=0;i<190;i++){
      const t=random(),a=i*2.399963,r=(1-t)*.045*Math.sqrt(random());
      add('cypress-leaves',leaf,m.leaf,{position:[x+Math.cos(a)*r,y+.06+t*.40,z+Math.sin(a)*r],scale:[.013,.024,.012],rotation:[0,a,0],color:['#586d3f','#657c49','#7b8c58'][i%3]},false);
    }
  }
  for(const [x,z,s] of [[-1.18,-.43,.82],[.78,-.43,.90],[1.32,-.90,.80]] as const){
    const y=studyHeight(x,z);
    add('olive-trunks',cylinder,m.darkwood,{position:[x,y+.18*s,z],scale:[.009*s,.36*s,.009*s],rotation:[0,0,.12]},false);
    for(let branch=0;branch<3;branch++){
      const a=branch*2.399;
      for(let i=0;i<150;i++){
        const angle=i*2.399963,r=Math.sqrt(random())*.12*s;
        const px=x+Math.cos(a)*.06*s+Math.cos(angle)*r,pz=z+Math.sin(a)*.05*s+Math.sin(angle)*r*.70;
        add('olive-leaves',leaf,m.leaf,{position:[px,y+.43*s+(random()-.5)*.09*s,pz],scale:[.022*s,.004*s,.009*s],rotation:[random()*2,angle,random()*.6],color:['#6b8055','#91a173','#536d42','#acb58b'][i%4]},false);
      }
    }
  }
  // Submerged grasses are sparse, leaving sand and stones readable.
  for(let i=0;i<90;i++){
    const x=-1.35+random()*2.7,z=.28+random()*1.10;
    if(random()>.40)continue;
    for(let k=0;k<5;k++){
      const h=.045+random()*.09;
      add('seagrass',leaf,m.leaf,{position:[x+(random()-.5)*.06,studyHeight(x,z)+h*.45,z+(random()-.5)*.06],scale:[.006,h*.5,.006],rotation:[.15,random()*6,(random()-.5)*.6],color:k%2?'#5e8a73':'#91ab85'},false);
    }
  }
  for(const [name,batch] of batches){
    const instanced=new THREE.InstancedMesh(batch.geometry,batch.material,batch.pieces.length),dummy=new THREE.Object3D();
    instanced.name=name;instanced.userData.ignoreHeightfield=!batch.heightfield;
    batch.pieces.forEach((p,i)=>{dummy.position.fromArray(p.position);dummy.scale.fromArray(p.scale);dummy.rotation.fromArray(p.rotation??[0,0,0]);dummy.updateMatrix();instanced.setMatrixAt(i,dummy.matrix);instanced.setColorAt(i,new THREE.Color(p.color??'#ffffff'));});
    instanced.castShadow=instanced.receiveShadow=true;root.add(instanced);
  }
  // The boat is a separately authored object, with a lofted hull and real deck.
  const boat=new THREE.Group();boat.name='HarborBoat';
  const sections=[[-.34,.005,.7],[-.25,.095,1],[-.1,.122,1],[.1,.12,1],[.26,.085,.9],[.33,.035,.65]];
  const hp:number[]=[],hi:number[]=[],hc:number[]=[],segments=16;
  for(let j=0;j<sections.length;j++)for(let i=0;i<=segments;i++){
    const [z,w,d]=sections[j],a=-Math.PI/2+i/segments*Math.PI,y=.045-.16*d*Math.cos(a);
    hp.push(w*Math.sin(a),y,z);
    const color=new THREE.Color(y<-.025?'#4c858b':'#f0e6cf');hc.push(color.r,color.g,color.b);
    if(j<sections.length-1&&i<segments){const k=j*(segments+1)+i;hi.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2);}
  }
  const hull=new THREE.BufferGeometry();hull.setAttribute('position',new THREE.Float32BufferAttribute(hp,3));hull.setAttribute('color',new THREE.Float32BufferAttribute(hc,3));hull.setIndex(hi);hull.computeVertexNormals();
  const hullMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.6,side:THREE.DoubleSide});mesh(hull,hullMaterial,[0,0,0],boat);
  const deckShape=new THREE.Shape();sections.forEach(([z,w],i)=>i?deckShape.lineTo(w,z):deckShape.moveTo(w,z));[...sections].reverse().forEach(([z,w])=>deckShape.lineTo(-w,z));deckShape.closePath();
  const boatDeck=new THREE.ShapeGeometry(deckShape);boatDeck.rotateX(-Math.PI/2);const boatDeckMesh=mesh(boatDeck,m.wood,[0,.045,0],boat);boatDeckMesh.rotation.y=Math.PI;
  for(const side of [-1,1])tube(sections.map(([z,w])=>[side*w,.051,z] as V),.006,m.ivory,boat);
  const actorBox=(position:V,scale:V,material:THREE.Material)=>{const o=mesh(box,material,position,boat);o.scale.fromArray(scale);return o;};
  actorBox([0,.12,-.02],[.155,.15,.18],m.ivory);actorBox([0,.205,-.02],[.185,.022,.205],m.ivory);
  actorBox([0,.145,.076],[.112,.055,.009],m.glass);
  for(const side of [-1,1]){actorBox([side*.079,.145,-.02],[.008,.055,.11],m.glass);actorBox([side*.084,.145,-.02],[.009,.055,.006],m.ivory);}
  mesh(new THREE.CylinderGeometry(.004,.005,.37,8),m.wood,[0,.25,.16],boat);
  tube([[0,.425,.16],[.008,.24,.27],[0,.052,.32]],.0018,m.rope,boat);
  tube([[0,.425,.16],[-.008,.25,-.10],[0,.06,-.30]],.0018,m.rope,boat);
  actorBox([.03,.080,-.24],[.10,.06,.10],m.wood);
  const buoy=mesh(new THREE.TorusGeometry(.029,.009,8,24),m.orange,[.125,.060,-.16],boat);buoy.rotation.y=Math.PI/2;
  const fish=new THREE.Group();fish.name='HarborFish';
  const finShape=new THREE.Shape();finShape.moveTo(0,0);finShape.lineTo(-.037,.026);finShape.lineTo(-.028,0);finShape.lineTo(-.037,-.026);finShape.closePath();
  const tailGeometry=new THREE.ExtrudeGeometry(finShape,{depth:.003,bevelEnabled:false});tailGeometry.translate(0,0,-.0015);geometries.add(tailGeometry);
  const eyeGeometry=new THREE.SphereGeometry(.003,8,6);geometries.add(eyeGeometry);
  const fishActors:{body:THREE.Mesh;rest:Float32Array;tail:THREE.Group;fins:THREE.Mesh[]}[]=[];
  for(let i=0;i<4;i++){
    const animal=new THREE.Group();
    const bodyGeometry=new THREE.SphereGeometry(1,16,10);bodyGeometry.scale(.070,.024,.018);
    const body=mesh(bodyGeometry,m.fish,[0,0,0],animal);body.name='FishBody';
    const rest=new Float32Array(bodyGeometry.attributes.position.array);
    const tail=new THREE.Group();tail.name='FishTail';tail.position.x=-.064;animal.add(tail);mesh(tailGeometry,m.fish,[0,0,0],tail);
    const fins:THREE.Mesh[]=[];
    for(const side of [-1,1]){
      mesh(eyeGeometry,m.glass,[.052,.006,side*.013],animal);
      const fin=mesh(tailGeometry,m.fish,[.012,-.008,side*.016],animal);fin.scale.set(.45,.35,.5);fin.rotation.set(side*.9,side*.35,0);fins.push(fin);
    }
    fishActors.push({body,rest,tail,fins});
    fish.add(animal);
  }
  root.updateMatrixWorld(true);
  return {root,boat,fish,fishActors,footprint,lanternMaterial,dispose(){root.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});geometries.forEach(g=>g.dispose());palette.dispose();hullMaterial.dispose();lanternMaterial.dispose();}};
}
