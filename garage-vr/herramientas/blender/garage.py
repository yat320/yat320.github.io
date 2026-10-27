# El garage: un ambiente de un auto, con portón de chapa, banco de trabajo, tablero de herramientas y estantería.
# Interior: X de -2.1 a 2.1, Y de -3.2 (portón) a 3.2 (pared del fondo), Z de 0 a 2.8.
import math
import random
from comun import *

ANCHO, LARGO, ALTO = 4.2, 6.4, 2.8
X0, X1 = -ANCHO / 2, ANCHO / 2
Y0, Y1 = -LARGO / 2, LARGO / 2
MURO = 0.2

# Tablero de herramientas en la pared del fondo, a la derecha del auto
TABLERO = {'x0': 0.55, 'x1': 1.95, 'z0': 1.05, 'z1': 1.95, 'y': Y1 - 0.02}


def piso():
    usar('estatico')
    # losa subdividida para que el horneado tenga buena resolución
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=21, y_segments=32, size=0.5)
    for v in bm.verts:
        v.co.x *= ANCHO
        v.co.y *= LARGO
    o = desde_bmesh('piso', bm, 'concreto')
    # rejilla de desagüe en el centro
    rej = caja('rejilla_marco', (0.25, -0.6, 0.002), (0.32, 0.32, 0.004), 'metal_gris')
    barras = [caja(f'rejilla_b{i}', (0.25 - 0.13 + i * 0.026, -0.6, 0.003), (0.012, 0.28, 0.005), 'fundicion') for i in range(11)]
    unir('rejilla', [rej] + barras)
    # manchas de aceite (calco apenas arriba del piso)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    for v in bm.verts:
        v.co.x *= 2.6
        v.co.y *= 4.2
        v.co.z = 0.0015
    m = desde_bmesh('piso_manchas', bm, 'piso_mancha')
    m.location = (-0.4, 0.2, 0)
    return o


def paredes():
    usar('estatico')
    partes = []
    # pared del fondo, laterales y techo: cajas gruesas para que no se cuele la luz
    partes.append(caja_min_max('muro_fondo', (X0 - MURO, Y1, 0), (X1 + MURO, Y1 + MURO, ALTO), 'revoque'))
    partes.append(caja_min_max('muro_izq', (X0 - MURO, Y0 - MURO, 0), (X0, Y1, ALTO), 'revoque'))
    partes.append(caja_min_max('muro_der', (X1, Y0 - MURO, 0), (X1 + MURO, Y1, ALTO), 'revoque'))
    # pared del frente con el vano del portón (2.7 de ancho, 2.25 de alto)
    pv0, pv1, pz = -1.35, 1.35, 2.25
    partes.append(caja_min_max('muro_frente_i', (X0 - MURO, Y0 - MURO, 0), (pv0, Y0, ALTO), 'revoque'))
    partes.append(caja_min_max('muro_frente_d', (pv1, Y0 - MURO, 0), (X1 + MURO, Y0, ALTO), 'revoque'))
    partes.append(caja_min_max('muro_frente_s', (pv0, Y0 - MURO, pz), (pv1, Y0, ALTO), 'revoque'))
    for o in partes:
        subdividir_paredes(o)
    # zócalo pintado (franja baja de otro color, 1.1 m) apenas despegado de la pared
    z = []
    z.append(caja_min_max('zoc_fondo', (X0, Y1 - 0.004, 0), (X1, Y1, 1.1), 'revoque_zocalo'))
    z.append(caja_min_max('zoc_izq', (X0, Y0, 0), (X0 + 0.004, Y1, 1.1), 'revoque_zocalo'))
    z.append(caja_min_max('zoc_der', (X1 - 0.004, Y0, 0), (X1, Y1, 1.1), 'revoque_zocalo'))
    z.append(caja_min_max('zoc_frente_i', (X0, Y0, 0), (pv0, Y0 + 0.004, 1.1), 'revoque_zocalo'))
    z.append(caja_min_max('zoc_frente_d', (pv1, Y0, 0), (X1, Y0 + 0.004, 1.1), 'revoque_zocalo'))
    for o in z:
        subdividir_paredes(o)
    # techo (losa) con una viga
    t = caja_min_max('techo', (X0 - MURO, Y0 - MURO, ALTO), (X1 + MURO, Y1 + MURO, ALTO + 0.15), 'losa')
    subdividir_paredes(t)
    caja_min_max('viga', (X0, -0.25, ALTO - 0.28), (X1, 0.0, ALTO), 'losa', bisel=0.01)
    # vereda de afuera, apenas para que el portón no flote
    caja_min_max('vereda', (X0 - 1, Y0 - 1.5, -0.05), (X1 + 1, Y0 - MURO, 0.0), 'concreto')


