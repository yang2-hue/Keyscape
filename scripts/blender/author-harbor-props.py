"""Local Blender fishing boat and T dock, constrained to existing collision bounds.
Author in project coordinates (Y up); convert to Blender Z up for export.
"""
import bpy,math,random,os,json
import numpy as np
from mathutils import Vector
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'));OUT=os.path.join(ROOT,'outputs/art-v23');DEST=os.path.join(ROOT,'public/models/harbor')
os.makedirs(OUT,exist_ok=True);os.makedirs(DEST,exist_ok=True);random.seed(230)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def xyz(v):return (v[0],-v[2],v[1])
def mat(name,c,rough=.85):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough;return m
ivory=mat('Warm painted ivory',(.73,.71,.61),.62)
teal=mat('Harbor blue green paint',(.045,.14,.16),.64)
bottom=mat('Muted red antifouling',(.25,.085,.055),.78)
wood=mat('Weathered timber',(.35,.26,.15),.91)
darkwood=mat('Wet pile wood',(.095,.075,.045),.95)
rope=mat('Hemp rope',(.43,.35,.22),.98)
iron=mat('Dark iron fittings',(.07,.085,.08),.57)
glass=mat('Cabin dark glass',(.025,.06,.07),.3)
orange=mat('Faded rescue ring',(.45,.16,.06),.77)
N=256;yy,xx=np.mgrid[:N,:N];rng=np.random.default_rng(23)
grain=.5+.16*np.sin(yy*.23+np.sin(xx*.026)*1.8)+.08*np.sin(yy*.93+xx*.004)+rng.normal(0,.035,(N,N))
for material,color in [(wood,(.35,.26,.15)),(darkwood,(.095,.075,.045))]:
 image=bpy.data.images.new(material.name+' grain',width=N,height=N);image.colorspace_settings.name='Linear Rec.709'
 rgba=np.ones((N,N,4),np.float32);rgba[:,:,:3]=np.array(color)*(1+(grain[:,:,None]-.5)*.38)
 image.pixels.foreach_set(rgba.ravel());image.pack();node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
 material.node_tree.links.new(node.outputs['Color'],material.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
def cube(name,loc,size,material,bevel=.001):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(loc));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
 if bevel:
  mod=o.modifiers.new('Soft worn edge','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def rod(name,a,b,r,material,vertices=8):
 aa,bb=Vector(xyz(a)),Vector(xyz(b));direction=bb-aa
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=direction.length,location=(aa+bb)*.5)
 o=bpy.context.object;o.name=name;o.rotation_euler=direction.to_track_quat('Z','Y').to_euler();o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=True
 return o
def line(name,points,r,material):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=1;c.resolution_u=5
 s=c.splines.new('POLY');s.points.add(len(points)-1)
 for p,v in zip(s.points,points):p.co=(*xyz(v),1)
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(material);return o
def mesh(name,verts,faces,materials,indices=None):
 g=bpy.data.meshes.new(name);g.from_pydata([xyz(p) for p in verts],[],faces);g.update();o=bpy.data.objects.new(name,g);bpy.context.collection.objects.link(o)
 for m in materials:g.materials.append(m)
 if indices:
  for p,i in zip(g.polygons,indices):p.material_index=i;p.use_smooth=True
 return o
def save(name):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.convert(target='MESH');bpy.context.view_layer.objects.active=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.ops.object.join();o=bpy.context.object;o.name=name
 bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 if name=='fishing-boat':
  # Curved trim has thickness beyond the mathematical hull. Fit the entire
  # visual model, including trim, inside the unchanged collision envelope.
  for v in o.data.vertices:v.co.x*=.98;v.co.y*=.99
  bpy.context.view_layer.update()
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,name+'.blend'))
 bpy.ops.export_scene.gltf(filepath=os.path.join(DEST,name+'.glb'),export_format='GLB',export_yup=True)
 return {'bytes':os.path.getsize(os.path.join(DEST,name+'.glb')),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'dimensionsBlender':list(o.dimensions)}

# Boat envelope: length .62, half width <=.104 before the existing .85 scale.
def width(t):return .103*max(0,math.sin(math.pi*t))**.64
verts=[];faces=[];mats=[];S=40;C=24
for layer in [0,1]:
 for j in range(S+1):
  t=j/S;w=width(t);sheer=.04+.018*abs(t*2-1)**3
  for k in range(C+1):
   a=-math.pi/2+k/C*math.pi
   verts.append((math.sin(a)*max(0,w-layer*.004),sheer-.13*(.88+.12*math.sin(math.pi*t))*math.cos(a)+layer*.004,(t-.5)*.62))
 base=layer*(S+1)*(C+1)
 for j in range(S):
  for k in range(C):
   v=base+j*(C+1)+k;faces.append((v,v+C+1,v+C+2,v+1));y=sum(verts[i][1] for i in faces[-1])/4
   mats.append(3 if layer else 2 if y<-.045 else 1 if y<.017 else 0)
mesh('Double skin painted hull',verts,faces,[ivory,teal,bottom,wood],mats)
for side in [-1,1]:
 pts=[(side*width(j/40),.044+.018*abs(j/20-1)**3,(j/40-.5)*.62) for j in range(41)]
 line('Rounded gunwale',pts,.0035,wood)
 line('Ivory sheer trim',[(x,y-.005,z) for x,y,z in pts],.0022,ivory)
