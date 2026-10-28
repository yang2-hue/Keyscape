import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';

/** Stylised distant trails, kept behind the miniature and depth-tested. */
export default function LunarMeteors({active,playing}:{active:boolean;playing:boolean}){
  const elapsed=useRef(0);
  const field=useMemo(()=>{
    const group=new THREE.Group(),geometry=new THREE.PlaneGeometry(1,1,16,1);
    const colors=[];
    for(let i=0;i<geometry.attributes.position.count;i++){
      const x=geometry.attributes.position.getX(i)+.5;
      const brightness=Math.pow(x,2);colors.push(brightness,brightness*.88,brightness*.67);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    for(let i=0;i<14;i++){
      const material=new THREE.MeshBasicMaterial({color:new THREE.Color('#fff2df').multiplyScalar(2.3),toneMapped:false,vertexColors:true,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
      const mesh=new THREE.Mesh(geometry,material);mesh.rotation.z=-.58;group.add(mesh);
    }
    return {group,geometry};
  },[]);
  useEffect(()=>()=>{field.geometry.dispose();field.group.children.forEach(o=>((o as THREE.Mesh).material as THREE.Material).dispose());},[field]);
  useFrame(({camera,gl},dt)=>{
    const delta=document.hidden?0:Math.min(dt,.05);
    if(playing)elapsed.current+=delta;
    field.group.position.copy(camera.position).add(new THREE.Vector3(0,0,-24).applyQuaternion(camera.quaternion));
    field.group.quaternion.copy(camera.quaternion);
    field.group.children.forEach((o,i)=>{
      const mesh=o as THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
      const age=(elapsed.current+i*.83)%11,duration=1.5+(i%3)*.18,u=age/duration;
      const visible=u<1;
      mesh.position.set(-4.5+(i%4)*1.8+u*3.3,3.6+(i%3)*.55-u*2.15,0);
      mesh.scale.set(.8+(i%3)*.22,.012+(i%2)*.006,1);
      const target=active&&visible?Math.sin(Math.PI*u)*.85:0;
      mesh.material.opacity=THREE.MathUtils.damp(mesh.material.opacity,target,8,delta);
      mesh.visible=mesh.material.opacity>.002;
    });
    if(import.meta.env.DEV){gl.domElement.dataset.meteorTime=elapsed.current.toFixed(3);gl.domElement.dataset.meteors=String(field.group.children.filter(o=>o.visible).length);}
  });
  return <primitive object={field.group} dispose={null}/>;
}
