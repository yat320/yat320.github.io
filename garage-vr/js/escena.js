// Carga la escena horneada: malla, lightmaps, entorno, materiales y la grilla de oclusión.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as MAT from './materiales.js';

export const BASE = 'modelos/';
const BASIS = 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/basis/';

/** Grilla de oclusión (0..1) para iluminar lo que se mueve según dónde está. */
export class Oclusion {
  constructor(d) {
    this.o = d.origen;
    this.paso = d.paso;
    this.n = d.n;
    const bin = atob(d.datos);
    this.v = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) this.v[i] = bin.charCodeAt(i);
  }
  /** Valor interpolado en un punto del mundo (1 = a cielo abierto). */
  en(p) {
    const [nx, ny, nz] = this.n;
    const fx = (p.x - this.o[0]) / this.paso;
    const fy = (p.y - this.o[1]) / this.paso;
    const fz = (p.z - this.o[2]) / this.paso;
    if (fx < 0 || fy < 0 || fz < 0 || fx > nx - 1 || fy > ny - 1 || fz > nz - 1) return 1;
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
    const tx = fx - i, ty = fy - j, tz = fz - k;
    const g = (a, b, c) => this.v[Math.min(c, nz - 1) * nx * ny + Math.min(b, ny - 1) * nx + Math.min(a, nx - 1)] / 255;
    let s = 0;
    for (let c = 0; c < 2; c++)
      for (let b = 0; b < 2; b++)
        for (let a = 0; a < 2; a++) s += g(i + a, j + b, k + c) * (a ? tx : 1 - tx) * (b ? ty : 1 - ty) * (c ? tz : 1 - tz);
    return s;
  }
}

/**
 * Carga todo. `progreso(f)` recibe de 0 a 1.
 * Devuelve { raiz, nodos (por nombre), estaticos (mallas para rayos), oclusion }.
 */
export async function cargar(renderer, scene, progreso = () => {}) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, hechos, total) => progreso(hechos / Math.max(total, 1));
  const ktx2 = new KTX2Loader(manager).setTranscoderPath(BASIS).detectSupport(renderer);
  MAT.usarCargador(ktx2);
  const gltf = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);

  const [g, meta, ocl, env] = await Promise.all([
    gltf.loadAsync(BASE + 'garage.glb'),
    fetch(BASE + 'lightmaps.json').then((r) => r.json()),
    fetch(BASE + 'oclusion.json').then((r) => r.json()),
    new HDRLoader(manager).loadAsync(BASE + 'entorno.hdr'),
  ]);

  // entorno para los reflejos
  env.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(env).texture;
  env.dispose();
  pmrem.dispose();

  const luces = {};
  await Promise.all(
    Object.entries(meta).map(async ([grupo, m]) => {
      const t = await ktx2.loadAsync(BASE + `lm_${grupo}.ktx2`);
      t.channel = 1;
      t.flipY = false;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      luces[`lm_${grupo}`] = { textura: t, intensidad: m.escala };
    }),
  );

  const raiz = g.scene;
  scene.add(raiz);
  raiz.updateMatrixWorld(true);
  const nodos = {};
  raiz.traverse((o) => {
    if (o.name) nodos[o.name] = o;
  });

  // materiales: uno por (material de Blender, lightmap); las piezas que se mueven tienen el suyo propio
  const hechos = new Map();
  const tareas = [];
  const estaticos = [];
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    const lmNombre = buscarExtra(o, 'lightmap');
    const dinamico = !lmNombre && !/^est_/.test(nombreNodo(o));
    const nombre = o.material.name;
    const luz = lmNombre ? luces[lmNombre] : null;
    const clave = dinamico ? null : `${nombre}|${lmNombre || ''}`;
    if (clave && !hechos.has(clave)) hechos.set(clave, MAT.crear(nombre, luz));
    const p = clave ? hechos.get(clave) : MAT.crear(nombre, null);
    tareas.push(p.then((m) => (o.material = m)));
    if (/^est_/.test(nombreNodo(o))) {
      estaticos.push(o);
      o.matrixAutoUpdate = false;
    }
    o.frustumCulled = true;
  });
  await Promise.all(tareas);
  progreso(1);
  return { raiz, nodos, estaticos, oclusion: new Oclusion(ocl), luces };
}

/** Nombre del nodo con datos (las mallas con varios materiales quedan como hijas). */
function nombreNodo(o) {
  let p = o;
  while (p && !p.name) p = p.parent;
  return p ? p.name : '';
}

function buscarExtra(o, clave) {
  let p = o;
  while (p) {
    if (p.userData && p.userData[clave] != null) return p.userData[clave];
    p = p.parent;
  }
  return null;
}
