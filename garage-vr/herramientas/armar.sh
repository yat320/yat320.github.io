#!/usr/bin/env bash
# Arma todo desde cero: escena en Blender, horneado de luz, texturas y empaquetado para el juego.
# Uso: herramientas/armar.sh [rapido|final]
#   rapido: lightmaps de 1024 con 16 muestras (para probar en minutos)
#   final:  lightmaps de 2048 con 96 muestras (tarda cerca de una hora con 2 núcleos)
# Variables: PY (python con bpy, numpy, pillow, pyoidn), NODE_DIR (carpeta con los paquetes de node), TRABAJO.
set -euo pipefail
MODO=${1:-rapido}
AQUI=$(cd "$(dirname "$0")" && pwd)
PY=${PY:-$HOME/venv/bin/python}
TRABAJO=${TRABAJO:-$HOME/gvr-build}
NODE_DIR=${NODE_DIR:-$HOME/gvr-node}
SALIDA="$AQUI/../modelos"
if [ "$MODO" = final ]; then MUESTRAS=96; RES=2048; ENV_M=128; else MUESTRAS=16; RES=1024; ENV_M=24; fi
mkdir -p "$TRABAJO"
cd "$AQUI/blender"
"$PY" construir.py "$TRABAJO/escena.blend"
"$PY" hornear.py "$TRABAJO/escena.blend" "$TRABAJO/horneado.blend" "$TRABAJO/lm" $MUESTRAS $RES
"$PY" exportar.py "$TRABAJO/horneado.blend" "$TRABAJO/lm" "$TRABAJO/export"
"$PY" entorno.py "$TRABAJO/escena.blend" "$TRABAJO/export/entorno.hdr" $ENV_M
"$PY" "$AQUI/texturas.py" "$TRABAJO/tex"
"$PY" siluetas.py "$TRABAJO/escena.blend" "$TRABAJO/tex/siluetas.png"
cp "$AQUI/empaquetar.mjs" "$NODE_DIR/"
cd "$NODE_DIR" && node empaquetar.mjs "$TRABAJO/export" "$TRABAJO/tex" "$SALIDA"
