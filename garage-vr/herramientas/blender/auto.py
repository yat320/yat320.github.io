# El auto: hatchback de 3 puertas de líneas rectas, inspirado en los compactos de los 80. Sin marcas ni logos.
# Se arma centrado (eje delantero en +Y) y al final se ubica en el garage.
# Medidas: largo 3.81, ancho 1.60, alto 1.36, distancia entre ejes 2.36, cubiertas 175/70 R13.
import math
from comun import *

# dónde queda el auto en el garage
CX, CY = -0.45, -0.03
EJE_D, EJE_T = 1.18, -1.18
R_RUEDA = 0.288
TROCHA = 0.675  # media trocha (centro de la cubierta)
Y_PARABRISAS = 0.62  # base del parabrisas (bisagra del capó)
Y_FRENTE = 1.88
Y_COLA = -1.84


def interp(tabla, y):
    """Interpola linealmente una tabla [(y, valor), ...] ordenada por y."""
    if y <= tabla[0][0]:
        return tabla[0][1]
    for (y0, a), (y1, b) in zip(tabla, tabla[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0) if y1 > y0 else 0
            return a + (b - a) * t
    return tabla[-1][1]


def suave(tabla, y):
    """Como interp pero con transición suave (smoothstep) entre puntos."""
    if y <= tabla[0][0]:
        return tabla[0][1]
    for (y0, a), (y1, b) in zip(tabla, tabla[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0) if y1 > y0 else 0
            t = t * t * (3 - 2 * t)
            return a + (b - a) * t
    return tabla[-1][1]


# Perfil del cuerpo bajo (de la cola al frente)
ANCHO_HOMBRO = [(-1.84, 0.772), (-1.70, 0.792), (-1.3, 0.80), (1.4, 0.80), (1.75, 0.792), (1.88, 0.775)]
ANCHO_ZOCALO = [(-1.84, 0.74), (-1.6, 0.775), (-1.3, 0.78), (1.4, 0.78), (1.7, 0.77), (1.88, 0.745)]
Z_PISO = [(-1.84, 0.34), (-1.62, 0.24), (-1.4, 0.215), (1.45, 0.215), (1.70, 0.27), (1.88, 0.33)]
Z_PLIEGUE = [(-1.84, 0.80), (1.88, 0.73)]
Z_ARRIBA = [(-1.84, 0.905), (-1.6, 0.93), (0.42, 0.935), (0.60, 0.872), (0.66, 0.866), (1.4, 0.83), (1.88, 0.785)]
COMBA_CAPO = [(0.6, 0.0), (0.7, 0.012), (1.8, 0.01), (1.88, 0.004)]

# estaciones del cuerpo bajo; los pares muy juntos marcan las juntas de las puertas
JUNTAS = [0.55, -0.64]
ESTACIONES = sorted(set([-1.84, -1.83, -1.80, -1.75, -1.68, -1.6, -1.5, -1.4, -1.25, -1.1, -0.95, -0.8, -0.5, -0.3, -0.1,
                         0.1, 0.3, 0.45, 0.62, 0.7, 0.85, 1.0, 1.15, 1.3, 1.45, 1.6, 1.7, 1.78, 1.84, 1.87, 1.88] +
                        [j + d for j in JUNTAS for d in (-0.006, -0.002, 0.002, 0.006)]))


def seccion_baja(y):
    """Media sección (lado derecho) de abajo hacia arriba: lista de (x, z)."""
    ws = interp(ANCHO_HOMBRO, y)
    wb = interp(ANCHO_ZOCALO, y)
    zb = suave(Z_PISO, y)
    zs = interp(Z_PLIEGUE, y)
    zt = suave(Z_ARRIBA, y) + (interp(COMBA_CAPO, y) if y > 0.6 else 0)
    # junta de puerta: se hunde el lateral 4 mm
    hundir = 0.0
    for j in JUNTAS:
        if abs(y - j) < 0.003:
            hundir = 0.004
    pts = [
        (0.0, zb),
        (wb - 0.04, zb),
        (wb - 0.012, zb + 0.012),
        (wb - hundir, zb + 0.05),
        (ws - 0.004 - hundir, zs - 0.16),
        (ws - hundir, zs - 0.03),
        (ws - hundir, zs),  # pliegue
        (ws - 0.012 - hundir, zs + 0.012),
        (ws - 0.022, zt - 0.03),
        (ws - 0.03, zt - 0.004),
        (ws - 0.045, zt),  # borde de arriba (filo del capó / guardabarros)
        (ws * 0.55, zt + 0.006),
        (0.0, zt + 0.008),
    ]
    return pts


def loft(nombre, estaciones, seccion, mat, cerrar_cola=True, cerrar_frente=True):
    filas = [seccion(y) for y in estaciones]
    n = len(filas[0])
    # lazo completo: derecha (de abajo a arriba) y la izquierda espejada (de arriba a abajo), sin repetir el centro
    lazo_idx = list(range(n)) + list(range(n - 2, 0, -1))
    verts = []
    for y, fila in zip(estaciones, filas):
        for k, i in enumerate(lazo_idx):
            x, z = fila[i]
            if k >= n:
                x = -x
            verts.append((x, y, z))
    m = len(lazo_idx)
    caras = []
    for s in range(len(estaciones) - 1):
        for k in range(m):
            a = s * m + k
            b = s * m + (k + 1) % m
            caras.append((a, b, b + m, a + m))
    if cerrar_cola:
        caras.append(tuple(range(m)))
    if cerrar_frente:
        caras.append(tuple(reversed(range((len(estaciones) - 1) * m, len(estaciones) * m))))
    o = malla(nombre, verts, caras, mat)
    limpiar(o, 1e-7)
    return o, m


def cuerpo():
    usar('estatico')
    o, m = loft('carroceria', ESTACIONES, seccion_baja, 'pintura_auto')
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    # 1) se separa el capó (la franja de arriba adelante del parabrisas)
    # 2) se abre la cabina (franja de arriba detrás del parabrisas) y el vano del motor
    capo_caras, borrar = [], []
    for f in bm.faces:
        c = f.calc_center_median()
        if len(f.verts) > 4:
            continue
        arriba = all(abs(v.co.x) < interp(ANCHO_HOMBRO, v.co.y) - 0.044 for v in f.verts) and c.z > 0.6
        if arriba and c.y > Y_PARABRISAS + 0.004:
            capo_caras.append(f)
        elif arriba and -1.79 < c.y < Y_PARABRISAS:
            borrar.append(f)
    capo_verts = [[tuple(v.co) for v in f.verts] for f in capo_caras]
    bmesh.ops.delete(bm, geom=capo_caras + borrar, context='FACES')
    bm.to_mesh(me)
    bm.free()
    marcar_bordes_duros(o, 32)
    # el piso del auto va con antióxido negro
    me.materials.append(material('fundicion'))
    for p in me.polygons:
        if p.normal.z < -0.6 and p.center.z < 0.4:
            p.material_index = 1
    s = o.modifiers.new('espesor', 'SOLIDIFY')
    s.thickness = 0.0012
    s.offset = -1
    aplicar(o)
    marcar_bordes_duros(o, 32)
    # pasos de rueda: se recortan los cuatro arcos
    for i, y in enumerate((EJE_D, EJE_T)):
        for sx in (-1, 1):
            c = cilindro(f'arco_tmp{i}{sx}', 0.34, 0.5, 'goma', 48, (sx * 0.9, y, R_RUEDA + 0.01), 'X')
            b = o.modifiers.new('arco', 'BOOLEAN')
            b.object = c
            b.operation = 'DIFFERENCE'
            b.solver = 'EXACT'
            aplicar(o)
            bpy.data.objects.remove(c)
    marcar_bordes_duros(o, 32)
    capo(capo_verts)
    return o


def capo(caras):
    """El capó: una pieza aparte que gira sobre la bisagra de atrás."""
    usar('dinamico')
    verts, idx = [], []
    mapa = {}
    for f in caras:
        ids = []
        for p in f:
            k = (round(p[0], 6), round(p[1], 6), round(p[2], 6))
            if k not in mapa:
                mapa[k] = len(verts)
                # luz de 4 mm con los guardabarros y el frente
                x, y, z = p
                ws = interp(ANCHO_HOMBRO, y) - 0.045
                if abs(x) > ws - 0.001:
                    x -= math.copysign(0.004, x)
                if y > Y_FRENTE - 0.001:
                    y -= 0.002
                if y < Y_PARABRISAS + 0.006:
                    y += 0.002
                verts.append((x, y, z + 0.0015))
            ids.append(mapa[k])
        idx.append(ids)
    o = malla('capo_piel', verts, idx, 'pintura_auto')
    limpiar(o)
    marcar_bordes_duros(o, 30)
    s = o.modifiers.new('espesor', 'SOLIDIFY')
    s.thickness = 0.0015
    s.offset = -1
    # borde doblado hacia abajo adelante (labio)
    partes = [o]
    zf = suave(Z_ARRIBA, Y_FRENTE) + 0.0055
    wf = interp(ANCHO_HOMBRO, Y_FRENTE) - 0.05
    partes.append(caja_min_max('capo_labio', (-wf, Y_FRENTE - 0.006, zf - 0.03), (wf, Y_FRENTE - 0.0025, zf), 'pintura_auto', 0.001))
    # estructura de abajo: marco perimetral y refuerzos en X, pintados del color del auto
    yb, yf = Y_PARABRISAS + 0.03, Y_FRENTE - 0.03
    def z_capo(y):
        return suave(Z_ARRIBA, y) + interp(COMBA_CAPO, y) - 0.002
    def viga(nombre, a, b, ancho=0.05, alto=0.022):
        pa = Vector((a[0], a[1], z_capo(a[1]) - alto / 2))
        pb = Vector((b[0], b[1], z_capo(b[1]) - alto / 2))
        d = pb - pa
        v = caja(nombre, (pa + pb) / 2, (ancho, d.length, alto), 'pintura_auto', 0.004)
        v.rotation_euler = (math.atan2(d.z, math.hypot(d.x, d.y)), 0, -math.atan2(d.x, d.y))
        return v
    w = interp(ANCHO_HOMBRO, 1.2) - 0.09
    partes.append(viga('capo_marco_t', (-w, yb), (w, yb), 0.06))
    partes.append(viga('capo_marco_f', (-w + 0.02, yf - 0.02), (w - 0.02, yf - 0.02), 0.07))
    partes.append(viga('capo_marco_i', (-w, yb), (-w + 0.02, yf - 0.02), 0.05))
    partes.append(viga('capo_marco_d', (w, yb), (w - 0.02, yf - 0.02), 0.05))
    partes.append(viga('capo_cruz_a', (-w + 0.05, yb + 0.05), (w - 0.07, yf - 0.08), 0.045, 0.018))
    partes.append(viga('capo_cruz_b', (w - 0.05, yb + 0.05), (-w + 0.07, yf - 0.08), 0.045, 0.018))
    # aislante (paño negro) en el medio de atrás
    ais = caja_min_max('capo_aislante', (-0.45, yb + 0.06, z_capo(0.9) - 0.012), (0.45, yb + 0.5, z_capo(0.9) - 0.002), 'tapizado', 0.006)
    partes.append(ais)
    # traba del capó (gancho) adelante al medio y alojamiento de la varilla
    partes.append(caja_min_max('capo_gancho', (-0.02, yf - 0.05, z_capo(yf) - 0.06), (0.02, yf - 0.035, z_capo(yf) - 0.02), 'metal_gris', 0.003))
    partes.append(caja_min_max('capo_alojamiento_varilla', (-w + 0.05, yf - 0.16, z_capo(yf) - 0.03), (-w + 0.09, yf - 0.12, z_capo(yf) - 0.015), 'plastico_negro', 0.003))
    o = unir('capo', partes)
    usar('anclas')
    ancla('ancla_capo_varilla', (-w + 0.07, yf - 0.14, z_capo(yf) - 0.03))
    usar('dinamico')
    # el origen va en la bisagra para girarlo
    eje = Vector((0, Y_PARABRISAS + 0.015, suave(Z_ARRIBA, Y_PARABRISAS) - 0.006))
    o.data.transform(Matrix.Translation(-eje))
    o.location = eje
    # bisagras (quedan en la carrocería)
    usar('estatico')
    for sx in (-1, 1):
        caja_min_max(f'bisagra{sx}', (sx * 0.56 - 0.015, Y_PARABRISAS - 0.03, eje.z - 0.05), (sx * 0.56 + 0.015, Y_PARABRISAS + 0.05, eje.z - 0.005), 'metal_gris', 0.003)
    ancla('ancla_capo_bisagra', tuple(eje))
    return o


# Parte de arriba (habitáculo): de la base del parabrisas a la cola
Z_TECHO = [(-1.80, 0.945), (-1.70, 1.07), (-1.52, 1.25), (-1.28, 1.345), (-1.15, 1.36), (-0.1, 1.365), (0.02, 1.345), (0.62, 0.885)]
ANCHO_TECHO = [(-1.80, 0.70), (-1.28, 0.62), (-1.15, 0.615), (0.0, 0.615), (0.62, 0.70)]
EST_ARRIBA = [-1.80, -1.79, -1.76, -1.70, -1.62, -1.52, -1.40, -1.32, -1.28, -1.22, -1.15, -1.0, -0.8, -0.72, -0.71, -0.66,
              -0.61, -0.4, -0.2, 0.0, 0.02, 0.05, 0.15, 0.3, 0.45, 0.58, 0.61, 0.62]


def seccion_arriba(y):
    zb = suave(Z_ARRIBA, y) - 0.004
    wb = interp(ANCHO_HOMBRO, y) - 0.046
    zr = interp(Z_TECHO, y)
    wr = interp(ANCHO_TECHO, y)
    if zr < zb + 0.02:
        zr = zb + 0.02
    h = zr - zb
    pts = [
        (wb, zb),
        (wb - 0.006, zb + min(0.035, h * 0.3)),
        (wr + 0.025 + (wb - wr) * 0.08, zr - min(0.05, h * 0.3)),
        (wr + 0.012, zr - min(0.012, h * 0.1)),
        (wr - 0.01, zr + 0.002),
        (wr - 0.06, zr + 0.012),
        (wr * 0.4, zr + 0.019),
        (0.0, zr + 0.02),
    ]
    return pts


def habitaculo():
    usar('estatico')
    filas = [seccion_arriba(y) for y in EST_ARRIBA]
    n = len(filas[0])
    lazo = list(range(n)) + list(range(n - 2, -1, -1))
    m = len(lazo)
    verts = []
    for y, fila in zip(EST_ARRIBA, filas):
        for k, i in enumerate(lazo):
            x, z = fila[i]
            verts.append((-x if k >= n else x, y, z))
    caras = []
    for s in range(len(EST_ARRIBA) - 1):
        for k in range(m - 1):
            a = s * m + k
            caras.append((a, a + 1, a + 1 + m, a + m))
    o = malla('habitaculo', verts, caras, 'pintura_auto')
    me = o.data
    me.materials.append(material('vidrio'))
    # vidrios: se eligen las caras por zona
    for p in me.polygons:
        c = p.center
        k = p.vertices
        # índice de la cara en el lazo
        kk = (p.index % (m - 1))
        lado = kk if kk < n - 1 else (m - 2 - kk)  # 0..n-2 desde abajo
        vidrio = False
        if lado == 1:  # lateral
            if -0.6 < c.y < 0.585 or -1.43 < c.y < -0.73:
                vidrio = True
        if lado >= 4:  # arriba (centro)
            if 0.035 < c.y < 0.6 and abs(c.x) < interp(ANCHO_TECHO, c.y) - 0.05:
                vidrio = True
            if -1.78 < c.y < -1.31 and abs(c.x) < interp(ANCHO_TECHO, c.y) - 0.06:
                vidrio = True
        if lado == 3 and (0.035 < c.y < 0.6 or -1.78 < c.y < -1.31):
            vidrio = abs(c.x) < interp(ANCHO_TECHO, c.y) - 0.05
        p.material_index = 1 if vidrio else 0
    limpiar(o)
    marcar_bordes_duros(o, 30)
    s = o.modifiers.new('espesor', 'SOLIDIFY')
    s.thickness = 0.003
    s.offset = -1
    aplicar(o)
    marcar_bordes_duros(o, 30)
    # el vidrio va en un objeto aparte (en el juego es transparente)
    separar_material(o, 'vidrio', 'vidrios')
    return o


def separar_material(o, nombre_mat, nuevo):
    me = o.data
    idx = [i for i, m in enumerate(me.materials) if m.name == nombre_mat]
    if not idx:
        return None
    bm = bmesh.new()
    bm.from_mesh(me)
    caras = [f for f in bm.faces if f.material_index in idx]
    otro = bm.copy()
    bmesh.ops.delete(bm, geom=caras, context='FACES')
    bm.to_mesh(me)
    bm.free()
    quedan = [f for f in otro.faces if f.material_index not in idx]
    bmesh.ops.delete(otro, geom=quedan, context='FACES')
    for f in otro.faces:
        f.material_index = 0
    o2 = desde_bmesh(nuevo, otro, nombre_mat, suave=True)
    marcar_bordes_duros(o2, 30)
    return o2


def frente():
    """Parrilla, ópticas, paragolpes y luces de giro."""
    usar('estatico')
    y = Y_FRENTE
    partes = []
    zt = suave(Z_ARRIBA, y)
    # panel del frente (detrás de las ópticas)
    partes.append(caja_min_max('frente_panel', (-0.74, y - 0.03, 0.5), (0.74, y + 0.002, zt - 0.012), 'plastico_negro', 0.004))
    # parrilla: marco y listones horizontales
    gx = 0.38
    partes.append(caja_min_max('parrilla_marco', (-gx, y, 0.56), (gx, y + 0.012, 0.74), 'plastico_negro', 0.005))
    for i in range(6):
        z = 0.575 + i * 0.03
        partes.append(caja_min_max(f'parrilla_l{i}', (-gx + 0.015, y + 0.006, z), (gx - 0.015, y + 0.016, z + 0.012), 'plastico_negro', 0.003))
    unir('frente', partes)
    # ópticas rectangulares
    for sx in (-1, 1):
        x0, x1 = sx * 0.405, sx * 0.725
        a, b = min(x0, x1), max(x0, x1)
        caja_min_max(f'optica_marco{sx}', (a - 0.008, y, 0.555), (b + 0.008, y + 0.014, 0.745), 'plastico_negro', 0.006)
        r = caja_min_max(f'optica_reflector{sx}', (a + 0.004, y - 0.02, 0.565), (b - 0.004, y + 0.006, 0.735), 'reflector', 0.004)
        # lámpara
        cilindro(f'optica_lampara{sx}', 0.012, 0.03, 'optica', 12, ((a + b) / 2, y + 0.006, 0.65), 'Y')
        # carcasa negra de atrás (lo que se ve desde el vano)
        caja_min_max(f'optica_carcasa{sx}', (a + 0.01, y - 0.11, 0.575), (b - 0.01, y - 0.018, 0.728), 'plastico_negro', 0.02)
        v = caja_min_max(f'optica_vidrio{sx}', (a + 0.002, y + 0.012, 0.562), (b - 0.002, y + 0.016, 0.738), 'optica', 0.003)
        # luz de giro en el paragolpes
        caja_min_max(f'giro_del{sx}', (sx * 0.52 - 0.06, y + 0.035, 0.40), (sx * 0.52 + 0.06, y + 0.06, 0.45), 'optica_ambar', 0.004)
    paragolpes(y, 1)


def paragolpes(y, s):
    """Paragolpes de plástico negro que envuelve las esquinas. s=1 adelante, -1 atrás."""
    z0, z1 = 0.31, 0.49
    pts = []
    w = 0.80
    # planta del paragolpes
    planta = [(-w + 0.02, y - s * 0.32), (-w + 0.035, y - s * 0.02), (-w + 0.12, y + s * 0.055), (0, y + s * 0.07),
              (w - 0.12, y + s * 0.055), (w - 0.035, y - s * 0.02), (w - 0.02, y - s * 0.32)]
    if s < 0:
        planta = list(reversed(planta))
    # contorno con espesor de 4 cm hacia adentro
    ext = planta
    inn = []
    for i, (x, yy) in enumerate(ext):
        inn.append((x * 0.95, yy - s * 0.04))
    contorno = ext + list(reversed(inn))
    o = extruir_contorno(f'paragolpes{s}', contorno, z1 - z0, 'plastico_negro', z0, bisel=0.008)
    # banda de goma
    contorno2 = [(x * 1.004, yy + s * 0.004) for x, yy in ext] + list(reversed([(x * 0.99, yy - s * 0.01) for x, yy in ext]))
    extruir_contorno(f'paragolpes_goma{s}', contorno2, 0.03, 'goma', z0 + 0.075, bisel=0.004)
    return o


def cola():
    usar('estatico')
    y = Y_COLA
    zt = suave(Z_ARRIBA, y)
    partes = []
    # portón trasero (chapa) con junta marcada
    for sx in (-1, 1):
        x0, x1 = sx * 0.50, sx * 0.755
        a, b = min(x0, x1), max(x0, x1)
        caja_min_max(f'faro_marco{sx}', (a - 0.006, y - 0.012, 0.6), (b + 0.006, y + 0.004, 0.82), 'plastico_negro', 0.006)
        caja_min_max(f'faro_rojo{sx}', (a, y - 0.018, 0.68), (b, y - 0.008, 0.815), 'optica_roja', 0.004)
        caja_min_max(f'faro_ambar{sx}', (a, y - 0.018, 0.64), (b, y - 0.008, 0.678), 'optica_ambar', 0.003)
        caja_min_max(f'faro_blanco{sx}', (a, y - 0.018, 0.605), (b, y - 0.008, 0.638), 'optica', 0.003)
        caja_min_max(f'faro_reflector{sx}', (a + 0.004, y - 0.012, 0.61), (b - 0.004, y, 0.81), 'reflector')
    # hueco de la patente (sin patente) y su luz
    caja_min_max('patente_hueco', (-0.2, y - 0.004, 0.46), (0.2, y + 0.004, 0.6), 'plastico_negro', 0.004)
    caja_min_max('patente_luz', (-0.04, y - 0.01, 0.6), (0.04, y, 0.615), 'optica', 0.002)
    # juntas del portón (líneas oscuras)
    for x in (-0.49, 0.49):
        caja_min_max(f'junta_porton{x}', (x - 0.0015, y - 0.0012, 0.58), (x + 0.0015, y + 0.002, zt - 0.01), 'plastico_negro')
    caja_min_max('junta_porton_b', (-0.49, y - 0.0012, 0.578), (0.49, y + 0.002, 0.582), 'plastico_negro')
    # cerradura del portón
    cilindro('porton_cerr', 0.014, 0.015, 'cromo', 16, (0, y - 0.007, 0.64), 'Y')
    paragolpes(y, -1)
    # caño de escape asomando abajo a la izquierda
    cilindro('escape_punta', 0.022, 0.25, 'oxido', 16, (-0.45, y + 0.05, 0.24), 'Y')
    cilindro('silenciador', 0.11, 0.55, 'oxido', 24, (-0.35, y + 0.55, 0.26), 'Y')


def costados():
    usar('estatico')
    for sx in (-1, 1):
        x = sx * 0.8
        # manija de puerta
        caja_min_max(f'manija{sx}', (x - 0.004 if sx > 0 else x - 0.012, -0.5, 0.835), (x + 0.012 if sx > 0 else x + 0.004, -0.38, 0.86), 'plastico_negro', 0.006)
        cilindro(f'manija_cerr{sx}', 0.009, 0.01, 'cromo', 12, (x + sx * 0.008, -0.53, 0.848), 'X')
        # moldura lateral de goma
        caja_min_max(f'moldura{sx}', (x - 0.006 if sx > 0 else x - 0.004, -1.6, 0.53), (x + 0.004 if sx > 0 else x + 0.006, 1.62, 0.555), 'goma', 0.004)
        # espejo retrovisor
        ex = sx * 0.83
        base = caja_min_max(f'espejo_base{sx}', (min(sx * 0.755, sx * 0.80), 0.42, 0.93), (max(sx * 0.755, sx * 0.80), 0.52, 0.98), 'plastico_negro', 0.008)
        cuerpo = caja_min_max(f'espejo_cuerpo{sx}', (min(sx * 0.79, sx * 0.94), 0.44, 0.94), (max(sx * 0.79, sx * 0.94), 0.5, 1.03), 'plastico_negro', 0.015)
        luna = caja_min_max(f'espejo_luna{sx}', (min(sx * 0.80, sx * 0.93), 0.438, 0.948), (max(sx * 0.80, sx * 0.93), 0.441, 1.022), 'cromo')
        # tapa de nafta (lado derecho)
        if sx > 0:
            for (a, b) in (((0.0, -1.42), (0.0, -1.27)),):
                pass
            caja_min_max('tapa_nafta_junta', (x - 0.0035, -1.43, 0.70), (x + 0.0015, -1.26, 0.703), 'plastico_negro')
            caja_min_max('tapa_nafta_junta2', (x - 0.0035, -1.43, 0.84), (x + 0.0015, -1.26, 0.843), 'plastico_negro')
            caja_min_max('tapa_nafta_junta3', (x - 0.0035, -1.43, 0.70), (x + 0.0015, -1.427, 0.843), 'plastico_negro')
            caja_min_max('tapa_nafta_junta4', (x - 0.0035, -1.263, 0.70), (x + 0.0015, -1.26, 0.843), 'plastico_negro')
    # limpiaparabrisas
    for sx in (-0.38, 0.12):
        tubo(f'limpia_brazo{sx}', [(sx, 0.66, 0.87), (sx + 0.08, 0.6, 0.9), (sx + 0.38, 0.56, 0.91)], 0.006, 'plastico_negro', 8)
        caja(f'limpia_escobilla{sx}', (sx + 0.23, 0.555, 0.915), (0.42, 0.012, 0.018), 'goma', 0.003)
        cilindro(f'limpia_eje{sx}', 0.012, 0.03, 'plastico_negro', 12, (sx, 0.67, 0.865))
    # burletes del parabrisas y luneta (marco negro)
    # antena en el techo, adelante
    cilindro('antena_base', 0.012, 0.015, 'plastico_negro', 12, (-0.3, 0.02, 1.36))
    a = cilindro('antena', 0.0025, 0.55, 'cromo', 8, (-0.3, -0.12, 1.6))
    a.rotation_euler = (math.radians(-28), 0, 0)


def ruedas():
    usar('estatico')
    for i, y in enumerate((EJE_D, EJE_T)):
        for sx in (-1, 1):
            rueda(f'rueda{i}{sx}', sx * TROCHA, y, sx, delantera=(i == 0))


def rueda(nombre, x, y, sx, delantera):
    r_ext, r_llanta, ancho = R_RUEDA, 0.165, 0.175
    a2 = ancho / 2
    # cubierta con dibujo: tres canales y hombros redondeados
    perfil = [(r_llanta + 0.006, -a2 * 0.78), (r_llanta + 0.03, -a2 * 0.92), (r_ext - 0.07, -a2), (r_ext - 0.03, -a2 * 0.97),
              (r_ext - 0.01, -a2 * 0.88), (r_ext, -a2 * 0.75)]
    for c in (-0.45, 0.0, 0.45):
        zc = a2 * c
        perfil += [(r_ext, zc - 0.012), (r_ext - 0.008, zc - 0.008), (r_ext - 0.008, zc + 0.008), (r_ext, zc + 0.012)]
    perfil += [(r_ext, a2 * 0.75), (r_ext - 0.01, a2 * 0.88), (r_ext - 0.03, a2 * 0.97), (r_ext - 0.07, a2),
               (r_llanta + 0.03, a2 * 0.92), (r_llanta + 0.006, a2 * 0.78)]
    t = torno(nombre + '_cubierta', perfil, 'goma', 64, angulo_duro=55)
    # llanta de chapa: aro y disco con agujeros, tapa central
    off = 0.02 * sx
    aro = [(r_llanta - 0.002, -a2 * 0.8), (r_llanta + 0.006, -a2 * 0.8), (r_llanta + 0.008, -a2 * 0.74), (r_llanta - 0.01, -a2 * 0.7),
           (r_llanta - 0.012, a2 * 0.7), (r_llanta + 0.008, a2 * 0.74), (r_llanta + 0.006, a2 * 0.8), (r_llanta - 0.002, a2 * 0.8)]
    ll = torno(nombre + '_aro', aro, 'llanta', 48, angulo_duro=50)
    disco = torno(nombre + '_disco', [(0.05, 0.03), (0.08, 0.035), (0.12, 0.025), (0.15, 0.012), (r_llanta - 0.008, a2 * 0.55)], 'llanta', 48, angulo_duro=60)
    tapa = torno(nombre + '_tapa', [(0, 0.06), (0.035, 0.058), (0.055, 0.05), (0.068, 0.038), (0.07, 0.03)], 'cromo', 32, angulo_duro=60)
    # bulones de rueda
    bulones = []
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        b = cilindro(f'{nombre}_bulon{k}', 0.009, 0.012, 'acero', 6, (0.075 * math.cos(a), 0.075 * math.sin(a), 0.04))
        bulones.append(b)
    # agujeros de ventilación (marcados con discos oscuros)
    agujeros = []
    for k in range(8):
        a = k * math.pi / 4
        h = cilindro(f'{nombre}_ag{k}', 0.016, 0.004, 'plastico_negro', 12, (0.128 * math.cos(a), 0.128 * math.sin(a), 0.0195))
        h.rotation_euler = (math.radians(-11) * math.sin(a), math.radians(11) * math.cos(a), 0)
        agujeros.append(h)
    partes = [t, ll, disco, tapa] + bulones + agujeros
    # freno: disco adelante, tambor atrás (detrás de la llanta)
    if delantera:
        partes.append(cilindro(nombre + '_freno', 0.12, 0.012, 'acero', 32, (0, 0, -0.03)))
        partes.append(caja_min_max(nombre + '_mordaza', (-0.04, 0.07, -0.06), (0.04, 0.13, 0.0), 'fundicion', 0.008))
    else:
        partes.append(cilindro(nombre + '_tambor', 0.115, 0.06, 'fundicion', 32, (0, 0, -0.04)))
    o = unir(nombre, partes)
    # el disco de la llanta mira hacia afuera (+Z local → ±X del auto)
    o.rotation_euler = (0, math.radians(90 * sx), 0)
    o.location = (x, y, R_RUEDA)
    aplicar(o)
    # pequeño aplastamiento contra el piso
    for v in o.data.vertices:
        if v.co.z < 0.012:
            v.co.z = 0.012 + (v.co.z - 0.012) * 0.15
    return o


def pasos_rueda():
    """Guardabarros interiores negros dentro de cada arco."""
    usar('estatico')
    for i, y in enumerate((EJE_D, EJE_T)):
        for sx in (-1, 1):
            perfil = []
            n = 20
            pts = []
            for k in range(n + 1):
                a = math.radians(-10 + 200 * k / n)
                pts.append((math.cos(a) * 0.345, math.sin(a) * 0.345))
            verts, caras = [], []
            x0, x1 = sx * 0.63, sx * 0.795
            for k, (py, pz) in enumerate(pts):
                verts.append((x0, y + py, R_RUEDA + 0.01 + pz))
                verts.append((x1, y + py, R_RUEDA + 0.01 + pz))
            for k in range(n):
                a = 2 * k
                caras.append((a, a + 2, a + 3, a + 1) if sx > 0 else (a, a + 1, a + 3, a + 2))
            # tapa lateral interna
            o = malla(f'paso_rueda{i}{sx}', verts, caras, 'plastico_negro', suave=True)
            s = o.modifiers.new('esp', 'SOLIDIFY')
            s.thickness = 0.004


def interior():
    """Habitáculo: tablero, volante, butacas, asiento de atrás, paneles y piso."""
    usar('estatico')
    partes = []
    # piso alfombrado
    partes.append(caja_min_max('alfombra', (-0.74, -1.5, 0.24), (0.74, 0.62, 0.26), 'tapizado'))
    # tablero
    partes.append(caja_min_max('tablero_base', (-0.74, 0.38, 0.52), (0.74, 0.66, 0.84), 'plastico_negro', 0.03))
    partes.append(caja_min_max('tablero_capota', (-0.66, 0.34, 0.80), (-0.12, 0.5, 0.90), 'plastico_negro', 0.03))
    partes.append(caja_min_max('consola', (-0.12, 0.25, 0.26), (0.12, 0.55, 0.62), 'plastico_negro', 0.02))
    # instrumentos
    for k, dx in enumerate((-0.47, -0.31)):
        partes.append(cilindro(f'reloj{k}', 0.05, 0.01, 'plastico_traslucido', 24, (dx, 0.34, 0.82), 'Y'))
    # volante (izquierda)
    v = torno('volante_aro', [(0.18, -0.012), (0.192, 0), (0.18, 0.012), (0.168, 0)], 'plastico_negro', 40)
    v2 = caja('volante_rayo', (0, 0, 0), (0.34, 0.03, 0.012), 'plastico_negro', 0.006)
    v3 = cilindro('volante_centro', 0.05, 0.03, 'plastico_negro', 20, (0, 0, 0))
    vol = unir('volante', [v, v2, v3])
    vol.rotation_euler = (math.radians(70), 0, 0)
    vol.location = (-0.37, 0.25, 0.80)
    partes.append(vol)
    partes.append(cilindro('columna', 0.03, 0.3, 'plastico_negro', 16, (-0.37, 0.38, 0.72), 'Y'))
    partes[-1].rotation_euler = (math.radians(70), 0, 0)
    # butacas
    for sx in (-1, 1):
        x = sx * 0.37
        partes.append(caja_min_max(f'butaca_asiento{sx}', (x - 0.24, -0.35, 0.28), (x + 0.24, 0.12, 0.42), 'tapizado', 0.04))
        resp = caja(f'butaca_resp{sx}', (x, -0.4, 0.72), (0.46, 0.12, 0.62), 'tapizado', 0.04)
        resp.rotation_euler = (math.radians(-12), 0, 0)
        partes.append(resp)
        partes.append(caja(f'butaca_cab{sx}', (x, -0.47, 1.1), (0.26, 0.09, 0.18), 'tapizado', 0.03))
        # panel de puerta
        partes.append(caja_min_max(f'panel_puerta{sx}', (sx * 0.74 - 0.02, -0.6, 0.3), (sx * 0.74 + 0.02, 0.5, 0.9), 'tapizado', 0.01))
        partes.append(caja_min_max(f'panel_lateral_t{sx}', (sx * 0.72 - 0.03, -1.6, 0.3), (sx * 0.72 + 0.03, -0.66, 0.9), 'tapizado', 0.01))
    # asiento trasero
    partes.append(caja_min_max('asiento_t', (-0.62, -1.15, 0.28), (0.62, -0.7, 0.44), 'tapizado', 0.04))
    rt = caja('asiento_t_resp', (0, -1.22, 0.7), (1.24, 0.12, 0.55), 'tapizado', 0.04)
    rt.rotation_euler = (math.radians(-15), 0, 0)
    partes.append(rt)
    # bandeja de atrás y tapizado de techo
    partes.append(caja_min_max('bandeja', (-0.66, -1.75, 0.9), (0.66, -1.32, 0.915), 'tapizado'))
    partes.append(caja_min_max('techo_int', (-0.6, -1.2, 1.33), (0.6, 0.0, 1.345), 'tapizado'))
    # espejo interior
    partes.append(caja_min_max('espejo_int', (-0.1, 0.06, 1.24), (0.1, 0.08, 1.3), 'plastico_negro', 0.01))
    unir('interior', partes)


def bajos():
    """Lo que se ve por abajo: piso negro, travesaños, caño de escape."""
    usar('estatico')
    partes = [caja_min_max('bajo_piso', (-0.7, -1.6, 0.2), (0.7, 0.6, 0.215), 'fundicion')]
    partes.append(caja_min_max('tunel', (-0.12, -1.4, 0.2), (0.12, 0.6, 0.3), 'fundicion', 0.02))
    partes.append(tubo('cano_escape', [(0.0, 1.5, 0.3), (0.05, 0.6, 0.2), (-0.05, -0.6, 0.2), (-0.25, -1.3, 0.24), (-0.4, -1.6, 0.24)], 0.022, 'oxido', 12))
    partes.append(cilindro('silenciador_medio', 0.07, 0.4, 'oxido', 20, (-0.02, -0.4, 0.2), 'Y'))
    # ejes y brazos (simples)
    partes.append(caja_min_max('eje_trasero', (-0.62, EJE_T - 0.04, 0.24), (0.62, EJE_T + 0.04, 0.32), 'fundicion', 0.01))
    unir('bajos', partes)


def fundas():
    """Fundas de guardabarros (vinilo azul) sobre los dos lados del vano, como en cualquier taller."""
    usar('estatico')
    for sx in (-1, 1):
        ys = [0.72 + i * 0.07 for i in range(13)]
        filas = []
        for y in ys:
            sec = seccion_baja(y)
            # del borde de arriba (cerca del capó) hacia abajo por el costado
            pts = [sec[10], sec[9], sec[8], sec[7], sec[6], sec[5]]
            fila = []
            for k, (x, z) in enumerate(pts):
                # 4 mm afuera de la chapa, con una onda suave de tela
                ox = 0.004 + 0.002 * math.sin(y * 31 + k)
                fila.append((sx * (x + ox), y, z + (0.004 if k < 2 else 0)))
            # el borde de adentro se apoya sobre el ala de la pollera
            fila.insert(0, (sx * (sec[10][0] - 0.05), y, sec[10][1] + 0.003))
            # el borde de abajo cuelga un poco más
            x, z = sec[5]
            fila.append((sx * (x + 0.012), y, z - 0.1 - 0.02 * math.sin(y * 9)))
            filas.append(fila)
        verts, caras = [], []
        n = len(filas[0])
        for f in filas:
            verts.extend(f)
        for i in range(len(filas) - 1):
            for k in range(n - 1):
                a = i * n + k
                c = (a, a + 1, a + n + 1, a + n) if sx > 0 else (a, a + n, a + n + 1, a + 1)
                caras.append(c)
        o = malla(f'funda{sx}', verts, caras, 'funda', suave=True)
        s = o.modifiers.new('esp', 'SOLIDIFY')
        s.thickness = 0.002


def ubicar():
    """Mueve todo lo del auto a su lugar en el garage."""
    t = Matrix.Translation((CX, CY, 0))
    for nombre in ('estatico', 'dinamico', 'anclas'):
        c = bpy.data.collections.get(nombre)
        if not c:
            continue
        for o in c.objects:
            if o.get('_auto'):
                o.matrix_basis = t @ o.matrix_basis


def construir():
    previos = set(bpy.data.objects)
    cuerpo()
    habitaculo()
    frente()
    cola()
    costados()
    ruedas()
    pasos_rueda()
    interior()
    bajos()
    fundas()
    for o in bpy.data.objects:
        if o not in previos:
            o['_auto'] = True
    ubicar()