def subdividir_paredes(o, paso=0.5):
    """Corta las caras grandes en una grilla para que el horneado tenga vértices donde cambia la luz."""
    aplicar(o)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for eje in range(3):
        lo = min(v.co[eje] for v in bm.verts)
        hi = max(v.co[eje] for v in bm.verts)
        n = int((hi - lo) / paso)
        for i in range(1, n + 1):
            c = lo + i * (hi - lo) / (n + 1)
            no = [0, 0, 0]
            no[eje] = 1
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=tuple(c if k == eje else 0 for k in range(3)), plane_no=no)
    bm.to_mesh(o.data)
    bm.free()


def porton():
    """Portón levadizo de chapa acanalada, cerrado."""
    usar('estatico')
    pv0, pv1, pz = -1.35, 1.35, 2.25
    y = Y0 - 0.06
    # chapa ondulada: perfil en Z, se extiende en X
    verts, caras = [], []
    nz = 150
    nx = 10
    for i in range(nz + 1):
        z = pz * i / nz
        d = 0.012 * math.sin(2 * math.pi * z / 0.075)
        for j in range(nx + 1):
            x = pv0 + (pv1 - pv0) * j / nx
            verts.append((x, y + d, z))
    for i in range(nz):
        for j in range(nx):
            a = i * (nx + 1) + j
            caras.append((a, a + 1, a + nx + 2, a + nx + 1))
    o = malla('porton_chapa', verts, caras, 'chapa_galv', suave=True)
    s = o.modifiers.new('espesor', 'SOLIDIFY')
    s.thickness = 0.002
    # marco perimetral y guías
    partes = [o]
    partes.append(caja_min_max('porton_guia_i', (pv0 - 0.05, y - 0.04, 0), (pv0 + 0.02, y + 0.06, pz), 'metal_pintado', 0.004))
    partes.append(caja_min_max('porton_guia_d', (pv1 - 0.02, y - 0.04, 0), (pv1 + 0.05, y + 0.06, pz), 'metal_pintado', 0.004))
    partes.append(caja_min_max('porton_dintel', (pv0 - 0.05, y - 0.04, pz - 0.02), (pv1 + 0.05, y + 0.08, pz + 0.06), 'metal_pintado', 0.004))
    partes.append(caja_min_max('porton_zocalo', (pv0, y - 0.03, 0), (pv1, y + 0.03, 0.06), 'metal_pintado', 0.004))
    # manija y cerradura
    partes.append(caja_min_max('porton_manija', (-0.1, y + 0.02, 0.9), (0.1, y + 0.05, 0.93), 'metal_gris', 0.006))
    partes.append(cilindro('porton_cerradura', 0.018, 0.02, 'cromo', 20, (0.0, y + 0.03, 1.0), 'Y'))
    unir('porton', partes)


def ventana():
    """Ventanita alta en la pared izquierda, vidrio esmerilado (entra la luz de la tarde)."""
    usar('estatico')
    x = X0
    y0, y1, z0, z1 = -1.6, -0.4, 1.85, 2.45
    # vano (cortamos la pared con un boolean)
    muro = bpy.data.objects['muro_izq']
    corte = caja_min_max('vano_tmp', (x - MURO - 0.1, y0, z0), (x + 0.1, y1, z1), 'revoque')
    b = muro.modifiers.new('vano', 'BOOLEAN')
    b.object = corte
    b.operation = 'DIFFERENCE'
    b.solver = 'EXACT'
    aplicar(muro)
    zoc = bpy.data.objects['zoc_izq']
    bpy.data.objects.remove(corte)
    partes = []
    partes.append(caja_min_max('vent_marco_a', (x - 0.08, y0, z0), (x - 0.03, y1, z0 + 0.04), 'metal_pintado', 0.003))
    partes.append(caja_min_max('vent_marco_b', (x - 0.08, y0, z1 - 0.04), (x - 0.03, y1, z1), 'metal_pintado', 0.003))
    partes.append(caja_min_max('vent_marco_c', (x - 0.08, y0, z0), (x - 0.03, y0 + 0.04, z1), 'metal_pintado', 0.003))
    partes.append(caja_min_max('vent_marco_d', (x - 0.08, y1 - 0.04, z0), (x - 0.03, y1, z1), 'metal_pintado', 0.003))
    partes.append(caja_min_max('vent_marco_m', (x - 0.08, (y0 + y1) / 2 - 0.015, z0), (x - 0.03, (y0 + y1) / 2 + 0.015, z1), 'metal_pintado', 0.003))
    unir('ventana_marco', partes)
    v = caja_min_max('ventana_vidrio', (x - 0.06, y0 + 0.02, z0 + 0.02), (x - 0.055, y1 - 0.02, z1 - 0.02), 'vidrio')
    v['vidrio_esmerilado'] = True
    # alféizar
    caja_min_max('alfeizar', (x - 0.02, y0 - 0.03, z0 - 0.03), (x + 0.07, y1 + 0.03, z0), 'revoque', 0.004)


