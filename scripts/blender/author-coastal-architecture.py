"""Editable coastal cottage and lighthouse shells, aligned to existing paths.
Blender Z up / front -Y exports to glTF Y up / front +Z. No cloud generation.
"""
import bpy,math,random,os,json
import numpy as np
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=os.path.join(ROOT,'outputs/art-v29');DEST=os.path.join(ROOT,'public/models/architecture')
os.makedirs(OUT,exist_ok=True);os.makedirs(DEST,exist_ok=True);random.seed(220)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color,rough=.9):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
 return m
plaster=material('Warm limewashed plaster',(.77,.73,.65),.94)
stone=material('Pale limestone trim',(.58,.55,.47),.91)
teal=material('Weathered deep sage wood',(.10,.20,.17),.84)
wood=material('Dark exposed timber',(.12,.085,.055),.92)
glass=material('ArchitectureWindowGlass',(.025,.055,.065),.38)
iron=material('Oxidized bronze rail',(.075,.09,.075),.65)
copper=material('Aged coastal copper',(.12,.20,.17),.62)
copper.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=.48
roof=[material('Terracotta '+str(i),c,.88) for i,c in enumerate([(.34,.14,.075),(.39,.17,.09),(.28,.11,.055),(.43,.21,.12)])]
# Exported albedo, normal and roughness maps remain effective in the browser.
# Low-frequency plaster mottling is distinct from small pores; no procedural
# nodes are left for the GLB exporter to silently discard.
rng=np.random.default_rng(22);N=256;yy,xx=np.mgrid[:N,:N]
def noise(scale):
 grid=rng.random((scale,scale));axis=np.linspace(0,scale-1,N)
 rows=np.array([np.interp(axis,np.arange(scale),row) for row in grid])
 return np.array([np.interp(axis,np.arange(scale),col) for col in rows.T]).T
coarse=noise(7);mid=noise(32);fine=rng.random((N,N))
def raster(mat,label,rgb,color=False):
 im=bpy.data.images.new(mat.name+' '+label,width=N,height=N)
 im.colorspace_settings.name='Linear Rec.709' if color else 'Non-Color'
 rgba=np.ones((N,N,4),dtype=np.float32);rgba[:,:,:3]=rgb
 im.pixels.foreach_set(rgba.ravel());im.pack()
 node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=im;node.label=label
 return node
def textured(mat,base,grain,variation,roughness,normal_scale):
 p=mat.node_tree.nodes['Principled BSDF']
 albedo=np.clip(np.array(base)*(1+(grain[:,:,None]-.5)*variation),0,1)
 al=raster(mat,'weathered albedo',albedo,True);mat.node_tree.links.new(al.outputs['Color'],p.inputs['Base Color'])
 rr=np.repeat(np.clip(roughness+(grain-.5)*.18,0,1)[:,:,None],3,axis=2)
 ro=raster(mat,'surface roughness',rr);mat.node_tree.links.new(ro.outputs['Color'],p.inputs['Roughness'])
 gy,gx=np.gradient(grain);norm=np.dstack((-gx*normal_scale,-gy*normal_scale,np.ones_like(gx)))
 norm/=np.linalg.norm(norm,axis=2,keepdims=True)
 no=raster(mat,'surface normal',norm*.5+.5)
 nm=mat.node_tree.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.6
 mat.node_tree.links.new(no.outputs['Color'],nm.inputs['Color']);mat.node_tree.links.new(nm.outputs['Normal'],p.inputs['Normal'])
textured(plaster,(.77,.73,.65),coarse*.52+mid*.23+fine*.25,.26,.94,1.5)
textured(stone,(.58,.55,.47),coarse*.25+mid*.40+fine*.35,.34,.91,2.0)
wood_grain=np.clip(.5+.16*np.sin(xx*.28+np.sin(yy*.035)*1.8)+.16*(mid-.5)+.08*(fine-.5),0,1)
textured(teal,(.10,.20,.17),wood_grain,.58,.84,1.1)
textured(copper,(.12,.20,.17),coarse*.7+fine*.3,.48,.62,.6)
def cube(name,loc,scale,mat,bevel=.0015):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:
  mod=o.modifiers.new('Fine hand-cut edge','BEVEL');mod.width=bevel;mod.segments=2
  bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def cylinder(name,loc,r1,r2,depth,mat,vertices=48):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth,location=loc)
 o=bpy.context.object;o.name=name;o.data.materials.append(mat)
 for f in o.data.polygons:f.use_smooth=True
 return o
