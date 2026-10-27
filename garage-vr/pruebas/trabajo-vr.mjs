// Prueba en realidad virtual con un Quest 3 emulado (IWER, el emulador de Meta):
// con controles abre el capó, pone la varilla, saca la manguera, calza la llave de 10 y afloja una tuerca girando la mano;
// con seguimiento de manos saca la tuerca con un pellizco, la lleva a la bandeja, levanta la tapa y la vuelve a poner,
// y enrosca una tuerca girando la muñeca.
// Uso: node pruebas/trabajo-vr.mjs [carpeta-capturas]
import fs from 'node:fs';
import path from 'node:path';
import { servir, abrir } from './navegador.mjs';

const OUT = process.argv[2] || '/tmp/garage-vr';
fs.mkdirSync(OUT, { recursive: true });
const fallas = [];
const ok = (c, m) => (c ? console.log('  ✓', m) : (fallas.push(m), console.log('  ✗', m)));

const { servidor, puerto } = await servir();
const { browser, page, errores } = await abrir({ iwer: true, ancho: 640, alto: 400 });
await page.goto(`http://127.0.0.1:${puerto}/garage-vr/index.html${process.env.PARAMS || '?px=1&sinaa&escala=0.12&sindibujo'}`);
await page.waitForFunction(() => window.garage?.juego, null, { timeout: 180000 });
await page.waitForFunction(() => !document.getElementById('btnVR').disabled, null, { timeout: 20000 });
/** Espera que pasen cuadros del juego (en software dibuja pocos por segundo). */
process.on('unhandledRejection', async (e) => {
  console.log('SE CORTÓ:', e.message.split('\n')[0]);
  console.log('ERRORES DE LA PÁGINA:\n' + errores.join('\n'));
  process.exit(1);
});
const esperar = async (ms) => {
  const n = Math.max(2, Math.ceil(ms / 50));
  const f0 = await page.evaluate(() => window.garage.cuadros());
  await page.waitForFunction((f) => window.garage.cuadros() >= f, f0 + n, { timeout: 120000, polling: 30 });
};
const captura = async (n) => {
  const f = await page.evaluate(() => (window.garage.dibujar(), window.garage.cuadros()));
  await page.waitForFunction((f) => window.garage.cuadros() > f + 1, f, { timeout: 120000 });
  await page.screenshot({ path: path.join(OUT, n + '.png') });
};
const estado = () => page.evaluate(() => JSON.parse(JSON.stringify(window.garage.juego.tr)));