# Open working cockpit, real narrow deck boards, transverse ribs and benches.
for j in range(13):
 z=(j-6)*.033;t=z/.62+.5;w=width(t)-.008
 cube('Cockpit sole plank',(0,-.018,z),(w*2,.008,.030),wood,.0008)
for z in [-.18,-.09,.08,.18]:
 t=z/.62+.5;w=width(t)-.006
 line('Internal rib',[(-w,.035,z),(-w*.6,-.025,z),(0,-.052,z),(w*.6,-.025,z),(w,.035,z)],.0024,wood)
for z in [.055,.18]:cube('Bench thwart',(0,.036,z),(width(z/.62+.5)*1.85,.012,.033),wood)
# A compact fishing wheelhouse replaces the featureless filled deck.
cube('Cabin body',(0,.093,-.115),(.119,.103,.126),ivory,.003)
cube('Cabin roof',(0,.150,-.115),(.141,.014,.145),wood,.002)
for side in [-1,1]:
 cube('Side cabin window',(side*.061,.112,-.112),(.004,.042,.068),glass,.001)
 for z in [-.148,-.076]:cube('Side window frame',(side*.064,.112,z),(.004,.052,.004),wood,.0005)
cube('Front cabin glazing',(0,.114,-.049),(.088,.045,.004),glass,.001)
cube('Front window mullion',(0,.114,-.046),(.003,.047,.004),wood,.0004)
cube('Rear cabin door',(0,.087,-.180),(.044,.079,.004),teal,.001)
rod('Mast',(0,.025,.125),(0,.36,.125),.0035,wood)
rod('Small boom',(0,.235,.125),(0,.235,-.012),.0022,wood)
for z in [-.27,.28]:line('Standing rigging',[(0,.352,.125),(0,.055,z)],.0009,rope)
for i in range(5):rod('Furled canvas',(.006,.11+i*.039,.125),(.006,.146+i*.039,.125),.0055,ivory)
for side in [-1,1]:rod('Bow oar',(side*.05,.045,.10),(side*.047,.053,.28),.0018,wood)
coil=[]
for i in range(100):
 t=i/99;r=.006+t*.014;a=t*math.tau*3.8;coil.append((math.cos(a)*r,.048,.247+math.sin(a)*r))
line('Boat rope coil',coil,.0011,rope)
# Keep the side fender inside the collision envelope.
bpy.ops.mesh.primitive_torus_add(major_radius=.019,minor_radius=.004,major_segments=24,minor_segments=6,location=xyz((.095,.064,-.02)))
f=bpy.context.object;f.name='Lifebelt';f.rotation_euler[1]=math.pi/2;f.data.materials.append(orange)
report={'blender':bpy.app.version_string,'author':'Keyscape local Blender construction','boat':save('fishing-boat')}

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# Dock origin = shore landing, deck top Y=0, head Z=.25. Its surface fits DOCK.
L=.25
for j in range(8):
 z=j*.022+.002
 cube('Walkway deck board',(0,-.008,z),(.17,.016,.020),wood,.0012)
 for side in [-1,1]:rod('Recessed nail',(side*.061,-.0005,z),(side*.061,.0002,z),.001,iron,6)
for i in range(15):
 x=(i-7)*.0303
 # Account for the dock's slight yaw: the visual corners must remain inside
 # the existing axis-aligned head obstacle, not merely match its local depth.
 cube('T head deck board',(x,-.008,L),(.0285,.016,.18),wood,.0012)
 for z in [L-.065,L+.065]:rod('Recessed nail',(x,-.0005,z),(x,.0002,z),.001,iron,6)
for side in [-1,1]:
 cube('Walkway stringer',(side*.057,-.035,.08),(.016,.033,.22),darkwood)
 cube('Head stringer',(0,-.035,L+side*.059),(.45,.033,.020),darkwood)
for x,z in [(-.061,.025),(.061,.025),(-.061,.135),(.061,.135),(-.21,L),(.21,L)]:
 rod('Embedded timber pile',(x,-.43,z),(x,.013,z),.012,darkwood,10)
 cube('Pile end grain cap',(x,.012,z),(.027,.008,.027),wood,.002)
for side in [-1,1]:
 rod('Under-deck diagonal brace',(side*.21,-.18,L),(0,-.03,L),.007,darkwood)
 x=side*.132
 rod('Mooring post',(x,-.03,L),(x,.15,L),.010,wood,10)
 for y in [.058,.064,.070]:
  line('Rope around post',[(x+math.cos(a)*.012,y,L+math.sin(a)*.012) for a in np.linspace(0,math.tau,30)],.0015,rope)
coil=[]
for i in range(120):
 t=i/119;r=.006+t*.025;a=t*math.tau*4;coil.append((.072+math.cos(a)*r,.004,L+math.sin(a)*r))
line('Dock rope coil',coil,.0015,rope)
# Small swimming ladder below the head, instead of broad floating stone slabs.
for x in [.12,.18]:rod('Swimming ladder rail',(x,.016,L+.085),(x,-.19,L+.085),.004,wood)
for y in [-.055,-.11,-.165]:rod('Swimming ladder rung',(.12,y,L+.085),(.18,y,L+.085),.003,wood)
report['dock']=save('timber-dock')
with open(os.path.join(OUT,'harbor-report.json'),'w') as f:json.dump(report,f,indent=2)
print('KEYSCAPE_HARBOR_READY',flush=True)
