/** A bounded, deterministic trip above the lagoon. No wall-clock timers: the
 * caller advances elapsed only while playing and visible. */
export const GULL_FLIGHT_SECONDS=8;
const TAKEOFF_SECONDS=1.2,LAND_AT=6.4;
export type GullPoint=readonly [number,number,number];
export type GullFlightState={flying:boolean;elapsed:number;completed:number};
const smooth=(t:number)=>{const x=Math.min(1,Math.max(0,t));return x*x*x*(x*(x*6-15)+10);};

export function advanceGull(state:GullFlightState,dt:number,playing:boolean,visible:boolean){
  if(!playing||!visible||!state.flying)return;
  state.elapsed=Math.min(GULL_FLIGHT_SECONDS,state.elapsed+Math.max(0,Math.min(dt,.05)));
  if(state.elapsed>=GULL_FLIGHT_SECONDS){state.flying=false;state.completed++;}
}

export function gullPose(elapsed:number,flying:boolean,anchor:GullPoint,center:readonly [number,number]){
  const dx=anchor[0]-center[0],dz=anchor[2]-center[1],radius=Math.hypot(dx,dz);
  const start=Math.atan2(dz,dx),t=Math.min(GULL_FLIGHT_SECONDS,Math.max(0,elapsed));
  let x=anchor[0],y=anchor[1],z=anchor[2],yaw=-start,pitch=0,bank=0,spread=0;
  const phase=!flying?'perched':t<TAKEOFF_SECONDS?'takeoff':t<LAND_AT?'orbit':'landing';
  if(flying){
    const takeoff=TAKEOFF_SECONDS,landAt=LAND_AT;
    spread=smooth(t/.85)*(1-smooth((t-6.9)/1.1));
    if(t<takeoff){
      y+=.50*smooth(t/takeoff);
      pitch=-.14*Math.sin(Math.PI*t/takeoff);
    }else if(t<landAt){
      const p=(t-takeoff)/(landAt-takeoff),a=start+Math.PI*2*smooth(p);
      x=center[0]+Math.cos(a)*radius;z=center[1]+Math.sin(a)*radius;
      y+=.50+.06*Math.sin(Math.PI*p)**2;
      yaw=-a;bank=-.16*Math.sin(Math.PI*p)**2;
    }else{
      const p=(t-landAt)/(GULL_FLIGHT_SECONDS-landAt);
      y+=.50*(1-smooth(p));pitch=.12*Math.sin(Math.PI*p);
    }
  }
  // Swept-back wings at rest unfold before the flight; flap amplitude tapers
  // continuously through takeoff and landing instead of snapping on/off.
  const flap=Math.sin(t*Math.PI*2*2.6)*.48*spread;
  return {x,y,z,yaw,pitch,bank,spread,phase,wingSweep:1.28*(1-spread)+.12*spread,wingFlap:.10+flap};
}