// ayudas dentro de la página: llevar un control o una mano a una pose del mundo
await page.evaluate(() => {
  const g = window.garage;
  const T = g.THREE;
  window.__vr = {
    mano(lado) {
      return g.rv.manos.find((m) => m.lado === lado);
    },
    /** Lleva el punto de agarre de esa mano a p (mundo) con orientación q (mundo), corrigiendo el error. */
    async llevar(lado, p, q) {
      const disp = lado === 'izquierda' ? window.__xr.controllers?.left : window.__xr.controllers?.right;
      const mano = window.__xr.primaryInputMode === 'hand' ? (lado === 'izquierda' ? window.__xr.hands.left : window.__xr.hands.right) : disp;
      const rig = g.rv.rig;
      const invRig = rig.matrixWorld.clone().invert();
      const qRigInv = rig.getWorldQuaternion(new T.Quaternion()).invert();
      const P = new T.Vector3(...p), Q = q ? new T.Quaternion(...q) : null;
      const cuadro = () => new Promise((r) => {
        const f = g.cuadros();
        const c = () => (g.cuadros() > f + 1 ? r() : setTimeout(c, 15));
        c();
      });
      const m = this.mano(lado);
      // orientación: la del dispositivo y la de la mano difieren en un giro fijo K (se mide una vez)
      if (Q) {
        if (!this.K) this.K = {};
        if (!this.K[lado + window.__xr.primaryInputMode]) {
          const qs = new T.Quaternion(mano.quaternion.x, mano.quaternion.y, mano.quaternion.z, mano.quaternion.w);
          const qMundo = rig.getWorldQuaternion(new T.Quaternion()).multiply(qs);
          this.K[lado + window.__xr.primaryInputMode] = qMundo.clone().invert().multiply(m.obj.quaternion);
        }
        const K = this.K[lado + window.__xr.primaryInputMode];
        const qSet = qRigInv.clone().multiply(Q.clone().multiply(K.clone().invert()));
        mano.quaternion.set(qSet.x, qSet.y, qSet.z, qSet.w);
      }
      let objetivo = P.clone();
      for (let i = 0; i < 6; i++) {
        const loc = objetivo.clone().applyMatrix4(invRig);
        mano.position.set(loc.x, loc.y, loc.z);
        await cuadro();
        const err = P.clone().sub(m.obj.position);
        objetivo.add(err);
        if (err.length() < 0.002) break;
      }
      return this.mano(lado).obj.position.distanceTo(P);
    },
    apretar(lado, v) {
      if (window.__xr.primaryInputMode === 'hand') (lado === 'izquierda' ? window.__xr.hands.left : window.__xr.hands.right).updatePinchValue(v);
      else (lado === 'izquierda' ? window.__xr.controllers.left : window.__xr.controllers.right).updateButtonValue('squeeze', v);
    },
    pose(lado) {
      const m = this.mano(lado);
      return { p: m.obj.position.toArray(), q: m.obj.quaternion.toArray() };
    },
  };
});
const llevar = (lado, p, q) => page.evaluate(({ lado, p, q }) => window.__vr.llevar(lado, p, q), { lado, p, q });
const apretar = async (lado, v) => {
  await page.evaluate(({ lado, v }) => window.__vr.apretar(lado, v), { lado, v });
  await esperar(150);
};

console.log('1) entrar en realidad virtual');
await page.click('#btnVR');
await esperar(2500);
ok(await page.evaluate(() => window.garage.rv.activa), 'entró en realidad virtual');
ok(await page.evaluate(() => window.garage.rv.manos.every((m) => m.activa && m.tipo === 'control')), 'aparecen los dos controles');
await captura('vr-01-entro');

console.log('2) abrir el capó con el control derecho');
const borde = await page.evaluate(() => {
  const j = window.garage.juego;
  const c = j.capo;
  const T = window.garage.THREE;
  const p = new T.Vector3((c.caja.min.x + c.caja.max.x) / 2 + 0.25, c.caja.max.y, c.caja.min.z + 0.06).applyMatrix4(c.pivote.matrixWorld);
  return p.toArray();
});
await llevar('derecha', borde);
await apretar('derecha', 1);
ok(await page.evaluate(() => window.garage.juego.capo.sostenida != null), 'agarró el capó');
// sube por el arco de la bisagra
const arco = await page.evaluate(() => {
  const j = window.garage.juego;
  const T = window.garage.THREE;
  const h = j.capo.pivote.position;
  const p0 = new T.Vector3(...window.__vr.pose('derecha').p);
  const pts = [];
  for (let a = 4; a <= 48; a += 4) pts.push(p0.clone().sub(h).applyAxisAngle(new T.Vector3(1, 0, 0), (a * Math.PI) / 180).add(h).toArray());
  return pts;
});
for (const p of arco) await llevar('derecha', p);
let tr = await estado();
ok(tr.capo > 40, `el capó se levantó (${tr.capo.toFixed(0)}°)`);

