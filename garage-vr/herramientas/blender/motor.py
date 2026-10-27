# Vano del motor y motor 1.6 tipo AP (longitudinal, la distribución hacia adelante).
# El motor se arma en milímetros con los ejes del taller (ap16.ts): X a lo largo del cigüeñal (cilindro 1 = lado
# distribución), Y arriba, Z a lo ancho (admisión y escape en -Z). Después se pasa al auto.
import json
import math
import os
from comun import *
import auto as A

AQUI = os.path.dirname(os.path.abspath(__file__))
DATOS = json.load(open(os.path.join(AQUI, '..', '..', 'datos', 'ap16-tapa.json')))
G = DATOS['geometria']
TAPA = next(p for p in DATOS['piezas'] if p['id'] == 'tapa-valvulas')
TUERCAS = TAPA['fijaciones']

# dónde va el motor en el auto (coordenadas del auto, metros): centro del cigüeñal
OX, OY, OZ = -0.05, 1.38, 0.36

# motor (mm) → auto (m): X del motor hacia atrás del auto, Z del motor hacia la izquierda, Y arriba
M_MOTOR = (Matrix.Translation((A.CX + OX, A.CY + OY, OZ)) @
           Matrix(((0, 0, -1, 0), (-1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1))) @ Matrix.Scale(0.001, 4))
M_AUTO = Matrix.Translation((A.CX, A.CY, 0))


def a_mundo(p):
    """Punto del motor (mm) a coordenadas del mundo."""
    return M_MOTOR @ Vector(p)


def rbox(nombre, x0, x1, y0, y1, z0, z1, mat, r=0.0, seg=2):
    return caja_min_max(nombre, (x0, y0, z0), (x1, y1, z1), mat, r, seg)


def cil(nombre, r, eje, a0, a1, centro2, mat, lados=32, r2=None):
    """Cilindro en el espacio del motor. eje 'x'|'y'|'z', de a0 a a1, centro2 = las otras dos coordenadas."""
    alto = abs(a1 - a0)
    m = (a0 + a1) / 2
    c1, c2 = centro2
    if eje == 'x':
        return cilindro(nombre, r, alto, mat, lados, (m, c1, c2), 'X', r2)
    if eje == 'y':
        o = cilindro(nombre, r, alto, mat, lados, (c1, m, c2), 'Y', r2)
        o.rotation_euler = (math.radians(-90), 0, 0)
        return o
    return cilindro(nombre, r, alto, mat, lados, (c1, c2, m), 'Z', r2)


def hexagono(nombre, entre_caras, alto, mat, centro, eje='y', chaflan=True):
    r = entre_caras / 2 / math.cos(math.pi / 6)
    perfil = [(0, 0), (r * 0.92, 0), (r, alto * 0.12), (r, alto * 0.88), (r * 0.92, alto), (0, alto)] if chaflan else [(0, 0), (r, 0), (r, alto), (0, alto)]
    o = torno(nombre, perfil, mat, 6, angulo_duro=20)
    o.rotation_euler = (0, 0, math.radians(30))
    aplicar(o)
    if eje == 'y':
        o.rotation_euler = (math.radians(-90), 0, 0)
    elif eje == 'x':
        o.rotation_euler = (0, math.radians(90), 0)
    o.location = centro
    return o


ENG = []  # objetos del motor (en mm) que hay que pasar al auto
DIN = []


def reg(o):
    ENG.append(o)
    return o


# ───────────────────────── Motor ─────────────────────────

def bloque():
    usar('estatico')
    p = []
    p.append(rbox('bloque_c', -210, 210, -70, 216, -100, 100, 'fundicion', 6))
    # nervios y faldón
    for x in (-132, -44, 44, 132):
        for s in (-1, 1):
            p.append(rbox(f'bloque_nervio{x}{s}', x - 5, x + 5, -60, 190, s * 100 - 4, s * 100 + 4, 'fundicion', 1.5))
    # cárter de chapa
    p.append(rbox('carter', -205, 205, -175, -68, -95, 95, 'chapa_tapa', 14, 3))
    p.append(rbox('carter_brida', -212, 212, -74, -66, -104, 104, 'chapa_tapa', 3))
    for x in range(-190, 200, 38):
        for s in (-1, 1):
            p.append(cil(f'carter_b{x}{s}', 4.5, 'y', -80, -66, (x, s * 100), 'acero', 6))
    # tapón de vaciado
    p.append(hexagono('carter_tapon', 19, 10, 'acero', (120, -184, 20)))
    # campana / caja de cambios atrás (aluminio)
    p.append(cil('campana', 150, 'x', 210, 300, (60, 0), 'aluminio_fundido', 40, 175))
    p.append(rbox('caja', 300, 720, -120, 180, -140, 140, 'aluminio_fundido', 30, 3))
    for x in range(330, 720, 60):
        p.append(rbox(f'caja_nervio{x}', x - 4, x + 4, -110, 190, -100, 100, 'aluminio_fundido', 2))
    p.append(cil('caja_tapa', 110, 'x', 720, 760, (40, 0), 'aluminio_fundido', 36))
    # filtro de aceite (sin marca) y su base, del lado de admisión abajo
    f = torno('filtro_aceite', [(0, 0), (38, 0), (44, 6), (44, 92), (40, 100), (12, 102), (0, 102)], 'lata', 36)
    f.rotation_euler = (math.radians(90), 0, 0)
    f.location = (60, 40, -100)
    p.append(f)
    # varilla de aceite: tubo y mango amarillo
    p.append(tubo('varilla_tubo', [(-30, 40, 104), (-30, 200, 125), (-40, 330, 150)], 4, 'acero', 8))
    mango = torno('varilla_mango', [(0, 0), (6, 0), (8, 8), (14, 20), (16, 30), (0, 32)], 'plastico_amarillo', 16)
    mango.location = (-40, 330, 150)
    p.append(mango)
    o = unir('motor_bloque', p)
    return reg(o)


