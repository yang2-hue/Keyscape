import * as THREE from 'three';
import {createBeaconVolume} from './beacon-light.ts';
import {beachInfluence,headlandInfluence} from './coastal-composition.ts';
import {closeTerrainVolume} from './terrain-volume.ts';
import {addCoastalArt,applyCoastalScan,type CoastalArtAssets} from './coastal-asset-details.ts';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeCoastalMaterials,seeded,type CoastalMaterials } from './coastal-materials.ts';
import { HARBOR,roundedSquarePoint,keycapOutline } from './harbor-layout.ts';
import { limestoneGeometry,leafBladeGeometry,sculptCliffs,limestoneSurface } from './coastal-forms.ts';
import { COTTAGES,TOWER,TERRACE,MAIN_PATH,HOUSE_PATHS,SHORE_STAIRS,islandPoint,gradeAccessTerrain,keepAccessClear,stairTreads,nearestOnSegment } from './crescent-access.ts';

type V=[number,number,number];
/** Module-level polar helper: the dock footprint is derived at load time, before
 * the study factory runs. */
const polar=(angle:number,radius:number):[number,number,number]=>[CRESCENT.cx+Math.cos(angle)*radius,0,CRESCENT.cz+Math.sin(angle)*radius];
type Piece={position:V;scale:V;rotation?:V;color?:string};
const smooth=THREE.MathUtils.smoothstep;

/** The keycap outline comes from the shared layout module: the water volume,
 * the resin base and the terrain must never disagree about the footprint. */
export function bayFootprint(){
  return keycapOutline();
}

/** Crescent bay layout: an island arc around a shallow lagoon, with a wide
 * open sea channel facing the default camera's right side (+z in study space,
 * which the HARBOR.rotation display turn shows front-right). The opening must
 * never close into an O. */
export const CRESCENT={cx:-0.22,cz:0.06,rIn:0.70,rOut:1.30,openAt:Math.PI/2,openLo:0.55,openHi:1.25};
/** Boat berth beside the finger-dock head: far enough from the planks that the
 * hull never overlaps them, still inside the lagoon. Verified against the dock
 * footprint and the seabed (see `DOCK`). */
export const BERTH={x:0.09,z:0.32,heading:2.40};
/** Finger dock footprint (walkway + T platform) in study XZ, used by the boat's
 * clearance guard. Kept next to the geometry that builds it. */
export const PIER_HEAD=CRESCENT.rIn-.26;
export const PIER_ANGLE=-1.55;
export const DOCK=(()=>{
  const jettyA=PIER_ANGLE,headR=PIER_HEAD,platW=.46,platD=.19;
  const head=polar(jettyA,headR),shore=polar(jettyA,CRESCENT.rIn-.01);
  const box=(x0:number,x1:number,z0:number,z1:number)=>({x0,x1,z0,z1});
  return [
    box(Math.min(shore[0],head[0])-.09,Math.max(shore[0],head[0])+.09,Math.min(shore[2],head[2])-.09,Math.max(shore[2],head[2])+.09),
    box(head[0]-platW/2,head[0]+platW/2,head[2]-platD/2,head[2]+platD/2),
  ];
})();

/** The beacon is a visual effect, never a solid obstacle in the water field. */
export function createLighthouseBeam(){return createBeaconVolume();}

export function crescentHeight(x:number,z:number){
  const dx=x-CRESCENT.cx,dz=z-CRESCENT.cz,r=Math.hypot(dx,dz);
  const a=Math.atan2(dz,dx),wrap=Math.abs(Math.atan2(Math.sin(a-CRESCENT.openAt),Math.cos(a-CRESCENT.openAt)));
  const open=smooth(wrap,CRESCENT.openLo,CRESCENT.openHi);
  const shapedR=r+.060*Math.sin(a*3+.4)+.024*Math.sin(a*7+.9)+.012*Math.sin(a*13);
  const bed=THREE.MathUtils.lerp(-.24,-.58,smooth(r,CRESCENT.rIn,CRESCENT.rOut+.35));
  const crest=.5+.5*Math.sin(wrap*2.6+.7);
  const noise=Math.sin(x*9.3+Math.sin(z*7.1)*1.7)*.5+Math.sin(x*21+z*17)*.25;
  // A low beach terrace precedes the higher limestone ridge. A single bell
  // curve made the entire inner bank a smooth retaining wall with no beach.
  const shelf=smooth(shapedR,.50,.68)*(1-smooth(shapedR,1.24,1.44));
  const ridge=smooth(shapedR,.88,1.06)*(1-smooth(shapedR,1.18,1.40));
  const land=open*(shelf*.34+ridge*(.33+.23*crest+.045*noise));
  // A gentle sand profile continues below the waterline; multiplying another
  // narrow ridge made the "beach" a raised lump with a vertical submerged rim.
  const beachProfile=.145-.95*Math.pow(shapedR-.96,2);
  const beachRamp=smooth(shapedR,.48,.67)*(1-smooth(shapedR,1.42,1.64));
  const sandBank=bed+(beachProfile-bed)*open*beachRamp;
  let natural=THREE.MathUtils.lerp(bed+land,sandBank,beachInfluence(a));
  // A single high outcrop behind the village replaces the equal-height ring.
  const backRidge=smooth(shapedR,1.10,1.25)*(1-smooth(shapedR,1.33,1.49));
  natural+=open*headlandInfluence(a)*backRidge*.25;
  return gradeAccessTerrain(x,z,natural+.006*Math.sin(x*15)*Math.cos(z*13)*(1-open*ridge));
}

/** Programmatic crescent bay. Keeps island, lighthouse, cabins, boat and fish
 * as separately authored objects so each can be tuned without re-baking. */
