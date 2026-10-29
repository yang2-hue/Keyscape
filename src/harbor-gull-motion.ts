/** A bounded, deterministic trip above the lagoon. No wall-clock timers: the
 * caller advances elapsed only while playing and visible.
 *
 * The first version flew a perfect circle at a constant speed with a constant
 * 2.6 Hz flap, which is a mechanical duck on a carousel: nothing about the pose
 * responded to anything else, so the bird had one idea and repeated it. What
 * makes a gull read as alive is the rhythm — a burst of beats, then a long
 * unpowered glide with the wings held in a shallow V, then another burst — and
 * a bank angle that comes out of how hard it is actually turning.
 */
export const GULL_FLIGHT_SECONDS=8;
const TAKEOFF_SECONDS=1.2,LAND_AT=6.4;
export type GullPoint=readonly [number,number,number];
export type GullFlightState={flying:boolean;elapsed:number;completed:number};
const smooth=(t:number)=>{const x=Math.min(1,Math.max(0,t));return x*x*x*(x*(x*6-15)+10);};
const TWO_PI=Math.PI*2;

/** One point on the circuit, with its heading.
 *
 * Heading is differentiated by hand rather than sampled: a chord over a finite
 * step is rotated by half the step's sweep, and the join with the takeoff is
 * checked to a hundredth of a milliradian. The angle also keeps a small floor
 * speed at both ends — easing to a dead stop makes the heading undefined there,
 * and no bird hovers at the entry to its own circle.
 */
function orbit(p:number,radius0:number,startAngle:number,anchor:GullPoint,center:readonly [number,number]){
  const env=Math.sin(Math.PI*p)**2;
  const envDerivative=Math.PI*Math.sin(TWO_PI*p);
  const wobble=.10*Math.sin(TWO_PI*p+.4);
  const wobbleDerivative=.10*TWO_PI*Math.cos(TWO_PI*p+.4);
  const easeDerivative=30*p*p*(1-p)*(1-p);
  const angle=startAngle+TWO_PI*(.15*p+.85*smooth(p)+wobble*env);
  const angleRate=TWO_PI*(.15+.85*easeDerivative+wobbleDerivative*env+wobble*envDerivative);
  // Radius only ever shrinks: the post already sits near the edge of the safe
  // circle, so an outward bulge would put the bird over the cottages.
  const wobbleR=.55+.45*Math.sin(TWO_PI*p*1.4+.9);
  const wobbleRDerivative=.45*Math.cos(TWO_PI*p*1.4+.9)*TWO_PI*1.4;
  const radius=radius0*(1-.20*env*wobbleR);
  const radiusRate=radius0*(-.20*(envDerivative*wobbleR+env*wobbleRDerivative));
  const cos=Math.cos(angle),sin=Math.sin(angle);
  return {
    x:center[0]+cos*radius,
    y:anchor[1]+.50+(.048+.016*Math.sin(TWO_PI*p*1.7+1.2))*env,
    z:center[1]+sin*radius,
    yaw:Math.atan2(radiusRate*cos-radius*angleRate*sin,radiusRate*sin+radius*angleRate*cos),
  };
}

export function advanceGull(state:GullFlightState,dt:number,playing:boolean,visible:boolean){
  if(!playing||!visible||!state.flying)return;
  state.elapsed=Math.min(GULL_FLIGHT_SECONDS,state.elapsed+Math.max(0,Math.min(dt,.05)));
  if(state.elapsed>=GULL_FLIGHT_SECONDS){state.flying=false;state.completed++;}
}

export function gullPose(elapsed:number,flying:boolean,anchor:GullPoint,center:readonly [number,number]){
  const dx=anchor[0]-center[0],dz=anchor[2]-center[1],radius0=Math.hypot(dx,dz);
  const start=Math.atan2(dz,dx),t=Math.min(GULL_FLIGHT_SECONDS,Math.max(0,elapsed));
  let x=anchor[0],y=anchor[1],z=anchor[2],yaw=-start,pitch=0,bank=0,spread=0;
  let glide=0,beat=0;
  const phase=!flying?'perched':t<TAKEOFF_SECONDS?'takeoff':t<LAND_AT?'orbit':'landing';
  if(flying){
    spread=smooth(t/.85)*(1-smooth((t-6.9)/1.1));
    if(t<TAKEOFF_SECONDS){
      // A gull runs forward and climbs; it does not rise like a lift.
      const p=t/TAKEOFF_SECONDS,rise=.50*smooth(p),push=.06*Math.sin(Math.PI*p);
      y+=rise;
      x+=Math.sin(yaw)*push;z+=Math.cos(yaw)*push;
      pitch=-.10*Math.sin(Math.PI*p);
      beat=1;
    }else if(t<LAND_AT){
      const p=(t-TAKEOFF_SECONDS)/(LAND_AT-TAKEOFF_SECONDS);
      const envelope=Math.sin(Math.PI*p)**2;
      const here=orbit(p,radius0,start,anchor,center);
      x=here.x;y=here.y;z=here.z;yaw=here.yaw;
      // Bank follows the actual turn rate over a real slice of the circle, not
      // over a differential: measured across 1e-4 of the orbit the heading moves
      // by a thousandth of a radian and the bird never leans at all.
      const before=orbit(Math.max(0,p-.02),radius0,start,anchor,center).yaw;
      const turn=Math.atan2(Math.sin(yaw-before),Math.cos(yaw-before));
      bank=Math.max(-.42,Math.min(.42,turn*2.6));
      // Beats and glides. A glide holds the wings slightly back and high, and
      // the bird sinks a little while it is unpowered.
      beat=(t-TAKEOFF_SECONDS)/1.05;
      const cyc=beat-Math.floor(beat);
      glide=smooth((cyc-.50)/.16)*(1-smooth((cyc-.88)/.12));
      y-=glide*.016*envelope;
      pitch=.10*glide;
    }else{
      const p=(t-LAND_AT)/(GULL_FLIGHT_SECONDS-LAND_AT);
      y+=.50*(1-smooth(p));
      // Flare: nose up, wings cupped, a last fast beat to kill the speed.
      pitch=.30*Math.sin(Math.PI*p);
      beat=0;
      glide=1-smooth(p*1.6);
    }
  }
  const flapAmp=(1-.90*Math.max(0,Math.min(1,glide)))*(phase==='landing'?1.25:phase==='takeoff'?1.15:1);
  const flap=Math.sin(t*TWO_PI*3.15)*.55*flapAmp*spread;
  return {
    x,y,z,yaw,pitch,bank,spread,phase,
    wingSweep:1.28*(1-spread)+.12*spread+glide*spread*.16,
    // At rest, and at both ends of the trip, `spread` is zero, so the wings fold
    // to exactly the perched pose and the join is invisible.
    wingFlap:.10+flap+glide*spread*.10,
  };
}
