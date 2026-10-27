// Hace el trabajo entero en la versión de escritorio, con eventos de mouse de verdad:
// abrir el capó, sacar la manguera, probar la llave equivocada, aflojar y sacar las 8 tuercas con la de 10,
// sacar la tapa, volver a ponerla, poner y ajustar las tuercas y volver a poner la manguera.
// Uso: node pruebas/trabajo-escritorio.mjs [carpeta-capturas]
import fs from 'node:fs';
import path from 'node:path';
import { servir, abrir } from './navegador.mjs';

const OUT = process.argv[2] || '/tmp/garage-trabajo';
fs.mkdirSync(OUT, { recursive: true });
const fallas = [];
const ok = (c, m) => (c ? console.log('  ✓', m) : (fallas.push(m), console.log('  ✗', m)));

const { servidor, puerto } = await servir();
const { browser, page, errores } = await abrir({ ancho: +(process.env.ANCHO || 640), alto: +(process.env.ALTO || 400) });
await page.goto(`http://127.0.0.1:${puerto}/garage-vr/index.html${process.env.PARAMS || '?px=1&sinaa&sindibujo'}`);
await page.waitForFunction(() => window.garage?.juego, null, { timeout: 180000 });
await page.click('#btnPC');
await page.evaluate(() => (window.garage.escritorio.bloqueado = true));

/** Espera que pasen cuadros del juego (en software dibuja pocos por segundo). */
const esperar = async (ms) => {
  const n = Math.max(2, Math.ceil(ms / 50));
  const f0 = await page.evaluate(() => window.garage.cuadros());
  await page.waitForFunction((f) => window.garage.cuadros() >= f, f0 + n, { timeout: 120000, polling: 30 });
};
const estado = () => page.evaluate(() => JSON.parse(JSON.stringify(window.garage.juego.tr)));
const paso = () => page.evaluate(() => document.getElementById('pasoTitulo').textContent);
const captura = async (n) => {
  const f = await page.evaluate(() => (window.garage.dibujar(), window.garage.cuadros()));
  await page.waitForFunction((f) => window.garage.cuadros() > f + 1, f, { timeout: 120000 });
  await page.screenshot({ path: path.join(OUT, n + '.png') });
};

/** Se para en (x, z) y mira un punto del mundo. */
async function mirar(punto, desde) {
  await page.evaluate(({ punto, desde }) => {
    const e = window.garage.escritorio;
    if (desde) e.pos.set(desde[0], 0, desde[1]);
    if (desde && desde[2]) e.alto = e.altoObj = desde[2];
    const ox = e.pos.x, oy = e.alto, oz = e.pos.z;
    const dx = punto[0] - ox, dy = punto[1] - oy, dz = punto[2] - oz;
    e.yaw = Math.atan2(-dx, -dz);
    e.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, { punto, desde });
  await esperar(250);
}

async function evento(tipo, extra = {}) {
  await page.evaluate(({ tipo, extra }) => document.dispatchEvent(new MouseEvent(tipo, { button: 0, bubbles: true, ...extra })), { tipo, extra });
}
async function clic() {
  await evento('mousedown');
  await esperar(80);
  await evento('mouseup');
  await esperar(250);
}
/** Mantiene el clic y arrastra el mouse en X (negativo = a la izquierda). */
async function arrastrar(dxTotal, pasos = 20) {
  await evento('mousedown');
  await esperar(80);
  for (let i = 0; i < pasos; i++) {
    await evento('mousemove', { movementX: dxTotal / pasos });
    await page.waitForTimeout(15);
    if (i % 4 === 3) await esperar(50);
  }
  await esperar(150);
  await evento('mouseup');
  await esperar(200);
}
async function tecla(code) {
  await page.keyboard.down(code);
  await esperar(60);
  await page.keyboard.up(code);
  await esperar(250);
}
const pos = (expr) => page.evaluate((expr) => {
  const j = window.garage.juego;
  // eslint-disable-next-line no-new-func
  return new Function('j', `return (${expr}).toArray();`)(j);
}, expr);

console.log('1) abrir el capó');
let p = await pos(`j.capo.centro().add(new window.garage.THREE.Vector3(0, 0.0, -0.5))`);
await mirar(p, [-0.45, -2.55, 1.62]);
ok((await paso()) === 'Abrí el capó.', 'el primer paso es abrir el capó');
await clic();
ok(await page.evaluate(() => window.garage.juego.capo.sostenida != null), 'agarró el capó');
// mirar para arriba levanta el capó
for (let i = 0; i < 18; i++) {
  await page.evaluate(() => (window.garage.escritorio.pitch += 0.05));
  await esperar(60);
}
let tr = await estado();
ok(tr.capo > 38, `el capó subió (${tr.capo.toFixed(0)}°)`);
await clic();
await esperar(600);
tr = await estado();
ok(tr.varilla === 'puesta', 'en la compu la varilla se pone sola al soltar arriba');
await captura('01-capo-abierto');

console.log('2) sacar la manguera del respiradero');
p = await pos(`j.bocaMundo.clone().lerp(j.manguera.pivote.position, 0.3)`);
await mirar(p, [-0.35, -2.2, 1.55]);
await clic();
ok(await page.evaluate(() => window.garage.juego.manguera.sostenida != null), 'agarró la manguera');
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => (window.garage.escritorio.yaw -= 0.03));
  await esperar(60);
}
tr = await estado();
ok(tr.manguera === 'sacada', 'la manguera salió');
await clic();
await esperar(500);