def tapa_cilindros():
    usar('estatico')
    y0 = 216 + 1.5
    p = []
    p.append(rbox('tapa_cil', -212, 212, y0, G['headTopY'], -100, 100, 'aluminio_fundido', 4))
    # torres del árbol (se ven sacando la tapa de válvulas)
    for x in (-176, -88, 0, 88, 176):
        p.append(rbox(f'torre{x}', x - 10, x + 10, G['headTopY'] - 2, G['camY'], -40, 40, 'aluminio_fundido', 2))
        # sombrerete con sus tuercas
        p.append(rbox(f'sombrerete{x}', x - 10, x + 10, G['camY'], 322, -40, 40, 'aluminio_fundido', 5))
        for s in (-1, 1):
            p.append(cil(f'esparrago_s{x}{s}', 4, 'y', 322, 332, (x, s * 30), 'acero', 10))
            p.append(hexagono(f'tuerca_s{x}{s}', 13, 8, 'acero_aceitado', (x, 322, s * 30)))
    # árbol de levas con sus levas
    p.append(cil('arbol', 12, 'x', -252, 206, (G['camY'], 0), 'acero_aceitado', 24))
    fases = {1: 0, 3: 90, 4: 180, 2: 270}
    valv = [(1, 'E', -150), (1, 'A', -114), (2, 'A', -62), (2, 'E', -26), (3, 'E', 26), (3, 'A', 62), (4, 'A', 114), (4, 'E', 150)]
    for cyl, k, x in valv:
        base = 90 + fases[cyl] + (55 if k == 'A' else -55)
        pts = []
        for i in range(48):
            a = 2 * math.pi * i / 48
            d = math.cos(a - math.radians(base))
            r = 18 + 8.5 * max(0, d) ** 3
            pts.append((math.cos(a) * r, math.sin(a) * r))
        leva = extruir_contorno(f'leva{x}', pts, 14, 'acero_aceitado', -7)
        leva.rotation_euler = (0, math.radians(90), 0)
        leva.location = (x, G['camY'], 0)
        p.append(leva)
        # botador debajo de la leva
        p.append(cil(f'botador{x}', 17.4, 'y', 260, 282, (x, 0), 'acero_aceitado', 24))
    # aceite que queda en la tapa (un charco brillante entre las torres)
    p.append(rbox('aceite_tapa', -205, 205, G['headTopY'] - 1, G['headTopY'] + 0.5, -82, 82, 'acero_aceitado'))
    # espárragos de la tapa de válvulas (de los datos del taller)
    for f in TUERCAS:
        x, y, z = f['pos']
        p.append(cil(f'esparrago_{f["id"]}', 3, 'y', G['headTopY'], y + 14, (x, z), 'acero', 12))
    # nervios laterales y bridas
    for x in (-176, -88, 0, 88, 176):
        p.append(rbox(f'tapa_cil_nervio{x}', x - 3, x + 3, y0, G['headTopY'] - 4, 99, 104, 'aluminio_fundido', 1))
    # caja del termostato (atrás)
    p.append(rbox('termostato', 212, 245, 236, 278, 20, 70, 'aluminio_fundido', 6))
    p.append(cil('termostato_salida', 17, 'x', 245, 275, (258, 45), 'aluminio_fundido', 20))
    # retén y tapa del árbol adelante
    p.append(cil('reten_arbol', 24, 'x', -222, -210, (G['camY'], 0), 'aluminio_fundido', 24))
    # junta de tapa de cilindros (borde visible)
    p.append(rbox('junta_tapa_cil', -213, 213, 216, 217.5, -101, 101, 'cobre'))
    return reg(unir('motor_tapa', p))


