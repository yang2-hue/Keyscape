import * as THREE from 'three';
import {HARBOR,type Heightfield} from './harbor-layout';

const passVertex='varying vec2 point;void main(){point=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
const solver=`
  uniform sampler2D previous;uniform sampler2D bed;
  uniform float reset;uniform float time;uniform float rain;uniform float dt;uniform float count;
  uniform vec2 texel;uniform vec4 impulses[8];varying vec2 point;
  float height(vec2 uv){return texture2D(previous,clamp(uv,vec2(0.0),vec2(1.0))).r;}
  void main(){
    if(reset>.5){gl_FragColor=vec4(0.0);return;}
    vec2 p=(point-.5)*3.2;
    float depth=${HARBOR.water.toFixed(3)}-texture2D(bed,point).r;
    vec2 q=abs(p)-vec2(1.41);
    float boundary=.16-length(max(q,0.0));
    float wet=smoothstep(.012,.10,depth)*smoothstep(.005,.12,boundary);
    if(wet<.001){gl_FragColor=vec4(0.0);return;}
    vec4 state=texture2D(previous,point);float h=state.r,v=state.g;
    float left=height(point-vec2(texel.x,0)),right=height(point+vec2(texel.x,0));
    float back=height(point-vec2(0,texel.y)),front=height(point+vec2(0,texel.y));
    float spacing=3.2*texel.x;
    float lap=(left+right+back+front-4.0*h)/(spacing*spacing);
    float wind=(.34*sin(p.x*8.1+p.y*4.3-time*2.0)+.21*sin(p.x*4.5-p.y*11.5+time*2.6))*(1.0+rain*.45);
    v+=(.23*lap+wind-h*.35)*dt;
    v*=exp(-(1.05+(1.0-wet)*9.0)*dt);
    h+=v*dt;
    for(int i=0;i<8;i++)if(float(i)<count){
      vec4 drop=impulses[i];float r2=dot(p-drop.xy,p-drop.xy)/(drop.w*drop.w);
      float pulse=(1.0-r2*.5)*exp(-r2*.5)*drop.z;
      h+=pulse;v+=pulse*2.0;
    }
    if(abs(h)>.075){h=clamp(h,-.075,.075);v*=.25;}
    h*=mix(.97,1.0,wet);v=clamp(v,-.8,.8);
    vec2 slope=vec2(right-left,front-back)/(2.0*spacing);
    gl_FragColor=vec4(h,v,clamp(slope,vec2(-1.2),vec2(1.2)))*wet;
  }`;
const sampler=`
  uniform sampler2D waves;uniform vec2 boat;uniform vec2 probe;varying vec2 point;
  void main(){vec2 p=gl_FragCoord.x<1.0?boat:probe;vec4 s=texture2D(waves,(p+1.6)/3.2);
  gl_FragColor=vec4(s.r/.16+.5,s.b/.8+.5,s.a/.8+.5,1.0);}`;

export type WaveSample={height:number;slopeX:number;slopeZ:number};
export function decodeWaveSample(bytes:Uint8Array,offset=0):WaveSample{
  return {height:(bytes[offset]/255-.5)*.16,slopeX:(bytes[offset+1]/255-.5)*.8,slopeZ:(bytes[offset+2]/255-.5)*.8};
}

