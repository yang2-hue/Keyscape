export type Spring={position:number;velocity:number};
/** Small fixed substeps keep delayed GPU samples from snapping the boat. */
export function stepSpring(state:Spring,target:number,delta:number,stiffness=30,damping=9){
  let remaining=Math.max(0,Math.min(delta,.05));
  while(remaining>1e-7){const dt=Math.min(remaining,1/120);state.velocity+=((target-state.position)*stiffness-state.velocity*damping)*dt;state.position+=state.velocity*dt;remaining-=dt;}
}
export function fishBend(x:number,time:number,phase:number,effort=1,turn=0){
  const rear=Math.max(0,Math.min(1,(.07-x)/.14));
  return rear*rear*(Math.sin(time*(8.5+phase*.2)-x*34+phase)*.012*effort+turn*.006);
}
export function deformFish(rest:Float32Array,positions:Float32Array,time:number,phase:number,effort=1,turn=0){
  let largest=0;
  for(let i=0;i<rest.length;i+=3){const bend=fishBend(rest[i],time,phase,effort,turn);positions[i]=rest[i];positions[i+1]=rest[i+1];positions[i+2]=rest[i+2]+bend;largest=Math.max(largest,Math.abs(bend));}
  return largest;
}
export function turnToward(current:number,target:number,delta:number){
  return current+Math.atan2(Math.sin(target-current),Math.cos(target-current))*(1-Math.exp(-Math.max(0,delta)*7));
}