def luces_techo():
    """Dos artefactos de tubos fluorescentes colgados de la losa."""
    usar('estatico')
    for i, y in enumerate((-1.3, 1.5)):
        z = ALTO - 0.06
        partes = []
        cuerpo = caja_min_max(f'artefacto{i}_cuerpo', (-0.62, y - 0.09, z - 0.05), (0.62, y + 0.09, z), 'metal_pintado', 0.004)
        partes.append(cuerpo)
        for k in (-0.6, 0.6):
            partes.append(caja_min_max(f'artefacto{i}_tapa{k}', (k - 0.015, y - 0.07, z - 0.085), (k + 0.015, y + 0.07, z - 0.04), 'plastico_negro', 0.003))
        for k in range(2):
            partes.append(cilindro(f'artefacto{i}_cad{k}', 0.004, ALTO - z, 'metal_gris', 8, (0.0 + (k - 0.5) * 0.9, y, (ALTO + z) / 2)))
        unir(f'artefacto{i}', partes)
        for k, dy in enumerate((-0.04, 0.04)):
            t = cilindro(f'tubo{i}_{k}', 0.013, 1.18, 'tubo_luz', 16, (0, y + dy, z - 0.065), 'X')
            t['luz'] = True


def banco():
    """Banco de trabajo bajo el tablero: tapa de madera, patas de ángulo, estante abajo y morsa."""
    usar('estatico')
    x0, x1 = 0.45, 2.05
    y0, y1 = Y1 - 0.65, Y1 - 0.02
    z = 0.9
    partes = []
    partes.append(caja_min_max('banco_tapa', (x0, y0, z - 0.045), (x1, y1, z), 'madera', 0.004))
    for px in (x0 + 0.03, x1 - 0.03):
        for py in (y0 + 0.03, y1 - 0.03):
            partes.append(angulo_vertical(f'banco_pata{px}{py}', px, py, 0, z - 0.045))
    partes.append(caja_min_max('banco_estante', (x0 + 0.02, y0 + 0.02, 0.18), (x1 - 0.02, y1 - 0.02, 0.2), 'madera', 0.003))
    partes.append(caja_min_max('banco_trav_f', (x0, y0, z - 0.1), (x1, y0 + 0.03, z - 0.045), 'metal_pintado', 0.003))
    partes.append(caja_min_max('banco_trav_t', (x0, y1 - 0.03, z - 0.1), (x1, y1, z - 0.045), 'metal_pintado', 0.003))
    unir('banco', partes)
    morsa(x0 + 0.22, y0 + 0.06, z)
    # cajones de cartón y una caja de herramientas en el estante
    random.seed(4)
    cx = x0 + 0.1
    for i in range(3):
        w = 0.35 + random.random() * 0.12
        caja_min_max(f'caja_carton{i}', (cx, y0 + 0.1, 0.2), (cx + w, y1 - 0.12, 0.2 + 0.18 + random.random() * 0.1), 'carton', 0.006)
        cx += w + 0.05
    caja_herramientas(x1 - 0.45, y0 + 0.08, z)
    # trapo sobre el banco
    trapo(x0 + 0.75, y0 + 0.2, z)
    # zócalo de enchufes
    caja_min_max('toma', (x1 - 0.3, Y1 - 0.03, 1.0), (x1 - 0.18, Y1, 1.08), 'plastico_traslucido', 0.004)