console.log('3) la llave equivocada');
p = await pos(`j.herramientas.llave_12.centro()`);
await mirar(p, [1.0, -2.6, 1.6]);
await clic();
ok(await page.evaluate(() => window.garage.juego.herramientas.llave_12.sostenida != null), 'tomó la llave de 12');
p = await page.evaluate(() => window.garage.juego.centroTuerca(window.garage.juego.ids[0]).toArray());
await mirar(p, [-0.3, -2.0, 1.45]);
await evento('mousedown');
await esperar(200);
const aviso = await page.evaluate(() => document.getElementById('aviso').textContent);
ok(/grande/.test(aviso), `avisa que la de 12 no sirve («${aviso}»)`);
await evento('mouseup');
// la devuelve al tablero
p = await pos(`j.herramientas.llave_12.inicio.pos`);
await mirar(p, [1.0, -2.6, 1.6]);
await clic();
await esperar(500);
ok(await page.evaluate(() => { const h = window.garage.juego.herramientas.llave_12; return h.pivote.position.distanceTo(h.inicio.pos) < 0.01; }), 'la de 12 volvió a su gancho');

console.log('4) aflojar las 8 tuercas con la de 10');
p = await pos(`j.herramientas.llave_10.centro()`);
await mirar(p, [1.0, -2.6, 1.6]);
await clic();
ok(await page.evaluate(() => window.garage.juego.herramientas.llave_10.sostenida != null), 'tomó la llave de 10');
const ids = await page.evaluate(() => window.garage.juego.ids);
for (const [k, id] of ids.entries()) {
  p = await page.evaluate((id) => window.garage.juego.centroTuerca(id).toArray(), id);
  await mirar(p, [-0.3, -2.0, 1.45]);
  // forzar para despegar, después girar hasta que salga
  await arrastrar(-160, 12);
  let est = await page.evaluate((id) => window.garage.L.tuerca(window.garage.juego.tr, id).estado, id);
  for (let i = 0; i < 6 && est !== 'suelta'; i++) {
    p = await page.evaluate((id) => window.garage.juego.centroTuerca(id).toArray(), id);
    await mirar(p);
    await arrastrar(-900, 18);
    est = await page.evaluate((id) => window.garage.L.tuerca(window.garage.juego.tr, id).estado, id);
  }
  ok(est === 'suelta', `tuerca ${k + 1} suelta`);
  if (k === 0) await captura('02-llave-en-tuerca');
}
// deja la llave en el carrito
p = await page.evaluate(() => window.garage.juego.bandeja.toArray());
await mirar([p[0] + 0.15, p[1], p[2] + 0.1], [-1.3, -2.85, 1.62]);
await clic();
await esperar(700);

console.log('5) sacar las tuercas y dejarlas en la bandeja magnética');
for (const [k, id] of ids.entries()) {
  p = await page.evaluate((id) => window.garage.juego.centroTuerca(id).toArray(), id);
  await mirar(p, [-0.3, -2.0, 1.45]);
  await clic();
  const tiene = await page.evaluate(() => window.garage.escritorio.mano.sostiene?.tipo);
  ok(tiene === 'tuerca', `tiene la tuerca ${k + 1} en la mano`);
  p = await page.evaluate(() => window.garage.juego.bandeja.toArray());
  await mirar(p, [-1.3, -2.85, 1.62]);
  await clic();
  await esperar(350);
}
tr = await estado();
ok(tr.tuercas.every((t) => t.estado === 'afuera'), 'las 8 tuercas afuera');
ok(await page.evaluate(() => window.garage.juego.enBandeja.length) === 8, 'las 8 en la bandeja');
await captura('03-tuercas-en-bandeja');

