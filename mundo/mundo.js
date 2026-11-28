/* Mundo: la historia de la vida desde la sopa hasta hoy, como recurso para juegos.
   No simula átomos: trabaja por niveles (sopa de cadenas → especies con ADN).
   El ADN usa el código genético real; las fechas de los grandes eventos son reales;
   las especies son inventadas. Misma semilla = mismo mundo.

   Uso (navegador o Node):
     const m = Mundo.crear(1234);         // historia completa
     Mundo.traducir("ATGGCT...")          // ADN → proteína (letras de aminoácidos)
     Mundo.linaje(m, id)                  // [id, padre, abuelo, ..., LUCA]
     Mundo.ancestroComun(m, a, b)         // id del ancestro común más cercano
     Mundo.distancia(adnA, adnB)          // letras distintas
     Mundo.vivasEn(m, ma)                 // especies vivas hace `ma` millones de años
*/
(function (raiz) {
  'use strict';
  const VERSION = 2;
  const BASES = 'TCAG';
  const AA = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
  const CODIGO = {};
  for (let i = 0; i < 64; i++) CODIGO[BASES[i >> 4] + BASES[(i >> 2) & 3] + BASES[i & 3]] = AA[i];
  // Hidrofobicidad de Kyte-Doolittle, llevada a 0..1.
  const KD = { I: 4.5, V: 4.2, L: 3.8, F: 2.8, C: 2.5, M: 1.9, A: 1.8, G: -0.4, T: -0.7, S: -0.8, W: -0.9, Y: -1.3, P: -1.6, H: -3.2, E: -3.5, Q: -3.5, D: -3.5, N: -3.5, K: -3.9, R: -4.5 };
  const CARGA = { D: -1, E: -1, K: 1, R: 1, H: 0.5 };
  const GENES = ['metabolismo', 'temperatura', 'oxigeno', 'tamano', 'movimiento', 'luz', 'forma'];
  const CODONES_GEN = 24;

  // Eventos reales (millones de años atrás). Las especies reaccionan a ellos.
  const HITOS = [
    { ma: 4400, tipo: 'planeta', texto: 'La Tierra se enfría y hay océanos.' },
    { ma: 2400, tipo: 'oxigeno', texto: 'Gran Oxidación: aparece oxígeno en el aire.' },
    { ma: 720, tipo: 'frio', texto: 'Tierra bola de nieve: el planeta casi se congela.', hasta: 640 },
    { ma: 540, tipo: 'cambrico', texto: 'Explosión cámbrica: aparecen muchos cuerpos nuevos.' },
    { ma: 443, tipo: 'extincion', texto: 'Extinción del Ordovícico.', fuerza: 0.6 },
    { ma: 372, tipo: 'extincion', texto: 'Extinción del Devónico.', fuerza: 0.5 },
    { ma: 252, tipo: 'extincion', texto: 'Gran Mortandad del Pérmico: la peor de todas.', fuerza: 0.85 },
    { ma: 201, tipo: 'extincion', texto: 'Extinción del Triásico.', fuerza: 0.5 },
    { ma: 66, tipo: 'extincion', texto: 'Meteorito de fin del Cretácico.', fuerza: 0.7 },
  ];
  const NIVELES = ['célula simple', 'célula con núcleo', 'multicelular', 'cuerpo complejo'];
  const REINOS = ['animal', 'planta', 'hongo'];

  // Reino: se decide una vez, al volverse multicelular, y se hereda.
  function reinoDe(ra) {
    if (ra.luz >= 0.3 && ra.luz > ra.movimiento) return 'planta';
    if (ra.movimiento >= 0.3) return 'animal';
    return 'hongo';
  }

  // Plan de cuerpo: sale de la proteína del gen "forma" (cada letra decide algo),
  // del tamaño y de la fecha (no hay árboles antes de 385 Ma ni flores antes de 130 Ma).
  function planDe(e, genoma) {
    const p = traducir(genoma[GENES.indexOf('forma')]) || 'A';
    const n = (k) => Math.min(0.999, 'ACDEFGHIKLMNPQRSTVWY'.indexOf(p[k % p.length]) / 19);
    const t = e.rasgos.tamano, ma = e.nace;
    const metros = +(0.001 * Math.pow(10, t * 4)).toPrecision(2); // de 1 mm a 10 m
    if (e.reino === 'planta') {
      const tipos = ['alga'];
      if (ma <= 470) tipos.push('musgo');
      if (ma <= 420) tipos.push('helecho');
      if (ma <= 385) tipos.push('árbol');
      if (ma <= 130) tipos.push('planta con flor');
      const tipo = tipos[Math.min(tipos.length - 1, Math.floor(n(1) * tipos.length + t * 1.5))];
      return { tipo, medio: tipo === 'alga' ? 'agua' : 'tierra', tamanoM: tipo === 'árbol' ? Math.max(metros, 2) : metros, hojas: tipo === 'alga' ? 0 : 2 + Math.floor(n(2) * 8) };
    }
    if (e.reino === 'hongo') {
      const tipo = ma <= 440 && n(1) > 0.4 ? 'seta' : 'moho';
      return { tipo, medio: tipo === 'seta' ? 'tierra' : n(2) > 0.5 ? 'agua' : 'tierra', tamanoM: Math.min(metros, 0.5) };
    }
    const simetria = n(0) < 0.25 ? 'radial' : 'bilateral';
    let patas = simetria === 'radial' ? 0 : [0, 0, 2, 4, 4, 6, 8][Math.floor(n(1) * 7)];
    const ojos = [0, 1, 2, 2, 2, 2, 4, 6, 8][Math.floor(n(2) * 9)];
    let medio = 'agua';
    const sale = n(7) > 0.45; // no todos los linajes salen del agua
    if (sale && patas >= 6 && ma <= 400) medio = 'tierra';
    if (sale && patas === 4 && ma <= 375) medio = 'tierra';
    if (sale && patas === 2 && ma <= 230) medio = 'tierra';
    if (medio === 'agua' && n(8) < 0.6) patas = 0; // la mayoría de los de agua nada sin patas
    const alas = medio === 'tierra' && ((patas >= 6 && ma <= 325) || (patas <= 4 && ma <= 150)) && n(4) > 0.6 ? 2 * (1 + (patas >= 6 ? Math.floor(n(5) * 2) : 0)) : 0;
    const aletas = medio === 'agua' && simetria === 'bilateral' ? 2 + 2 * Math.floor(n(4) * 2) : 0;
    const cubierta = ['piel', 'caparazón', 'escamas', 'pelo', 'plumas'][Math.floor(n(6) * (medio === 'agua' ? 3 : ma <= 160 ? 5 : ma <= 220 ? 4 : 3))];
    return { tipo: alas ? 'volador' : medio === 'agua' ? (simetria === 'radial' ? 'radial de agua' : 'nadador') : 'caminante', simetria, patas, ojos, aletas, alas, cubierta, medio: alas ? 'aire' : medio, tamanoM: medio === 'agua' && simetria === 'radial' ? Math.min(metros, 2) : metros };
  }

  function azar(semilla) {
    let a = semilla >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function traducir(adn) {
    let p = '';
    for (let i = 0; i + 2 < adn.length; i += 3) {
      const aa = CODIGO[adn.substr(i, 3)];
      if (aa === '*') break;
      p += aa;
    }
    return p;
  }

  // Un rasgo sale de la proteína real: si una mutación mete un "stop" temprano,
  // la proteína queda corta y el rasgo se cae (pasa en la vida real).
  function rasgoDeGen(gen, i) {
    const p = traducir(gen);
    if (p.length < 2) return 0;
    let s = 0;
    for (const a of p) s += i % 2 ? (KD[a] + 4.5) / 9 : ((CARGA[a] || 0) + 1) / 2;
    const media = s / p.length;
    const completo = p.length / CODONES_GEN;
    return Math.max(0, Math.min(1, (media - 0.3) * 2.5)) * completo;
  }

  function rasgos(genoma) {
    const r = {};
    GENES.forEach((g, i) => { r[g] = +rasgoDeGen(genoma[i], i).toFixed(3); });
    return r;
  }

  function distancia(a, b) {
    const x = Array.isArray(a) ? a.join('') : a, y = Array.isArray(b) ? b.join('') : b;
    let d = 0;
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) d++;
    return d + Math.abs(x.length - y.length);
  }

  function ambiente(ma, r) {
    let temp = 0.85 - 0.45 * (1 - ma / 4200) + (r() - 0.5) * 0.06;
    if (ma <= 720 && ma >= 640) temp = 0.08;
    let ox = ma > 2400 ? 0.02 : ma > 600 ? 0.25 : 0.25 + 0.7 * (1 - ma / 600);
    return { ma, temp: +Math.max(0, Math.min(1, temp)).toFixed(3), oxigeno: +ox.toFixed(3) };
  }

  function crear(semilla, opciones) {
    semilla = (semilla >>> 0) || 1;
    const op = Object.assign({ paso: 10, tope: 70 }, opciones || {});
    const r = azar(semilla);
    const elegir = (s) => s[Math.floor(r() * s.length)];
    const eventos = HITOS.map((h) => ({ ma: h.ma, tipo: h.tipo, texto: h.texto, real: true }));

    // 1. La sopa: cadenas cortas de ARN que se copian con errores y a veces se pegan.
    let sopa = [];
    for (let i = 0; i < 200; i++) {
      let c = '';
      const n = 3 + Math.floor(r() * 6);
      for (let j = 0; j < n; j++) c += elegir('ACGU');
      sopa.push(c);
    }
    const copia = (c) => {
      const gc = (c.match(/[GC]/g) || []).length / c.length;
      return 0.25 + gc * 0.5 + Math.min(c.length, 30) * 0.008;
    };
    let replicador = null, vueltas = 0;
    while (!replicador && vueltas < 5000) {
      vueltas++;
      const nueva = [];
      for (const c of sopa) {
        if (r() < copia(c)) {
          let h = '';
          for (const b of c) h += r() < 0.03 ? elegir('ACGU') : b;
          nueva.push(h);
        }
        if (r() < 0.6) nueva.push(c);
      }
      for (let k = 0; k < 15 && nueva.length > 1; k++) {
        const i = Math.floor(r() * nueva.length), j = Math.floor(r() * nueva.length);
        if (i !== j) { nueva[i] += nueva[j]; nueva.splice(j, 1); }
      }
      nueva.sort((a, b) => copia(b) - copia(a));
      sopa = nueva.slice(0, 200);
      while (sopa.length < 50) sopa.push(elegir('ACGU') + elegir('ACGU') + elegir('ACGU'));
      if (sopa[0].length >= 24) replicador = sopa[0].slice(0, 24);
    }
    if (!replicador) replicador = sopa[0];
    eventos.push({ ma: 4300, tipo: 'replicador', texto: 'Primera cadena que se copia sola (ARN): ' + replicador + ' (' + vueltas + ' vueltas de sopa).' });

    // 2. LUCA: sus genes nacen del replicador (ARN → ADN) y se completan al azar.
    const semillaAdn = replicador.replace(/U/g, 'T');
    const codonAzar = () => { let c; do { c = elegir('ACGT') + elegir('ACGT') + elegir('ACGT'); } while (CODIGO[c] === '*'); return c; };
    const genLuca = (g) => {
      let s = 'ATG';
      for (let i = 1; i < CODONES_GEN; i++) {
        const t = semillaAdn.substr(((i + g * 5) * 3) % (semillaAdn.length - 2), 3);
        s += CODIGO[t] && CODIGO[t] !== '*' && r() < 0.5 ? t : codonAzar();
      }
      return s;
    };

    const silabas = ['ar', 'bo', 'ca', 'di', 'el', 'fu', 'ga', 'hi', 'lo', 'mu', 'ne', 'or', 'pi', 'qua', 'ru', 'sa', 'te', 'ul', 'vi', 'xe', 'zo', 'tri', 'pla', 'cro'];
    const finales = ['a', 'is', 'us', 'um', 'ia', 'ex', 'on'];
    const nombre = () => { let n = ''; const k = 2 + Math.floor(r() * 2); for (let i = 0; i < k; i++) n += elegir(silabas); n += elegir(finales); return n[0].toUpperCase() + n.slice(1); };

    const especies = [];
    const nueva = (padre, ma, genoma, nivel, extra) => {
      const e = Object.assign({ id: especies.length, nombre: nombre(), padre, nace: ma, muere: null, causa: null, nivel, adn: genoma.join(''), rasgos: rasgos(genoma) }, extra || {});
      e._g = genoma;
      if (e.nivel >= 2) e.reino = (padre !== null && especies[padre].reino) || reinoDe(e.rasgos);
      if (e.nivel >= 3) e.cuerpo = planDe(e, genoma);
      especies.push(e);
      return e;
    };
    const mutar = (genoma, veces) => {
      const g = genoma.slice();
      for (let k = 0; k < veces; k++) {
        const gi = Math.floor(r() * g.length);
        const pos = 3 + Math.floor(r() * (g[gi].length - 3));
        g[gi] = g[gi].slice(0, pos) + elegir('ACGT') + g[gi].slice(pos + 1);
      }
      // El gen de la forma cambia un poco más: así los cuerpos varían entre linajes.
      if (r() < 0.6) { const gi = GENES.indexOf('forma'); const pos = 3 + Math.floor(r() * (g[gi].length - 3)); g[gi] = g[gi].slice(0, pos) + elegir('ACGT') + g[gi].slice(pos + 1); }
      return g;
    };

    const luca = nueva(null, 4200, GENES.map((_, i) => genLuca(i)), 0, { nombre: 'LUCA' });
    eventos.push({ ma: 4200, tipo: 'luca', texto: 'LUCA, el ancestro común de todo lo que vive (fecha estimada real; su ADN, inventado).' });

    // 3. Especies: cambian de golpe al separarse (equilibrio puntuado) y se extinguen
    //    si no encajan con el ambiente. Antes del núcleo, se prestan genes de costado.
    const ambientes = [];
    const vivas = [luca];
    const primero = {};
    for (let ma = 4200 - op.paso; ma >= 0; ma -= op.paso) {
      const amb = ambiente(ma, r);
      ambientes.push(amb);
      const hito = HITOS.find((h) => h.tipo === 'extincion' && h.ma <= ma + op.paso && h.ma > ma);
      const cambrico = ma <= 540;
      const nacidas = [];
      // Compiten con los de su nivel (y, si son multicelulares, con los de su reino).
      const clave = (v) => v.reino || v.nivel;
      const porNivel = {};
      for (const v of vivas) porNivel[clave(v)] = (porNivel[clave(v)] || 0) + 1;
      for (const e of vivas) {
        // Las células simples sin oxígeno sobreviven en rincones sin aire (como hoy).
        const ox = amb.oxigeno > 0.2 ? Math.max(0, 0.35 - e.rasgos.oxigeno) * (e.nivel === 0 ? 0.2 : 1) : 0;
        const desajuste = Math.abs(e.rasgos.temperatura - amb.temp) * (e.nivel === 0 ? 0.6 : 1) + ox;
        let pMuere = 0.01 + desajuste * 0.12 + Math.max(0, porNivel[clave(e)] - op.tope / 2) * 0.012;
        if (hito) pMuere += hito.fuerza * (e.nivel === 0 ? 0.3 : 0.6 + 0.4 * e.rasgos.tamano);
        if (e !== luca || vivas.length > 1) {
          if (r() < pMuere) { e.muere = ma; e.causa = hito ? hito.texto : desajuste > 0.4 ? 'No se adaptó al ambiente.' : 'Le ganaron otras.'; continue; }
        }
        const pHija = 0.05 + e.rasgos.metabolismo * 0.12 + (cambrico && e.nivel >= 2 ? 0.1 : 0) + (e.reino === 'planta' ? e.rasgos.luz * 0.05 : 0);
        if (r() < pHija) {
          let g = mutar(e._g, 2 + Math.floor(r() * 5));
          let nivel = e.nivel, extra = {};
          if (nivel === 0 && ma < 2400 && vivas.length > 1 && r() < 0.15) {
            const otra = elegir(vivas.filter((v) => v !== e && v.nivel === 0 && !v.muere));
            if (otra) { const gi = Math.floor(r() * GENES.length); g[gi] = otra._g[gi]; extra.prestamo = { de: otra.id, gen: GENES[gi] }; }
          }
          if (nivel === 0 && ma <= 2000 && e.rasgos.oxigeno > 0.4 && r() < 0.08) nivel = 1;
          else if (nivel === 1 && ma <= 1200 && e.rasgos.tamano > 0.2 && r() < 0.12) nivel = 2;
          else if (nivel === 2 && cambrico && r() < 0.35) nivel = 3;
          const h = nueva(e.id, ma, g, nivel, extra);
          if (nivel > e.nivel && primero[nivel] === undefined) {
            primero[nivel] = h.id;
            eventos.push({ ma, tipo: 'nivel', texto: 'Primer ser de tipo «' + NIVELES[nivel] + '»: ' + h.nombre + '.', especie: h.id });
          }
          nacidas.push(h);
        }
      }
      for (let i = vivas.length - 1; i >= 0; i--) if (vivas[i].muere !== null) vivas.splice(i, 1);
      vivas.push(...nacidas);
      if (!vivas.length) { // la vida no se corta del todo: sobrevive la última
        const ult = especies[especies.length - 1];
        ult.muere = null; ult.causa = null; vivas.push(ult);
      }
    }
    especies.forEach((e) => delete e._g);
    eventos.sort((a, b) => b.ma - a.ma);
    return { version: VERSION, semilla, genes: GENES, codonesPorGen: CODONES_GEN, niveles: NIVELES, reinos: REINOS, eventos, ambiente: ambientes, especies };
  }

  function linaje(m, id) {
    const out = [];
    for (let e = m.especies[id]; e; e = e.padre === null ? null : m.especies[e.padre]) out.push(e.id);
    return out;
  }
  function ancestroComun(m, a, b) {
    const la = new Set(linaje(m, a));
    for (const x of linaje(m, b)) if (la.has(x)) return x;
    return null;
  }
  function vivasEn(m, ma) {
    return m.especies.filter((e) => e.nace >= ma && (e.muere === null || e.muere < ma));
  }

  const Mundo = { VERSION, CODIGO, GENES, crear, traducir, rasgos: (adn) => rasgos(adn.match(new RegExp('.{' + CODONES_GEN * 3 + '}', 'g'))), linaje, ancestroComun, distancia, vivasEn };
  if (typeof module !== 'undefined' && module.exports) module.exports = Mundo;
  else raiz.Mundo = Mundo;
})(typeof self !== 'undefined' ? self : this);
