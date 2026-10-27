// Abre el juego y saca capturas desde varios lugares (para revisar cómo se ve).
// Uso: node pruebas/ver.mjs <carpeta-capturas> [vista,vista...]
import fs from 'node:fs';
import path from 'node:path';
import { servir, abrir } from './navegador.mjs';

const OUT = process.argv[2] || '/tmp/garage-capturas';
const pedidas = (process.argv[3] || 'inicio,frente,motor,tablero,lado').split(',');
fs.mkdirSync(OUT, { recursive: true });

const VISTAS = {
  // dónde se para (x, z), altura de los ojos y a dónde mira
  frente: { pos: [-0.45, -2.55], alto: 1.62, mira: [-0.45, 0.6, -1.3] },
  motor: { pos: [-0.3, -2.15], alto: 1.55, mira: [-0.5, 0.62, -1.35] },
  tapa: { pos: [-0.35, -1.85], alto: 1.25, mira: [-0.5, 0.66, -1.35] },
  tablero: { pos: [1.2, -2.45], alto: 1.6, mira: [1.2, 1.45, -3.2] },
  lado: { pos: [1.4, 0.6], alto: 1.5, mira: [-0.45, 0.6, -0.2] },
  atras: { pos: [0.9, 2.6], alto: 1.65, mira: [-0.45, 0.7, 0.0] },
  garage: { pos: [1.6, 2.7], alto: 1.75, mira: [-0.6, 0.8, -1.5] },
};

const { servidor, puerto } = await servir();
const { browser, page, errores } = await abrir({ ancho: +(process.env.ANCHO || 640), alto: +(process.env.ALTO || 400) });
await page.goto(`http://127.0.0.1:${puerto}/garage-vr/index.html${process.env.PARAMS || '?px=1&sinaa'}`);
await page.waitForFunction(() => window.garage?.juego, null, { timeout: 180000 });
await page.waitForTimeout(1500);
if (pedidas.includes('inicio')) await page.screenshot({ path: path.join(OUT, 'inicio.png') });
await page.click('#btnPC');
await page.evaluate(() => {
  window.garage.escritorio.bloqueado = true;
  window.garage.capo = (a) => window.garage.juego.ponerCapo(a);
});
await page.evaluate(({ exp, tono, luz, env }) => {
  const g = window.garage;
  const T = g.THREE;
  if (exp) g.renderer.toneMappingExposure = +exp;
  if (tono) g.renderer.toneMapping = { agx: T.AgXToneMapping, neutral: T.NeutralToneMapping, aces: T.ACESFilmicToneMapping }[tono];
  g.escena.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (luz && m.lightMap && !m.userData._luz) { m.lightMapIntensity *= +luz; m.userData._luz = 1; }
    if (env && m.envMapIntensity != null && !m.userData._env) { m.envMapIntensity *= +env; m.userData._env = 1; }
    m.needsUpdate = true;
  });
}, { exp: process.env.EXPOSICION, tono: process.env.TONO, luz: process.env.LUZ, env: process.env.ENV });
const abrirCapo = process.env.CAPO !== 'cerrado';
if (abrirCapo) await page.evaluate(() => {
  const j = window.garage.juego;
  j.ponerCapo(j.anguloVarilla);
  window.garage.L.ponerVarilla(j.tr);
  j.apuntarVarilla(j.slotMundo());
});
if (process.env.SIN_TAPA) await page.evaluate(() => {
  const j = window.garage.juego;
  j.tapa.pivote.position.set(1.2, 0.92, -2.85);
  j.tapa.pivote.updateMatrixWorld(true);
  for (const t of j.tuercas) { t.pivote.position.y -= 5; t.pivote.updateMatrixWorld(true); }
});
for (const nombre of pedidas) {
  const v = VISTAS[nombre];
  if (!v) continue;
  await page.evaluate((v) => {
    const e = window.garage.escritorio;
    e.pos.set(v.pos[0], 0, v.pos[1]);
    e.alto = e.altoObj = v.alto;
    const dx = v.mira[0] - v.pos[0], dy = v.mira[1] - v.alto, dz = v.mira[2] - v.pos[1];
    e.yaw = Math.atan2(-dx, -dz);
    e.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, v);
  await page.evaluate(() => { const m = window.garage.escritorio.mano; m.activa = false; });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `${nombre}.png`) });
  console.log('captura', nombre);
}
const r = await page.evaluate(() => window.garage.rendimiento);
console.log('rendimiento (software, sin GPU):', JSON.stringify(r));
console.log(errores.length ? 'ERRORES:\n' + errores.join('\n') : 'sin errores');
await browser.close();
servidor.close();
