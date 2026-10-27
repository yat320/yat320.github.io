// Materiales PBR del juego. Cada material de Blender (por nombre) se reemplaza por uno de estos.
// Las texturas se repiten en metros (la UV0 de la escena está en metros).
// Lo estático lleva lightmap (UV1); lo que se mueve se ilumina con el entorno y una grilla de oclusión.
import * as THREE from 'three';

const T = 'modelos/tex/';

/**
 * set: juego de texturas (color, normal, orm) · tile: metros que cubre una repetición
 * color: tinte lineal · rug: multiplica la rugosidad · metal: fija el metal (si no, sale del mapa)
 */
export const CATALOGO = {
  concreto: { set: 'concreto', tile: 2.0, color: [1, 1, 1], normal: 1.0 },
  revoque: { set: 'revoque', tile: 1.5, color: [0.82, 0.8, 0.74] },
  revoque_zocalo: { set: 'revoque', tile: 1.5, color: [0.25, 0.31, 0.27], rug: 0.75 },
  losa: { set: 'revoque', tile: 1.5, color: [0.6, 0.59, 0.56] },
  metal_pintado: { set: 'metal_pintado', tile: 0.6, color: [0.15, 0.22, 0.25] },
  metal_gris: { set: 'metal_pintado', tile: 0.6, color: [0.3, 0.31, 0.31] },
  chapa_galv: { set: 'metal_crudo', tile: 0.5, color: [0.6, 0.61, 0.62], rug: 1.5, metal: 0.95 },
  madera: { set: 'madera', tile: 0.8, color: [1, 1, 1] },
  tablero: { set: 'tablero', tile: 0.254, color: [1, 1, 1] },
  carton: { set: 'plastico', tile: 0.3, color: [0.46, 0.32, 0.18], rug: 1.7 },
  pintura_auto: { set: 'pintura', tile: 0.5, color: [0.4, 0.03, 0.025], metal: 0, env: 0.9 },
  plastico_negro: { set: 'plastico', tile: 0.15, color: [0.028, 0.028, 0.03] },
  goma: { set: 'plastico', tile: 0.1, color: [0.022, 0.022, 0.022], rug: 1.6 },
  llanta: { set: 'metal_crudo', tile: 0.3, color: [0.5, 0.51, 0.52], metal: 0.9, rug: 1.2 },
  reflector: { set: 'metal_crudo', tile: 0.2, color: [0.9, 0.9, 0.9], metal: 1, rug: 0.4 },
  tapizado: { set: 'tela', tile: 0.08, color: [0.07, 0.07, 0.08] },
  aluminio_fundido: { set: 'fundido', tile: 0.25, color: [0.5, 0.5, 0.48] },
  fundicion: { set: 'fundido', tile: 0.25, color: [0.13, 0.12, 0.11], metalMul: 0.5 },
  oxido: { set: 'oxido', tile: 0.3, color: [1, 1, 1] },
  chapa_tapa: { set: 'metal_pintado', tile: 0.5, color: [0.04, 0.055, 0.085], rug: 0.8 },
  acero: { set: 'metal_crudo', tile: 0.2, color: [0.6, 0.6, 0.62], metal: 1 },
  acero_aceitado: { set: 'metal_crudo', tile: 0.2, color: [0.42, 0.42, 0.42], metal: 1, rug: 0.55 },
  cromo: { set: 'metal_crudo', tile: 0.15, color: [0.88, 0.88, 0.9], metal: 1, rug: 0.35 },
  plastico_amarillo: { set: 'plastico', tile: 0.15, color: [0.78, 0.5, 0.02] },
  plastico_rojo: { set: 'plastico', tile: 0.15, color: [0.5, 0.035, 0.02] },
  plastico_traslucido: { set: 'plastico', tile: 0.15, color: [0.75, 0.74, 0.68], opacidad: 0.82 },
  cable: { set: 'plastico', tile: 0.1, color: [0.014, 0.014, 0.014] },
  cable_rojo: { set: 'plastico', tile: 0.1, color: [0.42, 0.02, 0.015] },
  junta_goma: { set: 'plastico', tile: 0.1, color: [0.045, 0.035, 0.035], rug: 1.3 },
  cobre: { set: 'metal_crudo', tile: 0.2, color: [0.85, 0.45, 0.3], metal: 1 },
  trapo: { set: 'tela', tile: 0.08, color: [0.38, 0.09, 0.05] },
  lata: { set: 'metal_pintado', tile: 0.4, color: [0.09, 0.2, 0.4] },
  mango: { set: 'plastico', tile: 0.1, color: [0.55, 0.05, 0.03], rug: 0.8 },
  iman: { set: 'metal_crudo', tile: 0.1, color: [0.06, 0.06, 0.065], metal: 0.8, rug: 1.3 },
  funda: { set: 'tela', tile: 0.12, color: [0.025, 0.07, 0.2], rug: 0.75 },
  // especiales
  vidrio: { vidrio: true, color: [0.012, 0.014, 0.014], opacidad: 0.3 },
  optica: { vidrio: true, color: [0.7, 0.72, 0.72], opacidad: 0.22 },
  optica_roja: { vidrio: true, color: [0.35, 0.01, 0.008], opacidad: 0.85 },
  optica_ambar: { vidrio: true, color: [0.6, 0.22, 0.01], opacidad: 0.8 },
  vidrio_esmerilado: { luz: [1.9, 1.8, 1.6] },
  tubo_luz: { luz: [7.0, 6.8, 6.3] },
  piso_mancha: { calco: 'manchas_piso', rug: 0.22 },
  silueta: { calco: 'siluetas', rug: 0.7 },
};

