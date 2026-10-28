"""Author an original, independently articulated harbor gull in Blender.

Coordinates below use the application's Y-up, +Z-forward convention. Feet sit
at Y=0. Exported left/right shoulder nodes remain independent for live flight.
Run: blender --background --factory-startup --python-exit-code 1 --python this.py
"""
import bpy, math, os, json
from mathutils import Vector

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=os.path.join(ROOT,'outputs/gull-v29')
DEST=os.path.join(ROOT,'public/models/harbor')
os.makedirs(OUT,exist_ok=True);os.makedirs(DEST,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

def xyz(p):return (p[0],-p[2],p[1])
def material(name,color,rough=.72):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
 return m
ivory=material('Gull ivory plumage',(.87,.86,.79))
gray=material('Gull cool silver mantle',(.32,.38,.40),.8)
dark=material('Gull charcoal primaries',(.035,.047,.051),.88)
gold=material('Gull muted ochre beak and feet',(.63,.38,.10))
eye=material('Gull dark eyes',(.008,.012,.012),.24)

def sphere(name,at,scale,mat,segments=16,rings=10):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=xyz(at))
 o=bpy.context.object;o.name=name;o.scale=(scale[0],scale[2],scale[1]);o.data.materials.append(mat)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for p in o.data.polygons:p.use_smooth=True
 return o
def rod(name,a,b,r,mat,r2=None):
 aa,bb=Vector(xyz(a)),Vector(xyz(b));d=bb-aa
 bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=(aa+bb)*.5)
 o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(mat)
 for p in o.data.polygons:p.use_smooth=True
 return o
def join(objects,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
 bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
 bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 return o

body=[sphere('Streamlined breast',(0,.036,-.004),(.015,.018,.031),ivory),
 sphere('Silver back mantle',(0,.044,-.010),(.0152,.012,.026),gray),
 sphere('Neck',(0,.052,.020),(.008,.014,.009),ivory),
 sphere('Round white head',(0,.063,.026),(.011,.011,.013),ivory),
 rod('Tapered beak',(0,.060,.037),(0,.059,.051),.0036,gold,.0009),
 sphere('Tail plume',(0,.037,-.038),(.011,.003,.020),ivory,12,6)]
for s in [-1,1]:
 body.append(sphere('Inset eye',(s*.0091,.065,.032),(.0017,.0017,.0014),eye,10,6))
 body.append(rod('Leg',(s*.006,0.004,-.001),(s*.006,.025,-.003),.0014,gold))
 for toe in [-1,0,1]:body.append(rod('Webbed toe',(s*.006,.001,-.001),(s*.006+toe*.003,.001,.007),.001,gold,.0007))
static=join(body,'GullBody')
root=bpy.data.objects.new('HarborGullAsset',None);bpy.context.collection.objects.link(root);static.parent=root

for s,label in [(-1,'Left'),(1,'Right')]:
 # Thin closed wing with an arched section and tapered outer primary feathers.
 # Shoulder origin is retained separately; no armature/baked animation required.
 pivot=(s*.011,.046,.002)
 sections=[(0,.008,-.016,.003),(.020,.011,-.021,.004),(.043,.005,-.027,.0025),(.061,-.002,-.023,.0013),(.076,-.012,-.017,.0005)]
 verts=[]
 for x,front,back,h in sections:
  for z,y in [(front,0),((front+back)/2,h),(back,0),((front+back)/2,-.001)]:verts.append(xyz((s*x,y,z)))
 faces=[];indices=[]
 for j in range(len(sections)-1):
  for k in range(4):
   f=(j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k)
   if s<0:f=tuple(reversed(f))
   faces.append(f);indices.append(1 if j>=2 else 0)
 faces.extend([(3,2,1,0),(16,17,18,19)]);indices.extend([0,1])
 mesh=bpy.data.meshes.new('Layered primary wing '+label);mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new('GullWingMesh'+label,mesh);bpy.context.collection.objects.link(o)
 o.data.materials.append(gray);o.data.materials.append(dark)
 for p,i in zip(o.data.polygons,indices):p.material_index=i;p.use_smooth=True
 # Recalculate outside normals for the mirrored wing and its caps.
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
 hinge=bpy.data.objects.new('GullWing'+label,None);bpy.context.collection.objects.link(hinge);hinge.location=xyz(pivot);hinge.parent=root;o.parent=hinge

for o in bpy.context.scene.objects:
 if o.type=='MESH':o['originalAsset']='Keyscape / MIT';o['ignoreHeightfield']=True
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'harbor-gull.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(DEST,'harbor-gull.glb'),export_format='GLB',export_yup=True)
report={'blender':bpy.app.version_string,'triangles':sum(len(p.vertices)-2 for o in bpy.context.scene.objects if o.type=='MESH' for p in o.data.polygons),
 'meshCount':sum(o.type=='MESH' for o in bpy.context.scene.objects),'bytes':os.path.getsize(os.path.join(DEST,'harbor-gull.glb')),
 'axes':'glTF Y up, +Z beak forward, feet origin Y=0','wingNodes':['GullWingLeft','GullWingRight'],'license':'MIT; created locally, no downloaded geometry or textures'}
with open(os.path.join(OUT,'asset-report.json'),'w',encoding='utf8') as f:json.dump(report,f,indent=2)

# A separate close-up preview validates silhouette/materials. No camera/lights
# are included in the already-exported asset or editable source file.
bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=24
bpy.context.scene.render.resolution_x=800;bpy.context.scene.render.resolution_y=600;bpy.context.scene.render.resolution_percentage=100
bpy.context.scene.world.color=(.32,.32,.32)
bpy.ops.object.light_add(type='AREA',location=(.18,-.10,.28));bpy.context.object.data.energy=12;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=.22
bpy.ops.object.camera_add(location=(.16,-.20,.18));camera=bpy.context.object
target=Vector((0,0,.035));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=.23;bpy.context.scene.camera=camera
bpy.context.scene.render.image_settings.file_format='PNG';bpy.context.scene.render.filepath=os.path.join(OUT,'gull-preview.png');bpy.ops.render.render(write_still=True)
print('KEYSCAPE_GULL_READY '+json.dumps(report),flush=True)
