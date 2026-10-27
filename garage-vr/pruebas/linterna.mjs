// Captura con la linterna en la mano apuntando al vano (la única luz en tiempo real).
// Uso: node pruebas/linterna.mjs <carpeta-capturas>
import fs from 'node:fs';
import path from 'node:path';
import { servir, abrir } from './navegador.mjs';

const OUT = process.argv[2] || '/tmp/garage-linterna';
fs.mkdirSync(OUT, { recursive: true });
const { servidor, puerto } = await servir();
const { browser, page, errores } = await abrir({ ancho: 1000, alto: 625 });
await page.goto(`http://127.0.0.1:${puerto}/garage-vr/index.html?px=1&sinaa`);
await page.waitForFunction(() => window.garage?.juego, null, { timeout: 180000 });
await page.click('#btnPC');
await page.evaluate(() => {
  const g = window.garage, j = g.juego, e = g.escritorio, T = g.THREE;
  e.bloqueado = true;
  j.ponerCapo(j.anguloVarilla);
  g.L.ponerVarilla(j.tr);
  j.apuntarVarilla(j.slotMundo());
  // parado frente al auto, un poco agachado, mirando el motor
  e.pos.set(-0.3, 0, -2.1);
  e.alto = e.altoObj = 1.4;
  const p = new T.Vector3(-0.5, 0.62, -1.35);
  const dx = p.x - e.pos.x, dy = p.y - e.alto, dz = p.z - e.pos.z;
  e.yaw = Math.atan2(-dx, -dz);
  e.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  // la linterna en la mano
  e.mano.activa = true;
  j.agarrar(e.mano, j.herramientas.linterna);
  e.mano.datos.ofsBase = e._offsetEnMano(j.herramientas.linterna);
  e.mano.offset.copy(e.mano.datos.ofsBase);
});
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(OUT, 'linterna-prendida.png') });
await page.evaluate(() => (window.garage.juego.luz.intensity = 0));
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(OUT, 'linterna-apagada.png') });
console.log(errores.length ? errores.join('\n') : 'sin errores');
await browser.close();
servidor.close();
