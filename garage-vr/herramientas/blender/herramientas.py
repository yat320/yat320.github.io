# Herramientas del tablero: llaves combinadas, destornillador, pinza, martillo y linterna. Sin marcas.
# Cada herramienta tiene su origen en la mano (donde se agarra) y anclas hijas para la punta.
import math
from comun import *
from garage import TABLERO

LLAVES = [8, 10, 12, 13, 17]


def estrella12(r_entre_caras, n=12):
    """Agujero de 12 estrías: dos hexágonos superpuestos (contorno en zigzag)."""
    pts = []
    r_in = r_entre_caras / 2
    r_out = r_in / math.cos(math.pi / 12) * 1.07
    for k in range(24):
        a = math.pi * k / 12 + math.pi / 24
        r = r_out if k % 2 == 0 else r_in
        pts.append((r * math.cos(a), r * math.sin(a)))
    return pts


def llave(s):
    """Llave combinada de s mm. Largo sobre X: estría en +X, boca en -X. Grosor en Z."""
    s_m = s / 1000
    L = (12 * s + 40) / 1000
    t = 0.42 * s_m + 0.0018
    partes = []
    # estría (anillo)
    ro = 0.88 * s_m + 0.003
    cx = L / 2 - ro
    anillo = extruir_contorno(f'llave{s}_anillo', circulo(0, 0, ro, 40), t, 'cromo', -t / 2,
                              agujeros=[list(reversed(estrella12(s_m * 1.02)))], bisel=0.0005)
    anillo.location = (cx, 0, 0)
    # inclinación de 15° de la estría
    anillo.rotation_euler = (0, math.radians(-12), 0)
    partes.append(anillo)
    # boca abierta a 15°
    bx = -L / 2 + 1.05 * s_m + 0.002
    ancho_boca = s_m * 1.03
    cab = []
    rcab = 1.12 * s_m + 0.004
    for k in range(40):
        a = 2 * math.pi * k / 40
        cab.append((rcab * math.cos(a), rcab * 0.9 * math.sin(a)))
    boca = [(-rcab * 1.4, -ancho_boca / 2), (0.15 * s_m, -ancho_boca / 2), (0.32 * s_m, -ancho_boca / 2 + 0.2 * s_m * 0.3),
            (0.32 * s_m, ancho_boca / 2 - 0.2 * s_m * 0.3), (0.15 * s_m, ancho_boca / 2), (-rcab * 1.4, ancho_boca / 2)]
    cabeza = extruir_contorno(f'llave{s}_cab', cab, t * 0.92, 'cromo', -t * 0.46, bisel=0.0005)
    corte = extruir_contorno(f'llave{s}_corte', boca, t * 3, 'cromo', -t * 1.5)
    b = cabeza.modifiers.new('boca', 'BOOLEAN')
    b.object = corte
    b.operation = 'DIFFERENCE'
    b.solver = 'EXACT'
    aplicar(cabeza)
    bpy.data.objects.remove(corte)
    cabeza.rotation_euler = (0, 0, math.radians(180 + 15))
    cabeza.location = (bx, 0, 0)
    partes.append(cabeza)
    # cuerpo en I que se afina hacia la boca
    x0, x1 = bx + rcab * 0.7, cx - ro * 0.7
    w0, w1 = 0.62 * s_m + 0.004, 0.72 * s_m + 0.004
    cuerpo = [(x0, -w0 / 2), (x1, -w1 / 2), (x1, w1 / 2), (x0, w0 / 2)]
    partes.append(extruir_contorno(f'llave{s}_cuerpo', cuerpo, t * 0.8, 'cromo', -t * 0.4, bisel=0.0008))
    # medida estampada en relieve sobre el cuerpo (las dos caras)
    for lado in (1, -1):
        cu = bpy.data.curves.new(f'num{s}{lado}', 'FONT')
        cu.body = str(s)
        cu.size = 0.42 * s_m + 0.002
        cu.extrude = 0.00018
        cu.align_x = 'CENTER'
        cu.align_y = 'CENTER'
        tx = bpy.data.objects.new(f'num{s}{lado}', cu)
        bpy.context.scene.collection.objects.link(tx)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(tx.evaluated_get(dg))
        bpy.data.objects.remove(tx)
        num = bpy.data.objects.new(f'llave{s}_num{lado}', me)
        me.materials.append(material('cromo'))
        COL['actual'].objects.link(num)
        num.location = ((x0 + x1) / 2 + 0.01, 0, lado * t * 0.4)
        num.rotation_euler = (0 if lado > 0 else math.pi, 0, 0)
        partes.append(num)
    o = unir(f'llave_{s}', partes)
    marcar_bordes_duros(o, 35)
    o['herramienta'] = 'llave'
    o['medida'] = s
    o['largo'] = L
    return o, cx, bx


def destornillador():
    mango = torno('dest_mango', [(0, 0), (0.012, 0), (0.016, 0.01), (0.016, 0.08), (0.013, 0.1), (0.008, 0.105), (0, 0.105)], 'mango', 24)
    vas = cilindro('dest_vastago', 0.0032, 0.12, 'cromo', 12, (0, 0, -0.06))
    punta = caja('dest_punta', (0, 0, -0.125), (0.0065, 0.0012, 0.012), 'cromo', 0.0003)
    o = unir('destornillador', [mango, vas, punta])
    o['herramienta'] = 'destornillador'
    return o