console.log('3) poner la varilla con el control izquierdo');
const punta = await page.evaluate(() => window.garage.juego.puntaVarilla().toArray());
await llevar('izquierda', punta);
await apretar('izquierda', 1);
ok(await page.evaluate(() => window.garage.juego.varilla.sostenida != null), 'agarró la varilla');
const camino = await page.evaluate(() => {
  const j = window.garage.juego;
  const T = window.garage.THREE;
  const a = j.puntaVarilla(), b = j.slotMundo();
  const pts = [];
  for (let k = 1; k <= 10; k++) pts.push(new T.Vector3().lerpVectors(a, b, k / 10).add(new T.Vector3(0, 0.06 * Math.sin((Math.PI * k) / 10), 0)).toArray());
  return pts;
});
for (const p of camino) await llevar('izquierda', p);
await apretar('izquierda', 0);
await apretar('derecha', 0);
await esperar(700);
tr = await estado();
ok(tr.varilla === 'puesta', 'la varilla quedó puesta');
ok(Math.abs(tr.capo - (await page.evaluate(() => window.garage.juego.anguloVarilla))) < 1.5, 'el capó apoya en la varilla');
await captura('vr-02-capo');

console.log('4) sacar la manguera del respiradero');
const boca = await page.evaluate(() => {
  const j = window.garage.juego;
  return j.bocaMundo.clone().lerp(j.manguera.pivote.position, 0.25).toArray();
});
await llevar('derecha', boca);
await apretar('derecha', 1);
ok(await page.evaluate(() => window.garage.juego.manguera.sostenida != null), 'agarró la manguera');
await llevar('derecha', [boca[0] + 0.04, boca[1] + 0.05, boca[2]]);
tr = await estado();
ok(tr.manguera === 'sacada', 'salió de la boca de la tapa');
await apretar('derecha', 0);

console.log('5) la llave de 10: calzar en la tuerca y aflojar girando la mano');
const llave = await page.evaluate(() => window.garage.juego.herramientas.llave_10.centro().toArray());
await llevar('derecha', llave);
await apretar('derecha', 1);
ok(await page.evaluate(() => window.garage.juego.herramientas.llave_10.sostenida != null), 'tomó la llave de 10 del tablero');
// la mano que deja la estría calzada en la tuerca 1, acostada y con el mango hacia el frente del auto
const poseCalzar = await page.evaluate(() => {
  const g = window.garage, j = g.juego, T = g.THREE;
  const h = j.herramientas.llave_10;
  const m = window.__vr.mano('derecha');
  const id = j.ids[0];
  const c = j.centroTuerca(id);
  const dir = new T.Vector3(0.3, 0, -1).normalize(); // del centro de la tuerca hacia el mango
  const X = dir.clone().negate(), Y = new T.Vector3(0, 1, 0), Z = new T.Vector3().crossVectors(X, Y).normalize();
  const mEstria = new T.Matrix4().makeBasis(X, Y, Z).setPosition(c);
  const mPivote = mEstria.clone().multiply(h.estriaInv);
  const mMano = mPivote.clone().multiply(m.offset.clone().invert());
  const p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
  mMano.decompose(p, q, s);
  return { p: p.toArray(), q: q.toArray(), c: c.toArray() };
});
// se acerca desde arriba
await llevar('derecha', [poseCalzar.p[0], poseCalzar.p[1] + 0.06, poseCalzar.p[2]], poseCalzar.q);
await llevar('derecha', poseCalzar.p, poseCalzar.q);
await esperar(200);
ok(await page.evaluate(() => window.__vr.mano('derecha').modo === 'llave'), 'la estría calzó en la tuerca');
await captura('vr-03-llave');
// gira la mano alrededor de la tuerca, antihorario visto desde arriba
const vueltas = await page.evaluate(({ poseCalzar }) => {
  const T = window.garage.THREE;
  const c = new T.Vector3(...poseCalzar.c);
  const p0 = new T.Vector3(...poseCalzar.p);
  const q0 = new T.Quaternion(...poseCalzar.q);
  const pts = [];
  for (let a = 6; a <= 800; a += 6) {
    const r = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), (a * Math.PI) / 180);
    pts.push({ p: p0.clone().sub(c).applyQuaternion(r).add(c).toArray(), q: r.clone().multiply(q0).toArray() });
  }
  return pts;
}, { poseCalzar });
let eventos = new Set();
for (const v of vueltas) {
  await llevar('derecha', v.p, v.q);
  const e = await page.evaluate(() => window.garage.L.tuerca(window.garage.juego.tr, window.garage.juego.ids[0]).estado);
  eventos.add(e);
  if (e === 'suelta') break;
}
ok(eventos.has('floja'), 'la tuerca despegó');
ok(eventos.has('suelta'), 'después de dos vueltas quedó suelta');
await apretar('derecha', 0);
await esperar(600);