def angulo_vertical(nombre, x, y, z0, z1, a=0.035, e=0.004):
    p = [caja_min_max(nombre + 'a', (x - a / 2, y - a / 2, z0), (x + a / 2, y - a / 2 + e, z1), 'metal_pintado'),
         caja_min_max(nombre + 'b', (x - a / 2, y - a / 2, z0), (x - a / 2 + e, y + a / 2, z1), 'metal_pintado')]
    return unir(nombre, p)


def morsa(x, y, z):
    partes = []
    partes.append(caja_min_max('morsa_base', (x - 0.09, y, z), (x + 0.09, y + 0.16, z + 0.03), 'metal_pintado', 0.006))
    partes.append(caja_min_max('morsa_cuerpo', (x - 0.06, y - 0.02, z + 0.03), (x + 0.06, y + 0.14, z + 0.12), 'metal_pintado', 0.01))
    partes.append(caja_min_max('morsa_mordaza_f', (x - 0.075, y - 0.07, z + 0.06), (x + 0.075, y - 0.02, z + 0.15), 'metal_pintado', 0.008))
    partes.append(caja_min_max('morsa_mordaza_t', (x - 0.075, y + 0.0, z + 0.1), (x + 0.075, y + 0.04, z + 0.15), 'metal_pintado', 0.008))
    partes.append(caja_min_max('morsa_placa_f', (x - 0.07, y - 0.025, z + 0.12), (x + 0.07, y - 0.019, z + 0.15), 'acero'))
    partes.append(caja_min_max('morsa_placa_t', (x - 0.07, y - 0.001, z + 0.12), (x + 0.07, y + 0.005, z + 0.15), 'acero'))
    partes.append(cilindro('morsa_tornillo', 0.011, 0.14, 'acero', 16, (x, y - 0.12, z + 0.08), 'Y'))
    partes.append(cilindro('morsa_palanca', 0.006, 0.2, 'acero', 12, (x, y - 0.19, z + 0.08), 'X'))
    for s in (-1, 1):
        partes.append(cilindro(f'morsa_bola{s}', 0.011, 0.02, 'acero', 12, (x + s * 0.1, y - 0.19, z + 0.08), 'X'))
    unir('morsa', partes)


def caja_herramientas(x, y, z):
    partes = []
    partes.append(caja_min_max('cajah_cuerpo', (x, y, z), (x + 0.4, y + 0.2, z + 0.16), 'plastico_rojo', 0.01))
    partes.append(caja_min_max('cajah_tapa', (x - 0.005, y - 0.005, z + 0.16), (x + 0.405, y + 0.205, z + 0.19), 'plastico_rojo', 0.012))
    partes.append(caja_min_max('cajah_manija', (x + 0.12, y + 0.08, z + 0.19), (x + 0.28, y + 0.12, z + 0.215), 'plastico_negro', 0.008))
    for s in (0.04, 0.33):
        partes.append(caja_min_max(f'cajah_traba{s}', (x + s, y - 0.012, z + 0.12), (x + s + 0.035, y, z + 0.17), 'metal_gris', 0.003))
    unir('caja_herramientas', partes)


def trapo(x, y, z):
    """Trapo arrugado: una grilla con ruido."""
    random.seed(9)
    verts, caras = [], []
    n = 14
    for i in range(n + 1):
        for j in range(n + 1):
            u, v = i / n, j / n
            px = x + (u - 0.5) * 0.3 + random.uniform(-0.006, 0.006)
            py = y + (v - 0.5) * 0.24 + random.uniform(-0.006, 0.006)
            borde = min(u, v, 1 - u, 1 - v)
            pz = z + 0.002 + 0.025 * math.sin(u * 7.1 + v * 3.3) ** 2 * min(1, borde * 5) + random.uniform(0, 0.004)
            verts.append((px, py, pz))
    for i in range(n):
        for j in range(n):
            a = i * (n + 1) + j
            caras.append((a, a + n + 1, a + n + 2, a + 1))
    malla('trapo', verts, caras, 'trapo', suave=True)