def bujias_y_cables():
    """Bujías del lado opuesto a los múltiples (+Z), cables al distribuidor."""
    usar('estatico')
    p = []
    dist = (205, 150, 92)
    p.append(cil('distribuidor_cuerpo', 28, 'y', 60, 140, (205, 92), 'aluminio_fundido', 24))
    tapa = torno('distribuidor_tapa', [(0, 0), (40, 0), (42, 5), (40, 32), (32, 40), (0, 42)], 'plastico_negro', 32)
    tapa.rotation_euler = (math.radians(-90), 0, 0)
    tapa.location = (205, 140, 92)
    p.append(tapa)
    torres = []
    for k in range(5):
        a = k * 2 * math.pi / 5
        tx, tz = 205 + 26 * math.cos(a), 92 + 26 * math.sin(a)
        if k == 0:
            tx, tz = 205, 92
        torres.append((tx, 182, tz))
        p.append(cil(f'dist_torre{k}', 6.5, 'y', 172, 186, (tx, tz), 'plastico_negro', 12))
    # bobina en la torre del parallamas (en el motor la dejamos atrás arriba)
    for i, x in enumerate(G['cylX']):
        bx, by, bz = x, 262, 112
        p.append(cil(f'bujia_capuchon{i}', 9, 'z', 100, 150, (bx, by), 'plastico_rojo', 16))
        t = torres[1 + i]
        p.append(tubo(f'cable_bujia{i}', [(bx, by, 150), (bx, by + 30, 175), ((bx + t[0]) / 2, 230, 180), (t[0], 230, t[2]), (t[0], 190, t[2])], 4, 'cable', 8))
    p.append(tubo('cable_bobina', [(205, 190, 92), (230, 240, 110), (330, 300, 150), (420, 330, 210)], 4, 'cable', 8))
    return reg(unir('motor_encendido', p))


def admision_escape():
    usar('estatico')
    p = []
    # múltiple de admisión: cuatro conductos al carburador
    carb = (20, 330, -265)
    for i, x in enumerate(G['cylX']):
        p.append(tubo(f'admision{i}', [(x * 0.95, 275, -100), (x * 0.9, 285, -150), (x * 0.4, 300, -215), (carb[0] + x * 0.12, 305, carb[2] + 10)], 17, 'aluminio_fundido', 16, res=6))
    p.append(rbox('admision_brida', -200, 200, 262, 296, -108, -98, 'aluminio_fundido', 3))
    p.append(rbox('carburador_base', carb[0] - 45, carb[0] + 45, 300, 318, carb[2] - 45, carb[2] + 45, 'aluminio_fundido', 4))
    p.append(rbox('carburador', carb[0] - 40, carb[0] + 40, 318, 372, carb[2] - 42, carb[2] + 42, 'aluminio_fundido', 6))
    p.append(rbox('carb_cuba', carb[0] + 40, carb[0] + 62, 325, 365, carb[2] - 30, carb[2] + 20, 'aluminio_fundido', 5))
    p.append(cil('carb_mariposa_eje', 4, 'z', carb[2] - 55, carb[2] + 55, (carb[0] - 10, 345), 'acero', 10))
    # filtro de aire redondo sobre el carburador
    filtro = torno('filtro_aire', [(0, 0), (60, 0), (150, 0), (156, 4), (156, 52), (150, 58), (60, 60), (14, 62), (0, 62)], 'chapa_tapa', 64)
    filtro.rotation_euler = (math.radians(-90), 0, 0)
    filtro.location = (carb[0], 372, carb[2] - 25)
    p.append(filtro)
    p.append(hexagono('filtro_aire_mariposa', 22, 12, 'acero', (carb[0], 434, carb[2] - 25)))
    # trompa del filtro hacia adelante
    p.append(tubo('filtro_aire_trompa', [(carb[0] - 140, 400, carb[2] - 25), (-260, 400, carb[2] - 10), (-330, 390, -260)], 32, 'chapa_tapa', 16))
    # múltiple de escape oxidado debajo
    for i, x in enumerate(G['cylX']):
        p.append(tubo(f'escape{i}', [(x, 240, -100), (x, 238, -130), (x * 0.5 + 60, 210, -150), (100, 120, -160)], 16, 'oxido', 14, res=6))
    p.append(rbox('escape_brida', -200, 200, 226, 254, -108, -98, 'oxido', 3))
    p.append(cil('escape_bajada', 26, 'y', -60, 130, (110, -160), 'oxido', 20))
    # pantalla térmica
    pts = [(-190, 0), (190, 0), (190, 60), (-190, 60)]
    sh = rbox('pantalla_termica', -190, 190, 180, 262, -168, -162, 'chapa_galv', 2)
    p.append(sh)
    # caño de combustible al carburador con filtro transparente
    p.append(tubo('nafta', [(carb[0] + 62, 345, carb[2]), (100, 360, -260), (200, 340, -300), (330, 300, -310)], 4, 'goma', 8))
    p.append(cil('filtro_nafta', 14, 'x', 140, 190, (352, -282), 'plastico_traslucido', 16))
    # cable del acelerador
    p.append(tubo('cable_acel', [(carb[0] - 40, 350, carb[2] + 30), (100, 380, -150), (300, 400, -120), (480, 420, -60)], 2.5, 'cable', 6))
    # manguera del respiradero: de la tapa de válvulas al filtro de aire
    o = reg(unir('motor_admision', p))
    # manguera del respiradero: de la tapa de válvulas al filtro de aire. Se saca antes que la tapa.
    usar('dinamico')
    piv = Vector((carb[0] + 40, 395, carb[2] + 70))
    pts = [(150, 330, -106), (150, 332, -135), (130, 370, -185), tuple(piv)]
    h = tubo('manguera_respiradero', [tuple(Vector(q) - piv) for q in pts], 9, 'goma', 12, res=8)
    abr = cil('abrazadera_resp', 10.5, 'z', -122, -116, (150, 331), 'acero', 16)
    abr.data.transform(Matrix.Translation(-piv))
    h = unir('manguera_respiradero', [h, abr])
    h.location = piv
    h['pieza'] = 'manguera-respiradero'
    DIN.append(h)
    reg(h)
    usar('anclas')
    reg(ancla('ancla_respiradero_boca', (150, 330, -106)))
    reg(ancla('ancla_respiradero_pivote', tuple(piv)))
    usar('estatico')
    return o


