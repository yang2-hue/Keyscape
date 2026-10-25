import * as THREE from 'three';

export type AccessPoint={x:number;y:number;z:number};
export const TERRACE=.43;
export const ACCESS_CENTER={x:-.22,z:.06};
export function islandPoint(angle:number,radius:number,y=TERRACE):AccessPoint{
  return {x:ACCESS_CENTER.x+Math.cos(angle)*radius,y,z:ACCESS_CENTER.z+Math.sin(angle)*radius};
}
export const COTTAGES=[{a:-1.12,r:1.14,w:.32,d:.26,h:.24},{a:-2.12,r:1.14,w:.30,d:.25,h:.23}].map(c=>({...c,ry:Math.atan2(-Math.cos(c.a),-Math.sin(c.a))}));
export const TOWER={a:2.88,r:1.04};
export const LANDING=islandPoint(-1.55,.69,.13);
export const MAIN_PATH=Array.from({length:100},(_,i)=>islandPoint(-3.45+i/99*2.77,.94));
export const SHORE_STAIRS=[islandPoint(-1.55,.94),islandPoint(-1.75,.80),islandPoint(-2.05,.73,.28),LANDING];
export const HOUSE_PATHS=COTTAGES.map(c=>[islandPoint(c.a,.94),islandPoint(c.a,c.r-c.d/2-.015)]);
export const ACCESS_ROUTES=[MAIN_PATH,...HOUSE_PATHS,SHORE_STAIRS];

export function nearestOnSegment(x:number,z:number,a:AccessPoint,b:AccessPoint){
  const dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
  return {distance:Math.hypot(x-a.x-t*dx,z-a.z-t*dz),y:a.y+(b.y-a.y)*t};
}
export function accessClearance(x:number,z:number){
  let distance=Infinity;
  for(const route of ACCESS_ROUTES)for(let i=1;i<route.length;i++)distance=Math.min(distance,nearestOnSegment(x,z,route[i-1],route[i]).distance);
  return distance;
}
export function keepAccessClear(x:number,z:number,padding=0){
  if(accessClearance(x,z)<.075+padding)return true;
  for(const c of COTTAGES){const p=islandPoint(c.a,c.r);if(Math.hypot(x-p.x,z-p.z)<.24+padding)return true;}
  const t=islandPoint(TOWER.a,TOWER.r);return Math.hypot(x-t.x,z-t.z)<.18+padding;
}
/** Grade the usable island, then cut one designed switchback into its bank. */
export function gradeAccessTerrain(x:number,z:number,natural:number){
  const dx=x-ACCESS_CENTER.x,dz=z-ACCESS_CENTER.z,r=Math.hypot(dx,dz);
  let a=Math.atan2(dz,dx);if(a>1)a-=Math.PI*2;
  const radial=THREE.MathUtils.smoothstep(r,.79,.89)*(1-THREE.MathUtils.smoothstep(r,1.22,1.38));
  const angular=THREE.MathUtils.smoothstep(a,-3.65,-3.42)*(1-THREE.MathUtils.smoothstep(a,-.68,-.48));
  let h=THREE.MathUtils.lerp(natural,TERRACE,radial*angular);
  for(const c of COTTAGES){
    const p=islandPoint(c.a,c.r),xx=x-p.x,zz=z-p.z;
    const lx=xx*Math.cos(c.ry)-zz*Math.sin(c.ry),lz=xx*Math.sin(c.ry)+zz*Math.cos(c.ry);
    const outside=Math.max(Math.abs(lx)-(c.w/2+.035),Math.abs(lz)-(c.d/2+.055));
    h=THREE.MathUtils.lerp(h,TERRACE,1-THREE.MathUtils.smoothstep(outside,0,.09));
  }
  const tower=islandPoint(TOWER.a,TOWER.r),d=Math.hypot(x-tower.x,z-tower.z);
  h=THREE.MathUtils.lerp(h,TERRACE,1-THREE.MathUtils.smoothstep(d,.15,.23));
  let best={distance:Infinity,y:0};
  for(let i=1;i<SHORE_STAIRS.length;i++){const q=nearestOnSegment(x,z,SHORE_STAIRS[i-1],SHORE_STAIRS[i]);if(q.distance<best.distance)best=q;}
  return THREE.MathUtils.lerp(h,best.y-.028,1-THREE.MathUtils.smoothstep(best.distance,.065,.11));
}

export function stairTreads(){
  const treads:{a:AccessPoint;b:AccessPoint;top:number}[]=[];
  for(let leg=1;leg<SHORE_STAIRS.length;leg++){
    const a=SHORE_STAIRS[leg-1],b=SHORE_STAIRS[leg],length=Math.hypot(b.x-a.x,b.z-a.z);
    const n=Math.max(1,Math.ceil(Math.abs(b.y-a.y)/.018),Math.ceil(length/.045));
    for(let i=0;i<n;i++){
      const at=(u:number)=>({x:THREE.MathUtils.lerp(a.x,b.x,u),z:THREE.MathUtils.lerp(a.z,b.z,u),y:THREE.MathUtils.lerp(a.y,b.y,u)});
      treads.push({a:at(i/n),b:at((i+1)/n),top:at(i/n).y});
    }
  }return treads;
}
