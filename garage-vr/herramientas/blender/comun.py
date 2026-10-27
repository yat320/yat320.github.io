# Ayudas comunes para armar la escena por código (Blender 5, módulo bpy).
# Unidades: metros. Ejes de Blender: X a la derecha, Y hacia adelante (el frente del auto), Z arriba.
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

# Colores aproximados de cada material: sirven para las vistas previas en Blender.
# En el juego cada material se reemplaza por su versión PBR con texturas (por nombre).
MATERIALES = {
    # nombre: (color base, rugosidad, metal)
    'concreto': ((0.42, 0.41, 0.39), 0.85, 0.0),
    'revoque': ((0.78, 0.76, 0.70), 0.9, 0.0),
    'revoque_zocalo': ((0.32, 0.37, 0.33), 0.75, 0.0),
    'losa': ((0.55, 0.54, 0.52), 0.9, 0.0),
    'metal_pintado': ((0.20, 0.27, 0.30), 0.55, 0.3),
    'metal_gris': ((0.35, 0.36, 0.36), 0.5, 0.6),
    'chapa_galv': ((0.55, 0.56, 0.57), 0.45, 0.9),
    'madera': ((0.42, 0.28, 0.16), 0.7, 0.0),
    'tablero': ((0.62, 0.50, 0.36), 0.8, 0.0),
    'carton': ((0.55, 0.42, 0.28), 0.9, 0.0),
    'pintura_auto': ((0.48, 0.05, 0.04), 0.25, 0.0),
    'plastico_negro': ((0.035, 0.035, 0.035), 0.6, 0.0),
    'goma': ((0.03, 0.03, 0.03), 0.85, 0.0),
    'llanta': ((0.55, 0.56, 0.57), 0.35, 0.8),
    'vidrio': ((0.6, 0.7, 0.7), 0.05, 0.0),
    'optica': ((0.9, 0.9, 0.9), 0.05, 0.0),
    'optica_roja': ((0.6, 0.02, 0.02), 0.1, 0.0),
    'optica_ambar': ((0.9, 0.4, 0.02), 0.1, 0.0),
    'reflector': ((0.9, 0.9, 0.9), 0.15, 1.0),
    'tapizado': ((0.10, 0.10, 0.11), 0.9, 0.0),
    'aluminio_fundido': ((0.55, 0.55, 0.53), 0.55, 0.9),
    'fundicion': ((0.18, 0.17, 0.16), 0.7, 0.5),
    'oxido': ((0.30, 0.14, 0.07), 0.85, 0.2),
    'chapa_tapa': ((0.08, 0.10, 0.16), 0.4, 0.2),
    'acero': ((0.6, 0.6, 0.62), 0.35, 1.0),
    'acero_aceitado': ((0.45, 0.45, 0.45), 0.2, 1.0),
    'cromo': ((0.8, 0.8, 0.82), 0.12, 1.0),
    'plastico_amarillo': ((0.85, 0.6, 0.05), 0.5, 0.0),
    'plastico_rojo': ((0.6, 0.05, 0.03), 0.5, 0.0),
    'plastico_traslucido': ((0.85, 0.85, 0.80), 0.3, 0.0),
    'cable': ((0.02, 0.02, 0.02), 0.5, 0.0),
    'cable_rojo': ((0.5, 0.03, 0.02), 0.5, 0.0),
    'junta_goma': ((0.06, 0.05, 0.05), 0.75, 0.0),
    'cobre': ((0.75, 0.4, 0.25), 0.3, 1.0),
    'tubo_luz': ((1.0, 1.0, 1.0), 0.3, 0.0),
    'trapo': ((0.45, 0.12, 0.08), 0.95, 0.0),
    'lata': ((0.12, 0.25, 0.45), 0.4, 0.5),
    'mango': ((0.7, 0.08, 0.05), 0.4, 0.0),
    'piso_mancha': ((0.05, 0.05, 0.05), 0.4, 0.0),
    'silueta': ((0.9, 0.9, 0.85), 0.8, 0.0),
}


def material(nombre):
    m = bpy.data.materials.get(nombre)
    if m:
        return m
    color, rug, met = MATERIALES[nombre]
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rug
    b.inputs['Metallic'].default_value = met
    if nombre in ('vidrio', 'optica', 'optica_roja', 'optica_ambar', 'plastico_traslucido'):
        b.inputs['Transmission Weight'].default_value = 0.9 if nombre == 'vidrio' else 0.6
        b.inputs['IOR'].default_value = 1.5
    if nombre == 'tubo_luz':
        b.inputs['Emission Color'].default_value = (1.0, 0.97, 0.92, 1)
        b.inputs['Emission Strength'].default_value = 8.0
    m.diffuse_color = (*color, 1)
    return m


