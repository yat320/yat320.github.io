# Exporta la escena horneada para el juego.
# Uso: ~/venv/bin/python exportar.py <horneado.blend> <carpeta-lightmaps> <salida-carpeta>
# Genera: escena.glb (sin texturas), lm_<grupo>.png (luz en sRGB, escalada) y lightmaps.json (escala de cada uno).
import sys
import os
import json
import math
import bpy
import numpy as np

entrada, carpeta_lm, salida = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(salida, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=entrada)
vl = bpy.context.view_layer


def seleccionar(objs):
    for o in vl.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    vl.objects.active = objs[0]


def mallas(col):
    c = bpy.data.collections.get(col)
    return [o for o in c.all_objects if o.type == 'MESH'] if c else []


# calcos: UV0 plana de 0 a 1 sobre el rectángulo
for nombre, ejes in (('piso_manchas', (0, 1)), ('tablero_siluetas', (0, 2))):
    o = bpy.data.objects.get(nombre)
    if not o:
        continue
    me = o.data
    vs = [o.matrix_world @ v.co for v in me.vertices]
    a, b = ejes
    lo = [min(v[a] for v in vs), min(v[b] for v in vs)]
    hi = [max(v[a] for v in vs), max(v[b] for v in vs)]
    uv = me.uv_layers['UVMap'].data
    for loop in me.loops:
        p = vs[loop.vertex_index]
        uv[loop.index].uv = ((p[a] - lo[0]) / (hi[0] - lo[0]), (p[b] - lo[1]) / (hi[1] - lo[1]))

# grilla de oclusión (para iluminar las piezas que se mueven): fracción de cielo que se ve desde cada punto
def grilla_oclusion():
    import base64
    capo = bpy.data.objects.get('capo')
    if capo:
        capo.rotation_euler.x = math.radians(42)
    for o in bpy.data.objects:
        if o.name in ('piso_manchas', 'tablero_siluetas') or o.type != 'MESH':
            continue
        # las piezas que se mueven no se tapan a sí mismas en la grilla
        if o.users_collection and o.users_collection[0].name == 'dinamico' and o.name != 'capo':
            o.hide_viewport = True
    vl.update()
    dg = bpy.context.evaluated_depsgraph_get()
    sc = bpy.context.scene
    from mathutils import Vector
    # en coordenadas del juego (Y arriba): x, y, z con z = -y de Blender
    x0, y0, z0, paso = -1.45, 0.15, -3.2, 0.1
    nx, ny, nz = 37, 20, 30
    dirs = []
    n = 32
    for i in range(n):
        yv = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(1 - yv * yv)
        a = i * 2.399963
        dirs.append(Vector((r * math.cos(a), r * math.sin(a), yv)))
    datos = bytearray()
    for k in range(nz):
        for j in range(ny):
            for i in range(nx):
                p3 = (x0 + i * paso, y0 + j * paso, z0 + k * paso)
                o = Vector((p3[0], -p3[2], p3[1]))
                libre = 0.0
                for d in dirs:
                    hit, loc, *_ = sc.ray_cast(dg, o, d, distance=1.0)
                    libre += ((loc - o).length / 1.0) if hit else 1.0
                datos.append(int(round(255 * libre / n)))
    for o in bpy.data.objects:
        o.hide_viewport = False
    if capo:
        capo.rotation_euler.x = 0
    json.dump({'origen': [x0, y0, z0], 'paso': paso, 'n': [nx, ny, nz], 'datos': base64.b64encode(bytes(datos)).decode()},
              open(os.path.join(salida, 'oclusion.json'), 'w'))
    print('grilla de oclusión', nx * ny * nz, 'puntos')


grilla_oclusion()

# se unen las piezas estáticas por atlas de luz; vidrios y tubos aparte
grupos = {'garaje': [], 'auto': [], 'motor': [], 'vidrios': [], 'luces': []}
VIDRIO = {'vidrio', 'optica', 'optica_roja', 'optica_ambar', 'plastico_traslucido'}
for o in mallas('estatico'):
    mats = {m.name for m in o.data.materials if m}
    if o.get('luz') or mats == {'tubo_luz'}:
        grupos['luces'].append(o)
    elif 'lightmap' not in o.data.uv_layers:
        grupos['vidrios'].append(o)
    elif o.name.startswith(('motor_', 'vano', 'varilla_', 'bisagra')):
        grupos['motor'].append(o)
    elif o.get('_auto'):
        grupos['auto'].append(o)
    else:
        grupos['garaje'].append(o)

for g, objs in grupos.items():
    if not objs:
        continue
    # sin UV de lightmap no se puede unir con los que la tienen: a vidrios y luces les sacamos la que no hay
    seleccionar(objs)
    bpy.ops.object.join()
    o = vl.objects.active
    o.name = f'est_{g}'
    o.data.name = f'est_{g}'
    if g in ('garaje', 'auto', 'motor'):
        o['lightmap'] = f'lm_{g}'
    print('unido', o.name, len(o.data.polygons), 'caras', len(o.data.materials), 'materiales')

# lightmaps: EXR → PNG sRGB con escala
meta = {}
for g in ('garaje', 'auto', 'motor'):
    ruta = os.path.join(carpeta_lm, f'lm_{g}.exr')
    img = bpy.data.images.load(ruta)
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3]
    lum = a.mean(-1)
    k = float(np.percentile(lum[lum > 1e-5], 99.7)) * 1.15
    v = np.clip(a / k, 0, 1)
    srgb = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    out = bpy.data.images.new(f'png_{g}', w, h, alpha=False)
    out.colorspace_settings.name = 'Non-Color'
    out.pixels = np.concatenate([srgb, np.ones((h, w, 1), np.float32)], -1).ravel()
    out.filepath_raw = os.path.join(salida, f'lm_{g}.png')
    out.file_format = 'PNG'
    out.save()
    meta[g] = {'escala': round(k, 5)}
    print('lightmap', g, 'escala', k)
json.dump(meta, open(os.path.join(salida, 'lightmaps.json'), 'w'), indent=2)

# afuera lo que no va al juego
for o in list(bpy.data.objects):
    if o.type in ('LIGHT', 'CAMERA'):
        bpy.data.objects.remove(o)
# el capó cerrado y todo en su lugar
capo = bpy.data.objects.get('capo')
if capo:
    capo.rotation_euler = (0, 0, 0)

bpy.ops.export_scene.gltf(
    filepath=os.path.join(salida, 'escena.glb'),
    export_format='GLB',
    export_texcoords=True,
    export_normals=True,
    export_tangents=False,
    export_materials='EXPORT',
    export_image_format='NONE',
    export_extras=True,
    export_apply=True,
    export_yup=True,
    export_lights=False,
    export_cameras=False,
)
print('exportado', os.path.join(salida, 'escena.glb'))