def frente_motor():
    """Cubrecorrea, poleas, alternador y bomba de agua (adelante)."""
    usar('estatico')
    p = []
    # cubrecorrea plástico de dos piezas, con nervios
    up = []
    for i in range(33):
        a = math.pi * i / 32
        up.append((G['camY'] + 78 * math.cos(a - math.pi / 2) * 0 + 78 * math.sin(a) * 0, 0))
    cub_sup = torno('cubrecorrea_sup', [(0, 0), (82, 0), (84, 4), (84, 26), (80, 30), (0, 30)], 'plastico_negro', 48)
    cub_sup.rotation_euler = (0, math.radians(-90), 0)
    cub_sup.location = (-238, G['camY'], 0)
    p.append(cub_sup)
    p.append(rbox('cubrecorrea_med', -268, -238, 90, 300, -70, 70, 'plastico_negro', 8))
    p.append(rbox('cubrecorrea_inf', -268, -238, -40, 120, -80, 110, 'plastico_negro', 10))
    for k in range(6):
        p.append(rbox(f'cubrecorrea_nervio{k}', -270, -266, 110 + k * 30, 114 + k * 30, -66, 66, 'plastico_negro', 1))
    # polea del cigüeñal (correa en V)
    p.append(cil('polea_cig', 70, 'x', -300, -270, (0, 0), 'fundicion', 40))
    p.append(cil('polea_cig_canal', 62, 'x', -292, -278, (0, 0), 'fundicion', 40))
    p.append(hexagono('bulon_cig', 19, 12, 'acero', (-312, 0, 0), 'x'))
    # bomba de agua y su polea
    p.append(cil('polea_bomba', 55, 'x', -296, -276, (150, 135), 'metal_gris', 32))
    # alternador
    alt = (-210, 40, -165)
    p.append(cil('alternador', 62, 'x', -200, -60, (alt[1], alt[2]), 'aluminio_fundido', 32))
    for k in range(12):
        a = k * math.pi / 6
        p.append(rbox(f'alt_aleta{k}', -205, -195, alt[1] + 50 * math.sin(a) - 4, alt[1] + 50 * math.sin(a) + 4, alt[2] + 50 * math.cos(a) - 4, alt[2] + 50 * math.cos(a) + 4, 'aluminio_fundido', 1))
    p.append(cil('alt_polea', 32, 'x', -296, -276, (alt[1], alt[2]), 'acero', 24))
    p.append(cil('alt_ventilador', 52, 'x', -230, -205, (alt[1], alt[2]), 'metal_gris', 24))
    # correa en V (lazo alrededor de las tres poleas)
    centros = [(0, 0, 66), (150, 135, 52), (alt[1], alt[2], 30)]
    pts = []
    for cy, cz, r in centros:
        for k in range(10):
            a = 2 * math.pi * k / 10
            pts.append((cy + r * math.sin(a), cz + r * math.cos(a)))
    # contorno convexo simple
    pts = convexo(pts)
    pts.append(pts[0])
    p.append(tubo('correa_v', [(-287, y, z) for y, z in pts], 5, 'goma', 6, res=2))
    p.append(cil('alt_cable', 3, 'z', alt[2], alt[2] + 120, (-130, alt[1] + 60), 'cable_rojo', 8))
    return reg(unir('motor_frente', p))


