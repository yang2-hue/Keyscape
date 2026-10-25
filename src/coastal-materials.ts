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
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;
  return {map:texture,normal:normalFrom(image,n)};
}

/** Sobel the same pixels into a normal map. A 256 px bump map only shifts the
 * lighting a little; a normal map keeps the grain crisp at grazing angles,
 * which is where cliffs are actually looked at. */
function normalFrom(image:ImageData,n:number){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=n;
  const ctx=canvas.getContext('2d')!;
  const out=ctx.createImageData(n,n);
  const at=(x:number,y:number)=>image.data[((y+n)%n*n+(x+n)%n)*4];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=(y*n+x)*4,strength=.55;
    const nx=-(at(x+1,y)-at(x-1,y))*strength;
    const ny=-(at(x,y+1)-at(x,y-1))*strength;
    const nz=255,len=Math.hypot(nx,ny,nz)||1;
    out.data[i]=Math.round((nx/len*.5+.5)*255);
    out.data[i+1]=Math.round((ny/len*.5+.5)*255);
    out.data[i+2]=Math.round((nz/len*.5+.5)*255);
    out.data[i+3]=255;
  }
  ctx.putImageData(out,0,0);
  const texture=new THREE.CanvasTexture(canvas);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;
  return texture;
}

export function makeCoastalMaterials(time:{value:number},water:number,causticGain=1){
  const maps={stone:surface('stone'),plaster:surface('plaster'),wood:surface('wood'),sand:surface('sand'),tile:surface('tile')};
  const standard=(color:string,roughness=.88,surface?:{map:THREE.Texture;normal:THREE.Texture},normalScale=.7)=>new THREE.MeshStandardMaterial({color,roughness,map:surface?.map,normalMap:surface?.normal,normalScale:new THREE.Vector2(normalScale,normalScale)});
  const materials={
    stone:standard('#d9ceb6',.95,maps.stone,.9),
    plaster:standard('#f4ead5',.94,maps.plaster,.45),
    rock:standard('#c9bfa8',.96,maps.stone,1.05),
    wood:standard('#b6a17c',.92,maps.wood,.55),
    darkwood:standard('#746c54',.94,maps.wood,.55),
    sand:standard('#e7d8b6',.98,maps.sand,.45),
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
  return {materials,dispose(){
    Object.values(materials).forEach(m=>m.dispose());
    Object.values(maps).forEach(s=>{s.map.dispose();s.normal.dispose();});
    Object.values(materials).forEach(m=>{(m as THREE.MeshStandardMaterial).normalMap?.dispose();});
  }};
}
export type CoastalMaterials=ReturnType<typeof makeCoastalMaterials>['materials'];