def tablero():
    """Tablero perforado con las siluetas pintadas de cada herramienta."""
    usar('estatico')
    t = TABLERO
    partes = []
    partes.append(caja_min_max('tablero_placa', (t['x0'], t['y'] - 0.012, t['z0']), (t['x1'], t['y'], t['z1']), 'tablero', 0.002))
    # listones de separación detrás (marco)
    for z in (t['z0'] + 0.02, t['z1'] - 0.02):
        partes.append(caja_min_max(f'tablero_liston{z}', (t['x0'] - 0.02, t['y'] - 0.016, z - 0.025), (t['x1'] + 0.02, t['y'] - 0.012, z + 0.025), 'madera', 0.003))
    unir('tablero', partes)
    # calco de siluetas (un plano adelante del tablero; la textura se dibuja aparte)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    for v in bm.verts:
        v.co = Vector((t['x0'] + (v.co.x + 0.5) * (t['x1'] - t['x0']), t['y'] - 0.0125, t['z0'] + (v.co.y + 0.5) * (t['z1'] - t['z0'])))
    s = desde_bmesh('tablero_siluetas', bm, 'silueta')
    s['calco'] = True


def estanteria():
    """Estantería metálica en la pared derecha con latas, bidones y repuestos sin marca."""
    usar('estatico')
    x1 = X1 - 0.02
    x0 = x1 - 0.42
    y0, y1 = -1.9, -0.7
    partes = []
    for px in (x0, x1 - 0.035):
        for py in (y0, y1 - 0.035):
            partes.append(angulo_vertical(f'est_pata{px}{py}', px + 0.0175, py + 0.0175, 0, 2.0))
    niveles = (0.12, 0.62, 1.12, 1.62, 1.98)
    for z in niveles:
        partes.append(caja_min_max(f'est_bandeja{z}', (x0, y0, z - 0.02), (x1, y1, z), 'metal_pintado', 0.002))
        partes.append(caja_min_max(f'est_labio{z}', (x0, y0, z - 0.035), (x0 + 0.004, y1, z), 'metal_pintado'))
    unir('estanteria', partes)
    random.seed(2)
    # latas y bidones
    for k, z in enumerate(niveles[:4]):
        y = y0 + 0.08
        while y < y1 - 0.1:
            tipo = random.random()
            if tipo < 0.45:
                r = 0.05 + random.random() * 0.02
                h = 0.13 + random.random() * 0.08
                lata(f'lata{k}_{y:.2f}', x0 + 0.12 + random.random() * 0.15, y + r, z, r, h)
                y += 2 * r + 0.03
            elif tipo < 0.75:
                w = 0.12 + random.random() * 0.06
                bidon(f'bidon{k}_{y:.2f}', x0 + 0.08, y, z, w)
                y += w + 0.04
            else:
                w = 0.15 + random.random() * 0.12
                caja_min_max(f'caja_rep{k}_{y:.2f}', (x0 + 0.05, y, z), (x0 + 0.05 + 0.25 + random.random() * 0.08, y + w, z + 0.08 + random.random() * 0.12), 'carton', 0.004)
                y += w + 0.03
    # cubiertas apiladas en el piso al lado de la estantería
    for i in range(3):
        cubierta(f'pila_cubierta{i}', (X1 - 0.38, -0.25, 0.09 + i * 0.178), girada=True)


def lata(nombre, x, y, z, r, h):
    o = torno(nombre, [(0, 0), (r * 0.94, 0), (r, 0.006), (r, h - 0.008), (r * 0.94, h), (r * 0.3, h + 0.004), (0, h + 0.004)], 'lata', 24, angulo_duro=50)
    o.location = (x, y, z)
    return o


def bidon(nombre, x, y, z, w):
    partes = [caja_min_max(nombre + 'c', (x, y, z), (x + 0.22, y + w, z + 0.26), 'plastico_amarillo' if random.random() < 0.5 else 'plastico_rojo', 0.02)]
    partes.append(cilindro(nombre + 'tapa', 0.022, 0.03, 'plastico_negro', 16, (x + 0.05, y + w / 2, z + 0.275)))
    partes.append(caja_min_max(nombre + 'asa', (x + 0.1, y + w / 2 - 0.012, z + 0.24), (x + 0.2, y + w / 2 + 0.012, z + 0.3), partes[0].data.materials[0].name, 0.01))
    return unir(nombre, partes)


