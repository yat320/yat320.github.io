// Empaqueta lo que sale de Blender para el juego: malla comprimida (meshopt) y texturas KTX2.
// Uso: node empaquetar.mjs <carpeta-export> <carpeta-texturas> <carpeta-salida>
// Necesita (en la carpeta donde se corre): @gltf-transform/{core,extensions,functions}, meshoptimizer, ktx2-encoder, sharp.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';

const [EXPORT, TEX, SALIDA] = process.argv.slice(2);
fs.mkdirSync(SALIDA, { recursive: true });

const decodificar = async (buf) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

async function ktx2(entrada, salida, tipo) {
  const buf = new Uint8Array(fs.readFileSync(entrada));
  const comun = { imageDecoder: decodificar, isKTX2File: true };
  const opciones = {
    // color: ETC1S liviano, en sRGB
    color: { isUASTC: false, qualityLevel: 230, compressionLevel: 2, isPerceptual: true, isSetKTX2SRGBTransferFunc: true, generateMipmap: true },
    // oclusión-rugosidad-metal: ETC1S lineal
    orm: { isUASTC: false, qualityLevel: 230, compressionLevel: 2, isPerceptual: false, isSetKTX2SRGBTransferFunc: false, generateMipmap: true },
    // normales: UASTC (ETC1S las arruina)
    normal: { isUASTC: true, isNormalMap: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false, generateMipmap: true, needSupercompression: true, enableRDO: true, rdoQualityLevel: 1.5, uastcLDRQualityLevel: 2 },
    // lightmaps: UASTC sin mipmaps (la luz cambia suave)
    luz: { isUASTC: true, isPerceptual: true, isSetKTX2SRGBTransferFunc: true, generateMipmap: false, needSupercompression: true, uastcLDRQualityLevel: 3 },
    // calcos con transparencia
    calco: { isUASTC: true, isPerceptual: true, isSetKTX2SRGBTransferFunc: true, generateMipmap: true, needSupercompression: true, enableRDO: true, rdoQualityLevel: 1.0, uastcLDRQualityLevel: 2 },
  }[tipo];
  const out = await encodeToKTX2(buf, { ...comun, ...opciones });
  fs.writeFileSync(salida, out);
  return out.byteLength;
}

// 1) la escena
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
const doc = await io.read(path.join(EXPORT, 'escena.glb'));
await doc.transform(
  dedup(),
  prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  quantize({ quantizationVolume: 'scene', quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 16, cleanup: false }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
const glb = await io.writeBinary(doc);
fs.writeFileSync(path.join(SALIDA, 'garage.glb'), glb);
console.log('garage.glb', (glb.byteLength / 1e6).toFixed(2), 'MB');

// 2) lightmaps
let total = glb.byteLength;
for (const f of fs.readdirSync(EXPORT).filter((f) => /^lm_.*\.png$/.test(f))) {
  const n = await ktx2(path.join(EXPORT, f), path.join(SALIDA, f.replace('.png', '.ktx2')), 'luz');
  total += n;
  console.log(f, (n / 1e6).toFixed(2), 'MB');
}
fs.copyFileSync(path.join(EXPORT, 'lightmaps.json'), path.join(SALIDA, 'lightmaps.json'));
if (fs.existsSync(path.join(EXPORT, 'entorno.hdr'))) fs.copyFileSync(path.join(EXPORT, 'entorno.hdr'), path.join(SALIDA, 'entorno.hdr'));

// 3) texturas de materiales
fs.mkdirSync(path.join(SALIDA, 'tex'), { recursive: true });
for (const f of fs.readdirSync(TEX).filter((f) => f.endsWith('.png')).sort()) {
  const tipo = f.endsWith('_color.png') ? 'color' : f.endsWith('_orm.png') ? 'orm' : f.endsWith('_normal.png') ? 'normal' : 'calco';
  const n = await ktx2(path.join(TEX, f), path.join(SALIDA, 'tex', f.replace('.png', '.ktx2')), tipo);
  total += n;
  console.log('tex/' + f, tipo, (n / 1e3).toFixed(0), 'kB');
}
console.log('total', (total / 1e6).toFixed(2), 'MB');
