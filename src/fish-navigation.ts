export type FishState={x:number;z:number;heading:number;speed:number;velocity:number;turn:number;avoid?:number;hold?:number};
type World={safe:(x:number,z:number)=>boolean;time:number;phase:number;fear:number;away:number};
const angle=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const damp=(a:number,b:number,k:number,dt:number)=>a+(b-a)*(1-Math.exp(-k*dt));

/** One steering owner. Choose a clear corridor, commit to its turn, and never
 * teleport to a boundary: a blocked fish brakes and turns in place. */
export function swimFish(s:FishState,dt:number,w:World){
  dt=Math.max(0,Math.min(.05,dt));if(!dt)return;
  const clearance=(heading:number)=>{
    for(let j=1;j<=8;j++){
      const d=j*.025,x=s.x+Math.cos(heading)*d,z=s.z+Math.sin(heading)*d;
      // Probe both sides of the body, not only its centre.
      for(const side of [-.025,0,.025])if(!w.safe(x-Math.sin(heading)*side,z+Math.cos(heading)*side))return d-.025;
    }return .2;
  };
  const forward=clearance(s.heading);
  s.hold=Math.max(0,(s.hold??0)-dt);
  let desired=s.heading+(Math.sin(w.time*.31+w.phase)*.5+Math.sin(w.time*.17+w.phase*3)*.3)*dt;
  if(w.fear>.05)desired=w.away;
  if(forward<.14||s.hold>0){
    if(s.avoid===undefined||s.hold===0){
      let best=-Infinity,target=s.heading;
      for(const offset of [0,.45,-.45,.9,-.9,1.5,-1.5,2.2,-2.2,Math.PI]){
        const a=s.heading+offset,score=clearance(a)-Math.abs(offset)*.012;
        if(score>best){best=score;target=a;}
      }
      s.avoid=target;s.hold=.85;
    }
    desired=s.avoid!;
  }else s.avoid=undefined;
  const change=Math.max(-1.6*dt,Math.min(1.6*dt,angle(desired-s.heading)));
  s.heading+=change;s.turn=damp(s.turn,-change/dt,5,dt);
  const room=clearance(s.heading),brake=Math.max(0,Math.min(1,(room-.025)/.12));
  const cruise=s.speed*(.85+.15*Math.sin(w.time*.48+w.phase))*(1+w.fear*1.4);
  s.velocity=damp(s.velocity,cruise*brake,room<.08?9:2.5,dt);
  const distance=Math.min(s.velocity*dt,Math.max(0,room-.025));
  s.x+=Math.cos(s.heading)*distance;s.z+=Math.sin(s.heading)*distance;
}