console.log('6) con las manos: sacar la tuerca con un pellizco y dejarla en la bandeja');
await page.evaluate(() => (window.__xr.primaryInputMode = 'hand'));
await esperar(1500);
ok(await page.evaluate(() => window.garage.rv.manos.some((m) => m.activa && m.tipo === 'mano')), 'pasó a seguimiento de manos');
const cTuerca = await page.evaluate(() => window.garage.juego.centroTuerca(window.garage.juego.ids[0]).toArray());
await llevar('izquierda', cTuerca);
await apretar('izquierda', 1);
await esperar(200);
ok(await page.evaluate(() => window.__vr.mano('izquierda').sostiene?.tipo === 'tuerca'), 'pellizcó la tuerca');
await llevar('izquierda', [cTuerca[0], cTuerca[1] + 0.05, cTuerca[2]]);
ok(await page.evaluate(() => window.garage.L.tuerca(window.garage.juego.tr, window.garage.juego.ids[0]).estado === 'afuera'), 'la sacó del espárrago');
const bandeja = await page.evaluate(() => window.garage.juego.bandeja.toArray());
await llevar('izquierda', [bandeja[0], bandeja[1] + 0.06, bandeja[2]]);
await apretar('izquierda', 0);
await esperar(600);
ok(await page.evaluate(() => window.garage.juego.enBandeja.length === 1), 'quedó en la bandeja magnética');
await captura('vr-04-manos');

console.log('7) la tapa: no sale con tuercas puestas; sin tuercas sí, y vuelve a su lugar');
const cTapa = await page.evaluate(() => window.garage.juego.tapa.centro().toArray());
await llevar('derecha', cTapa);
await apretar('derecha', 1);
ok(await page.evaluate(() => window.garage.juego.tapa.sostenida == null), 'con 7 tuercas puestas no la deja agarrar');
await apretar('derecha', 0);
// las otras siete se sacan por la lógica (ya se probó el camino entero en la compu)
await page.evaluate(() => {
  const j = window.garage.juego, L = window.garage.L;
  for (const t of j.tuercas.filter((t) => t.en)) {
    const est = L.tuerca(j.tr, t.en);
    est.estado = 'suelta';
    L.sacarTuerca(j.tr, t.en);
    t.en = null;
    t.libre = true;
    j.aBandeja(t);
  }
});
await esperar(500);
await llevar('derecha', cTapa);
await apretar('derecha', 1);
ok(await page.evaluate(() => window.garage.juego.tapa.sostenida != null), 'ahora sí la agarra');
for (let k = 1; k <= 6; k++) await llevar('derecha', [cTapa[0], cTapa[1] + 0.01 * k, cTapa[2]]);
tr = await estado();
ok(tr.tapa === 'afuera', 'subió derecho por los espárragos y salió');
await llevar('derecha', [cTapa[0] + 0.25, cTapa[1] + 0.3, cTapa[2] - 0.3]);
await esperar(200);
await captura('vr-05-tapa-en-la-mano');
// la vuelve a llevar arriba de su lugar, derecha
await llevar('derecha', [cTapa[0], cTapa[1] + 0.06, cTapa[2]]);
await apretar('derecha', 0);
await esperar(900);
tr = await estado();
ok(tr.tapa === 'puesta', 'la tapa volvió a su lugar');

