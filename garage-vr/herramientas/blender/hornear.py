# Coordenadas UV y horneado de la luz (lightmaps) con Cycles.
# Uso: ~/venv/bin/python hornear.py <escena.blend> <salida.blend> <carpeta-lightmaps> [muestras] [resolución]
#
# - UV0 ("UVMap"): proyección en metros (1 unidad UV = 1 m) para las texturas que se repiten.
# - UV1 ("lightmap"): atlas único por grupo, sin superposición, con densidad mayor en el vano del motor.
# - Se hornea solo la luz (directa + indirecta, sin el color del material): en el juego se multiplica por el albedo.
import sys
import os
import math
import time
import bpy
import bmesh
from mathutils import Vector

entrada, salida, carpeta = sys.argv[1], sys.argv[2], sys.argv[3]
MUESTRAS = int(sys.argv[4]) if len(sys.argv) > 4 else 128
RES = int(sys.argv[5]) if len(sys.argv) > 5 else 2048
os.makedirs(carpeta, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=entrada)
sc = bpy.context.scene
vl = bpy.context.view_layer

SIN_LIGHTMAP_MAT = {'vidrio', 'optica', 'optica_roja', 'optica_ambar', 'tubo_luz', 'plastico_traslucido'}


def mallas(col):
    c = bpy.data.collections.get(col)
    return [o for o in c.all_objects if o.type == 'MESH'] if c else []


def es_vidrio(o):
    mats = {m.name for m in o.data.materials if m}
    return bool(mats) and mats <= SIN_LIGHTMAP_MAT


def grupo(o):
    """A qué atlas va cada objeto estático: el garage, el auto por fuera y el vano del motor."""
    if o.name.startswith(('motor_', 'vano', 'varilla_', 'bisagra')):
        return 'motor'
    if o.get('_auto'):
        return 'auto'
    return 'garaje'


def densidad_obj(o):
    d = 1.0
    if o.name in ('interior', 'bajos') or o.name.startswith('paso_rueda'):
        d *= 0.35
    if o.name.startswith(('techo', 'viga')):
        d *= 0.5
    if o.name.startswith('rueda'):
        d *= 0.6
    return d


def limpiar_cascara():
    """Borra las caras del lado de afuera de paredes y techo: nunca se ven y gastan lightmap."""
    from mathutils import Vector
    X0, X1, Y0, Y1, Z1 = -2.1, 2.1, -3.2, 3.2, 2.8
    for o in mallas('estatico'):
        if not o.name.startswith(('muro_', 'zoc_', 'techo')):
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        fuera = []
        for f in bm.faces:
            c = f.calc_center_median()
            n = f.normal
            afuera = (c.x < X0 - 0.01 or c.x > X1 + 0.01 or c.y < Y0 - 0.01 or c.y > Y1 + 0.01 or c.z > Z1 + 0.01)
            tapada = (c.z > Z1 - 0.001 and n.z > 0.5)  # arriba de las paredes, debajo de la losa
            if afuera or tapada:
                fuera.append(f)
        bmesh.ops.delete(bm, geom=fuera, context='FACES')
        bm.to_mesh(o.data)
        bm.free()
    v = bpy.data.objects.get('vereda')
    if v:
        bpy.data.objects.remove(v)


def seleccionar(objs):
    bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode != 'OBJECT' else None
    for o in vl.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    vl.objects.active = objs[0]


def area_3d_uv(me, uv_name):
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv[uv_name]
    a3 = auv = 0.0
    for f in bm.faces:
        a3 += f.calc_area()
        pts = [l[uv].uv for l in f.loops]
        s = 0.0
        for i in range(len(pts)):
            x0, y0 = pts[i]
            x1, y1 = pts[(i + 1) % len(pts)]
            s += x0 * y1 - x1 * y0
        auv += abs(s) / 2
    bm.free()
    return a3, auv


def escalar_uv(me, uv_name, k):
    uv = me.uv_layers[uv_name].data
    for d in uv:
        d.uv = (d.uv[0] * k, d.uv[1] * k)


def proyectar(o, uv_name, angulo, margen):
    me = o.data
    if uv_name not in me.uv_layers:
        me.uv_layers.new(name=uv_name)
    me.uv_layers.active = me.uv_layers[uv_name]
    seleccionar([o])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angulo), island_margin=margen, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')


t0 = time.time()
limpiar_cascara()
todas = mallas('estatico') + mallas('dinamico')
# los objetos estáticos con transformación pendiente se aplican (las UV se miden en metros reales)
for o in mallas('estatico'):
    if o.matrix_basis != o.matrix_basis.Identity(4) or o.modifiers:
        seleccionar([o])
        if o.modifiers:
            for m in list(o.modifiers):
                bpy.ops.object.modifier_apply(modifier=m.name)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# UV0 en metros (para las texturas que se repiten)
