# Dibuja las siluetas pintadas del tablero (donde va cada herramienta) a partir de las herramientas mismas.
# Uso: ~/venv/bin/python siluetas.py <escena.blend> <salida.png>
import sys
import math
import bpy
import numpy as np
from PIL import Image, ImageFilter

blend, salida = sys.argv[1], sys.argv[2]
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
t = bpy.data.objects['tablero_siluetas']
vs = [t.matrix_world @ v.co for v in t.data.vertices]
x0, x1 = min(v.x for v in vs), max(v.x for v in vs)
z0, z1 = min(v.z for v in vs), max(v.z for v in vs)
y = vs[0].y

HERR = {'llave_8', 'llave_10', 'llave_12', 'llave_13', 'llave_17', 'destornillador', 'pinza', 'martillo', 'linterna'}
for o in bpy.data.objects:
    if o.type in ('MESH', 'CURVE'):
        o.hide_render = o.name not in HERR
    if o.type == 'LIGHT':
        o.hide_render = True
mat = bpy.data.materials.new('blanco')
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
em = nt.nodes.new('ShaderNodeEmission')
em.inputs['Strength'].default_value = 1.0
out = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(em.outputs[0], out.inputs[0])
bpy.context.view_layer.material_override = mat
w = bpy.data.worlds.new('negro')
sc.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
cd = bpy.data.cameras.new('orto')
cd.type = 'ORTHO'
cd.ortho_scale = max(x1 - x0, z1 - z0)
cam = bpy.data.objects.new('orto', cd)
sc.collection.objects.link(cam)
cam.location = ((x0 + x1) / 2, y - 1.0, (z0 + z1) / 2)
cam.rotation_euler = (math.radians(90), 0, 0)
sc.camera = cam
ancho = 1024
sc.render.resolution_x = ancho
sc.render.resolution_y = int(ancho * (z1 - z0) / (x1 - x0))
sc.render.engine = 'CYCLES'
sc.cycles.samples = 4
sc.view_settings.view_transform = 'Standard'
sc.render.filepath = '/tmp/siluetas_mascara.png'
bpy.ops.render.render(write_still=True)

m = np.array(Image.open('/tmp/siluetas_mascara.png').convert('L'), dtype=np.float32) / 255
mask = Image.fromarray(((m > 0.3) * 255).astype(np.uint8))
# la pintura se extiende unos milímetros alrededor de la herramienta
px_mm = ancho / ((x1 - x0) * 1000)
grande = mask.filter(ImageFilter.MaxFilter(int(px_mm * 5) | 1)).filter(ImageFilter.GaussianBlur(px_mm * 0.6))
a = np.array(grande, dtype=np.float32) / 255
rgba = np.zeros(a.shape + (4,), np.uint8)
rgba[..., 0], rgba[..., 1], rgba[..., 2] = 30, 30, 32
rgba[..., 3] = (np.clip(a * 1.2, 0, 1) * 235).astype(np.uint8)
# el calco es un plano de 0 a 1: la imagen se estira al rectángulo (se guarda cuadrada para la textura)
Image.fromarray(rgba, 'RGBA').resize((1024, 1024), Image.LANCZOS).save(salida)
print('siluetas', salida)