def cubierta(nombre, centro, girada=False):
    """Cubierta 175/70 R13 suelta (sin llanta)."""
    r_ext, r_int, ancho = 0.288, 0.165, 0.175
    perfil = [(r_int, -ancho * 0.36), (r_int + 0.02, -ancho * 0.45), (r_ext - 0.05, -ancho * 0.5), (r_ext - 0.012, -ancho * 0.47),
              (r_ext, -ancho * 0.4), (r_ext, ancho * 0.4), (r_ext - 0.012, ancho * 0.47), (r_ext - 0.05, ancho * 0.5),
              (r_int + 0.02, ancho * 0.45), (r_int, ancho * 0.36), (r_int + 0.01, 0), (r_int, -ancho * 0.36)]
    o = torno(nombre, perfil, 'goma', 48, angulo_duro=60)
    o.location = centro
    if not girada:
        o.rotation_euler = (0, math.radians(90), 0)
    return o


def accesorios():
    """Cosas sueltas: crique carrito, alargue colgado, bidón de aceite usado, cartel sin texto."""
    usar('estatico')
    # crique carrito en el piso, al costado izquierdo del auto
    x, y = -1.75, 1.6
    partes = []
    partes.append(caja_min_max('crique_chasis', (x - 0.09, y - 0.3, 0.05), (x + 0.09, y + 0.3, 0.13), 'plastico_rojo', 0.012))
    for s in (-1, 1):
        for py in (y - 0.26, y + 0.24):
            partes.append(cilindro(f'crique_rueda{s}{py}', 0.04, 0.03, 'metal_gris', 16, (x + s * 0.105, py, 0.04), 'X'))
    partes.append(caja_min_max('crique_brazo', (x - 0.04, y - 0.05, 0.1), (x + 0.04, y + 0.3, 0.17), 'plastico_rojo', 0.01))
    partes.append(cilindro('crique_plato', 0.05, 0.02, 'metal_gris', 20, (x, y + 0.3, 0.18)))
    partes.append(tubo('crique_palanca', [(x, y - 0.28, 0.12), (x, y - 0.6, 0.3), (x, y - 0.9, 0.5)], 0.013, 'metal_pintado', 10))
    unir('crique', partes)
    # alargue enrollado colgado en la pared izquierda
    pts = []
    for i in range(80):
        a = i / 80 * 2 * math.pi * 3.2
        pts.append((X0 + 0.04 + 0.012 * math.sin(i * 1.7), 1.0 + 0.15 * math.cos(a), 1.5 + 0.15 * math.sin(a) - i * 0.0006))
    tubo('alargue', pts, 0.0045, 'plastico_amarillo', 8)
    cilindro('alargue_gancho', 0.006, 0.08, 'metal_gris', 8, (X0 + 0.04, 1.0, 1.66), 'X')
    # bidón de aceite usado y embudo cerca del banco
    bidon('bidon_usado', 0.1, Y1 - 0.45, 0.0, 0.2)
    torno('embudo', [(0.012, 0), (0.014, 0.08), (0.09, 0.18), (0.095, 0.185)], 'plastico_amarillo', 24).location = (0.24, Y1 - 0.35, 0.28)
    # matafuego en la pared izquierda (sin marcas)
    m = torno('matafuego', [(0, 0), (0.07, 0), (0.075, 0.01), (0.075, 0.42), (0.06, 0.47), (0.02, 0.5), (0, 0.5)], 'plastico_rojo', 24)
    m.location = (X0 + 0.1, 2.4, 0.5)
    caja_min_max('matafuego_valv', (X0 + 0.09, 2.38, 1.0), (X0 + 0.11, 2.42, 1.06), 'metal_gris', 0.004)
    caja_min_max('matafuego_soporte', (X0 + 0.004, 2.36, 0.75), (X0 + 0.03, 2.44, 0.8), 'metal_pintado', 0.003)
    # cajón para el carrito de pie bajo la ventana: banqueta
    x, y = -1.7, -2.4
    p = [caja_min_max('banqueta_asiento', (x - 0.17, y - 0.17, 0.45), (x + 0.17, y + 0.17, 0.48), 'madera', 0.006)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(caja_min_max(f'banqueta_pata{sx}{sy}', (x + sx * 0.14 - 0.015, y + sy * 0.14 - 0.015, 0), (x + sx * 0.14 + 0.015, y + sy * 0.14 + 0.015, 0.45), 'madera', 0.003))
    unir('banqueta', p)


def construir():
    piso()
    paredes()
    ventana()
    porton()
    luces_techo()
    banco()
    tablero()
    estanteria()
    accesorios()
