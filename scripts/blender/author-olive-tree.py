"""Editable, individually branched Mediterranean olive; no opaque crown blobs."""
import bpy,math,random,os,json
from mathutils import Vector
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'));OUT=os.path.join(ROOT,'outputs/art-v21')
random.seed(572)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,roughness):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness
 return m
bark=mat('Warm silver olive bark',(.25,.20,.13),.93)
foliage=[mat('Olive leaf '+str(i),c,.78) for i,c in enumerate([(.06,.10,.035),(.10,.16,.06),(.16,.23,.10),(.23,.30,.15),(.09,.14,.05)])]
verts=[];faces=[]
def branch(points,radius):
 start=len(verts);N=8
 for k,p in enumerate(points):
  tangent=Vector(points[min(k+1,len(points)-1)])-Vector(points[max(0,k-1)])
  tangent.normalize();u=tangent.cross(Vector((0,1,0))).normalized();v=tangent.cross(u)
  r=radius*(1-.87*k/(len(points)-1))
  for j in range(N):
   a=j*math.tau/N;pos=Vector(p)+(u*math.cos(a)+v*math.sin(a))*r*(1+.09*math.sin(j*4+k))
   verts.append(tuple(pos))
 for k in range(len(points)-1):
  for j in range(N):faces.append((start+k*N+j,start+k*N+(j+1)%N,start+(k+1)*N+(j+1)%N,start+(k+1)*N+j))
branch([(0,0,0),(.024,-.012,.14),(-.012,.014,.29),(.035,0,.43),(.018,.015,.56)],.047)
leafverts=[];leaffaces=[];leafmats=[]
def leaf(p,direction,length):
 # A narrow cupped blade, with an actual center ridge and tapered ends.
 d=direction.normalized();u=d.cross(Vector((0,0,1))).normalized()
 if u.length<.1:u=Vector((1,0,0))
 v=d.cross(u).normalized();start=len(leafverts);w=length*.16
 leafverts.extend([tuple(p-d*length*.5),tuple(p-u*w-v*w*.12),tuple(p+v*w*.32),tuple(p+u*w-v*w*.12),tuple(p+d*length*.5)])
 leaffaces.extend([(start,start+1,start+2),(start,start+2,start+3),(start+4,start+2,start+1),(start+4,start+3,start+2)])
 shade=random.choices(range(5),[2,4,3,1,3])[0];leafmats.extend([shade]*4)
for b in range(9):
 a=b*2.39996;reach=random.uniform(.23,.39);height=random.uniform(.59,.80)
 if b>=7:reach=.10+(b-7)*.05;height=.84+(b-7)*.04
 tip=Vector((math.cos(a)*reach,math.sin(a)*reach,height))
 branch([(.012,.005,.27+b*.025),tuple(tip*.48+Vector((0,0,.18))),tuple(tip)],.018)
 for twig in range(5):
  aa=a+(twig-2)*.48
  end=tip+Vector((math.cos(aa)*random.uniform(.08,.15),math.sin(aa)*random.uniform(.08,.15),random.uniform(-.02,.12)))
  branch([tuple(tip-Vector((0,0,.065))),tuple((tip+end)*.5),tuple(end)],.005)
  for j in range(58):
   az=random.random()*math.tau;zz=random.uniform(-1,1);rr=random.random()**(1/3)
   offset=Vector((math.cos(az)*math.sqrt(1-zz*zz)*.13,math.sin(az)*math.sqrt(1-zz*zz)*.11,zz*.09))*rr
   p=end+offset;direction=Vector((math.cos(az),math.sin(az),random.uniform(-.3,.6)))
   leaf(p,direction,random.uniform(.037,.063))
def obj(name,vertices,polys,mats):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],polys);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
 for m in mats:mesh.materials.append(m)
 return o
trunk=obj('OliveTrunk',verts,faces,[bark])
for p in trunk.data.polygons:p.use_smooth=True
leaves=obj('IndividualOliveLeaves',leafverts,leaffaces,foliage)
for p,i in zip(leaves.data.polygons,leafmats):p.material_index=i;p.use_smooth=True
os.makedirs(os.path.join(ROOT,'public/models/olive'),exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'olive-tree.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public/models/olive/mediterranean-olive.glb'),export_format='GLB',export_yup=True)
with open(os.path.join(OUT,'olive-report.json'),'w') as f:json.dump({'blender':bpy.app.version_string,'author':'Keyscape local Blender construction','leafCount':len(leaffaces)//4,'branchPolygons':len(faces),'height':max(v[2] for v in leafverts)},f,indent=2)
