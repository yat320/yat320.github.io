# Garage VR

Un garage, un hatchback de 3 puertas de los 80 (sin marcas) y su motor 1.6 tipo AP, para el Meta Quest 3 (WebXR + Three.js) y para probar en la compu con mouse. Se juega en https://yat320.github.io/garage-vr/

Primer hito: abrir el capó, ponerle la varilla, sacar la manguera del respiradero, aflojar las 8 tuercas de la tapa de válvulas con la llave de 10, sacar la tapa, volver a ponerla, enroscar y ajustar las tuercas y volver a poner la manguera.

## Carpetas

- `index.html`, `js/`: el juego (módulos de JavaScript sin compilar; Three.js 0.186.1 desde jsDelivr con un import map).
  - `logica.js`: el trabajo sin 3D (rosca de las tuercas, despegue, apriete, capó, varilla, manguera, tapa, próximo paso). Se prueba sola.
  - `juego.js`: las piezas que se agarran y cómo se mueve cada una (bisagra, riel de los espárragos, llave calzada, giro con los dedos, caídas).
  - `xr.js`: controles y manos (pellizco o puño). `escritorio.js`: mouse y teclado. `escena.js`/`materiales.js`: carga y materiales PBR con lightmap.
- `modelos/`: lo que sale del armado (no se edita a mano): `garage.glb` (meshopt), lightmaps y texturas en KTX2, entorno HDR y grilla de oclusión.
- `datos/ap16-tapa.json`: tapa, junta y tuercas sacadas de `taller-mecanico/src/data/ap16.ts` (solo lectura) con `herramientas/extraer-ap16.mts`.
- `herramientas/`: el armado de los modelos.
  - `blender/*.py`: la escena entera por código (bpy): `garage.py`, `auto.py`, `motor.py`, `herramientas.py`; `hornear.py` (UV y lightmaps con Cycles + quitarruido OIDN), `exportar.py`, `entorno.py`, `siluetas.py`, `vista.py` (vistas previas).
  - `texturas.py`: texturas PBR que se repiten sin costura (ruido por FFT).
  - `empaquetar.mjs`: comprime la malla (meshopt) y pasa las texturas a KTX2.
  - `armar.sh rapido|final`: todo de una (final: lightmaps de 2048, cerca de 2 horas con 2 núcleos).
- `pruebas/`: `node --test pruebas/*.test.mjs` (lógica), `node pruebas/trabajo-escritorio.mjs` (el trabajo entero con eventos de mouse), `node pruebas/trabajo-vr.mjs` (Quest 3 emulado con IWER: controles y manos), `node pruebas/ver.mjs <carpeta> <vistas>` (capturas).

## Reglas de lo visual

- Nada de luces en tiempo real salvo la linterna (una SpotLight que siempre existe, apagada, para no recompilar shaders).
- Lo estático lleva lightmap en UV1 (tres atlas: garaje, auto, motor). Lo que se mueve se ilumina con el entorno y la grilla de oclusión (`uOclusion`).
- El parche del shader (`materiales.js`) evita contar dos veces la luz difusa y apaga los reflejos donde el lightmap dice que hay poca luz.
- Presupuesto: 72 fps en el Quest 3. Hoy son ~75 llamadas de dibujo y ~110 mil triángulos. Con el botón X del control izquierdo la pizarra muestra los cuadros por segundo.

## Para armar los modelos

Necesita Python 3.13 con `bpy` (Blender como módulo), `numpy`, `pillow` y `pyoidn`, y una carpeta de Node con `@gltf-transform/{core,extensions,functions}`, `meshoptimizer`, `ktx2-encoder` y `sharp`. Ver las variables al principio de `herramientas/armar.sh`.