console.log('8) enroscar una tuerca girando la muñeca');
const t0 = await page.evaluate(() => {
  const j = window.garage.juego;
  return j.enBandeja[0].centro().toArray();
});
await llevar('izquierda', t0);
await apretar('izquierda', 1);
// la mano va adonde la tuerca queda justo arriba de su espárrago
const poseTuerca = await page.evaluate(() => {
  const g = window.garage, j = g.juego, T = g.THREE;
  const m = window.__vr.mano('izquierda');
  const destino = new T.Matrix4().makeTranslation(j.esparragos[j.ids[0]].pos.clone().add(new T.Vector3(0, 0.012, 0)));
  const mano = destino.multiply(m.offset.clone().invert());
  const p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
  mano.decompose(p, q, s);
  return { p: p.toArray(), q: q.toArray() };
});
await llevar('izquierda', poseTuerca.p, poseTuerca.q);
await apretar('izquierda', 0);
await esperar(500);
let est = await page.evaluate(() => window.garage.L.tuerca(window.garage.juego.tr, window.garage.juego.ids[0]).estado);
ok(est === 'suelta', 'la tuerca quedó apoyada en el espárrago');
const ct = await page.evaluate(() => window.garage.juego.centroTuerca(window.garage.juego.ids[0]).toArray());
await llevar('izquierda', ct);
await apretar('izquierda', 1);
const base = await page.evaluate(() => window.__vr.pose('izquierda'));
// girar la muñeca a la derecha (horario visto desde arriba) de a 30°, soltando y volviendo como haría una mano
for (let i = 0; i < 40 && est !== 'asentada'; i++) {
  if (process.env.DEPURAR && i === 8) await page.evaluate(() => { const j = window.garage.juego; const L = window.garage.L; const orig = j.girarTuerca.bind(j); window.__log = []; j.girarTuerca = (id, g, c, m) => { const a = L.tuerca(j.tr, id); const e0 = a.estado + ':' + a.vueltas.toFixed(3); const r = orig(id, g, c, m); window.__log.push([g.toFixed(1), e0, a.estado + ':' + a.vueltas.toFixed(3), r.evento, m ? m.firme : 'x', m?.apretado]); return r; }; });
  const pinza = await page.evaluate(() => window.__vr.pose('izquierda'));
  for (let a = 0; a >= -90; a -= 15) {
    await page.evaluate(({ pinza, a }) => {
      const T = window.garage.THREE;
      const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), (a * Math.PI) / 180).multiply(new T.Quaternion(...pinza.q));
      return window.__vr.llevar('izquierda', pinza.p, q.toArray());
    }, { pinza, a });
  }
  await apretar('izquierda', 0);
  // vuelve a poner los dedos alrededor de la tuerca (que ya bajó un poco)
  await page.evaluate(({ base }) => window.__vr.llevar('izquierda', window.garage.juego.centroTuerca(window.garage.juego.ids[0]).toArray(), base.q), { base });
  await apretar('izquierda', 1);
  est = await page.evaluate(() => window.garage.L.tuerca(window.garage.juego.tr, window.garage.juego.ids[0]).estado);
  if (process.env.DEPURAR && i === 8) console.log(JSON.stringify(await page.evaluate(() => window.__log)));
  if (process.env.DEPURAR) console.log('    vuelta', i, JSON.stringify(await page.evaluate(() => { const j = window.garage.juego, m = window.__vr.mano('izquierda'); const t = window.garage.L.tuerca(j.tr, j.ids[0]); return { est: t.estado, vueltas: +t.vueltas.toFixed(3), modo: m.modo, sost: m.sostiene?.nombre }; })));
}
ok(est === 'asentada', 'girando la muñeca quedó enroscada hasta apoyar');
await apretar('izquierda', 0);
await captura('vr-06-final');

console.log(errores.length ? 'ERRORES DE LA PÁGINA:\n' + errores.join('\n') : 'sin errores en la página');
console.log(fallas.length ? `FALLARON ${fallas.length}` : 'TODO BIEN');
await browser.close();
servidor.close();
process.exit(fallas.length || errores.length ? 1 : 0);
