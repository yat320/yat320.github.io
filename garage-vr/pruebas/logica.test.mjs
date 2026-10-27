// Pruebas de la lógica del trabajo: node --test pruebas/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logica.js';
import fs from 'node:fs';

const datos = JSON.parse(fs.readFileSync(new URL('../datos/ap16-tapa.json', import.meta.url)));
const tapa = datos.piezas.find((p) => p.id === 'tapa-valvulas');
const ids = tapa.fijaciones.map((f) => f.id);

/** gira de a pasos chicos, como la mano en el visor */
function girarDeA(t, total, paso, conLlave) {
  const ev = [];
  let hecho = 0;
  for (let i = 0; i < 2000 && Math.abs(hecho) < Math.abs(total); i++) {
    const r = L.girar(t, Math.sign(total) * paso, { conLlave });
    if (r.evento) ev.push(r.evento);
    hecho += r.giro || Math.sign(total) * paso;
  }
  return ev;
}

test('los datos del taller: 8 tuercas de 10 mm a 10 Nm', () => {
  assert.equal(ids.length, 8);
  for (const f of tapa.fijaciones) {
    assert.equal(f.medida, 10);
    assert.equal(f.encastre, 'hex');
    assert.deepEqual(f.apriete, [{ kind: 'nm', value: 10 }]);
  }
});

test('una tuerca ajustada no se afloja a mano', () => {
  const t = L.nuevaTuerca('x');
  const r = L.girar(t, 40, { conLlave: false });
  assert.equal(r.evento, 'necesita_llave');
  assert.equal(r.giro, 0);
  assert.equal(t.estado, 'ajustada');
});

test('con la llave hay que forzar para despegarla', () => {
  const t = L.nuevaTuerca('x');
  const poco = L.girar(t, 10, { conLlave: true });
  assert.equal(poco.evento, 'forcejeo');
  assert.equal(poco.giro, 0);
  assert.ok(poco.tension > 0 && poco.tension < 1);
  const fuerte = L.girar(t, L.DESPEGUE + 2, { conLlave: true });
  assert.equal(fuerte.evento, 'despego');
  assert.equal(t.estado, 'floja');
  assert.ok(fuerte.giro > 0);
});

test('después de despegar sale en dos vueltas y queda suelta arriba del espárrago', () => {
  const t = L.nuevaTuerca('x');
  L.girar(t, 30, { conLlave: true });
  const ev = girarDeA(t, 360 * 3, 7, false);
  assert.ok(ev.includes('salio'));
  assert.equal(t.estado, 'suelta');
  assert.equal(L.alturaTuerca(t), L.VUELTAS * L.PASO + 0.5);
});

test('poner, enroscar a mano, asentar y ajustar con la llave', () => {
  const tr = L.nuevoTrabajo(ids);
  for (const t of tr.tuercas) t.estado = 'afuera';
  tr.manguera = 'sacada';
  tr.capo = 60;
  assert.equal(L.sacarTapa(tr).ok, true);
  // sin tapa la tuerca no apoya
  assert.equal(L.ponerTuerca(tr, ids[0]).ok, false);
  assert.equal(L.ponerTapa(tr).ok, true);
  const t = L.tuerca(tr, ids[0]);
  assert.equal(L.ponerTuerca(tr, ids[0]).ok, true);
  assert.equal(t.estado, 'suelta');
  const ev = girarDeA(t, -360 * 3, 9, false);
  assert.ok(ev.includes('enrosco'));
  assert.ok(ev.includes('asento'));
  assert.equal(t.estado, 'asentada');
  // a mano no se ajusta
  assert.equal(L.girar(t, -10, { conLlave: false }).evento, 'a_mano_no');
  // con la llave hace clic al llegar al apriete
  const ev2 = [];
  for (let i = 0; i < 20 && t.estado !== 'ajustada'; i++) {
    const r = L.girar(t, -4, { conLlave: true });
    if (r.evento) ev2.push(r.evento);
  }
  assert.ok(ev2.includes('ajustada'));
  assert.ok(t.apriete >= L.AJUSTE && t.apriete < L.DE_MAS);
});