def pinza():
    p = []
    for s in (-1, 1):
        mango = tubo(f'pinza_mango{s}', [(0, 0, 0), (s * 0.012, 0, -0.06), (s * 0.02, 0, -0.13)], 0.0055, 'mango', 10)
        p.append(mango)
        p.append(caja(f'pinza_quijada{s}', (s * 0.003, 0, 0.035), (0.006, 0.006, 0.07), 'cromo', 0.001))
    p.append(cilindro('pinza_eje', 0.006, 0.012, 'cromo', 16, (0, 0, 0.0), 'Y'))
    o = unir('pinza', p)
    o['herramienta'] = 'pinza'
    return o


def martillo():
    p = [cilindro('mart_mango', 0.012, 0.3, 'madera', 16, (0, 0, -0.12))]
    p.append(caja('mart_cabeza', (0, 0, 0.04), (0.1, 0.026, 0.026), 'metal_gris', 0.003))
    p.append(cilindro('mart_boca', 0.015, 0.02, 'metal_gris', 16, (0.055, 0, 0.04), 'X'))
    o = unir('martillo', p)
    o['herramienta'] = 'martillo'
    return o


def linterna():
    cuerpo = torno('lint_cuerpo', [(0, -0.09), (0.013, -0.09), (0.0145, -0.085), (0.0145, 0.03), (0.02, 0.05), (0.021, 0.07), (0.0185, 0.072), (0, 0.072)], 'metal_pintado', 32)
    lente = cilindro('lint_lente', 0.0175, 0.002, 'optica', 24, (0, 0, 0.071))
    boton = caja('lint_boton', (0.0145, 0, 0.0), (0.004, 0.009, 0.014), 'goma', 0.002)
    estrias = []
    for k in range(10):
        estrias.append(torno(f'lint_estria{k}', [(0.0146, -0.07 + k * 0.007), (0.0152, -0.068 + k * 0.007), (0.0146, -0.066 + k * 0.007)], 'metal_pintado', 32))
    o = unir('linterna', [cuerpo, lente, boton] + estrias)
    o['herramienta'] = 'linterna'
    return o


def colgar(o, pos, giro_z=0.0, hijos=()):
    """Cuelga la herramienta contra el tablero (acostada sobre el plano de la pared) y le pone su gancho."""
    # la herramienta queda con su plano XZ... la llave está armada en el plano XY: la paramos contra la pared
    o.rotation_euler = (math.radians(90), giro_z, 0)
    o.location = pos
    usar('estatico')
    y = TABLERO['y'] - 0.012
    for dx in (-0.012, 0.012):
        g = tubo(f'gancho_{o.name}{dx}', [(pos[0] + dx, y, pos[2] + 0.0), (pos[0] + dx, y - 0.03, pos[2] + 0.002), (pos[0] + dx, y - 0.04, pos[2] + 0.012)], 0.002, 'metal_gris', 6)
    usar('dinamico')


def construir():
    usar('dinamico')
    t = TABLERO
    y = t['y'] - 0.012 - 0.008
    xs = [0.70, 0.83, 0.97, 1.12, 1.29]
    for s, x in zip(LLAVES, xs):
        o, cx, bx = llave(s)
        # ancla de la estría (para encastrar en la tuerca)
        usar('dinamico')
        e = ancla(f'{o.name}_estria', (cx, 0, 0))
        e.parent = o
        e2 = ancla(f'{o.name}_boca', (bx, 0, 0))
        e2.parent = o
        # colgada vertical con la estría arriba
        o.rotation_euler = (math.radians(90), math.radians(-90), 0)
        o.location = (x, y, t['z0'] + 0.5)
        # un gancho que pasa por el agujero de la estría
        colgar_ganchos(o.name, x, t['z0'] + 0.5 + cx - 0.004, ancho=0.0)
    d = destornillador()
    d.location = (1.47, y - 0.008, t['z0'] + 0.48)
    colgar_ganchos('destornillador', 1.47, t['z0'] + 0.5)
    pz = pinza()
    pz.location = (1.62, y - 0.006, t['z0'] + 0.52)
    colgar_ganchos('pinza', 1.62, t['z0'] + 0.53)
    m = martillo()
    m.location = (1.80, y - 0.015, t['z0'] + 0.5)
    colgar_ganchos('martillo', 1.80, t['z0'] + 0.52)
    li = linterna()
    li.rotation_euler = (0, math.radians(90), 0)
    li.location = (0.86, y - 0.018, t['z0'] + 0.16)
    colgar_ganchos('linterna', 0.86, t['z0'] + 0.14, ancho=0.05)
    usar('dinamico')
    e = ancla('linterna_luz', (0, 0, 0.075))
    e.parent = li
    # anclas de cada lugar del tablero (para volver a colgar)
    usar('anclas')
    for o in [bpy.data.objects[n] for n in ('llave_8', 'llave_10', 'llave_12', 'llave_13', 'llave_17', 'destornillador', 'pinza', 'martillo', 'linterna')]:
        a = ancla(f'colgar_{o.name}', tuple(o.location), tuple(o.rotation_euler))


def colgar_ganchos(nombre, x, z, ancho=0.022):
    usar('estatico')
    y = TABLERO['y'] - 0.012
    for dx in ((0.0,) if ancho == 0 else (-ancho / 2, ancho / 2)):
        tubo(f'gancho_{nombre}{dx}', [(x + dx, y, z - 0.004), (x + dx, y - 0.028, z - 0.002), (x + dx, y - 0.034, z + 0.01)], 0.0018, 'metal_gris', 6)
    usar('dinamico')
