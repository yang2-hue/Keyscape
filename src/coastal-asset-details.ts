import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {keepAccessClear} from './crescent-access.ts';
import {roundedSquarePoint,HARBOR} from './harbor-layout.ts';
import {beachInfluence} from './coastal-composition.ts';

export type CoastalArtAssets={rock:THREE.Mesh;olive:THREE.Group;cottage?:THREE.Group;lighthouse?:THREE.Group;boat?:THREE.Group;dock?:THREE.Group};

/** World-space projection lets the continuous shore share the scan's mineral
 * detail without stretching a top-down UV map down the vertical cliff. */
export function applyCoastalScan(material:THREE.MeshStandardMaterial,source:THREE.MeshStandardMaterial){
  const base=material.onBeforeCompile;
  material.map=null;material.normalMap=null;
  material.onBeforeCompile=(shader,renderer)=>{
    base.call(material,shader,renderer);
    shader.uniforms.coastalAlbedo={value:source.map};
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D coastalAlbedo;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 blend=pow(abs(normalize(tideN)),vec3(4.0));blend/=max(.001,blend.x+blend.y+blend.z);
      vec3 mineral=texture2D(coastalAlbedo,tideP.zy*1.65).rgb*blend.x
        +texture2D(coastalAlbedo,tideP.xz*1.65).rgb*blend.y
        +texture2D(coastalAlbedo,tideP.xy*1.65).rgb*blend.z;
      float cliff=1.0-smoothstep(.42,.88,tideN.y);
      diffuseColor.rgb*=mix(vec3(1.0),mineral*1.12,cliff*.85);
    `);
  };
  material.customProgramCacheKey=()=> 'coastal-scan-triplanar-v21';
}

/** Scan-derived large landforms, embedded into the existing navigable terrain.
 * Keep contact/collision geometry in the same root as the visible shore. */
export function addCoastalArt(root:THREE.Group,assets:CoastalArtAssets,height:(x:number,z:number)=>number){
  const pieces:THREE.BufferGeometry[]=[],matrix=new THREE.Matrix4(),q=new THREE.Quaternion();
  const material=(assets.rock.material as THREE.MeshStandardMaterial).clone();
  material.name='ScannedCoastalLimestone';material.roughness=.94;material.metalness=0;
  material.color.set('#eee4d1');material.normalScale.set(.8,.8);
  // Unequal clusters, not two evenly spaced concentric necklaces of rocks.
  const angles=[-3.32,-2.98,-2.61,-2.20,-1.87,-1.51,-1.09,-.72,2.42,2.83];
  const add=(a:number,r:number,radial:number,tangent:number,vertical:number)=>{
    const x=-.22+Math.cos(a)*r,z=.06+Math.sin(a)*r;
    const y=height(x,z)-vertical*.62;
    if(y<-.22||keepAccessClear(x,z,.015)||beachInfluence(a)>.6)return;
    q.setFromAxisAngle(new THREE.Vector3(0,1,0),-a);
    matrix.compose(new THREE.Vector3(x,y,z),q,new THREE.Vector3(radial,vertical,tangent));
    const g=assets.rock.geometry.clone();g.applyMatrix4(matrix);
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      const [px,pz]=roundedSquarePoint(THREE.MathUtils.clamp(p.getX(i),-1.55,1.55),THREE.MathUtils.clamp(p.getZ(i),-1.55,1.55));
      // Roads and entrances are authored first; trim concealed scan vertices
      // below their surface rather than scatter rocks across the circulation.
      const py=keepAccessClear(px,pz,.025)?Math.min(p.getY(i),height(px,pz)-.04):p.getY(i);
      p.setXYZ(i,px,py,pz);
    }
    g.computeVertexNormals();pieces.push(g);
  };
  angles.forEach((a,i)=>{
    const shift=Math.sin(i*2.3)*.025;
    add(a,1.25+shift,.17+(i%3)*.025,.23+(i%2)*.06,.29+(i%4)*.045);
    // Inner limestone ledges sit below the road, not on top of it.
    if(i%3!==1)add(a+.06,.79+shift,.14,.21+(i%3)*.035,.25+(i%3)*.045);
  });
  const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());
  if(!geometry)throw new Error('No usable coastal scan placements');
  const rock=new THREE.Mesh(geometry,material);rock.name='ScannedCoastalOutcrops';rock.castShadow=rock.receiveShadow=true;root.add(rock);
  const trees:THREE.Group[]=[];
  for(const [a,r,s,rotation] of [[-2.68,1.20,.53,.4],[-1.65,1.24,.48,1.8],[-.63,1.18,.40,3.1],[2.60,1.15,.47,4.5]]){
    const x=-.22+Math.cos(a)*r,z=.06+Math.sin(a)*r,y=height(x,z);
    if(y<HARBOR.water+.10||keepAccessClear(x,z,.09))continue;
    const tree=assets.olive.clone(true);tree.name='BlenderOliveTree';tree.position.set(x,y-.015,z);tree.scale.setScalar(s);tree.rotation.y=rotation;
    tree.traverse(o=>{o.userData.ignoreHeightfield=true;if(o instanceof THREE.Mesh){o.castShadow=o.receiveShadow=true;}});
    root.add(tree);trees.push(tree);
  }
  root.userData.artAssets={scanOutcrops:pieces.length,oliveTrees:trees.length};
  return ()=>{geometry.dispose();material.dispose();};
}
