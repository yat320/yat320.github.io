# Arma toda la escena y la guarda en un .blend.
# Uso: ~/venv/bin/python construir.py <salida.blend> [partes: garage,auto,motor,herramientas]
import sys
import os
import math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from comun import *

salida = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/gvr-build/escena.blend'
partes = sys.argv[2].split(',') if len(sys.argv) > 2 else ['garage', 'auto', 'motor', 'herramientas']

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.unit_settings.system = 'METRIC'


def luces():
    """Luces para el horneado: un rectángulo bajo cada tubo y la tarde que entra por la ventana."""
    usar('luces')
    from garage import ALTO, X0
    for i, y in enumerate((-1.3, 1.5)):
        d = bpy.data.lights.new(f'luz_tubos{i}', 'AREA')
        d.shape = 'RECTANGLE'
        d.size = 1.18
        d.size_y = 0.1
        d.energy = 260
        d.color = (1.0, 0.96, 0.9)
        o = bpy.data.objects.new(f'luz_tubos{i}', d)
        o.location = (0, y, ALTO - 0.155)
        COL['actual'].objects.link(o)
    # luz de afuera por la ventana (cálida, de costado)
    d = bpy.data.lights.new('luz_ventana', 'AREA')
    d.shape = 'RECTANGLE'
    d.size = 1.2
    d.size_y = 0.6
    d.energy = 700
    d.color = (1.0, 0.82, 0.62)
    o = bpy.data.objects.new('luz_ventana', d)
    o.location = (X0 - 0.6, -1.0, 2.55)
    o.rotation_euler = (0, math.radians(-70), 0)
    COL['actual'].objects.link(o)
    # cielo apenas azulado (rebota por la ventana)
    w = bpy.data.worlds.new('mundo')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.35, 0.42, 0.55, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6


if 'garage' in partes:
    import garage
    garage.construir()
    luces()
if 'auto' in partes:
    import auto
    auto.construir()
if 'motor' in partes:
    import motor
    motor.construir()
if 'herramientas' in partes:
    import herramientas
    herramientas.construir()

os.makedirs(os.path.dirname(salida), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=salida)
n = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('escena guardada:', salida, 'objetos:', len(bpy.data.objects), 'caras:', n)
