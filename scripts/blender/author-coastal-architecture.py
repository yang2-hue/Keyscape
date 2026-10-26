"""Editable coastal cottage and lighthouse shells, aligned to existing paths.
Blender Z up / front -Y exports to glTF Y up / front +Z. No cloud generation.
"""
import bpy,math,random,os,json
import numpy as np
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=os.path.join(ROOT,'outputs/art-v22');DEST=os.path.join(ROOT,'public/models/architecture')
os.makedirs(OUT,exist_ok=True);os.makedirs(DEST,exist_ok=True);random.seed(220)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color,rough=.9):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
 return m
plaster=material('Warm limewashed plaster',(.72,.68,.58),.98)
stone=material('Pale limestone trim',(.53,.49,.40),.96)
teal=material('Weathered deep sage wood',(.055,.12,.095),.86)
wood=material('Dark exposed timber',(.12,.085,.055),.92)
glass=material('ArchitectureWindowGlass',(.025,.055,.065),.38)
iron=material('Oxidized bronze rail',(.075,.09,.075),.65)
roof=[material('Terracotta '+str(i),c,.88) for i,c in enumerate([(.34,.14,.075),(.39,.17,.09),(.28,.11,.055),(.43,.21,.12)])]
# Exportable raster material detail; do not rely on unsupported procedural nodes.
rng=np.random.default_rng(22);N=256;yy,xx=np.mgrid[:N,:N]
height=.5+.14*np.sin(xx*.08+np.sin(yy*.04))+.10*np.sin(yy*.15)+rng.normal(0,.07,(N,N))
for mat,base in [(plaster,(.72,.68,.58)),(stone,(.53,.49,.40))]:
 im=bpy.data.images.new(mat.name+' albedo',width=N,height=N);im.colorspace_settings.name='Linear Rec.709'
 rgba=np.ones((N,N,4),dtype=np.float32);rgba[:,:,:3]=np.array(base)*(1+(height[:,:,None]-.5)*.14)
 im.pixels.foreach_set(rgba.ravel());im.pack()
 node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=im
 mat.node_tree.links.new(node.outputs['Color'],mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
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
 return {'bytes':os.path.getsize(os.path.join(DEST,name+'.glb')),'meshes':len([o for o in bpy.context.scene.objects if o.type=='MESH']),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')}

# Cottage: measured to fit the existing .32 x .26 foundation and inward door.
w=.32;d=.26;h=.24;rise=.1024;half=.20
cube('Foundation',(0,0,-.018),(.365,.305,.036),stone,.003)
cube('LimewashedWalls',(0,0,h/2),(w,d,h),plaster,.003)
for side in [-1,1]:
 # Closed gable end, intentionally under the overlapping tile shell.
 verts=[(-w/2,side*d/2,h),(w/2,side*d/2,h),(0,side*d/2,h+rise)]
 mesh=bpy.data.meshes.new('Gable');mesh.from_pydata(verts,[],[(0,1,2)]);mesh.materials.append(plaster)
 o=bpy.data.objects.new('Gable',mesh);bpy.context.collection.objects.link(o)
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
   mesh=bpy.data.meshes.new('Barrel tile');mesh.from_pydata(vertices,[],faces);mesh.materials.append(roof[(row*3+col)%4])
   o=bpy.data.objects.new('Overlapping clay tile',mesh);bpy.context.collection.objects.link(o)
for i in range(14):
 o=cylinder('Ridge cap',(0,(i-6.5)*.023,h+rise+.007),.007,.007,.025,roof[i%4],12);o.rotation_euler[0]=math.pi/2
# Entrances, actual trim depth, a small lintel and a clear landing.
cube('Door recess',(0,-d/2-.003,.089),(.081,.007,.178),wood)
cube('CottageDoor',(0,-d/2-.008,.087),(.062,.010,.166),teal,.001)
for x in [-.04,.04]:cube('Door jamb',(x,-d/2-.012,.092),(.013,.022,.184),stone,.001)
cube('Door lintel',(0,-d/2-.014,.189),(.098,.025,.018),stone)
cube('Entry threshold',(0,-d/2-.04,-.001),(.14,.085,.022),stone)
for z in [.054,.12]:cube('Door inset panel',(0,-d/2-.014,z),(.047,.002,.045),wood,.0005)
cube('Door handle',(.02,-d/2-.02,.09),(.004,.005,.013),iron,.0006)
panes=[]
for side in [-1,1]:
 x=side*(w/2+.004);z=.151
 cube('Window recess',(x,0,z),(.009,.082,.104),wood)
 panes.append(cube('CottageWindowPanes',(x+side*.004,0,z),(.003,.055,.075),glass,.0003))
 for y in [-.041,.041]:cube('Window jamb',(x+side*.003,y,z),(.019,.010,.106),stone)
 for zz in [z-.052,z+.052]:cube('Window sill',(x+side*.007,0,zz),(.026,.095,.011),stone)
 cube('Window crossbar',(x+side*.007,0,z),(.006,.057,.003),stone,.0004)
 for y in [-.069,.069]:
  cube('Sage shutter',(x+side*.007,y,z),(.011,.038,.092),teal,.001)
  for k in range(5):cube('Shutter louvers',(x+side*.014,y,z+(k-2)*.014),(.004,.031,.004),wood,.0004)
for sx in [-1,1]:
 for sy in [-1,1]:
  for row in range(5):cube('Corner limestone quoin',(sx*(w/2-.015),sy*(d/2-.012),.022+row*.045),(.038,.031,.018),stone,.001)
cube('Chimney',(.076,.045,.324),(.047,.055,.15),plaster,.002)
cube('Chimney cap',(.076,.045,.404),(.064,.071,.015),stone,.0015)
cube('Chimney dark flue',(.076,.045,.413),(.030,.037,.006),wood,.001)
join('CottageWindowPanes',panes)
join('CoastalCottageShell',[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name!='CottageWindowPanes'])
report={'blender':bpy.app.version_string,'author':'Keyscape local Blender construction','cottage':save('coastal-cottage')}

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# Lighthouse shell matches the existing lantern at local z=.70 exactly.
cylinder('Lower plinth',(0,0,.0125),.17,.15,.025,stone)
cylinder('Limewashed tower',(0,0,.3125),.10,.066,.575,plaster,64)
cylinder('Stone footing',(0,0,.045),.103,.098,.04,stone)
for row in range(6):
 z=.065+row*.026;r=.10-(z-.025)/.575*.034
 for k in range(12):
  a=(k+(row%2)*.5)*math.tau/12
  o=cube('Footing masonry',(math.cos(a)*r,math.sin(a)*r,z),(.043,.009,.018),stone,.001)
  o.rotation_euler[2]=a-math.pi/2
door=cube('LighthouseDoor',(0,-.099,.095),(.045,.014,.14),teal)
for x in [-.030,.030]:cube('Tower entry jamb',(x,-.100,.10),(.014,.022,.16),stone)
cube('Tower lintel',(0,-.101,.183),(.079,.024,.02),stone)
cube('Tower threshold',(0,-.13,.012),(.085,.095,.023),stone)
for z in [.30,.46]:
 r=.10-(z-.025)/.575*.034
 cube('Tower slit recess',(0,-r-.003,z),(.030,.009,.057),wood)
 cube('Tower slit glass',(0,-r-.008,z),(.019,.004,.042),glass)
 cube('Tower slit sill',(0,-r-.01,z-.029),(.041,.021,.008),stone)
for z,r in [(.585,.074),(.604,.091),(.618,.108)]:cylinder('Gallery corbel',(0,0,z),r,r+.008,.016,stone)
cylinder('Gallery deck',(0,0,.632),.126,.126,.014,stone)
for i in range(16):
 a=i*math.tau/16;cylinder('Gallery baluster',(math.cos(a)*.111,math.sin(a)*.111,.675),.0018,.0018,.072,iron,6)
for z in [.648,.708]:torus('Gallery rail',z,.111,.0022,iron)
for i in range(8):
 a=i*math.tau/8;cylinder('Lantern mullion',(math.cos(a)*.064,math.sin(a)*.064,.70),.0025,.0025,.145,iron,6)
cylinder('Lantern roof rim',(0,0,.775),.101,.101,.012,iron)
cylinder('Weathered copper roof',(0,0,.816),.103,.006,.073,roof[2],32)
cylinder('Roof finial',(0,0,.867),.004,.002,.036,iron,8)
join('CoastalLighthouseShell',[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name!='LighthouseDoor'])
report['lighthouse']=save('coastal-lighthouse')
with open(os.path.join(OUT,'architecture-report.json'),'w') as f:json.dump(report,f,indent=2)
print('KEYSCAPE_ARCHITECTURE_READY',flush=True)