const cache = {};
let ktx2 = null;

export function usarCargador(cargadorKtx2) {
  ktx2 = cargadorKtx2;
}

function textura(nombre, { repetir = true } = {}) {
  if (cache[nombre]) return cache[nombre];
  const p = ktx2.loadAsync(T + nombre + '.ktx2').then((t) => {
    if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  });
  cache[nombre] = p;
  return p;
}

/** Texturas de un juego, ya con la repetición de este material (comparten la imagen en la GPU). */
async function juego(set, tile) {
  const [c, n, o] = await Promise.all([textura(set + '_color'), textura(set + '_normal'), textura(set + '_orm')]);
  const rep = 1 / tile;
  const clon = (t) => {
    const k = t.clone();
    k.repeat.set(rep, rep);
    k.needsUpdate = false;
    return k;
  };
  return { color: clon(c), normal: clon(n), orm: clon(o) };
}

/**
 * Parche del shader estándar:
 * - con lightmap no se suma además la luz difusa del entorno (sería contarla dos veces);
 * - el reflejo del entorno se apaga donde el lightmap dice que hay poca luz (rincones del vano).
 * - sin lightmap, la grilla de oclusión baja el entorno (uniform uOclusion).
 */
const LUCES_MAPAS = /* glsl */ `
#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#else
		#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
			iblIrradiance += getIBLIrradiance( geometryNormal ) * uOclusion;
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#ifdef USE_LIGHTMAP
		float lmLum = dot( lightMapIrradiance, vec3( 0.2126, 0.7152, 0.0722 ) );
		iblRadiance *= clamp( lmLum / uLuzRef, 0.03, 1.0 );
	#else
		iblRadiance *= uOclusion;
	#endif
	radiance += iblRadiance;
#endif
`;

export const AJUSTES = { luzRef: { value: 0.45 } };

function parchear(m) {
  m.userData.oclusion = { value: 1.0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLuzRef = AJUSTES.luzRef;
    sh.uniforms.uOclusion = m.userData.oclusion;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLuzRef;\nuniform float uOclusion;')
      .replace('#include <lights_fragment_maps>', LUCES_MAPAS);
  };
  m.customProgramCacheKey = () => 'garage-v1';
}

/**
 * Crea el material del juego para un material de Blender.
 * `luz`: { textura, intensidad } del lightmap (estáticos) o null (piezas que se mueven).
 */
export async function crear(nombre, luz) {
  const d = CATALOGO[nombre];
  if (!d) {
    console.warn('material sin catálogo:', nombre);
    const m = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    parchear(m);
    return m;
  }
  if (d.luz) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...d.luz) });
    m.toneMapped = true;
    return m;
  }
  if (d.vidrio) {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(...d.color),
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: d.opacidad,
      depthWrite: false,
      envMapIntensity: 1.4,
    });
    parchear(m);
    return m;
  }
  if (d.calco) {
    const t = await textura(d.calco, { repetir: false });
    const m = new THREE.MeshStandardMaterial({
      map: t,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
      roughness: d.rug,
      metalness: 0,
    });
    if (luz) {
      m.lightMap = luz.textura;
      m.lightMapIntensity = luz.intensidad;
    }
    parchear(m);
    return m;
  }
  const tx = await juego(d.set, d.tile);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(...d.color),
    map: tx.color,
    normalMap: tx.normal,
    normalScale: new THREE.Vector2(d.normal ?? 1, d.normal ?? 1),
    roughnessMap: tx.orm,
    metalnessMap: tx.orm,
    aoMap: luz ? null : tx.orm,
    aoMapIntensity: 0.8,
    roughness: d.rug ?? 1,
    metalness: d.metal ?? d.metalMul ?? 1,
    envMapIntensity: d.env ?? 1,
  });
  if (d.metal != null) m.metalnessMap = null;
  if (d.opacidad) {
    m.transparent = true;
    m.opacity = d.opacidad;
  }
  if (luz) {
    m.lightMap = luz.textura;
    m.lightMapIntensity = luz.intensidad;
  }
  parchear(m);
  return m;
}
