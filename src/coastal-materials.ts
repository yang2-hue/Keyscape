import * as THREE from 'three';

export function seeded(seed:number){let value=seed>>>0;return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};}

/** Small deterministic surface maps, authored locally and shared by instances. */
function surface(kind:'stone'|'plaster'|'wood'|'sand'|'tile'){
  const n=256,canvas=document.createElement('canvas');canvas.width=canvas.height=n;
  const ctx=canvas.getContext('2d')!;
  const random=seeded({stone:12,plaster:35,wood:68,sand:94,tile:120}[kind]);
  ctx.fillStyle=kind==='wood'?'#c9bb9f':'#eee7d8';ctx.fillRect(0,0,n,n);
  const image=ctx.getImageData(0,0,n,n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=(y*n+x)*4;
    const broad=Math.sin(x*.033+Math.sin(y*.041))*Math.cos(y*.057)*5;
    const grain=(random()-.5)*(kind==='sand'?38:kind==='plaster'?16:24);
    const striation=kind==='wood'?Math.sin(y*.47+Math.sin(x*.034)*2)*9:0;
    for(let c=0;c<3;c++)image.data[i+c]=Math.max(0,Math.min(255,image.data[i+c]+broad+grain+striation));
  }
  ctx.putImageData(image,0,0);
  if(kind==='wood')for(let k=0;k<14;k++){
    ctx.strokeStyle=`rgba(74,63,43,${.04+random()*.07})`;ctx.lineWidth=.5+random();ctx.beginPath();
    const y=random()*n;ctx.moveTo(0,y);ctx.bezierCurveTo(80,y+random()*8,170,y-4,256,y+2);ctx.stroke();
  }
  if(kind==='stone')for(let k=0;k<28;k++){
    ctx.fillStyle=`rgba(148,135,111,${random()*.10})`;ctx.beginPath();ctx.ellipse(random()*n,random()*n,3+random()*22,2+random()*8,random()*3,0,Math.PI*2);ctx.fill();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;
  return texture;
}

export function makeCoastalMaterials(time:{value:number},water:number,causticGain=1){
  const maps={stone:surface('stone'),plaster:surface('plaster'),wood:surface('wood'),sand:surface('sand'),tile:surface('tile')};
  const standard=(color:string,roughness=.88,map?:THREE.Texture,bump=.004)=>new THREE.MeshStandardMaterial({color,roughness,map,bumpMap:map,bumpScale:bump});
  const materials={
    stone:standard('#d9ceb6',.95,maps.stone,.007),
    plaster:standard('#f4ead5',.94,maps.plaster,.003),
    rock:standard('#c9bfa8',.96,maps.stone,.009),
    wood:standard('#b6a17c',.92,maps.wood,.004),
    darkwood:standard('#746c54',.94,maps.wood,.004),
    sand:standard('#e7d8b6',.98,maps.sand,.003),
    roof:standard('#c8825c',.87,maps.tile,.003),
    teal:standard('#3b6b65'),glass:standard('#263f41',.35),
    ivory:standard('#f6f0df',.65),metal:standard('#5b665c',.5),
    leaf:standard('#ffffff',.95),terra:standard('#b87c57'),rope:standard('#bca87f'),
    fish:standard('#44797d',.54),orange:standard('#ce6940',.7),
  };
  for(const material of [materials.sand,materials.rock,materials.stone]){
    material.onBeforeCompile=shader=>{
      shader.uniforms.tideTime=time;shader.uniforms.tideLevel={value:water};
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 tideP;varying vec3 tideN;');
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        vec4 tideLocal=vec4(transformed,1.0);vec3 tideNormal=objectNormal;
        #ifdef USE_INSTANCING
          tideLocal=instanceMatrix*tideLocal;tideNormal=mat3(instanceMatrix)*tideNormal;
        #endif
        tideP=(modelMatrix*tideLocal).xyz;tideN=normalize(mat3(modelMatrix)*tideNormal);
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 tideP;varying vec3 tideN;uniform float tideTime;uniform float tideLevel;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float wet=1.0-smoothstep(tideLevel-.02,tideLevel+.015,tideP.y);
        float a=sin(tideP.x*28.0+sin(tideP.z*19.0+tideTime*.6)*1.6);
        float b=cos(tideP.z*33.0-sin(tideP.x*17.0-tideTime*.4));
        float light=pow(1.0-abs(a*b),20.0)*wet*smoothstep(.1,.7,tideN.y);
        diffuseColor.rgb*=mix(vec3(1),vec3(.83,.96,.95),wet);
        diffuseColor.rgb+=vec3(.15,.22,.18)*light*${causticGain.toFixed(3)};
      `);
    };
    material.customProgramCacheKey=()=> 'coastal-study-caustics-v1-'+causticGain;
  }
  return {materials,dispose(){Object.values(materials).forEach(m=>m.dispose());Object.values(maps).forEach(t=>t.dispose());}};
}
export type CoastalMaterials=ReturnType<typeof makeCoastalMaterials>['materials'];