console.log('6) sacar la tapa de válvulas');
p = await pos(`j.tapa.centro()`);
await mirar(p, [-0.3, -2.0, 1.45]);
await clic();
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => (window.garage.escritorio.pitch += 0.02));
  await esperar(60);
}
tr = await estado();
ok(tr.tapa === 'afuera', 'la tapa salió');
// la deja en el banco
await mirar([1.5, 0.9, -2.9], [1.2, -2.2, 1.62]);
await clic();
await esperar(900);
p = await pos(`j.tapa.pivote.position`);
ok(p[1] > 0.85 && p[1] < 1.0, `la tapa quedó sobre el banco (altura ${p[1].toFixed(2)} m)`);
await mirar([-0.5, 0.6, -1.35], [-0.35, -1.85, 1.3]);
await esperar(500);
await captura('04-sin-tapa');
ok(/Afuera/.test(await paso()), 'el paso festeja y pide volver a ponerla');

console.log('7) volver a poner la tapa');
p = await pos(`j.tapa.centro()`);
await mirar(p, [1.2, -2.2, 1.62]);
await clic();
p = await pos(`j.tapaAsiento.pos`);
await mirar(p, [-0.3, -2.0, 1.45]);
await clic();
await esperar(900);
tr = await estado();
ok(tr.tapa === 'puesta', 'la tapa volvió a su lugar');

console.log('8) poner y enroscar las tuercas');
for (const [k, id] of ids.entries()) {
  p = await page.evaluate(() => window.garage.juego.bandeja.toArray());
  await mirar(p, [-1.3, -2.85, 1.62]);
  await clic();
  p = await page.evaluate((id) => window.garage.juego.esparragos[id].pos.toArray(), id);
  await mirar(p, [-0.3, -2.0, 1.45]);
  await clic();
  await esperar(300);
  let est = await page.evaluate((id) => window.garage.L.tuerca(window.garage.juego.tr, id).estado, id);
  ok(est === 'suelta', `tuerca ${k + 1} apoyada en su espárrago`);
  for (let i = 0; i < 5 && est !== 'asentada'; i++) {
    p = await page.evaluate((id) => window.garage.juego.centroTuerca(id).toArray(), id);
    await mirar(p);
    await arrastrar(900, 18);
    est = await page.evaluate((id) => window.garage.L.tuerca(window.garage.juego.tr, id).estado, id);
  }
  ok(est === 'asentada', `tuerca ${k + 1} enroscada a mano`);
}

console.log('9) ajustar con la de 10');
p = await pos(`j.herramientas.llave_10.centro()`);
await mirar(p, [-1.3, -2.85, 1.62]);
await clic();
ok(await page.evaluate(() => window.garage.escritorio.mano.sostiene?.medida === 10), 'volvió a tomar la de 10');
for (const [k, id] of ids.entries()) {
  let est;
  for (let i = 0; i < 4; i++) {
    p = await page.evaluate((id) => window.garage.juego.centroTuerca(id).toArray(), id);
    await mirar(p, [-0.3, -2.0, 1.45]);
    await arrastrar(80, 8);
    est = await page.evaluate((id) => window.garage.L.tuerca(window.garage.juego.tr, id).estado, id);
    if (est === 'ajustada') break;
  }
  ok(est === 'ajustada', `tuerca ${k + 1} ajustada`);
}
await tecla('KeyQ');

console.log('10) volver a poner la manguera');
p = await pos(`j.manguera.muestras[Math.floor(j.manguera.muestras.length / 2)].clone().applyMatrix4(j.manguera.pivote.matrixWorld)`);
await mirar(p, [-0.35, -2.2, 1.55]);
await clic();
p = await pos(`j.bocaMundo`);
await mirar(p);
await clic();
await esperar(600);
tr = await estado();
ok(tr.manguera === 'puesta', 'manguera puesta');
ok(tr.terminado, 'trabajo terminado');
ok(/Listo/.test(await paso()), `el cartel dice que terminó («${await paso()}»)`);
await mirar([-0.5, 0.66, -1.35], [-0.3, -2.05, 1.5]);
await esperar(600);
await captura('05-terminado');

console.log(errores.length ? 'ERRORES DE LA PÁGINA:\n' + errores.join('\n') : 'sin errores en la página');
console.log(fallas.length ? `FALLARON ${fallas.length}` : 'TODO BIEN');
await browser.close();
servidor.close();
process.exit(fallas.length || errores.length ? 1 : 0);