def coleccion(nombre, padre=None):
    c = bpy.data.collections.get(nombre)
    if not c:
        c = bpy.data.collections.new(nombre)
        (padre or bpy.context.scene.collection).children.link(c)
    return c


COL = {'actual': None}


def usar(nombre):
    """Las piezas nuevas van a esta colección."""
    COL['actual'] = coleccion(nombre)


def _link(o):
    (COL['actual'] or bpy.context.scene.collection).objects.link(o)
    return o


def desde_bmesh(nombre, bm, mat=None, suave=False):
    me = bpy.data.meshes.new(nombre)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(nombre, me)
    if mat:
        me.materials.append(material(mat))
    if suave:
        for p in me.polygons:
            p.use_smooth = True
    return _link(o)


def malla(nombre, verts, caras, mat=None, suave=False):
    me = bpy.data.meshes.new(nombre)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in caras])
    me.validate()
    me.update()
    o = bpy.data.objects.new(nombre, me)
    if mat:
        me.materials.append(material(mat))
    if suave:
        for p in me.polygons:
            p.use_smooth = True
    return _link(o)


def caja(nombre, centro, medida, mat, bisel=0.0, seg=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * medida[0], v.co.y * medida[1], v.co.z * medida[2]))
    o = desde_bmesh(nombre, bm, mat)
    o.location = centro
    if bisel > 0:
        biselar(o, bisel, seg)
    return o


def caja_min_max(nombre, a, b, mat, bisel=0.0, seg=2):
    c = [(a[i] + b[i]) / 2 for i in range(3)]
    s = [abs(b[i] - a[i]) for i in range(3)]
    return caja(nombre, c, s, mat, bisel, seg)


def biselar(o, ancho, seg=2, angulo=50):
    m = o.modifiers.new('bisel', 'BEVEL')
    m.width = ancho
    m.segments = seg
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angulo)
    m.harden_normals = False
    return m


def suavizar_por_angulo(o, angulo=35):
    me = o.data
    for p in me.polygons:
        p.use_smooth = True
    try:
        o.modifiers.new('suave', 'SMOOTH_BY_ANGLE')
        o.modifiers['suave'].node_group  # en Blender 4.1+ es un nodo; si falla, seguimos
    except Exception:
        pass
    return o


def cilindro(nombre, r, alto, mat, lados=32, centro=(0, 0, 0), eje='Z', r2=None, tapas=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=tapas, segments=lados, radius1=r, radius2=r if r2 is None else r2, depth=alto)
    o = desde_bmesh(nombre, bm, mat, suave=True)
    marcar_bordes_duros(o, 40)
    if eje == 'X':
        o.rotation_euler = (0, math.radians(90), 0)
    elif eje == 'Y':
        o.rotation_euler = (math.radians(90), 0, 0)
    o.location = centro
    return o


def marcar_bordes_duros(o, angulo=40):
    """Sombreado suave salvo en las aristas con más de `angulo` grados (cortando las normales)."""
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    lim = math.radians(angulo)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0) < lim
        else:
            e.smooth = False
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()


def torno(nombre, perfil, mat, lados=48, eje='Z', centro=(0, 0, 0), angulo_duro=40, cerrar=False):
    """Superficie de revolución. perfil = [(radio, altura), ...] alrededor de Z."""
    verts = []
    caras = []
    n = len(perfil)
    for i in range(lados):
        a = 2 * math.pi * i / lados
        c, s = math.cos(a), math.sin(a)
        for r, z in perfil:
            verts.append((r * c, r * s, z))
    for i in range(lados):
        j = (i + 1) % lados
        for k in range(n - 1):
            a0 = i * n + k
            caras.append((a0, a0 + 1, j * n + k + 1, j * n + k))
    if cerrar:
        for extremo in (0, n - 1):
            if perfil[extremo][0] > 1e-6:
                idx = [i * n + extremo for i in range(lados)]
                caras.append(tuple(reversed(idx)) if extremo == 0 else tuple(idx))
    o = malla(nombre, verts, caras, mat)
    limpiar(o)
    marcar_bordes_duros(o, angulo_duro)
    if eje == 'X':
        o.rotation_euler = (0, math.radians(90), 0)
    elif eje == 'Y':
        o.rotation_euler = (math.radians(-90), 0, 0)
    o.location = centro
    return o


def limpiar(o, dist=1e-6):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()