export function createCrescentBay(time:{value:number},artAssets?:CoastalArtAssets){
  const palette=makeCoastalMaterials(time,HARBOR.water,.40),m=palette.materials;
  m.rock.color.set('#e5dfd0');m.stone.color.set('#e8e0ce');m.leaf.side=THREE.DoubleSide;
  // The shared 256 px stone tile is stretched once across the whole key, so at
  // close range the cliffs read as smooth clay. Tile it and deepen the bump on
  // the two surfaces that are mostly rock.
  const extraTextures:THREE.Texture[]=[];
  const retile=(source:THREE.Material,repeat:number)=>{
    const material=source as THREE.MeshStandardMaterial;
    // Colour and normal must share the tiling or the grain slides off the relief.
    for(const key of ['map','normalMap'] as const){
      const source_=material[key];
      if(!source_)continue;
      const texture=source_.clone();texture.repeat.set(repeat,repeat);texture.anisotropy=8;texture.needsUpdate=true;
      material[key]=texture;extraTextures.push(texture);
    }
  };
  retile(m.rock,3.5);
  // Separate limestone cliffs, warm beach and cooler submerged rock.
  const terrainMaterial=m.rock.clone();terrainMaterial.vertexColors=true;terrainMaterial.color.set('#ffffff');
  retile(terrainMaterial,7);
  terrainMaterial.normalScale.set(.65,.65);m.rock.normalScale.set(.8,.8);
  terrainMaterial.onBeforeCompile=m.rock.onBeforeCompile;
  if(artAssets)applyCoastalScan(terrainMaterial,artAssets.rock.material as THREE.MeshStandardMaterial);
  else limestoneSurface(terrainMaterial,'crescent-cliff-v16');
  limestoneSurface(m.rock,'crescent-outcrop-v16');
  const root=new THREE.Group();root.name='CrescentBayStudy';
  const geometries=new Set<THREE.BufferGeometry>();
  const box=new RoundedBoxGeometry(1,1,1,2,.045),rocks=[limestoneGeometry(11),limestoneGeometry(37),limestoneGeometry(83)];
  const leaf=new THREE.SphereGeometry(1,8,6),blade=leafBladeGeometry(),cylinder=new THREE.CylinderGeometry(1,1,1,12);
  [box,...rocks,leaf,blade,cylinder].forEach(g=>geometries.add(g));
  const batches=new Map<string,{geometry:THREE.BufferGeometry;material:THREE.Material;pieces:Piece[];heightfield:boolean}>();
  const add=(name:string,geometry:THREE.BufferGeometry,material:THREE.Material,piece:Piece,heightfield=true)=>{
    if(/groundcover|scrub|olive-leaves|cypress|lavender|bay-shrubs|wildflowers/.test(name)){
      const x=piece.position[0],z=piece.position[2];
      if(keepAccessClear(x,z,.025))return;
      if(beachInfluence(Math.atan2(z-CRESCENT.cz,x-CRESCENT.cx))>.45&&crescentHeight(x,z)<.28)return;
    }
    if(!batches.has(name))batches.set(name,{geometry,material,pieces:[],heightfield});
    batches.get(name)!.pieces.push(piece);
  };
  const cube=(position:V,scale:V,kind:keyof CoastalMaterials='stone',rotation:V=[0,0,0],color?:string)=>add('box-'+kind,box,m[kind],{position,scale,rotation,color});
  const stone=(x:number,y:number,z:number,sx:number,sy:number,sz:number,angle:number,color?:string)=>{
    if(beachInfluence(Math.atan2(z-CRESCENT.cz,x-CRESCENT.cx))>.6&&crescentHeight(x,z)>.03&&Math.max(sx,sz)>.035)return;
    const extent=Math.max(sx,sz)*1.15;
    if(keepAccessClear(x,z,extent)||Math.abs(x)+extent>1.54||Math.abs(z)+extent>1.54)return;
    const v=Math.floor(random()*3);add('boulders-'+v,rocks[v],m.rock,{position:[x,y,z],scale:[sx,sy,sz],rotation:[Math.sin(angle)*.18,angle,Math.cos(angle)*.13],color});
  };
  const mesh=(geometry:THREE.BufferGeometry,material:THREE.Material,position:V=[0,0,0],parent:THREE.Object3D=root)=>{
    geometries.add(geometry);const object=new THREE.Mesh(geometry,material);object.position.fromArray(position);object.castShadow=object.receiveShadow=true;parent.add(object);return object;
  };
  const random=seeded(8209);
  // Continuous lagoon/sea bed and island share one height function.
  // 176 cells across 3.14 units is 1.8 cm per cell: cliffs stop reading as a
  // staircase of flat quads when the camera comes close.
  const floor=new THREE.PlaneGeometry(3.14,3.14,176,176);floor.rotateX(-Math.PI/2);
  const fp=floor.attributes.position,segments=176,row=segments+1,cell=3.14/segments;
  for(let i=0;i<fp.count;i++){
    const [x,z]=roundedSquarePoint(fp.getX(i),fp.getZ(i));
    fp.setXYZ(i,x,crescentHeight(x,z),z);
  }
  sculptCliffs(floor);
  floor.computeVertexNormals();
  const colors:number[]=[],sandColor=new THREE.Color('#ead9b9'),cliffColor=new THREE.Color('#cbc9b9'),deepColor=new THREE.Color('#749892');
  const normal=floor.attributes.normal;
  for(let i=0;i<fp.count;i++){
    const h=fp.getY(i),n=normal.getY(i),c=new THREE.Color();
    if(h<HARBOR.water-.15)c.copy(deepColor).lerp(sandColor,smooth(h,-.50,-.12));
    else c.copy(cliffColor).lerp(sandColor,smooth(n,.75,.98));
    const shoreAngle=Math.atan2(fp.getZ(i)-CRESCENT.cz,fp.getX(i)-CRESCENT.cx);
    c.lerp(sandColor,beachInfluence(shoreAngle)*smooth(h,-.20,.01));
    c.multiplyScalar(.94+.06*Math.sin(fp.getX(i)*19+fp.getZ(i)*14));
    // Cheap baked ambient occlusion from the grid itself: a vertex sitting
    // below its four neighbours is in a fold, and folds are what makes a cliff
    // read as rock instead of a smooth wall. No extra height samples needed.
    if(h>HARBOR.water-.10){
      const left=i%row>0?fp.getY(i-1):h,right=i%row<row-1?fp.getY(i+1):h;
      const back=i>=row?fp.getY(i-row):h,front=i+fp.count-row<fp.count?fp.getY(i+row):h;
      const fold=Math.max(0,(left+right+back+front)*.25-h);
      c.multiplyScalar(1-Math.min(.30,fold*7));
    }
    colors.push(c.r,c.g,c.b);
  }
  floor.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  // The heightfield reaches the keycap cut face. Close its boundary down into
  // the plinth; a lone top surface exposed a false underwater arch at low views.
  const solidTerrain=closeTerrainVolume(floor,HARBOR.bottom+.10);floor.dispose();
  const landscape=mesh(solidTerrain,terrainMaterial);landscape.name='CrescentShore';
  // Shore boulders along both island edges, skipping the open channel.
  for(let i=0;i<(artAssets?32:120);i++){
    const a=(random()*2-1)*Math.PI*.94,s=random()<.5?CRESCENT.rIn-.10-random()*.10:CRESCENT.rOut+.06+random()*.12;
    const [x,,z]=polar(a,s);
    if(Math.abs(Math.atan2(Math.sin(a-CRESCENT.openAt),Math.cos(a-CRESCENT.openAt)))<.7)continue;
    const size=.06+random()*.09;
    stone(x,crescentHeight(x,z)-size*.3,z,size,size*.75,size*.9,random()*6);
  }
  // Reef stones in the shallow lagoon, away from the boat berth.
  // Reef stones hug the shore ring, never the middle: the lagoon is the boat's
  // track and the fish's room, and stones there taught both of them to swim
  // through geometry.
  for(let i=0;i<14;i++){
    const a=random()*Math.PI*2,r=.54+random()*.12,x=CRESCENT.cx+Math.cos(a)*r,z=CRESCENT.cz+Math.sin(a)*r;
    if(Math.hypot(x-BERTH.x,z-BERTH.z)<.30)continue;
    const s=.035+random()*.05;
    stone(x,crescentHeight(x,z)+s*.2,z,s*1.3,s*.6,s,random()*6,'#c1c7b4');
  }
  for(let i=0;i<160;i++){
    const a=(random()*2-1)*Math.PI,r=CRESCENT.rIn-.16+random()*.20;
    const [x,,z]=polar(a,r);
    if(Math.abs(Math.atan2(Math.sin(a-CRESCENT.openAt),Math.cos(a-CRESCENT.openAt)))<.75)continue;
    const h=crescentHeight(x,z);if(h<HARBOR.water-.05||h>HARBOR.water+.10)continue;
    const s=.005+random()*.012;
    add('pebbles',rocks[Math.floor(random()*3)],m.stone,{position:[x,h+s*.3,z],scale:[s*1.3,s*.6,s],rotation:[0,random()*6,0],color:random()>.5?'#e8dec6':'#c1bba7'},false);
  }
  // Layered cliff outcrops break the mathematically smooth island silhouette.
  for(let i=0;i<(artAssets?35:310);i++){
    const a=random()*Math.PI*2,wrap=Math.abs(Math.atan2(Math.sin(a-CRESCENT.openAt),Math.cos(a-CRESCENT.openAt)));
    if(wrap<.88)continue;
    const r=.83+random()*.34,[x,,z]=polar(a,r),y=crescentHeight(x,z);
    if(y<HARBOR.water-.06)continue;
    const s=.035+random()*.075;
    stone(x,y-s*.27,z,s*(1+random()*.4),s*(.7+random()*.5),s,random()*6,['#f3efe5','#dddcd2','#ece6d7','#c5c7bd'][i%4]);
  }
  // Exposed strata on the inner cliff; staggered rows avoid a smooth dam wall.
  for(let row=0;row<(artAssets?0:4);row++)for(let i=0;i<90;i++){
    const a=i/90*Math.PI*2+(random()-.5)*.045;
    const wrap=Math.abs(Math.atan2(Math.sin(a-CRESCENT.openAt),Math.cos(a-CRESCENT.openAt)));
    if(wrap<1.12)continue;
    const r=.79+row*.046+(random()-.5)*.025,[x,,z]=polar(a,r),y=crescentHeight(x,z);
    if(y<HARBOR.water+.08)continue;
    const s=.035+random()*.036;
    stone(x,y-.008,z,s*1.5,s*.85,s,random()*6,['#eee9dc','#d9d8cb','#e1ddce','#c5c6ba'][i%4]);
  }
  // Two small cottages share one transform for walls, roof, doors and tiles.
  for(let i=0;i<(artAssets?16:95);i++){
    const a=2.3+random()*1.75,r=1.21+random()*.13,[x,,z]=polar(a,r),y=crescentHeight(x,z);
    if(y<HARBOR.water-.10)continue;
    const s=.035+random()*.045;
    stone(x,y-s*.35,z,s*1.25,s*.85,s,random()*6,['#dedbcf','#eee9db','#c8c8bb'][i%3]);
  }
  // Cottage window glass: warms up at dusk so the village looks inhabited.
  const windowMaterial=new THREE.MeshStandardMaterial({color:'#2e4a50',emissive:'#ffbf6e',emissiveIntensity:0,roughness:.4});
  const windowMaterials=COTTAGES.map((_,i)=>i===0?windowMaterial:windowMaterial.clone());
  const windowLights:THREE.PointLight[]=[];
  // Sized so a fishing boat (~.62 long) is about as long as a cottage is wide.
  const cabins=COTTAGES;
  for(const [n,c] of cabins.entries()){
    const [cx,,cz]=polar(c.a,c.r),ry=c.ry;
    const local=(dx:number,dz:number):V=>[cx+dx*Math.cos(ry)+dz*Math.sin(ry),0,cz-dx*Math.sin(ry)+dz*Math.cos(ry)];
    // Foundation follows the highest corner so cottages never float or sink
    // on the terrace slope.
    const cornerY=(dx:number,dz:number)=>{const [px,,pz]=local(dx,dz);return crescentHeight(px,pz);};
    const base=Math.max(
      cornerY(-c.w/2+.03,-c.d/2+.03),cornerY(c.w/2-.03,-c.d/2+.03),
      cornerY(-c.w/2+.03,c.d/2-.03),cornerY(c.w/2-.03,c.d/2-.03),
    )+.015;
    if(artAssets?.cottage){
      const cottage=artAssets.cottage.clone(true);cottage.name='CoastalCottage-'+n;
      cottage.position.set(cx,base,cz);cottage.rotation.y=ry;cottage.scale.set(c.w/.32,c.h/.24,c.d/.26);
      cottage.traverse(o=>{
        if(o instanceof THREE.Mesh){o.castShadow=o.receiveShadow=true;
          if(o.name==='CottageWindowPanes')o.material=windowMaterials[n];
        }
      });
      root.add(cottage);
      // A bounded, non-shadowed spill beside the visible window warms its
      // frame and adjacent stone without lighting the entire island.
      const [lx,,lz]=local(-c.w/2-.025,0);
      const spill=new THREE.PointLight('#ffc78a',0,.50,2);spill.name='CottageWindowSpill-'+n;
      spill.position.set(lx,base+c.h*.62,lz);root.add(spill);windowLights.push(spill);
      continue;
    }
    cube([cx,base-.024,cz],[c.w+.065,.055,c.d+.065],'stone',[0,ry,0]);
    cube([cx,base+c.h/2,cz],[c.w,c.h,c.d],'plaster',[0,ry,0]);
    const rise=c.w*.32,half=c.w/2+.04,slope=Math.atan2(rise,half),len=Math.hypot(half,rise);
    for(const side of [-1,1]){
      cube([cx+side*half/2*Math.cos(ry),base+c.h+rise/2,cz-side*half/2*Math.sin(ry)],[len,.012,c.d+.06],'roof',[0,ry,-side*slope]);
      for(let row=0;row<7;row++)for(let col=0;col<11;col++){
        const u=(row+.5)/7,v=(col+.5)/11;
        const [x,,z]=local(side*half*u,(v-.5)*(c.d+.06));
        add('cottage-tiles',cylinder,m.roof,{position:[x,base+c.h+rise*(1-u)+.010,z],scale:[.004,len/7*1.07,.004],rotation:[0,ry,Math.PI/2-side*slope],color:['#cf825a','#b26a48','#d99b73','#c27550'][(row+col)%4]},false);
      }
    }
    const gableShape=new THREE.Shape([new THREE.Vector2(-c.w/2,0),new THREE.Vector2(c.w/2,0),new THREE.Vector2(0,rise)]);
    const gableGeometry=new THREE.ExtrudeGeometry(gableShape,{depth:c.d,bevelEnabled:false});gableGeometry.translate(0,0,-c.d/2);
    const gable=mesh(gableGeometry,m.plaster,[cx,base+c.h,cz]);gable.rotation.y=ry;
    // Door and a seaward window stay legible at study scale.
    const [dx,,dz]=local(0,c.d/2+.013);
    cube([dx,base+.095,dz],[.086,.19,.02],'stone',[0,ry,0]);
    const door=local(0,c.d/2+.026);
    cube([door[0],base+.09,door[2]],[.062,.165,.012],'teal',[0,ry,0]);
    for(let i=0;i<3;i++)cube([door[0],base+.09,door[2]+.008],[.05,.008,.006],'stone',[0,ry,0]);
    for(const side of [-1,1]){
      const [wx,,wz]=local(side*(c.w/2+.009),0);
      cube([wx,base+c.h*.62,wz],[.014,.10,.082],'stone',[0,ry,0]);
      const window=local(side*(c.w/2+.020),0);
      cube([window[0],base+c.h*.62,window[2]],[.012,.074,.055],'glass',[0,ry,0]);
      // Warm pane in front of the glass; the shared windowMaterial breathes
      // emissive light when evening mode is on.
      const glow=local(side*(c.w/2+.022),0);
      add('cottage-window-'+n,box,windowMaterials[n],{position:[glow[0],base+c.h*.62,glow[2]],scale:[.009,.058,.038],rotation:[0,ry,0]});
      cube([window[0],base+c.h*.62+.037,window[2]],[.014,.006,.082],'stone',[0,ry,0]);
    }
    const [chx,,chz]=local(c.w*.24,-c.d*.18);
    cube([chx,base+c.h+rise*.5+.07,chz],[.062,.20,.068],'stone',[0,ry,0]);
    cube([chx,base+c.h+rise*.5+.18,chz],[.082,.020,.088],'roof',[0,ry,0]);
    // Masonry detailing: corner quoins, sparse wall stones, a stepped awning
    // over the door, entry steps and shutters — the density the reference
    // diorama gets from many small authored parts.
    const qrows=Math.max(3,Math.round(c.h/.085));
    for(let row=0;row<qrows;row++)for(const sx of [-1,1])for(const sz of [-1,1]){
      const [qx,,qz]=local(sx*(c.w/2-.026),sz*(c.d/2-.020));
      cube([qx,base+.04+row*(c.h-.07)/qrows,qz],[.072,.058,.048],'stone',[0,ry,0],row%2?'#ded4bc':'#e9e0ca');
    }
    for(let i=0;i<9;i++){
      const wxo=(random()-.5)*c.w*.78,wzo=(random()<.5?1:-1)*(c.d/2+.004);
      const [stx,,stz]=local(wxo,wzo);
      cube([stx,base+.05+random()*c.h*.8,stz],[.055+random()*.03,.028,.007],'stone',[0,ry,0],['#e7ddc7','#dbd2ba','#efe6d2'][i%3]);
    }
    for(let i=0;i<3;i++){
      const [ax,,az]=local(0,c.d/2+.02+i*.028);
      cube([ax,base+c.h*.78+.012-i*.008,az],[.30-i*.02,.010,.05],'roof',[0,ry,0],i%2?'#c27550':'#b26a48');
    }
    for(let i=0;i<2;i++){
      const [stx,,stz]=local(0,c.d/2+.035+i*.05);
      cube([stx,base-.014-i*.018,stz],[.15,.026,.075],'stone',[0,ry,0]);
    }
    for(const side of [-1,1])for(const zo of [-.036,.036]){
      const [shx,,shz]=local(side*(c.w/2+.028),zo);
      cube([shx,base+c.h*.62,shz],[.008,.09,.05],'teal',[0,ry,0]);
    }
  }
  // Lighthouse on the outer tip of the southern arm: about 3x a cottage's
  // total height and visibly slimmer, matching coastal proportions.
  const towerAngle=TOWER.a,towerR=TOWER.r,[tx,,tz]=polar(towerAngle,towerR);
  const tower=new THREE.Group(),ty=TERRACE+.012;tower.position.set(tx,ty,tz);tower.rotation.y=Math.atan2(-Math.cos(towerAngle),-Math.sin(towerAngle));tower.scale.set(.80,1.15,.80);tower.name='Lighthouse';root.add(tower);
  const towerCourt=mesh(new THREE.CylinderGeometry(.17,.18,.045,40),m.stone,[tx,TERRACE-.01,tz]);towerCourt.name='LighthouseCourt';
  if(artAssets?.lighthouse){
    const shell=artAssets.lighthouse.clone(true);shell.name='BlenderLighthouseArchitecture';
    shell.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=o.receiveShadow=true;});
    tower.add(shell);
  }else{
  mesh(new THREE.CylinderGeometry(.15,.17,.025,48),m.stone,[0,.0125,0],tower);
  mesh(new THREE.CylinderGeometry(.066,.10,.575,48),m.plaster,[0,.3125,0],tower);
  const towerDoor=mesh(box,m.teal,[0,.095,.099],tower);towerDoor.scale.set(.045,.14,.014);towerDoor.name='LighthouseDoor';
  const threshold=mesh(box,m.stone,[0,.012,.13],tower);threshold.scale.set(.085,.023,.095);
  for(const y of [.30,.46]){
    const o=mesh(box,m.glass,[0,y,.104-y*.048],tower);o.scale.set(.026,.05,.011);
  }
  mesh(new THREE.CylinderGeometry(.125,.107,.03,48),m.stone,[0,.615,0],tower);
  }
  mesh(new THREE.CylinderGeometry(.06,.06,.13,16),m.glass,[0,.70,0],tower);
  // Unlit by day: a dark amber lens inside the glass, not a cream ball. Without
  // emissive a pale sphere still reads as "switched on" under a noon sun.
  const lanternMaterial=new THREE.MeshStandardMaterial({color:'#4c4335',emissive:'#ffbf65',emissiveIntensity:0,roughness:.42,metalness:.15});
  const lantern=mesh(new THREE.SphereGeometry(.035,12,8),lanternMaterial,[0,.70,0],tower);lantern.name='CrescentLantern';
  // Warm evening glow: a small real light plus a soft halo billboard so the
  // lantern reads from the default camera distance, not only in close-up.
  const lanternLight=new THREE.PointLight('#ffb066',0,2.6,2);lanternLight.position.set(0,.70,0);tower.add(lanternLight);
  const haloTexture=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d')!;
    const gradient=g.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(255,190,110,.85)');gradient.addColorStop(.4,'rgba(255,180,100,.25)');gradient.addColorStop(1,'rgba(255,180,100,0)');
    g.fillStyle=gradient;g.fillRect(0,0,64,64);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
  const haloMaterial=new THREE.SpriteMaterial({map:haloTexture,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  const halo=new THREE.Sprite(haloMaterial);halo.scale.setScalar(.34);halo.position.set(0,.70,0);halo.name='CrescentLanternHalo';tower.add(halo);
  const beacon=new THREE.Group();beacon.position.set(0,.70,0);beacon.name='LighthouseBeacon';tower.add(beacon);
  const {beam,material:beamMaterial,setStrength:setBeamStrength}=createLighthouseBeam();
  geometries.add(beam.geometry);beacon.add(beam);
  const searchLight=new THREE.SpotLight('#ffe0a0',0,4.5,.14,.55,1.3);searchLight.name='LighthouseSearchlight';beacon.add(searchLight);
  const beamTarget=new THREE.Object3D();beamTarget.position.set(0,-.08,3.8);beacon.add(beamTarget);searchLight.target=beamTarget;
  if(!artAssets?.lighthouse){
  for(let i=0;i<10;i++){
    const a=i*Math.PI/5;
    mesh(new THREE.CylinderGeometry(.0022,.0022,.06,6),m.metal,[Math.cos(a)*.106,.665,Math.sin(a)*.106],tower);
    if(i%2===0)mesh(new THREE.CylinderGeometry(.0028,.0028,.15,6),m.metal,[Math.cos(a)*.066,.70,Math.sin(a)*.066],tower);
  }
  for(const y of [.645,.688]){const ring=mesh(new THREE.TorusGeometry(.106,.0022,5,48),m.metal,[0,y,0],tower);ring.rotation.x=Math.PI/2;}
  mesh(new THREE.ConeGeometry(.095,.085,24),m.roof,[0,.812,0],tower);
  }
  // Landing: shore steps down to a walkway, ending in a T-shaped finger dock
  // with mooring posts, a rope coil and a gull — a place people can actually
  // walk onto and tie a boat to, not a floating dead platform.
  const jettyA=PIER_ANGLE,deckY=HARBOR.water+.05;
  {
    const [sx,,sz]=polar(jettyA,CRESCENT.rIn-.01),[ex,,ez]=polar(jettyA,PIER_HEAD);
    const axis=Math.atan2(ez-sz,ex-sx),planks=11;
    const perp=axis+Math.PI/2,platW=.46;
    if(artAssets?.dock){
      const dock=artAssets.dock.clone(true);dock.name='DetailedHarborDock';
      dock.position.set(sx,deckY,sz);dock.rotation.y=Math.atan2(ex-sx,ez-sz);
      dock.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=o.receiveShadow=true;});
      root.add(dock);
    }else{
    for(let i=0;i<planks;i++){
      const u=i/(planks-1),x=sx+(ex-sx)*u,z=sz+(ez-sz)*u;
      cube([x,deckY,z],[.17,.014,.062],'wood',[0,axis+Math.PI/2,0],i%3?'#f1e4c7':'#c8b89a');
      cube([x,deckY-.012,z],[.13,.010,.045],'darkwood',[0,axis+Math.PI/2,0]);
    }
    // T platform at the dock head, perpendicular to the walkway.
    for(let i=0;i<7;i++){
      const u=(i/6-.5)*platW,x=ex+Math.cos(perp)*u,z=ez+Math.sin(perp)*u;
      cube([x,deckY,z],[.062,.014,.19],'wood',[0,axis,0],i%3?'#dfc9a3':'#c9ad84');
    }
    // Deck beams and piles under the whole structure.
    for(const u of [.02,.5,.98]){
      const x=sx+(ex-sx)*u,z=sz+(ez-sz)*u,bottom=crescentHeight(x,z)-.02;
      add('pier-posts',cylinder,m.darkwood,{position:[x,(deckY+.02+bottom)/2,z],scale:[.016,deckY+.02-bottom,.016]});
    }
    for(const s of [-.5,.5]){
      const x=ex+Math.cos(perp)*s*platW,z=ez+Math.sin(perp)*s*platW,bottom=crescentHeight(x,z)-.02;
      add('pier-posts',cylinder,m.darkwood,{position:[x,(deckY+.02+bottom)/2,z],scale:[.016,deckY+.02-bottom,.016]});
    }
    // Mooring posts with rope rings on the dock head, boat side.
    for(const s of [-.32,.30]){
      const x=ex+Math.cos(perp)*s*platW*.9,z=ez+Math.sin(perp)*s*platW*.9;
      add('pier-posts',cylinder,m.darkwood,{position:[x,deckY+.075,z],scale:[.011,.15,.011]});
      const ring=mesh(new THREE.TorusGeometry(.014,.0035,6,18),m.rope,[x,deckY+.055,z]);ring.rotation.x=Math.PI/2;
    }
    // Rope coil and a mooring line from the dock head toward the berth.
    const coil:V[]=[];for(let i=0;i<110;i++){const u=i/109,a=u*Math.PI*7,r=.011+u*.032;coil.push([ex+Math.cos(perp)*.14+Math.cos(a)*r,deckY+.012,ez+Math.sin(perp)*.14+Math.sin(a)*r]);}
    const coilCurve=new THREE.CatmullRomCurve3(coil.map(p=>new THREE.Vector3(...p)));
    mesh(new THREE.TubeGeometry(coilCurve,110,.0022,5,false),m.rope);
    // Three submerged steps at the platform end: you can climb out of the water.
    for(let i=0;i<3;i++){
      const x=ex-Math.cos(axis)*(.10+i*.085),z=ez-Math.sin(axis)*(.10+i*.085);
      cube([x,deckY-.03-i*.028,z],[.30,.020,.085],'stone',[0,axis,0]);
    }
    }
    // Designed switchback: fixed endpoints and bounded risers, independent
    // of the natural slope. The terrain is graded beneath the same route.
    const wornStep=new RoundedBoxGeometry(1,1,1,2,.045);geometries.add(wornStep);
    let stepIndex=0;
    for(const step of stairTreads()){
      const x=(step.a.x+step.b.x)/2,z=(step.a.z+step.b.z)/2;
      const length=Math.hypot(step.b.x-step.a.x,step.b.z-step.a.z);
      // Consecutive treads meet at their boundaries. Extra length makes the
      // flat first flight overlap itself at exactly the same depth.
      const yaw=Math.atan2(step.b.x-step.a.x,step.b.z-step.a.z);
      const shades=['#c6c0af','#d2cbb8','#bbb6a7','#d9d1bf'];
      add('access-stairs',wornStep,m.stone,{position:[x,step.top-.018,z],scale:[.14,.036,length],rotation:[0,yaw,0],color:shades[stepIndex++%4]});
      // Bedded masonry supports connect each tread to the cut bank.
      const bottom=Math.min(crescentHeight(x,z)-.06,step.top-.09),height=step.top-.036-bottom;
      const courses=Math.max(1,Math.ceil(height/.035));
      for(let row=0;row<courses;row++)add('stair-foundations',wornStep,m.stone,{position:[x,bottom+(row+.5)*height/courses,z],scale:[.128,height/courses-.001,length*.96],rotation:[0,yaw,0],color:shades[(row+stepIndex)%4]});
    }
    for(const p of SHORE_STAIRS){
      // A small stone threshold sits above both the adjoining tread and the
      // timber deck; identical top heights previously fought in the overlap.
      for(let ix=0;ix<2;ix++)for(let iz=0;iz<2;iz++)add('access-landings',wornStep,m.stone,{position:[p.x+(ix-.5)*.08,p.y-.025+.003,p.z+(iz-.5)*.08],scale:[.079,.05,.079],color:ix===iz?'#d0c8b5':'#c1bba9'});
      const bottom=Math.min(crescentHeight(p.x,p.z)-.06,p.y-.12),height=p.y-.047-bottom;
      for(let row=0;row<3;row++)add('landing-masonry',wornStep,m.stone,{position:[p.x,bottom+(row+.5)*height/3,p.z],scale:[.15,height/3-.001,.15],color:row%2?'#bcb5a4':'#c8c0ae'});
    }
    // The independently animated Blender gull is mounted by CrescentStudy.
  }
  // Vegetation stays subordinate to the crescent silhouette. The stair line
  // to the landing and the path stay clear of sprouting grass.
  const nearStair=(a:number,r:number)=>Math.abs(Math.atan2(Math.sin(a-jettyA),Math.cos(a-jettyA)))<.12&&r>.60&&r<1.06;
  for(let i=0;i<(artAssets?220:700);i++){
    const a=(random()*2-1)*Math.PI,r=CRESCENT.rIn-.02+random()*(CRESCENT.rOut-CRESCENT.rIn+.06);
    const [x,,z]=polar(a,r);
    if(Math.abs(Math.atan2(Math.sin(a-CRESCENT.openAt),Math.cos(a-CRESCENT.openAt)))<.75)continue;
    if(Math.hypot(x-tx,z-tz)<.24)continue;
    if(nearStair(a,r))continue;
    const y=crescentHeight(x,z);if(y<HARBOR.water+.12)continue;
    const s=.007+random()*.013;
    add('groundcover',leaf,m.leaf,{position:[x,y+.010+random()*.016,z],scale:[s*1.6,s*.7,s],rotation:[random(),random()*6,random()],color:['#75835b','#8b9870','#a2a780','#657954'][i%4]},false);
  }
  for(const [a,r,scale] of [[-3.0,1.02,.85],[-1.45,1.05,.9],[-0.9,.96,.72]] as const){
    const [x,,z]=polar(a,r),y=crescentHeight(x,z);
    for(let i=0;i<80;i++){
      const angle=i*2.399963,rr=Math.sqrt(random())*.11*scale;
      add('bay-shrubs',leaf,m.leaf,{position:[x+Math.cos(angle)*rr,y+.045+random()*.06,z+Math.sin(angle)*rr*.7],scale:[.022*scale,.011*scale,.014*scale],rotation:[random(),angle,random()],color:['#486236','#6e8751','#8e9b68','#587740'][i%4]},false);
    }
  }
  // Broad scrub cushions and olive crowns give land a continuous planting
  // layer. Keep the lagoon, lighthouse and cottage entrances readable.
  for(let patch=0;patch<(artAssets?55:220);patch++){
    const a=random()*Math.PI*2,r=.91+random()*.23,[x,,z]=polar(a,r),y=crescentHeight(x,z);
    if(y<HARBOR.water+.10||Math.hypot(x-tx,z-tz)<.18)continue;
    if(cabins.some(c=>{const [hx,,hz]=polar(c.a,c.r);return Math.hypot(x-hx,z-hz)<.20;}))continue;
    if(nearStair(a,r))continue;
    const spread=.025+random()*.04;
    add('scrub-core',leaf,m.leaf,{position:[x,y+.018,z],scale:[spread*.85,.019,spread*.75],color:'#526b40'},false);
    for(let i=0;i<38;i++){
      const a=i*2.399963,r=spread*Math.sqrt(random());
      add('scrub-cushions',blade,m.leaf,{position:[x+Math.cos(a)*r,y+.026+random()*.025,z+Math.sin(a)*r],scale:[.046,.04,.05],rotation:[(random()-.5)*1.2,a,(random()-.5)*.7],color:['#4e6339','#697d49','#879452','#435b36'][i%4]},false);
    }
    if(patch%4===0)for(let i=0;i<7;i++)add('wildflowers',leaf,m.ivory,{position:[x+(random()-.5)*.07,y+.055+random()*.025,z+(random()-.5)*.07],scale:[.004,.003,.004],color:patch%8?'#d9bd70':'#b495ad'},false);
  }
  // Deliberately planted olive trees sit beyond the walking strip. Each crown
  // grows from visible limbs, with thin silver-green blades instead of balls.
  for(const [a,r] of [[-2.68,1.20],[-1.65,1.24],[-.63,1.18],[2.60,1.15]] as const){
    if(artAssets)break;
    const [x,,z]=polar(a,r),y=crescentHeight(x,z);
    if(y<HARBOR.water+.10||keepAccessClear(x,z,.09))continue;
    const tree=new THREE.Group();tree.name='OliveTree';tree.position.set(x,y,z);root.add(tree);
    const limb=(points:V[],radius:number)=>{
      const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
      const o=mesh(new THREE.TubeGeometry(curve,9,radius,7,false),m.darkwood,[0,0,0],tree);o.userData.ignoreHeightfield=true;
    };
    limb([[0,0,0],[.012,.08,0],[-.014,.16,.008],[0,.21,0]],.010);
    for(let branch=0;branch<4;branch++){
      const angle=branch*Math.PI/2+.4,cx=Math.cos(angle)*.085,cz=Math.sin(angle)*.085,cy=.22+random()*.045;
      limb([[0,.13,0],[cx*.35,.19,cz*.35],[cx,cy,cz]],.0045);
      add('olive-core',leaf,m.leaf,{position:[x+cx,y+cy+.014,z+cz],scale:[.065,.029,.052],rotation:[0,angle,0],color:'#4e6749'},false);
      for(let i=0;i<125;i++){
        const direction=i*2.399963,rr=Math.sqrt(random())*.068;
        add('olive-leaves',blade,m.leaf,{position:[x+cx+Math.cos(direction)*rr,y+cy+.015+random()*.035,z+cz+Math.sin(direction)*rr*.8],scale:[.027+random()*.012,.028,.034],rotation:[(random()-.5)*.7,direction,(random()-.5)*.6],color:['#627858','#839477','#a4ae8f','#506a4b'][i%4]},false);
      }
    }
  }
  // Continuous main road and short branches reach every entrance.
  const paved=(route:typeof MAIN_PATH)=>{
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z),n=Math.max(1,Math.ceil(length/.045));
      for(let j=0;j<n;j++){
        const u=(j+.5)/n,x=THREE.MathUtils.lerp(a.x,b.x,u),z=THREE.MathUtils.lerp(a.z,b.z,u);
        add('access-paving',box,m.stone,{position:[x,TERRACE-.005,z],scale:[.13,.05,length/n+.006],rotation:[0,Math.atan2(b.x-a.x,b.z-a.z),0],color:(i+j)%3?'#e7dfc9':'#cfc7b5'});
      }
    }
  };
  paved(MAIN_PATH);HOUSE_PATHS.forEach(paved);
  // Staggered limestone courses replace the tall fence-like vertical strips.
  const masonry=new RoundedBoxGeometry(1,1,1,2,.055);geometries.add(masonry);
  const shades=['#bbb5a5','#c9c2b0','#d1c9b6','#c0b9a8'];
  for(let row=0;row<12;row++)for(let i=0;i<39;i++){
    const angle=-3.45+(i+.5+(row%2)*.5)/39*2.77;
    if(angle>-.68)continue;
    const p=islandPoint(angle,.878);
    if(SHORE_STAIRS.slice(1).some((b,j)=>nearestOnSegment(p.x,p.z,SHORE_STAIRS[j],b).distance<.14))continue;
    const top=TERRACE+.065-row*.038,bottom=Math.min(crescentHeight(p.x,p.z),TERRACE)-.018;
    if(top<=bottom)continue;
    const h=Math.min(.036,top-bottom);
    add('path-parapet',masonry,m.stone,{position:[p.x,top-h/2,p.z],scale:[row===0?.039:.033,h,.878*2.77/39-.002],rotation:[0,-angle,0],color:shades[(i+row*3)%4]});
  }
  // A continuous paved apron joins the inward-facing lighthouse door.
  const tdoor=islandPoint(TOWER.a,TOWER.r-.105);paved([islandPoint(TOWER.a,.94),tdoor]);
  for(const [a,r] of [[-.85,1.28],[-2.35,1.28]] as const){
    const [x,,z]=polar(a,r),y=crescentHeight(x,z);
    for(let i=0;i<150;i++){
      const t=random(),angle=i*2.399963,rr=(1-t)*.04*Math.sqrt(random());
      add('cypress-leaves',blade,m.leaf,{position:[x+Math.cos(angle)*rr,y+.05+t*.36,z+Math.sin(angle)*rr],scale:[.028,.035,.027],rotation:[.3,angle,1.0],color:['#586d3f','#657c49','#7b8c58'][i%3]},false);
    }
  }
  // Lavender tufts line the path and cottage fronts for a colour layer.
  for(let i=0;i<46;i++){
    const a=-2.55+random()*1.75,r=.90+random()*.11,[x,,z]=polar(a,r),y=crescentHeight(x,z);
    if(y<HARBOR.water+.13)continue;
    if(cabins.some(c=>{const [hx,,hz]=polar(c.a,c.r);return Math.hypot(x-hx,z-hz)<.17;}))continue;
    if(nearStair(a,r))continue;
    add('lavender',leaf,m.leaf,{position:[x,y+.018+random()*.022,z],scale:[.008,.016,.008],rotation:[random(),random()*6,0],color:random()>.4?'#8a7ab5':'#a394c9'},false);
  }
  // Sparse seagrass keeps lagoon sand readable.
  for(let i=0;i<80;i++){
    const a=random()*Math.PI*2,r=.24+random()*.42,x=CRESCENT.cx+Math.cos(a)*r,z=CRESCENT.cz+Math.sin(a)*r;
    if(random()>.4)continue;
    if(crescentHeight(x,z)>HARBOR.water-.05)continue;
    for(let k=0;k<5;k++){
      const h=.04+random()*.08;
      add('seagrass',leaf,m.leaf,{position:[x+(random()-.5)*.05,crescentHeight(x,z)+h*.45,z+(random()-.5)*.05],scale:[.006,h*.5,.006],rotation:[.15,random()*6,(random()-.5)*.6],color:k%2?'#5e8a73':'#91ab85'},false);
    }
  }
  for(const [name,batch] of batches){
    const instanced=new THREE.InstancedMesh(batch.geometry,batch.material,batch.pieces.length),dummy=new THREE.Object3D();
    instanced.name=name;instanced.userData.ignoreHeightfield=!batch.heightfield;
    batch.pieces.forEach((p,i)=>{dummy.position.fromArray(p.position);dummy.scale.fromArray(p.scale);dummy.rotation.fromArray(p.rotation??[0,0,0]);dummy.updateMatrix();instanced.setMatrixAt(i,dummy.matrix);instanced.setColorAt(i,new THREE.Color(p.color??'#ffffff'));});
    instanced.castShadow=instanced.receiveShadow=true;root.add(instanced);
  }
  // Anchored lagoon boat: smooth lofted hull with a painted waterline band
  // and warm red bottom (reference-style finishing), furled sail and rigging.
  const boat=new THREE.Group();boat.name='CrescentBoat';boat.scale.setScalar(.85);
  const hullMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.6,side:THREE.DoubleSide});
  if(artAssets?.boat){
    const model=artAssets.boat.clone(true);model.name='BlenderFishingBoat';
    model.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=o.receiveShadow=true;});
    boat.add(model);
  }else{
  const hp:number[]=[],hi:number[]=[],hc:number[]=[],HS=20,HC=20;
  const hullW=(t:number)=>.105*Math.pow(Math.sin(Math.PI*Math.max(.02,Math.min(.98,t))),.5)*(1+.18*t);
  const hullD=(t:number)=>.96*Math.pow(Math.sin(Math.PI*Math.max(.02,Math.min(.98,t))),.35)+.04;
  for(let j=0;j<=HS;j++){
    const t=j/HS,z=(t-.5)*.62,w=hullW(t),d=hullD(t);
    for(let i=0;i<=HC;i++){
      const a=-Math.PI/2+i/HC*Math.PI,y=.04-.13*d*Math.cos(a);
      hp.push(Math.sin(a)*w,y,z);
      const color=new THREE.Color(y<-.045?'#b46850':y>0&&y<.03?'#377d96':'#f2f0e4');hc.push(color.r,color.g,color.b);
      if(j<HS&&i<HC){const k=j*(HC+1)+i;hi.push(k,k+HC+1,k+1,k+1,k+HC+1,k+HC+2);}
    }
  }
  const hull=new THREE.BufferGeometry();hull.setAttribute('position',new THREE.Float32BufferAttribute(hp,3));hull.setAttribute('color',new THREE.Float32BufferAttribute(hc,3));hull.setIndex(hi);hull.computeVertexNormals();
  mesh(hull,hullMaterial,[0,0,0],boat);
  const deckPts:[number,number][]=[];for(const t of [.03,.16,.34,.5,.66,.84,.97])deckPts.push([(t-.5)*.62,hullW(t)]);
  const deckShape=new THREE.Shape();deckPts.forEach(([z,w],i)=>i?deckShape.lineTo(w,z):deckShape.moveTo(w,z));[...deckPts].reverse().forEach(([z,w])=>deckShape.lineTo(-w,z));deckShape.closePath();
  const boatDeck=new THREE.ShapeGeometry(deckShape);boatDeck.rotateX(-Math.PI/2);mesh(boatDeck,m.wood,[0,.04,0],boat).rotation.y=Math.PI;
  const tube=(points:V[],radius:number,material:THREE.Material,parent:THREE.Object3D)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    mesh(new THREE.TubeGeometry(curve,Math.max(12,points.length*6),radius,5,false),material,[0,0,0],parent);
  };
  const gunSamples:[number,number][]=[];for(let i=0;i<=12;i++){const t=i/12;gunSamples.push([(t-.5)*.62,hullW(t)]);}
  for(const side of [-1,1])tube(gunSamples.map(([z,w])=>[side*w,.042,z] as V),.0045,m.ivory,boat);
  // Mast with a furled sail, boom and gaff spars, standing rigging.
  mesh(new THREE.CylinderGeometry(.0032,.0042,.34,8),m.wood,[0,.21,.13],boat);
  const sail=mesh(new THREE.CylinderGeometry(.004,.011,.24,8),m.ivory,[.007,.24,.129],boat);sail.rotation.z=.14;
  const boom=mesh(new THREE.CylinderGeometry(.0026,.0026,.17,6),m.wood,[0,.172,.048],boat);boom.rotation.x=Math.PI/2;
  const gaff=mesh(new THREE.CylinderGeometry(.0022,.0022,.14,6),m.wood,[0,.315,.072],boat);gaff.rotation.x=.55;
  tube([[0,.375,.128],[0,.05,.28]],.0014,m.rope,boat);
  tube([[0,.375,.128],[0,.05,-.235]],.0014,m.rope,boat);
  // Bench thwarts and a tiller finish the working deck.
  mesh(box,m.wood,[0,.052,.02],boat).scale.set(.19,.012,.05);
  mesh(box,m.wood,[0,.052,-.10],boat).scale.set(.17,.012,.045);
  mesh(box,m.wood,[0,.062,-.245],boat).scale.set(.028,.026,.10);
  const coil:V[]=[];for(let i=0;i<100;i++){const u=i/99,a=u*Math.PI*8,r=.010+u*.034;coil.push([-.07+Math.cos(a)*r,.052,.20+Math.sin(a)*r]);}tube(coil,.0018,m.rope,boat);
  const buoy=mesh(new THREE.TorusGeometry(.026,.008,8,24),m.orange,[.10,.052,-.13],boat);buoy.rotation.y=Math.PI/2;
  }
  // Four fish with deformable bodies, shared with the coastal study pipeline.
  const fish=new THREE.Group();fish.name='CrescentFish';
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
  const disposeArt=artAssets?addCoastalArt(root,artAssets,crescentHeight):undefined;
  root.updateMatrixWorld(true);
  return {root,boat,fish,fishActors,beacon,beamMaterial,setBeamStrength,searchLight,footprint:bayFootprint(),lanternMaterial,lanternLight,haloMaterial,windowMaterial,windowMaterials,windowLights,dispose(){disposeArt?.();root.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});geometries.forEach(g=>g.dispose());palette.dispose();terrainMaterial.dispose();extraTextures.forEach(t=>t.dispose());hullMaterial.dispose();lanternMaterial.dispose();haloMaterial.dispose();haloTexture.dispose();windowMaterials.forEach(m=>m.dispose());beamMaterial.dispose();searchLight.dispose();}};
}