def convexo(puntos):
    pts = sorted(set(puntos))
    def cruz(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    inf, sup = [], []
    for p in pts:
        while len(inf) >= 2 and cruz(inf[-2], inf[-1], p) <= 0:
            inf.pop()
        inf.append(p)
    for p in reversed(pts):
        while len(sup) >= 2 and cruz(sup[-2], sup[-1], p) <= 0:
            sup.pop()
        sup.append(p)
    return inf[:-1] + sup[:-1]


def tapa_valvulas():
    """La tapa de válvulas (pieza que se saca), su junta y las 8 tuercas: cada una por separado."""
    usar('dinamico')
    y0 = G['headTopY'] + 1.5
    p = []
    brida = extruir_y('tv_brida', poligono_redondeado(-208, 208, -94, 94, 12), y0, 4.5, 'chapa_tapa',
                      agujeros=[list(reversed(poligono_redondeado(-196, 196, -80, 80, 6)))], bisel=0.6)
    p.append(brida)
    # cuerpo estampado: caja redondeada
    cuerpo = rbox('tv_cuerpo', -202, 202, y0 + 3, 360, -84, 84, 'chapa_tapa', 18, 5)
    p.append(cuerpo)
    # nervios estampados arriba
    for x in range(-160, 161, 40):
        p.append(rbox(f'tv_nervio{x}', x - 3.5, x + 3.5, 352, 365, -58, 58, 'chapa_tapa', 3, 3))
    # boca de llenado con tapa a rosca (plástico negro, estriada)
    p.append(cil('tv_boca', 24, 'y', 355, 366, (-70, 25), 'chapa_tapa', 32))
    tapa = torno('tv_tapa_aceite', [(0, 0), (30, 0), (31, 2), (31, 16), (28, 19), (0, 20)], 'plastico_negro', 36)
    tapa.rotation_euler = (math.radians(-90), 0, 0)
    tapa.location = (-70, 364, 25)
    p.append(tapa)
    for k in range(18):
        a = k * 2 * math.pi / 18
        p.append(rbox(f'tv_tapa_estria{k}', -70 + 31 * math.cos(a) - 1.8, -70 + 31 * math.cos(a) + 1.8, 367, 381, 25 + 31 * math.sin(a) - 1.8, 25 + 31 * math.sin(a) + 1.8, 'plastico_negro', 0.8))
    p.append(rbox('tv_tapa_ala', -92, -48, 383, 390, 21, 29, 'plastico_negro', 3))
    # respiradero (salida para la manguera, del lado de admisión)
    p.append(cil('tv_respiradero', 10, 'z', -110, -80, (150, 330), 'chapa_tapa', 20))
    p.append(cil('tv_respiradero_labio', 12, 'z', -105, -100, (150, 330), 'chapa_tapa', 20))
    # planchuelas de refuerzo sobre la brida, con los agujeros de los espárragos
    for s in (-1, 1):
        p.append(rbox(f'tv_planchuela{s}', -200, 200, y0 + 4.5, y0 + 7.5, s * 88 - 9, s * 88 + 9, 'chapa_tapa', 1.5))
    # sello de la boca de cada espárrago (arandela de goma)
    for f in TUERCAS:
        x, y, z = f['pos']
        p.append(cil(f'tv_arandela_{f["id"]}', 8, 'y', y0 + 7.5, y0 + 9, (x, z), 'junta_goma', 16))
    o = unir('tapa_valvulas', p)
    o['pieza'] = 'tapa-valvulas'
    DIN.append(o)
    reg(o)
    # junta de goma (queda sobre la tapa de cilindros)
    j = extruir_y('junta_tapa_valvulas', poligono_redondeado(-207, 207, -92, 92, 10), G['headTopY'], 1.5, 'junta_goma',
                  agujeros=[list(reversed(poligono_redondeado(-197, 197, -82, 82, 6)))])
    j['pieza'] = 'junta-tapa-valvulas'
    DIN.append(j)
    reg(j)
    # tuercas M6 con arandela (10 mm entre caras)
    for f in TUERCAS:
        x, y, z = f['pos']
        yt = y0 + 9
        h = hexagono(f'tuerca_{f["id"]}_h', f['medida'], 5.5, 'acero', (0, 0, 0))
        a = cil(f'tuerca_{f["id"]}_a', 6.5, 'y', -1.4, 0, (0, 0), 'acero', 16)
        t = unir(f'tuerca_{f["id"]}', [h, a])
        t.location = (x, yt + 1.4, z)
        t['pieza'] = f['id']
        DIN.append(t)
        reg(t)


def montar_motor():
    for o in ENG:
        o.matrix_basis = M_MOTOR @ o.matrix_basis
    for o in ENG:
        if o.type == 'MESH' and o not in DIN:
            aplicar(o)
    # las piezas dinámicas conservan el origen en su lugar de montaje (en metros)
    for o in DIN:
        aplicar_escala(o)
    # anclas de la tapa y de cada tuerca
    usar('anclas')
    for f in TUERCAS:
        x, y, z = f['pos']
        ancla(f'ancla_{f["id"]}', tuple(a_mundo((x, G['headTopY'] + 1.5 + 9 + 1.4, z))))
    ancla('ancla_tapa_valvulas', tuple(a_mundo((0, G['headTopY'] + 1.5, 0))))


def aplicar_escala(o):
    """Aplica rotación y escala pero deja la posición (el origen queda donde estaba)."""
    aplicar_mods(o)
    mw = o.matrix_basis.copy()
    loc, rot, esc = mw.decompose()
    o.data.transform(Matrix.LocRotScale(None, rot, esc))
    o.matrix_basis = Matrix.Translation(loc)
    if o.get('pieza') in ('tapa-valvulas', 'junta-tapa-valvulas'):
        # origen abajo al centro de la pieza (donde apoya)
        vs = [v.co for v in o.data.vertices]
        c = Vector(((min(v.x for v in vs) + max(v.x for v in vs)) / 2, (min(v.y for v in vs) + max(v.y for v in vs)) / 2, min(v.z for v in vs)))
        o.data.transform(Matrix.Translation(-c))
        o.matrix_basis = Matrix.Translation(loc + c)


def aplicar_mods(o):
    if not o.modifiers:
        return
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.clear()
    viejo = o.data
    o.data = me
    if viejo.users == 0:
        bpy.data.meshes.remove(viejo)


# ───────────────────────── Vano (en coordenadas del auto, metros) ─────────────────────────

def vano():
    usar('estatico')
    p = []
    Yp = A.Y_PARABRISAS
    # parallamas con bandeja (debajo del parabrisas)
    p.append(caja_min_max('parallamas', (-0.70, Yp - 0.02, 0.22), (0.70, Yp + 0.0, 0.86), 'pintura_auto', 0.004))
    p.append(caja_min_max('bandeja_parabrisas', (-0.72, Yp - 0.01, 0.82), (0.72, Yp + 0.12, 0.835), 'plastico_negro', 0.006))
    for k in range(18):
        p.append(caja_min_max(f'bandeja_ranura{k}', (-0.6 + k * 0.07, Yp + 0.03, 0.834), (-0.6 + k * 0.07 + 0.04, Yp + 0.09, 0.837), 'goma'))
    # túnel de la caja en el parallamas
    p.append(caja_min_max('parallamas_tunel', (-0.18, Yp - 0.01, 0.22), (0.10, Yp + 0.12, 0.40), 'pintura_auto', 0.04))
    # torretas y polleras internas
    for sx in (-1, 1):
        x = sx * 0.62
        p.append(caja_min_max(f'pollera{sx}', (x - 0.004, Yp, 0.28), (x + 0.004, 1.78, 0.80), 'pintura_auto', 0.003))
        p.append(caja_min_max(f'pollera_ala{sx}', (min(x, sx * 0.755), Yp, 0.80), (max(x, sx * 0.755), 1.84, 0.806), 'pintura_auto', 0.003))
        torreta = torno(f'torreta{sx}', [(0.095, 0), (0.095, 0.035), (0.085, 0.06), (0.06, 0.072), (0.0, 0.074)], 'pintura_auto', 40, angulo_duro=50)
        torreta.location = (sx * 0.56, A.EJE_D, 0.755)
        p.append(torreta)
        p.append(cilindro(f'amort_vastago{sx}', 0.011, 0.04, 'acero', 16, (sx * 0.56, A.EJE_D, 0.84)))
        p.append(cilindro(f'amort_cazoleta{sx}', 0.035, 0.012, 'metal_gris', 24, (sx * 0.56, A.EJE_D, 0.832)))
        for k in range(3):
            a = k * 2 * math.pi / 3 + 0.4
            p.append(cilindro(f'torreta_tuerca{sx}{k}', 0.008, 0.008, 'acero', 6, (sx * 0.56 + 0.062 * math.cos(a), A.EJE_D + 0.062 * math.sin(a), 0.831)))
    # travesaño delantero (porta radiador)
    p.append(caja_min_max('porta_radiador', (-0.74, 1.79, 0.70), (0.74, 1.85, 0.76), 'pintura_auto', 0.006))
    p.append(caja_min_max('porta_radiador_inf', (-0.74, 1.76, 0.24), (0.74, 1.84, 0.32), 'pintura_auto', 0.006))
    p.append(caja_min_max('cerradura_capo', (-0.03, 1.76, 0.70), (0.03, 1.79, 0.76), 'metal_gris', 0.003))
    # radiador con ventilador
    p.append(caja_min_max('radiador_panal', (-0.62, 1.72, 0.32), (0.22, 1.76, 0.68), 'metal_gris', 0.002))
    for k in range(32):
        p.append(caja_min_max(f'radiador_aleta{k}', (-0.6 + k * 0.025, 1.715, 0.33), (-0.6 + k * 0.025 + 0.003, 1.765, 0.67), 'fundicion'))
    p.append(caja_min_max('radiador_tanque_i', (-0.66, 1.70, 0.30), (-0.62, 1.78, 0.70), 'plastico_negro', 0.008))
    p.append(caja_min_max('radiador_tanque_d', (0.22, 1.70, 0.30), (0.26, 1.78, 0.70), 'plastico_negro', 0.008))
    p.append(cilindro('radiador_tapa', 0.022, 0.018, 'metal_gris', 20, (0.24, 1.74, 0.715)))
    p.append(cilindro('ventilador_aro', 0.17, 0.05, 'plastico_negro', 40, (-0.2, 1.685, 0.5), 'Y'))
    p.append(cilindro('ventilador_motor', 0.05, 0.07, 'metal_gris', 24, (-0.2, 1.63, 0.5), 'Y'))
    for k in range(5):
        a = k * 2 * math.pi / 5
        pala = caja(f'ventilador_pala{k}', (-0.2 + 0.09 * math.cos(a), 1.68, 0.5 + 0.09 * math.sin(a)), (0.13, 0.008, 0.05), 'plastico_negro', 0.004)
        pala.rotation_euler = (math.radians(25), -a, 0)
        pala.rotation_mode = 'YXZ'
        p.append(pala)
    # mangueras del radiador al motor (con abrazaderas)
    term = a_mundo((260, 258, 45)) - Vector((A.CX, A.CY, 0))
    bomba = a_mundo((-150, 140, 135)) - Vector((A.CX, A.CY, 0))
    p.append(tubo('manguera_sup', [tuple(term), (term.x - 0.06, term.y + 0.05, term.z - 0.02), (-0.3, 1.2, 0.6), (-0.52, 1.5, 0.64), (-0.64, 1.7, 0.66)], 0.019, 'goma', 14, res=6))
    p.append(tubo('manguera_inf', [tuple(bomba), (bomba.x - 0.05, bomba.y + 0.08, bomba.z - 0.05), (0.05, 1.66, 0.36), (0.24, 1.71, 0.36)], 0.019, 'goma', 14, res=6))
    # batería (sin marca) del lado izquierdo, con soporte
    bx, by = -0.47, 1.47
    p.append(caja_min_max('bat_soporte', (bx - 0.14, by - 0.1, 0.39), (bx + 0.14, by + 0.1, 0.41), 'fundicion', 0.003))
    p.append(caja_min_max('bat_caja', (bx - 0.13, by - 0.088, 0.41), (bx + 0.13, by + 0.088, 0.58), 'plastico_negro', 0.008))
    p.append(caja_min_max('bat_tapa', (bx - 0.132, by - 0.09, 0.575), (bx + 0.132, by + 0.09, 0.59), 'plastico_negro', 0.006))
    for k in range(6):
        p.append(cilindro(f'bat_tapon{k}', 0.011, 0.006, 'plastico_negro', 12, (bx - 0.09 + k * 0.036, by + 0.03, 0.593)))
    p.append(caja_min_max('bat_pos', (bx + 0.08, by - 0.07, 0.59), (bx + 0.115, by - 0.035, 0.615), 'plastico_rojo', 0.005))
    p.append(caja_min_max('bat_neg', (bx - 0.115, by - 0.07, 0.59), (bx - 0.08, by - 0.035, 0.615), 'plastico_negro', 0.005))
    p.append(caja_min_max('bat_traba', (bx - 0.14, by - 0.012, 0.59), (bx + 0.14, by + 0.012, 0.598), 'metal_gris', 0.002))
    p.append(tubo('bat_cable_pos', [(bx + 0.1, by - 0.05, 0.615), (bx + 0.12, by - 0.12, 0.6), (0.0, 1.2, 0.45), (0.15, 1.1, 0.35)], 0.008, 'cable_rojo', 10))
    p.append(tubo('bat_cable_neg', [(bx - 0.1, by - 0.05, 0.615), (bx - 0.14, by - 0.12, 0.58), (-0.6, 1.3, 0.55)], 0.008, 'cable', 10))
    # servofreno, bomba de freno y depósito en el parallamas (lado del conductor)
    sx = -0.42
    servo = torno('servofreno', [(0, 0), (0.11, 0), (0.12, 0.02), (0.12, 0.08), (0.11, 0.1), (0.04, 0.105), (0, 0.105)], 'plastico_negro', 48)
    servo.rotation_euler = (math.radians(-90), 0, 0)
    servo.location = (sx, Yp + 0.0, 0.6)
    p.append(servo)
    p.append(cilindro('bomba_freno', 0.025, 0.16, 'aluminio_fundido', 24, (sx, Yp + 0.18, 0.6), 'Y'))
    dep = caja_min_max('deposito_freno', (sx - 0.05, Yp + 0.12, 0.63), (sx + 0.05, Yp + 0.2, 0.71), 'plastico_traslucido', 0.01)
    p.append(dep)
    p.append(cilindro('deposito_freno_tapa', 0.025, 0.02, 'plastico_amarillo', 20, (sx, Yp + 0.16, 0.72)))
    for k, d in enumerate((-0.012, 0.012)):
        p.append(tubo(f'cano_freno{k}', [(sx + d, Yp + 0.24, 0.6), (sx + d - 0.05, Yp + 0.3, 0.55), (-0.62, 1.0, 0.5), (-0.6, 1.1, 0.45)], 0.0025, 'cobre', 6))
    # depósito de agua del limpiaparabrisas (derecha adelante) y de expansión (derecha atrás)
    p.append(caja_min_max('deposito_lava', (0.40, 1.55, 0.45), (0.58, 1.72, 0.68), 'plastico_traslucido', 0.02))
    p.append(cilindro('deposito_lava_tapa', 0.02, 0.025, 'plastico_negro', 16, (0.49, 1.63, 0.69)))
    p.append(caja_min_max('deposito_exp', (0.40, 0.72, 0.55), (0.56, 0.86, 0.72), 'plastico_traslucido', 0.03))
    p.append(cilindro('deposito_exp_tapa', 0.03, 0.03, 'plastico_negro', 20, (0.48, 0.79, 0.735)))
    p.append(tubo('manguera_exp', [(0.48, 0.79, 0.55), (0.4, 0.86, 0.5), (0.25, 1.0, 0.6), (term.x, term.y, term.z)], 0.008, 'goma', 8))
    # bobina en el parallamas
    p.append(cilindro('bobina', 0.03, 0.13, 'plastico_negro', 20, (0.0, Yp + 0.06, 0.66), 'X'))
    # mazo de cables por la pollera izquierda con cinta
    p.append(tubo('mazo', [(-0.6, Yp + 0.05, 0.74), (-0.6, 1.0, 0.76), (-0.58, 1.4, 0.74), (-0.5, 1.7, 0.68), (-0.55, 1.75, 0.62)], 0.012, 'cable', 10))
    # mangueras de la calefacción: del motor al parallamas
    for k, dz in enumerate((0.0, 0.05)):
        p.append(tubo(f'calefaccion{k}', [(term.x + 0.02 + dz, term.y - 0.05, term.z - 0.04), (term.x + 0.08 + dz, term.y - 0.25, term.z - 0.02), (0.15 + dz, Yp + 0.12, 0.62), (0.18 + dz, Yp + 0.005, 0.58)], 0.011, 'goma', 10))
    # caja de fusibles y relés sobre la pollera izquierda
    p.append(caja_min_max('fusibles', (-0.6, 0.78, 0.66), (-0.5, 0.95, 0.76), 'plastico_negro', 0.01))
    p.append(caja_min_max('fusibles_tapa', (-0.605, 0.775, 0.755), (-0.495, 0.955, 0.77), 'plastico_negro', 0.008))
    for k in range(3):
        p.append(caja_min_max(f'rele{k}', (-0.48, 0.8 + k * 0.045, 0.66), (-0.45, 0.835 + k * 0.045, 0.7), 'plastico_negro', 0.004))
    # bocina detrás de la parrilla
    bocina = torno('bocina', [(0, 0), (0.045, 0), (0.05, 0.01), (0.05, 0.03), (0.02, 0.035), (0, 0.035)], 'plastico_negro', 24)
    bocina.rotation_euler = (math.radians(-90), 0, 0)
    bocina.location = (0.4, 1.73, 0.4)
    p.append(bocina)
    # malla de masa del motor a la carrocería
    p.append(tubo('masa', [(-0.25, 1.15, 0.45), (-0.4, 1.12, 0.5), (-0.6, 1.1, 0.58)], 0.006, 'cobre', 6))
    # burlete del capó sobre la bandeja
    p.append(caja_min_max('burlete_capo', (-0.68, Yp + 0.1, 0.835), (0.68, Yp + 0.13, 0.85), 'goma', 0.008))
    # chapa de identificación (sin texto) en el parallamas
    p.append(caja_min_max('chapa_id', (0.2, Yp + 0.002, 0.7), (0.32, Yp + 0.004, 0.76), 'acero'))
    # soportes del motor
    for sx2 in (-1, 1):
        p.append(caja_min_max(f'soporte_motor{sx2}', (sx2 * 0.28 - 0.05 - 0.05, 1.35, 0.25), (sx2 * 0.28 + 0.05 - 0.05, 1.45, 0.38), 'fundicion', 0.01))
    # travesaño de abajo y semiejes (con fuelles)
    p.append(caja_min_max('travesano', (-0.62, 1.0, 0.18), (0.62, 1.1, 0.24), 'fundicion', 0.01))
    for s in (-1, 1):
        p.append(tubo(f'semieje{s}', [(-0.05 + s * 0.12, A.EJE_D, 0.29), (s * 0.4, A.EJE_D, 0.29), (s * 0.6, A.EJE_D, R_RUEDA_C)], 0.014, 'acero', 10))
        p.append(torno(f'fuelle{s}', [(0.015, 0), (0.04, 0.02), (0.03, 0.035), (0.042, 0.05), (0.03, 0.065), (0.04, 0.08), (0.015, 0.1)], 'goma', 24))
        p[-1].rotation_euler = (0, math.radians(90 * s), 0)
        p[-1].location = (s * 0.5, A.EJE_D, 0.29)
    o = unir('vano', p)
    o.matrix_basis = M_AUTO @ o.matrix_basis
    aplicar(o)
    return o


R_RUEDA_C = A.R_RUEDA


def varilla():
    """Varilla que sostiene el capó: gira en el porta radiador."""
    usar('dinamico')
    piv = Vector((-0.55, 1.80, 0.765))
    v = tubo('varilla', [(0, 0, 0), (0.0, -0.003, 0.45), (0.0, -0.0, 0.86), (0.0, 0.015, 0.88)], 0.004, 'metal_gris', 8)
    # guardada: acostada sobre el travesaño hacia el centro
    v.rotation_euler = (0, math.radians(90), 0)
    v.location = piv
    v.matrix_basis = M_AUTO @ v.matrix_basis
    v['pieza'] = 'varilla'
    usar('estatico')
    caja_min_max('varilla_pivote', (piv.x - 0.012 + A.CX, piv.y - 0.012 + A.CY, piv.z - 0.012), (piv.x + 0.012 + A.CX, piv.y + 0.012 + A.CY, piv.z + 0.004), 'plastico_negro', 0.003)
    caja_min_max('varilla_clip', (piv.x + 0.78 + A.CX, piv.y - 0.008 + A.CY, piv.z - 0.008), (piv.x + 0.81 + A.CX, piv.y + 0.008 + A.CY, piv.z + 0.006), 'plastico_negro', 0.003)
    usar('anclas')
    ancla('ancla_varilla_pivote', tuple(M_AUTO @ piv))
    return v


def construir():
    bloque()
    tapa_cilindros()
    bujias_y_cables()
    admision_escape()
    frente_motor()
    tapa_valvulas()
    montar_motor()
    vano()
    varilla()
