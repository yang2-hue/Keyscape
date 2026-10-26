import * as THREE from 'three';

const angularDistance=(a:number,b:number)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
/** The uninhabited eastern tip is a low sandy shore; the back of the village
 * carries the highest rock. Shared by terrain, scan placements and planting. */
export function beachInfluence(angle:number){
  return 1-THREE.MathUtils.smoothstep(angularDistance(angle,.18),.24,.85);
}
export function headlandInfluence(angle:number){
  return Math.exp(-Math.pow(angularDistance(angle,-1.55)/.56,2));
}
