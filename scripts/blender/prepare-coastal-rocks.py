"""Process the CC0 Poly Haven coast_rocks_05 scan into a web asset.
Run with Blender --background --factory-startup --python-exit-code 1 --python ...
Original downloads stay in work/art-v21/source; no cloud generation is used.
"""
import bpy, json, os
import numpy as np
from mathutils import Vector
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=os.path.join(ROOT,'outputs/art-v21')
os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT,'work/art-v21/source/coast_rocks_05/coast_rocks_05.gltf'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
report={'blender':bpy.app.version_string,'source':'https://polyhaven.com/a/coast_rocks_05','license':'CC0-1.0','objects':[]}
for ob in meshes:
 bpy.context.view_layer.objects.active=ob;ob.select_set(True)
 bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 original=len(ob.data.polygons)
 mod=ob.modifiers.new('Web silhouette-preserving reduction','DECIMATE');mod.ratio=min(1,10000/max(1,original));mod.use_collapse_triangulate=True
 bpy.ops.object.modifier_apply(modifier=mod.name)
 coords=[v.co.copy() for v in ob.data.vertices]
 lo=Vector(tuple(min(v[i] for v in coords) for i in range(3)));hi=Vector(tuple(max(v[i] for v in coords) for i in range(3)))
 center=(lo+hi)*.5;horizontal=max(hi.x-lo.x,hi.y-lo.y)
 for v in ob.data.vertices:
  v.co.x=(v.co.x-center.x)*2/horizontal
  v.co.y=(v.co.y-center.y)*2/horizontal
  v.co.z=(v.co.z-lo.z)/max(.001,hi.z-lo.z)
 ob.location=(0,0,0);ob.name='CoastalLimestoneScan'
 bpy.context.view_layer.update()
 for p in ob.data.polygons:p.use_smooth=True
 report['objects'].append({'name':ob.name,'originalPolygons':original,'webPolygons':len(ob.data.polygons),'sourceDimensions':list(hi-lo),'normalizedDimensions':list(ob.dimensions)})
for im in bpy.data.images:
 if im.source=='FILE' and im.size[0]>0:
  # Fine relief is carried by the normal map, not thousands of small meshes.
  if max(im.size)>1024:im.scale(1024,1024)
  if '_diff' in im.name:
   # Harmonize this wet brown scan with the pale Mediterranean limestone.
   # Preserve the photographed pores and crevices instead of flattening color.
   px=np.array(im.pixels[:],dtype=np.float32).reshape(-1,4)
   lum=px[:,:3]@np.array([.2126,.7152,.0722],dtype=np.float32)
   lo,hi=np.quantile(lum,[.03,.97]);shade=.24+.58*np.clip((lum-lo)/max(.001,hi-lo),0,1)**.65
   px[:,:3]=shade[:,None]*np.array([1,.95,.85],dtype=np.float32)
   im.pixels.foreach_set(px.reshape(-1));im.update()
  im.pack()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'coastal-rocks.blend'))
target=os.path.join(ROOT,'public/models/coast-rocks/coastal-limestone.glb')
bpy.ops.export_scene.gltf(filepath=target,export_format='GLB',export_image_format='JPEG',export_jpeg_quality=88,export_yup=True,export_cameras=False,export_lights=False)
report['exportBytes']=os.path.getsize(target)
with open(os.path.join(OUT,'blender-report.json'),'w',encoding='utf8') as f:json.dump(report,f,indent=2)
print('KEYSCAPE_ASSET_READY',target,flush=True)