/** Finite-difference GPU wave field. The only readback is two packed pixels. */
export function createWaterDynamics(gl:THREE.WebGLRenderer,field:Heightfield,berth:{x:number;z:number}={x:-.12,z:.49}){
  const n=128,options={type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false};
  const targets=[new THREE.WebGLRenderTarget(n,n,options),new THREE.WebGLRenderTarget(n,n,options)];
  const blank=new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType);blank.needsUpdate=true;
  const bed=new THREE.DataTexture(field.heights,field.resolution,field.resolution,THREE.RedFormat,THREE.FloatType);bed.minFilter=bed.magFilter=THREE.LinearFilter;bed.needsUpdate=true;
  const uniforms={previous:{value:targets[0].texture},bed:{value:bed},reset:{value:1},time:{value:0},rain:{value:0},dt:{value:1/120},count:{value:0},texel:{value:new THREE.Vector2(1/n,1/n)},impulses:{value:Array.from({length:8},()=>new THREE.Vector4())}};
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:passVertex,fragmentShader:solver,depthTest:false,depthWrite:false,toneMapped:false});
  const readUniforms={waves:{value:targets[0].texture},boat:{value:new THREE.Vector2(berth.x,berth.z)},probe:{value:new THREE.Vector2(.70,.80)}};
  const readMaterial=new THREE.ShaderMaterial({uniforms:readUniforms,vertexShader:passVertex,fragmentShader:sampler,depthTest:false,depthWrite:false,toneMapped:false});
  const geometry=new THREE.PlaneGeometry(2,2),quad=new THREE.Mesh(geometry,material),scene=new THREE.Scene(),camera=new THREE.Camera();scene.add(quad);
  const packed=new THREE.WebGLRenderTarget(2,1,{type:THREE.UnsignedByteType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false});
  let index=0,initialized=false,accumulator=0,pending=false,lastRead=-1,active=false,generation=0;
  const queue:THREE.Vector4[]=[];
  const dynamics={
    texture:targets[0].texture,time:0,steps:0,reads:0,impulses:0,readErrors:0,
    boat:{height:0,slopeX:0,slopeZ:0} as WaveSample,
    probe:{height:0,slopeX:0,slopeZ:0} as WaveSample,
    addImpulse(x:number,z:number,strength=.03,radius=.10){
      if(queue.length>=16)return 0;
      if(Math.abs(x)>1.5||Math.abs(z)>1.5||field.sample(x,z)>HARBOR.water-.025)return -1;
      queue.push(new THREE.Vector4(x,z,THREE.MathUtils.clamp(strength,-.045,.045),THREE.MathUtils.clamp(radius,.055,.2)));
      return 1;
    },
    advance(delta:number,playing:boolean,rainy:boolean){
      active=playing;const previousTarget=gl.getRenderTarget();
      const xr=gl.xr.enabled;gl.xr.enabled=false;
      try{
        quad.material=material;
        if(!initialized){
          uniforms.reset.value=1;uniforms.previous.value=blank;
          for(const target of targets){gl.setRenderTarget(target);gl.render(scene,camera);}
          initialized=true;uniforms.reset.value=0;
        }
        if(!playing){queue.length=0;accumulator=0;return;}
        accumulator=Math.min(accumulator+Math.min(delta,.05),.05);
        uniforms.rain.value=rainy?1:0;
        let steps=0;
        while(accumulator>=1/120&&steps<6){
          dynamics.time+=1/120;uniforms.time.value=dynamics.time;
          uniforms.previous.value=targets[index].texture;
          const count=Math.min(queue.length,8);uniforms.count.value=count;
          for(let i=0;i<count;i++)uniforms.impulses.value[i].copy(queue[i]);
          queue.splice(0,count);dynamics.impulses+=count;
          const next=1-index;gl.setRenderTarget(targets[next]);gl.render(scene,camera);index=next;
          accumulator-=1/120;steps++;dynamics.steps++;
        }
        dynamics.texture=targets[index].texture;
        if(!pending&&dynamics.time-lastRead>.1){
          lastRead=dynamics.time;pending=true;const version=generation;
          readUniforms.waves.value=dynamics.texture;quad.material=readMaterial;gl.setRenderTarget(packed);gl.render(scene,camera);
          const bytes=new Uint8Array(8);
          gl.readRenderTargetPixelsAsync(packed,0,0,2,1,bytes).then(()=>{
            if(version!==generation||!active)return;
            Object.assign(dynamics.boat,decodeWaveSample(bytes));Object.assign(dynamics.probe,decodeWaveSample(bytes,4));dynamics.reads++;
          }).catch(()=>{if(version===generation)dynamics.readErrors++;}).finally(()=>{if(version===generation)pending=false;});
        }
      }finally{quad.material=material;gl.xr.enabled=xr;gl.setRenderTarget(previousTarget);}
    },
    initialize(){initialized=false;active=false;generation++;pending=false;index=0;accumulator=0;queue.length=0;dynamics.texture=targets[0].texture;lastRead=-1;},
    dispose(){generation++;active=false;targets.forEach(t=>t.dispose());packed.dispose();bed.dispose();blank.dispose();geometry.dispose();material.dispose();readMaterial.dispose();},
  };
  return dynamics;
}
export type WaterDynamics=ReturnType<typeof createWaterDynamics>;
