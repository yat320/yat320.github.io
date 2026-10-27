# Renderiza el entorno (panorámica HDR) desde arriba del vano del motor, para los reflejos del juego.
# Uso: ~/venv/bin/python entorno.py <escena.blend> <salida.hdr> [muestras]
import sys
import math
import bpy

blend, salida = sys.argv[1], sys.argv[2]
muestras = int(sys.argv[3]) if len(sys.argv) > 3 else 64
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = muestras
sc.cycles.use_denoising = True
sc.render.resolution_x = 1024
sc.render.resolution_y = 512
sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.file_format = 'HDR'
capo = bpy.data.objects.get('capo')
if capo:
    capo.rotation_euler.x = math.radians(42)
for o in bpy.data.objects:
    if o.name in ('piso_manchas', 'tablero_siluetas'):
        o.hide_render = True
    # las luces de área no se ven en la panorámica (sí los tubos encendidos)
    if o.type == 'LIGHT':
        o.visible_camera = False
cd = bpy.data.cameras.new('pano')
cd.type = 'PANO'
cd.panorama_type = 'EQUIRECTANGULAR'
cam = bpy.data.objects.new('pano', cd)
sc.collection.objects.link(cam)
cam.location = (-0.45, 1.75, 1.15)
# mirando hacia +Y de Blender con Z arriba (así la panorámica queda alineada con el juego)
cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
sc.camera = cam
sc.render.filepath = salida
bpy.ops.render.render(write_still=True)
print('entorno', salida)