test('apretar de más avisa y frena', () => {
  const t = L.nuevaTuerca('x');
  t.estado = 'asentada';
  t.apriete = 0;
  let ultimo;
  for (let i = 0; i < 100; i++) ultimo = L.girar(t, -5, { conLlave: true });
  assert.equal(ultimo.evento, 'de_mas');
  assert.ok(t.apriete <= L.DE_MAS + 1e-9);
});

test('la tapa no sale con tuercas puestas ni con la manguera', () => {
  const tr = L.nuevoTrabajo(ids);
  assert.match(L.puedeSacarTapa(tr), /manguera/);
  tr.capo = 60;
  assert.equal(L.sacarManguera(tr).ok, true);
  assert.match(L.puedeSacarTapa(tr), /Faltan sacar 8 tuercas/);
  for (const t of tr.tuercas.slice(0, 7)) t.estado = 'afuera';
  assert.match(L.puedeSacarTapa(tr), /Falta sacar una tuerca/);
  tr.tuercas[7].estado = 'afuera';
  assert.equal(L.puedeSacarTapa(tr), null);
});

test('una tuerca enroscada no se saca con la mano', () => {
  const tr = L.nuevoTrabajo(ids);
  const r = L.sacarTuerca(tr, ids[2]);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /llave de 10/);
});

test('el capó sin varilla se cae', () => {
  const tr = L.nuevoTrabajo(ids);
  tr.capo = 25;
  assert.equal(L.soltarCapo(tr), 'cae');
  assert.equal(L.ponerVarilla(tr).ok, false);
  tr.capo = 58;
  assert.equal(L.ponerVarilla(tr).ok, true);
  assert.equal(L.soltarCapo(tr), 'queda');
});

test('la llave justa es la de 10', () => {
  assert.equal(L.llaveSirve(10), null);
  assert.match(L.llaveSirve(8), /no entra/);
  assert.match(L.llaveSirve(12), /grande/);
});

test('el trabajo entero, de punta a punta', () => {
  const tr = L.nuevoTrabajo(ids);
  tr.inicio = 0;
  const pasos = [];
  const anotar = (ctx) => pasos.push(L.proximoPaso(tr, ctx).titulo);
  anotar();
  tr.capo = 60;
  anotar();
  assert.equal(L.ponerVarilla(tr).ok, true);
  anotar();
  assert.equal(L.sacarManguera(tr).ok, true);
  anotar();
  anotar({ enMano: { tipo: 'llave', medida: 12 } });
  for (const t of tr.tuercas) {
    L.girar(t, 30, { conLlave: true });
    girarDeA(t, 800, 10, true);
    assert.equal(t.estado, 'suelta');
  }
  anotar({ enMano: { tipo: 'llave', medida: 10 } });
  for (const t of tr.tuercas) assert.equal(L.sacarTuerca(tr, t.id).ok, true);
  anotar();
  assert.equal(L.sacarTapa(tr).ok, true);
  anotar();
  assert.equal(L.ponerTapa(tr).ok, true);
  anotar();
  for (const t of tr.tuercas) {
    assert.equal(L.ponerTuerca(tr, t.id).ok, true);
    girarDeA(t, -800, 10, false);
    assert.equal(t.estado, 'asentada');
  }
  anotar();
  for (const t of tr.tuercas) for (let i = 0; i < 20 && t.estado !== 'ajustada'; i++) L.girar(t, -4, { conLlave: true });
  anotar();
  assert.equal(L.revisarFin(tr, 125000), false);
  assert.equal(L.ponerManguera(tr).ok, true);
  assert.equal(tr.terminado, true);
  tr.fin = 125000;
  anotar();
  assert.deepEqual(pasos, [
    'Abrí el capó.',
    'Sostené el capó con la varilla.',
    'Sacá la manguera del respiradero.',
    'Buscá la llave de 10 en el tablero.',
    'La de 12 le queda grande y baila. Las tuercas de la tapa son de 10.',
    'Sacá las tuercas sueltas (8).',
    'Sacá la tapa de válvulas.',
    '¡Afuera! Ahí ves el árbol de levas y los botadores.',
    'Poné las tuercas en los espárragos (faltan 8).',
    'Ajustalas con la llave de 10 (faltan 8).',
    'Volvé a poner la manguera del respiradero.',
    '¡Listo! Tapa de válvulas sacada y puesta en 2 min 5 s.',
  ]);
});