for o in todas:
    me = o.data
    for l in list(me.uv_layers):
        me.uv_layers.remove(l)
    proyectar(o, 'UVMap', 60, 0.0)
    a3, auv = area_3d_uv(me, 'UVMap')
    if auv > 0:
        # en objetos dinámicos la escala del objeto es 1 (ya aplicada)
        escalar_uv(me, 'UVMap', math.sqrt(a3 / auv))
print(f'UV0 listas ({time.time() - t0:.0f} s)')

# UV1 (lightmap) para lo estático
GRUPOS = {'garaje': [], 'auto': [], 'motor': []}
for o in mallas('estatico'):
    if es_vidrio(o) or o.get('luz'):
        continue
    GRUPOS[grupo(o)].append(o)

for g, objs in GRUPOS.items():
    for o in objs:
        proyectar(o, 'lightmap', 66, 0.0)
        a3, auv = area_3d_uv(o.data, 'lightmap')
        if auv > 0:
            escalar_uv(o.data, 'lightmap', math.sqrt(a3 / auv) * math.sqrt(densidad_obj(o)))
        # UV0 primero (TEXCOORD_0) y lightmap segundo (TEXCOORD_1)
        o.data.uv_layers.active = o.data.uv_layers['lightmap']
    seleccionar(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, margin_method='FRACTION', margin=float(os.environ.get('MARGEN', '0.0018')), shape_method=os.environ.get('FORMA', 'CONCAVE'), scale=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    # qué parte del atlas queda ocupada
    usado = sum(area_3d_uv(o.data, 'lightmap')[1] for o in objs)
    print(f'lightmap {g}: {len(objs)} objetos, {usado * 100:.0f}% del atlas ocupado ({time.time() - t0:.0f} s)')

bpy.ops.wm.save_as_mainfile(filepath=salida)

# ───────────────────────── Horneado ─────────────────────────
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = MUESTRAS
sc.cycles.use_denoising = False
sc.cycles.max_bounces = 6
sc.cycles.diffuse_bounces = 4
sc.cycles.glossy_bounces = 2
sc.cycles.transmission_bounces = 4
sc.cycles.sample_clamp_indirect = 8.0
sc.render.bake.margin = 4
sc.render.bake.margin_type = 'EXTEND'
sc.render.bake.use_pass_direct = True
sc.render.bake.use_pass_indirect = True
sc.render.bake.use_pass_color = False

# los calcos no tapan la luz de los demás
for o in todas:
    if o.name in ('piso_manchas', 'tablero_siluetas'):
        o.visible_shadow = False
        o.visible_diffuse = False
        o.visible_glossy = False
        o.visible_transmission = False
# los vidrios dejan pasar la luz (Cycles los trata como cáusticas si no)
for o in mallas('estatico'):
    if es_vidrio(o):
        o.visible_shadow = False
# capó abierto mientras se hornea (es como se juega casi siempre)
capo = bpy.data.objects.get('capo')
if capo:
    capo.rotation_euler.x = math.radians(58)
# sin la tapa de válvulas: así queda horneada la luz del árbol de levas (que se ve al sacarla)
for o in mallas('dinamico'):
    if o.get('pieza') in ('tapa-valvulas',) or (o.get('pieza') or '').startswith('tapa-valv-t'):
        o.hide_render = True

for g, objs in GRUPOS.items():
    img = bpy.data.images.new(f'lm_{g}', RES, RES, alpha=False, float_buffer=True)
    img.colorspace_settings.name = 'Linear Rec.709'
    mats = set()
    for o in objs:
        for m in o.data.materials:
            mats.add(m)
    nodos = []
    for m in mats:
        n = m.node_tree.nodes.new('ShaderNodeTexImage')
        n.image = img
        m.node_tree.nodes.active = n
        nodos.append((m, n))
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers['lightmap']
    seleccionar(objs)
    t1 = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=4, use_clear=True, target='IMAGE_TEXTURES')
    print(f'horneado {g}: {time.time() - t1:.0f} s')
    # quitarruido especial para lightmaps (Open Image Denoise, filtro RTLightmap)
    import numpy as np
    import pyoidn
    px = np.array(img.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
    px[..., :3] = pyoidn.denoise(np.ascontiguousarray(px[..., :3]), filter_type='RTLightmap')
    img.pixels = px.ravel()
    img.filepath_raw = os.path.join(carpeta, f'lm_{g}.exr')
    img.file_format = 'OPEN_EXR'
    img.save()
    for m, n in nodos:
        m.node_tree.nodes.remove(n)
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers['UVMap']

capo.rotation_euler.x = 0 if capo else None
for o in mallas('dinamico'):
    o.hide_render = False
for o in mallas('estatico'):
    o.visible_shadow = True
bpy.ops.wm.save_as_mainfile(filepath=salida)
print(f'listo en {time.time() - t0:.0f} s')