def extruir_contorno(nombre, contorno, alto, mat, z0=0.0, agujeros=(), bisel=0.0):
    """Extruye en Z un contorno 2D (lista de (x, y)) con agujeros opcionales."""
    bm = bmesh.new()
    curvas = [contorno] + list(agujeros)
    # usamos una curva de Blender para triangular con agujeros
    cu = bpy.data.curves.new(nombre + '_c', 'CURVE')
    cu.dimensions = '2D'
    cu.fill_mode = 'BOTH'
    for pts in curvas:
        sp = cu.splines.new('POLY')
        sp.points.add(len(pts) - 1)
        for i, (x, y) in enumerate(pts):
            sp.points[i].co = (x, y, 0, 1)
        sp.use_cyclic_u = True
    cu.extrude = alto / 2
    cu.bevel_depth = bisel
    cu.bevel_resolution = 2 if bisel else 0
    tmp = bpy.data.objects.new(nombre + '_tmp', cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    o = bpy.data.objects.new(nombre, me)
    me.materials.clear()
    me.materials.append(material(mat))
    _link(o)
    for v in me.vertices:
        v.co.z += z0 + alto / 2
    limpiar(o, 1e-7)
    marcar_bordes_duros(o, 35)
    return o


def extruir_y(nombre, contorno_xz, y0, alto, mat, agujeros=(), bisel=0.0):
    """Como extruir_contorno pero el contorno está en el plano XZ y se extruye hacia arriba en Y."""
    o = extruir_contorno(nombre, contorno_xz, alto, mat, 0.0, agujeros, bisel)
    for v in o.data.vertices:
        x, y, z = v.co
        v.co = (x, z + y0, y)
    o.data.flip_normals()
    limpiar(o, 1e-7)
    marcar_bordes_duros(o, 35)
    return o


def tubo(nombre, puntos, r, mat, lados=12, suave=True, res=4):
    """Manguera o cable que pasa por los puntos (curva Bezier automática)."""
    cu = bpy.data.curves.new(nombre + '_c', 'CURVE')
    cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(puntos) - 1)
    for i, p in enumerate(puntos):
        bp = sp.bezier_points[i]
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    cu.bevel_depth = r
    cu.bevel_resolution = max(1, lados // 4 - 1)
    cu.resolution_u = res
    cu.use_fill_caps = True
    tmp = bpy.data.objects.new(nombre + '_tmp', cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    o = bpy.data.objects.new(nombre, me)
    me.materials.clear()
    me.materials.append(material(mat))
    _link(o)
    for p in me.polygons:
        p.use_smooth = suave
    return o


def aplicar(o):
    """Aplica modificadores y transformaciones."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    viejo = o.data
    o.modifiers.clear()
    o.data = me
    if viejo.users == 0:
        bpy.data.meshes.remove(viejo)
    me.transform(o.matrix_basis)
    o.matrix_basis = Matrix.Identity(4)
    return o


def unir(nombre, objs):
    """Une varias mallas (con modificadores y transformaciones aplicados) en una."""
    objs = [o for o in objs if o is not None]
    for o in objs:
        aplicar(o)
    bm = bmesh.new()
    mats = []
    for o in objs:
        me = o.data
        remap = []
        for m in me.materials:
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        tmp = bmesh.new()
        tmp.from_mesh(me)
        for f in tmp.faces:
            f.material_index = remap[f.material_index] if remap else 0
        me2 = bpy.data.meshes.new('tmp')
        tmp.to_mesh(me2)
        tmp.free()
        bm.from_mesh(me2)
        bpy.data.meshes.remove(me2)
    for o in objs:
        me = o.data
        bpy.data.objects.remove(o)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(nombre)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    o = bpy.data.objects.new(nombre, me)
    return _link(o)


def mover(o, dx=0, dy=0, dz=0):
    o.location = (o.location.x + dx, o.location.y + dy, o.location.z + dz)
    return o


def ancla(nombre, pos, rot=(0, 0, 0)):
    e = bpy.data.objects.new(nombre, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = 0.05
    e.location = pos
    e.rotation_euler = rot
    return _link(e)


def poligono_redondeado(x0, x1, y0, y1, r, seg=6):
    """Rectángulo con esquinas redondeadas como lista de puntos (sentido antihorario)."""
    pts = []
    esquinas = [(x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)]
    for cx, cy, a0 in esquinas:
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def circulo(cx, cy, r, n=24, desde=0.0):
    return [(cx + r * math.cos(desde + 2 * math.pi * i / n), cy + r * math.sin(desde + 2 * math.pi * i / n)) for i in range(n)]