def torus(name,z,r,thickness,mat):
 bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=thickness,major_segments=48,minor_segments=6,location=(0,0,z))
 o=bpy.context.object;o.name=name;o.data.materials.append(mat);return o
def join(name,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
 bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');return o
def save(name):
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,name+'.blend'))
 bpy.ops.export_scene.gltf(filepath=os.path.join(DEST,name+'.glb'),export_format='GLB',export_yup=True,export_image_format='AUTO')
 from mathutils import Vector
 points=[o.matrix_world@Vector(p) for o in bpy.context.scene.objects if o.type=='MESH' for p in o.bound_box]
 return {'bytes':os.path.getsize(os.path.join(DEST,name+'.glb')),'meshes':len([o for o in bpy.context.scene.objects if o.type=='MESH']),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'),'bounds_blender':{'min':[min(v[i] for v in points) for i in range(3)],'max':[max(v[i] for v in points) for i in range(3)]},'mesh_names':[o.name for o in bpy.context.scene.objects if o.type=='MESH']}

# Cottage: measured to fit the existing .32 x .26 foundation and inward door.
w=.32;d=.26;h=.24;rise=.1024;half=.20
cube('Foundation',(0,0,-.018),(.365,.305,.036),stone,.003)
# A continuous gabled wall removes the visible texture seam between the former
# cube and loose triangle, and meets the underside of the actual wider roof.
eave=h+rise*(1-(w/2)/half)-.002
profile=[(-w/2,0),(w/2,0),(w/2,eave),(0,h+rise-.002),(-w/2,eave)]
verts=[(x,y,z) for y in [-d/2,d/2] for x,z in profile]
faces=[(0,1,2,3,4),(9,8,7,6,5)]+[(i,i+5,(i+1)%5+5,(i+1)%5) for i in range(5)]
wallmesh=bpy.data.meshes.new('Continuous gabled limewash');wallmesh.from_pydata(verts,[],faces);wallmesh.materials.append(plaster);wallmesh.update()
wall=bpy.data.objects.new('LimewashedWalls',wallmesh);bpy.context.collection.objects.link(wall)
uv=wallmesh.uv_layers.new(name='ArchitectureUV')
for face in wallmesh.polygons:
 for li in face.loop_indices:
  v=wallmesh.vertices[wallmesh.loops[li].vertex_index].co
  uv.data[li].uv=(v.x/w+.5,v.z/(h+rise)) if abs(face.normal.y)>.5 else (v.y/d+.5,v.z/(h+rise))
for side in [-1,1]:
 # Timber fascia along both eaves.
 cube('Eave fascia',(side*half,0,h-.002),(.008,d+.065,.018),wood,.001)
for side in [-1,1]:
 slope=math.atan2(rise,half)
 board=cube('Roof bed',(side*half/2,0,h+rise/2-.004),(math.hypot(half,rise),d+.06,.006),roof[2],.0008)
 board.rotation_euler[1]=side*slope
 # Each overlapping barrel tile is an arched surface, not a thick log.
 for row in range(7):
  for col in range(14):
   u0=row/7;u1=min(1.025,(row+1.15)/7);center=(col-6.5)*.023
   vertices=[];faces=[]
   for u in [u0,u1]:
    for j in range(7):
     v=(j/6-.5)*.024;arch=math.sqrt(max(0,1-(v/.012)**2))*.0035
     vertices.append((side*half*u,center+v,h+rise*(1-u)+.005+arch))
   for j in range(6):faces.append((j,j+1,j+8,j+7) if side>0 else (j+7,j+8,j+1,j))
   mesh=bpy.data.meshes.new('Barrel tile');mesh.from_pydata(vertices,[],faces);mesh.materials.append(random.choices(roof,weights=[4,4,1,2])[0])
   o=bpy.data.objects.new('Overlapping clay tile',mesh);bpy.context.collection.objects.link(o)
for i in range(14):
 o=cylinder('Ridge cap',(0,(i-6.5)*.023,h+rise+.007),.007,.007,.025,roof[i%4],12);o.rotation_euler[0]=math.pi/2
# Entrances, actual trim depth, a small lintel and a clear landing.
cube('Door recess',(0,-d/2-.003,.089),(.081,.007,.178),wood)
cube('CottageDoor',(0,-d/2-.008,.087),(.062,.010,.166),teal,.001)
for x in [-.04,.04]:cube('Door jamb',(x,-d/2-.012,.092),(.013,.022,.184),stone,.001)
cube('Door lintel',(0,-d/2-.014,.189),(.098,.025,.018),stone)
cube('Entry threshold',(0,-d/2-.04,-.001),(.14,.085,.022),stone)
for z in [.054,.12]:cube('Door inset panel',(0,-d/2-.014,z),(.047,.002,.045),teal,.0005)
cube('Door handle',(.02,-d/2-.02,.09),(.004,.005,.013),iron,.0006)
# Narrow architrave and horizontal panel rails add readable depth at close range.
for z in [.027,.081,.151]:cube('Door joinery rail',(0,-d/2-.0155,z),(.055,.003,.005),teal,.0004)
panes=[]
for side in [-1,1]:
 x=side*(w/2+.004);z=.151
 cube('Window recess',(x,0,z),(.009,.082,.104),wood)
 panes.append(cube('CottageWindowPanes',(x+side*.004,0,z),(.003,.055,.075),glass,.0003))
 for y in [-.041,.041]:cube('Window jamb',(x+side*.003,y,z),(.019,.010,.106),stone)
 for zz in [z-.052,z+.052]:cube('Window sill',(x+side*.007,0,zz),(.026,.095,.011),stone)
 cube('Window crossbar',(x+side*.008,0,z),(.006,.057,.003),teal,.0004)
 cube('Window central mullion',(x+side*.008,0,z),(.006,.003,.075),teal,.0004)
 for y in [-.069,.069]:
  cube('Sage shutter',(x+side*.007,y,z),(.011,.038,.092),teal,.001)
  for k in range(7):
   blade=cube('Angled shutter louvers',(x+side*.014,y,z+(k-3)*.0105),(.004,.031,.007),teal,.00035)
   blade.rotation_euler[1]=side*.30
  for zz in [z-.038,z+.038]:cube('Shutter hinge',(x+side*.015,y,zz),(.002,.026,.0025),iron,0)
  for edge in [-1,1]:cube('Shutter stile',(x+side*.014,y+edge*.016,z),(.004,.003,.088),teal,.0004)
# Small attic oculus; part of the same independent dynamic window mesh.
recess=cylinder('Attic window recess',(0,-d/2-.003,.274),.020,.020,.004,wood,24);recess.rotation_euler[0]=math.pi/2
pane=cylinder('Attic window pane',(0,-d/2-.006,.274),.013,.013,.002,glass,24);pane.rotation_euler[0]=math.pi/2;panes.append(pane)
ring=torus('Attic limestone ring',0,.0165,.0035,stone);ring.location=(0,-d/2-.007,.274);ring.rotation_euler[0]=math.pi/2
cube('Attic window mullion',(0,-d/2-.009,.274),(.002,.003,.026),teal,.0003)
for sx in [-1,1]:
 for sy in [-1,1]:
  for row in range(5):cube('Corner limestone quoin',(sx*(w/2-.015),sy*(d/2-.012),.022+row*.045),(.038,.031,.018),stone,.001)
cube('Chimney',(.076,.045,.324),(.047,.055,.15),plaster,.002)
cube('Chimney cap',(.076,.045,.404),(.064,.071,.015),stone,.0015)
cube('Chimney dark flue',(.076,.045,.413),(.030,.037,.006),wood,.001)
# A two-piece stone collar reads as flashing without enlarging the roof outline.
cube('Chimney flashing',(.076,.045,.322),(.058,.066,.008),iron,.0008)
for side in [-1,1]:
 for j in range(6):cube('Timber rafter end',(side*.193,(j-2.5)*.051,.229),(.012,.010,.020),wood,.0006)
join('CottageWindowPanes',panes)
join('CoastalCottageShell',[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name!='CottageWindowPanes'])
report={'revision':'v29','blender':bpy.app.version_string,'author':'Keyscape local Blender construction','cottage':save('coastal-cottage')}

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# Lighthouse shell matches the existing lantern at local z=.70 exactly.
cylinder('Lower plinth',(0,0,.0125),.17,.15,.025,stone)
cylinder('Limewashed tower',(0,0,.3125),.10,.066,.575,plaster,64)
cylinder('Stone footing',(0,0,.045),.103,.098,.04,stone)
for row in range(6):
 z=.065+row*.026;r=.10-(z-.025)/.575*.034
 for k in range(12):
  a=(k+(row%2)*.5)*math.tau/12;span=math.tau/12-.025
  verts=[]
  # Arc-shaped courses follow the tapered tower, rather than twelve box corners.
  for zz in [z-.009,z+.009]:
   rr=.10-(zz-.025)/.575*.034
   for radius in [rr-.002,rr+.0045]:
    for j in range(4):
     theta=a-span/2+span*j/3;verts.append((math.cos(theta)*radius,math.sin(theta)*radius,zz))
  faces=[]
  for j in range(3):faces.extend([(j,j+1,j+5,j+4),(j+8,j+12,j+13,j+9),(j+4,j+5,j+13,j+12),(j,j+8,j+9,j+1)])
  faces.extend([(0,4,12,8),(3,11,15,7)])
  mesh=bpy.data.meshes.new('Curved masonry');mesh.from_pydata(verts,[],faces);mesh.materials.append(stone)
  ob=bpy.data.objects.new('Limestone footing course',mesh);bpy.context.collection.objects.link(ob)
door=cube('LighthouseDoor',(0,-.099,.095),(.045,.014,.14),teal)
for x in [-.030,.030]:cube('Tower entry jamb',(x,-.100,.10),(.014,.022,.16),stone)
cube('Tower lintel',(0,-.101,.183),(.079,.024,.02),stone)
cube('Tower threshold',(0,-.13,.012),(.085,.095,.023),stone)
for z in [.30,.46]:
 r=.10-(z-.025)/.575*.034
 cube('Tower slit recess',(0,-r-.003,z),(.030,.009,.057),wood)
 cube('Tower slit glass',(0,-r-.008,z),(.019,.004,.042),glass)
 cube('Tower slit sill',(0,-r-.01,z-.029),(.041,.021,.008),stone)
 for x in [-.015,.015]:cube('Slit dressed stone jamb',(x,-r-.008,z),(.006,.012,.059),stone,.0008)
 cube('Slit dressed lintel',(0,-r-.009,z+.031),(.041,.014,.008),stone,.0008)
for z in [.214,.566]:
 r=.10-(z-.025)/.575*.034
 torus('Limewash drip course',z,r+.0008,.0014,stone)
for z,r in [(.585,.074),(.604,.091),(.618,.108)]:cylinder('Gallery corbel',(0,0,z),r,r+.008,.016,stone)
cylinder('Gallery deck',(0,0,.632),.126,.126,.014,stone)
for i in range(16):
 a=i*math.tau/16;cylinder('Gallery baluster',(math.cos(a)*.111,math.sin(a)*.111,.675),.0018,.0018,.072,iron,6)
for z in [.648,.708]:torus('Gallery rail',z,.111,.0022,iron)
for i in range(8):
 a=i*math.tau/8;cylinder('Lantern mullion',(math.cos(a)*.064,math.sin(a)*.064,.70),.0025,.0025,.145,iron,6)
cylinder('Lantern roof rim',(0,0,.775),.101,.101,.012,iron)
cylinder('Weathered copper roof',(0,0,.816),.103,.006,.073,copper,48)
# Raised copper seams read at close range but do not expand the roof silhouette.
for i in range(8):
 a=i*math.tau/8
 from mathutils import Vector
 start=Vector((math.cos(a)*.099,math.sin(a)*.099,.782));end=Vector((math.cos(a)*.007,math.sin(a)*.007,.851))
 seam=cylinder('Copper standing seam',(start+end)*.5,.001,.001,(end-start).length,copper,6)
 seam.rotation_euler=(end-start).to_track_quat('Z','Y').to_euler()
cylinder('Roof finial',(0,0,.867),.004,.002,.036,iron,8)
join('CoastalLighthouseShell',[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name!='LighthouseDoor'])
report['lighthouse']=save('coastal-lighthouse')
with open(os.path.join(OUT,'architecture-report.json'),'w') as f:json.dump(report,f,indent=2)
print('KEYSCAPE_ARCHITECTURE_READY',flush=True)
