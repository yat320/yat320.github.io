# Renderiza vistas previas de la escena con Cycles (para revisar el modelado).
# Uso: ~/venv/bin/python vista.py <escena.blend> <salida-prefijo> [cam,cam...] [muestras]
import sys
import os
import math
import bpy
from mathutils import Vector

blend, pref = sys.argv[1], sys.argv[2]
cams = sys.argv[3].split(',') if len(sys.argv) > 3 else ['general']
muestras = int(sys.argv[4]) if len(sys.argv) > 4 else 24
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = muestras
sc.cycles.use_denoising = True
sc.render.resolution_x = 960
sc.render.resolution_y = 600
sc.view_settings.view_transform = 'AgX'
sc.cycles.max_bounces = 4

VISTAS = {
    # nombre: (posición, a dónde mira, lente mm)
    'general': ((1.6, -2.9, 1.75), (-0.4, 0.8, 0.7), 18),
    'fondo': ((-0.5, -0.6, 1.6), (1.0, 3.2, 1.2), 20),
    'auto': ((2.0, -2.6, 1.3), (-0.4, 0.0, 0.6), 22),
    'auto_frente': ((0.7, 3.0, 1.3), (-0.4, 0.5, 0.6), 20),
    'auto_lado': ((1.9, 0.2, 0.9), (-0.4, 0.0, 0.6), 16),
    'motor': ((-0.35, 2.75, 1.65), (-0.42, 1.35, 0.75), 24),
    'motor_cerca': ((-0.1, 2.2, 1.35), (-0.42, 1.35, 0.78), 30),
    'motor_arriba': ((-0.5, 1.75, 1.75), (-0.5, 1.3, 0.7), 24),
    'tapa': ((-0.75, 1.75, 1.2), (-0.5, 1.35, 0.68), 30),
    'tablero': ((1.25, 1.9, 1.5), (1.25, 3.2, 1.45), 26),
    'llaves': ((1.25, 2.6, 1.5), (1.25, 3.2, 1.5), 35),
}


def camara(nombre):
    pos, mira, lente = VISTAS[nombre]
    cd = bpy.data.cameras.new('cam_' + nombre)
    cd.lens = lente
    cd.clip_start = 0.02
    o = bpy.data.objects.new('cam_' + nombre, cd)
    sc.collection.objects.link(o)
    o.location = pos
    d = Vector(mira) - Vector(pos)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o


for o in bpy.data.objects:
    if o.name in ('piso_manchas', 'tablero_siluetas'):
        o.hide_render = True
capo = bpy.data.objects.get('capo')
if capo and os.environ.get('CAPO', 'abierto') == 'abierto':
    capo.rotation_euler.x = math.radians(58)
if os.environ.get('SIN_TAPA'):
    for o in bpy.data.objects:
        if o.name == 'tapa_valvulas' or o.name.startswith('tuerca_'):
            o.hide_render = True

for c in cams:
    sc.camera = camara(c)
    sc.render.filepath = f'{pref}-{c}.png'
    bpy.ops.render.render(write_still=True)
    print('vista', sc.render.filepath)
