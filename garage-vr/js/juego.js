// El trabajo en 3D: piezas que se agarran, cómo se mueve cada una y cómo eso llega a la lógica (logica.js).
// Las "manos" pueden ser controles del visor, manos con seguimiento o el mouse (escritorio).
import * as THREE from 'three';
import * as L from './logica.js';

const ARRIBA = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4();
const rad = THREE.MathUtils.degToRad, deg = THREE.MathUtils.radToDeg;

const HERRAMIENTAS = ['llave_8', 'llave_10', 'llave_12', 'llave_13', 'llave_17', 'destornillador', 'pinza', 'martillo', 'linterna'];

/** Diferencia de ángulo en grados, entre -180 y 180. */
function difAng(a) {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

/** Giro alrededor del eje vertical de una rotación (descomposición giro-torsión). */
function torsionY(q) {
  // q y -q son la misma rotación: se toma la de w positivo para no saltar una vuelta entera
  const s = q.w < 0 ? -1 : 1;
  return difAng(deg(2 * Math.atan2(q.y * s, q.w * s)));
}

/** Ángulo de un vector horizontal alrededor de +Y (positivo = antihorario visto desde arriba). */
function anguloY(v) {
  return deg(Math.atan2(-v.z, v.x));
}

class Pieza {
  constructor(nombre, nodo, tipo, ancla, escena) {
    this.nombre = nombre;
    this.tipo = tipo;
    this.nodo = nodo;
    this.pivote = new THREE.Object3D();
    this.pivote.name = 'pivote_' + nombre;
    escena.add(this.pivote);
    if (ancla) {
      ancla.updateWorldMatrix(true, false);
      ancla.matrixWorld.decompose(this.pivote.position, this.pivote.quaternion, v1);
    } else {
      nodo.updateWorldMatrix(true, false);
      nodo.matrixWorld.decompose(this.pivote.position, this.pivote.quaternion, v1);
    }
    this.pivote.updateMatrixWorld(true);
    this.pivote.attach(nodo);
    this.inicio = { pos: this.pivote.position.clone(), quat: this.pivote.quaternion.clone() };
    // caja en el espacio del pivote (para saber si la mano está cerca)
    this.caja = new THREE.Box3();
    const inv = new THREE.Matrix4().copy(this.pivote.matrixWorld).invert();
    this.mallas = [];
    this.materiales = [];
    nodo.updateMatrixWorld(true);
    nodo.traverse((o) => {
      if (!o.isMesh) return;
      this.mallas.push(o);
      if (!this.materiales.includes(o.material)) this.materiales.push(o.material);
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(m1.multiplyMatrices(inv, o.matrixWorld));
      this.caja.union(b);
      o.userData.pieza = this;
    });
    const s = this.caja.getSize(new THREE.Vector3());
    this.volumen = s.x * s.y * s.z;
    // puntos de muestra de la superficie (en el espacio del pivote): para apuntar a piezas finas con el mouse
    this.muestras = [];
    for (const o of this.mallas) {
      const pos = o.geometry.attributes.position;
      const paso = Math.max(1, Math.floor(pos.count / 120));
      m2.multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < pos.count; i += paso) this.muestras.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m2));
    }
    this.sostenida = null; // mano que la tiene
    this.anim = null;
    this.brillo = 0;
  }
  /** Distancia de un punto del mundo a la caja de la pieza (en metros). */
  distancia(p) {
    v1.copy(p).applyMatrix4(m1.copy(this.pivote.matrixWorld).invert());
    return this.caja.distanceToPoint(v1);
  }
  centro(out = new THREE.Vector3()) {
    return this.caja.getCenter(out).applyMatrix4(this.pivote.matrixWorld);
  }
  resaltar(v) {
    if (v === this.brillo) return;
    this.brillo = v;
    for (const m of this.materiales) {
      if (!m.emissive) continue;
      m.emissive.setRGB(0.035 * v, 0.03 * v, 0.018 * v);
    }
  }
}

/** Una mano: control, mano con seguimiento o el mouse. */
export class Mano {
  constructor(tipo, lado = 'derecha') {
    this.tipo = tipo; // 'control' | 'mano' | 'mouse'
    this.lado = lado;
    this.obj = new THREE.Object3D(); // pose de agarre en el mundo
    this.apretado = false;
    this.antes = false;
    this.activa = true;
    this.sostiene = null;
    this.modo = null;
    this.offset = new THREE.Matrix4();
    this.qPrev = new THREE.Quaternion();
    this.giroExtra = 0; // escritorio: grados pedidos con el mouse
    this.hover = null;
    this.vibrar = () => {};
    this.datos = {};
  }
}

export class Juego {
  constructor({ escena, camara, cargado, sonido, ui }) {
    this.escena = escena;
    this.camara = camara;
    this.sonido = sonido;
    this.ui = ui;
    this.estaticos = cargado.estaticos;
    this.oclusion = cargado.oclusion;
    const N = cargado.nodos;
    this.N = N;
    this.ray = new THREE.Raycaster();
    this.manos = [];
    this.anims = [];
    this.avisados = new Map();

    // ── el trabajo
    const ids = Object.keys(N).filter((n) => /^ancla_tapa-valv-t\d$/.test(n)).map((n) => n.replace('ancla_', '')).sort();
    this.tr = L.nuevoTrabajo(ids);
    this.ids = ids;

    // ── piezas
    this.piezas = [];
    const pieza = (nombre, tipo, ancla) => {
      const nodo = N[nombre];
      if (!nodo) {
        console.warn('falta la pieza', nombre);
        return null;
      }
      const p = new Pieza(nombre, nodo, tipo, ancla ? N[ancla] : null, escena);
      this.piezas.push(p);
      return p;
    };
    this.capo = pieza('capo', 'capo', 'ancla_capo_bisagra');
    this.varilla = pieza('varilla', 'varilla', 'ancla_varilla_pivote');
    this.manguera = pieza('manguera_respiradero', 'manguera', 'ancla_respiradero_pivote');
    this.tapa = pieza('tapa_valvulas', 'tapa', 'ancla_tapa_valvulas');
    this.junta = N['junta_tapa_valvulas'];
    this.esparragos = {};
    this.tuercas = [];
    for (const id of ids) {
      const t = pieza('tuerca_' + id, 'tuerca', 'ancla_' + id);
      t.en = id;
      t.angulo = 0;
      t.libre = false;
      this.tuercas.push(t);
      this.esparragos[id] = { id, pos: t.pivote.position.clone(), tuerca: t };
    }
    this.herramientas = {};
    for (const n of HERRAMIENTAS) {
      const h = pieza(n, 'herramienta', null);
      if (!h) continue;
      h.medida = h.nodo.userData.medida || null;
      h.esLlave = h.nodo.userData.herramienta === 'llave';
      if (h.esLlave) {
        const est = N[n + '_estria'];
        // posición y orientación del anillo de la estría en el espacio del pivote
        h.estria = new THREE.Matrix4().multiplyMatrices(m1.copy(h.pivote.matrixWorld).invert(), est.matrixWorld);
        h.estriaInv = h.estria.clone().invert();
      }
      this.herramientas[n] = h;
    }
    this.linterna = this.herramientas.linterna;

    // ── capó: bisagra, varilla y su alojamiento
    this.capoSlotLocal = N['ancla_capo_varilla'].getWorldPosition(new THREE.Vector3()).applyMatrix4(m1.copy(this.capo.pivote.matrixWorld).invert());
    // punta de la varilla: el punto más lejano del pivote
    this.varillaPunta = new THREE.Vector3();
    {
      const inv = m1.copy(this.varilla.pivote.matrixWorld).invert();
      let lejos = 0;
      for (const malla of this.varilla.mallas) {
        const pos = malla.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 3) {
          v1.fromBufferAttribute(pos, i).applyMatrix4(malla.matrixWorld).applyMatrix4(inv);
          if (v1.length() > lejos) {
            lejos = v1.length();
            this.varillaPunta.copy(v1);
          }
        }
      }
      this.varillaLargo = lejos;
    }
    this.anguloVarilla = this.calcularAnguloVarilla();
    this.capoAngulo = 0;
    // manguera: boca en la tapa (en el espacio del pivote de la manguera, con la manguera puesta)
    this.bocaMundo = N['ancla_respiradero_boca'].getWorldPosition(new THREE.Vector3());
    this.mangueraPunta = this.bocaMundo.clone().applyMatrix4(m1.copy(this.manguera.pivote.matrixWorld).invert());
    this.mangueraPuesta = this.manguera.pivote.quaternion.clone();
    {
      // reposo: la punta hacia arriba y afuera del motor
      const p = this.manguera.pivote.position;
      const destino = v2.copy(this.bocaMundo).sub(p).normalize().add(v3.set(0.2, 1.1, 0.1)).normalize();
      const actual = v1.copy(this.mangueraPunta).applyQuaternion(this.manguera.pivote.quaternion).normalize();
      this.mangueraReposo = new THREE.Quaternion().setFromUnitVectors(actual, destino).multiply(this.manguera.pivote.quaternion);
    }
    this.tapaAsiento = { pos: this.tapa.pivote.position.clone(), quat: this.tapa.pivote.quaternion.clone() };
    this.bandeja = N['ancla_bandeja'] ? N['ancla_bandeja'].getWorldPosition(new THREE.Vector3()) : null;
    this.enBandeja = [];

    // ── linterna: una luz siempre presente (apagada) para no recompilar los shaders al prenderla
    this.luz = new THREE.SpotLight(0xfff4e0, 0, 6, rad(20), 0.5, 2);
    this.potenciaLinterna = 45;
    escena.add(this.luz, this.luz.target);
    this.luzAncla = N['linterna_luz'];
    this.ponerCapo(0);
    this.ponerVarillaGuardada();
  }

  // ───────────────────────── capó y varilla ─────────────────────────

  ponerCapo(a) {
    this.capoAngulo = a;
    this.tr.capo = a;
    this.capo.pivote.quaternion.copy(this.capo.inicio.quat).multiply(q1.setFromAxisAngle(v1.set(1, 0, 0), rad(a)));
    this.capo.pivote.updateMatrixWorld(true);
  }

  slotMundo(a = this.capoAngulo, out = new THREE.Vector3()) {
    q1.copy(this.capo.inicio.quat).multiply(q2.setFromAxisAngle(v1.set(1, 0, 0), rad(a)));
    return out.copy(this.capoSlotLocal).applyQuaternion(q1).add(this.capo.pivote.position);
  }

  calcularAnguloVarilla() {
    // el ángulo del capó en el que el alojamiento queda a un largo de varilla del pivote
    let mejor = 56, err = Infinity;
    for (let a = 30; a <= L.CAPO_MAX; a += 0.25) {
      const d = Math.abs(this.slotMundo(a, v2).distanceTo(this.varilla.pivote.position) - this.varillaLargo);
      if (d < err) {
        err = d;
        mejor = a;
      }
    }
    return mejor;
  }

  apuntarVarilla(destino) {
    const p = this.varilla.pivote;
    const hacia = destino.clone().sub(p.position).normalize();
    const desde = v1.copy(this.varillaPunta).applyQuaternion(this.varilla.inicio.quat).normalize();
    p.quaternion.setFromUnitVectors(desde, hacia).multiply(this.varilla.inicio.quat);
    p.updateMatrixWorld(true);
  }

  ponerVarillaGuardada() {
    this.varilla.pivote.quaternion.copy(this.varilla.inicio.quat);
    this.varilla.pivote.updateMatrixWorld(true);
  }

  puntaVarilla(out = new THREE.Vector3()) {
    return out.copy(this.varillaPunta).applyMatrix4(this.varilla.pivote.matrixWorld);
  }

  // ───────────────────────── tuercas ─────────────────────────

  tuercaEn(id) {
    return this.tuercas.find((t) => t.en === id) || null;
  }

  colocarTuerca(t) {
    // posición según el estado de la rosca
    const est = L.tuerca(this.tr, t.en);
    const alto = L.alturaTuerca(est) || 0;
    const e = this.esparragos[t.en];
    t.pivote.position.copy(e.pos).addScaledVector(ARRIBA, alto / 1000);
    t.pivote.quaternion.setFromAxisAngle(ARRIBA, rad(t.angulo));
    t.pivote.updateMatrixWorld(true);
  }

  centroTuerca(id, out = new THREE.Vector3()) {
    const est = L.tuerca(this.tr, id);
    const alto = (L.alturaTuerca(est) || 0) / 1000;
    return out.copy(this.esparragos[id].pos).addScaledVector(ARRIBA, alto + 0.0028);
  }

  /** Aplica un giro (grados, + afloja) a la tuerca de un espárrago, con o sin llave. */
  girarTuerca(id, grados, conLlave, mano) {
    const est = L.tuerca(this.tr, id);
    const t = this.tuercaEn(id);
    const r = L.girar(est, grados, { conLlave });
    if (r.giro) {
      t.angulo += r.giro;
      this.colocarTuerca(t);
      this.ruidoRosca = (this.ruidoRosca || 0) + Math.abs(r.giro);
      if (this.ruidoRosca > 40) {
        this.ruidoRosca = 0;
        this.sonido.tocar('rosca', t.pivote.position, 0.5);
      }
    }
    const pos = t.pivote.position;
    switch (r.evento) {
      case 'despego':
        this.sonido.tocar('crac', pos, 1);
        mano?.vibrar(1, 90);
        this.avisar('despego', '¡Despegó!', pos, 'bien', 0.5);
        break;
      case 'salio':
        this.sonido.tocar('calzar', pos, 0.5, 1.3);
        mano?.vibrar(0.4, 30);
        this.avisar('salio' + id, mano?.tipo === 'mouse' ? 'Suelta: hacé clic para sacarla.' : 'Suelta: levantala con la mano.', pos, 'info', 6);
        break;
      case 'asento':
        this.sonido.tocar('calzar', pos, 0.6);
        mano?.vibrar(0.4, 30);
        break;
      case 'ajustada':
        this.sonido.tocar('clic', pos, 1);
        mano?.vibrar(0.7, 25);
        this.avisar('ajustada', '¡Clic! Ajustada.', pos, 'bien', 0.3);
        this.revisarFin();
        break;
      case 'de_mas':
        mano?.vibrar(0.9, 40);
        this.avisar('de_mas', 'Pará: es chapa. 10 Nm alcanzan.', pos, 'aviso', 2);
        break;
      case 'necesita_llave':
        this.avisar('necesita_llave', 'Está ajustada: aflojala con la llave de 10.', pos, 'aviso', 3);
        break;
      case 'a_mano_no':
        this.avisar('a_mano_no', 'A mano ya no da: dale el ajuste con la llave.', pos, 'info', 4);
        break;
      case 'forcejeo':
        mano?.vibrar(0.15 + 0.5 * r.tension, 16);
        break;
    }
    return r;
  }

  // ───────────────────────── manos ─────────────────────────

  agregarMano(m) {
    this.manos.push(m);
    return m;
  }

  /** La pieza más cercana que se puede agarrar desde un punto. */
  buscar(p, margen) {
    let mejor = null, mejorV = Infinity;
    for (const pz of this.piezas) {
      if (!this.agarrable(pz)) continue;
      const d = pz.distancia(p);
      if (d > margen) continue;
      // las chicas primero (una tuerca arriba de la tapa)
      const v = pz.volumen + d * 0.02;
      if (v < mejorV) {
        mejorV = v;
        mejor = pz;
      }
    }
    return mejor;
  }

  agarrable(pz) {
    if (pz.sostenida || pz.anim?.bloquea) return false;
    const abierto = this.capoAngulo > 25 || this.tr.varilla === 'puesta';
    switch (pz.tipo) {
      case 'capo':
        return true;
      case 'varilla':
        return abierto || this.tr.varilla === 'puesta';
      case 'manguera':
      case 'tapa':
        return abierto;
      case 'tuerca':
        return pz.libre || abierto;
      default:
        return true;
    }
  }

  agarrar(mano, pz) {
    if (!pz) return;
    // si la tenía otra mano, la suelta
    for (const m of this.manos) if (m !== mano && m.sostiene === pz) this.soltar(m, true);
    pz.anim = null;
    mano.sostiene = pz;
    pz.sostenida = mano;
    mano.qPrev.copy(mano.obj.quaternion);
    mano.giroExtra = 0;
    mano.datos = {};
    mano.offset.multiplyMatrices(m1.copy(mano.obj.matrixWorld).invert(), pz.pivote.matrixWorld);
    mano.modo = 'libre';
    const pos = pz.pivote.position;
    switch (pz.tipo) {
      case 'capo': {
        mano.modo = 'capo';
        // punto agarrado, en el marco del capó (gira con él)
        mano.datos.g = this.enMarcoCapo(mano.obj.position).applyAxisAngle(v1.set(1, 0, 0), -rad(this.capoAngulo));
        break;
      }
      case 'varilla':
        mano.modo = 'varilla';
        if (this.tr.varilla === 'puesta') {
          L.guardarVarilla(this.tr);
          if (!this.capo.sostenida) {
            this.avisar('sin_varilla', '¡Ojo! Sin la varilla el capó se cae.', this.puntaVarilla(), 'aviso', 1);
            this.caerCapo();
          }
        }
        break;
      case 'manguera':
        mano.modo = 'manguera';
        mano.datos.inicio = mano.obj.position.clone();
        break;
      case 'tapa':
        if (this.tr.tapa === 'puesta') {
          const no = L.puedeSacarTapa(this.tr);
          if (no) {
            this.avisar('tapa_no', no, pz.centro(), 'aviso', 1.5);
            this.sonido.tocar('no', pz.centro(), 0.5);
            mano.vibrar(0.3, 60);
            mano.sostiene = null;
            pz.sostenida = null;
            mano.modo = null;
            return;
          }
          mano.modo = 'riel';
          mano.datos.y0 = mano.obj.position.y;
        }
        break;
      case 'tuerca': {
        if (!pz.libre) {
          mano.modo = 'rosca';
          mano.datos.y0 = mano.obj.position.y;
        }
        const i = this.enBandeja.indexOf(pz);
        if (i >= 0) this.enBandeja.splice(i, 1);
        break;
      }
      case 'herramienta':
        if (pz.calzadaEn) {
          mano.modo = 'llave';
          mano.datos.id = pz.calzadaEn;
          this.empezarLlave(mano, pz, pz.calzadaEn);
        }
        if (pz === this.linterna) this.luz.intensity = this.potenciaLinterna;
        break;
    }
    this.sonido.tocar('agarrar', pos, 0.4);
    mano.vibrar(0.25, 20);
    this.ui.paso?.();
  }

  /** Punto del mundo en el marco de la bisagra del capó cerrado (sin el giro de apertura). */
  enMarcoCapo(p) {
    m1.compose(this.capo.pivote.position, this.capo.inicio.quat, v2.set(1, 1, 1)).invert();
    return p.clone().applyMatrix4(m1);
  }

  soltar(mano, forzado = false) {
    const pz = mano.sostiene;
    if (!pz) return;
    mano.sostiene = null;
    pz.sostenida = null;
    const modo = mano.modo;
    mano.modo = null;
    if (pz === this.linterna) this.luz.intensity = 0;
    switch (pz.tipo) {
      case 'capo':
        if (mano.tipo === 'mouse' && this.tr.varilla === 'guardada' && this.capoAngulo >= L.CAPO_VARILLA - 3) {
          // en la compu hay una sola mano: la varilla se pone sola
          this.capoAngulo = Math.max(this.capoAngulo, L.CAPO_VARILLA);
          this.tr.capo = this.capoAngulo;
          L.ponerVarilla(this.tr);
          this.animarCapo(this.anguloVarilla, 0.35);
          this.sonido.tocar('varilla', this.slotMundo(), 0.8);
          this.avisar('varilla_ok', 'Le pusiste la varilla.', this.slotMundo(), 'bien', 0.2);
        } else if (this.tr.varilla === 'puesta') this.animarCapo(this.anguloVarilla, 0.35);
        else if (this.capoAngulo > 1) this.caerCapo();
        break;
      case 'varilla': {
        // entra si la varilla apunta al alojamiento y el largo da (si el capó está más alto, baja hasta apoyar)
        const slot = this.slotMundo();
        const pv = this.varilla.pivote.position;
        const dirV = this.puntaVarilla(v3).sub(pv).normalize();
        const dirS = v2.copy(slot).sub(pv);
        const sobra = dirS.length() - this.varillaLargo;
        const angulo = deg(dirV.angleTo(dirS.normalize()));
        const tol = mano.tipo === 'mouse' ? 2 : 1;
        this.ultimaVarilla = { angulo, sobra, capo: this.capoAngulo, anguloVarilla: this.anguloVarilla, largo: this.varillaLargo };
        if (this.capoAngulo >= L.CAPO_VARILLA - 6 && angulo < 7 * tol && sobra > -0.05 * tol && sobra < 0.2) {
          this.capoAngulo = Math.max(this.capoAngulo, L.CAPO_VARILLA);
          this.tr.capo = this.capoAngulo;
          L.ponerVarilla(this.tr);
          this.sonido.tocar('varilla', slot, 0.8);
          mano.vibrar(0.5, 30);
          if (!this.capo.sostenida) this.animarCapo(this.anguloVarilla, 0.3);
          this.apuntarVarilla(this.slotMundo(this.capo.sostenida ? this.capoAngulo : this.anguloVarilla));
          this.avisar('varilla_ok', 'Capó sostenido.', slot, 'bien', 0.2);
        } else {
          this.animarVarillaGuardar();
        }
        break;
      }
      case 'manguera':
        if (this.tr.manguera === 'sacada') {
          const punta = v3.copy(this.mangueraPunta).applyMatrix4(this.manguera.pivote.matrixWorld);
          if (this.tr.tapa === 'puesta' && punta.distanceTo(this.bocaMundo) < (mano.tipo === 'mouse' ? 0.08 : 0.045)) {
            L.ponerManguera(this.tr);
            this.sonido.tocar('goma', this.bocaMundo, 0.8, 1.2);
            mano.vibrar(0.5, 40);
            this.animarQuat(this.manguera, this.mangueraPuesta, 0.15);
            this.revisarFin();
          } else this.animarQuat(this.manguera, this.mangueraReposo, 0.35);
        } else this.animarQuat(this.manguera, this.mangueraPuesta, 0.15);
        break;
      case 'tapa':
        if (this.tr.tapa === 'puesta') {
          // se soltó a mitad de los espárragos: vuelve a apoyar
          this.animarA(pz, this.tapaAsiento.pos, this.tapaAsiento.quat, 0.2);
        } else if (!forzado && this.tapaCercaDelAsiento(mano)) {
          const r = L.ponerTapa(this.tr);
          if (r.ok) {
            const arriba = this.tapaAsiento.pos.clone().addScaledVector(ARRIBA, 0.03);
            this.animarA(pz, arriba, this.tapaAsiento.quat, 0.18, () =>
              this.animarA(pz, this.tapaAsiento.pos, this.tapaAsiento.quat, 0.25, () => {
                this.sonido.tocar('tapa', this.tapaAsiento.pos, 0.9);
                this.avisar('tapa_ok', 'Tapa en su lugar.', pz.centro(), 'bien', 0.3);
              }),
            );
            mano.vibrar(0.5, 40);
          } else {
            this.avisar('tapa_no', r.motivo, pz.centro(), 'aviso', 1);
            this.caer(pz);
          }
        } else this.caer(pz);
        break;
      case 'tuerca':
        if (!pz.libre) {
          // estaba en su espárrago: queda ahí
          this.colocarTuerca(pz);
        } else this.soltarTuerca(mano, pz, forzado);
        break;
      case 'herramienta':
        if (modo === 'llave' && pz.calzadaEn) {
          // la llave queda calzada en la tuerca
          this.sonido.tocar('calzar', pz.pivote.position, 0.25, 0.8);
        } else {
          pz.calzadaEn = null;
          if (!forzado && this.cercaDeColgar(pz)) this.animarA(pz, pz.inicio.pos, pz.inicio.quat, 0.25, () => this.sonido.tocar('calzar', pz.pivote.position, 0.4, 0.7));
          else this.caer(pz);
        }
        break;
      default:
        this.caer(pz);
    }
    this.ui.paso?.();
  }

  soltarTuerca(mano, pz, forzado) {
    // ¿arriba de un espárrago libre?
    const p = pz.pivote.position;
    const radio = mano.tipo === 'mouse' ? 0.05 : 0.03;
    let mejor = null, md = Infinity;
    for (const id of this.ids) {
      if (this.tuercaEn(id)) continue;
      const tope = v1.copy(this.esparragos[id].pos).addScaledVector(ARRIBA, 0.003);
      const dh = Math.hypot(p.x - tope.x, p.z - tope.z);
      const dv = p.y - tope.y;
      if (dh < radio && dv > -0.02 && dv < 0.07 && dh < md) {
        md = dh;
        mejor = id;
      }
    }
    if (mejor && !forzado) {
      const r = L.ponerTuerca(this.tr, mejor);
      if (r.ok) {
        pz.en = mejor;
        pz.libre = false;
        pz.angulo = 0;
        const destino = this.esparragos[mejor].pos.clone().addScaledVector(ARRIBA, (L.VUELTAS * L.PASO + 0.5) / 1000);
        this.animarA(pz, destino, new THREE.Quaternion(), 0.15, () => this.sonido.tocar('calzar', destino, 0.4, 1.4));
        mano.vibrar(0.3, 20);
        return;
      }
      this.avisar('tuerca_no', r.motivo, p, 'aviso', 1);
    }
    // ¿en la bandeja magnética?
    if (this.bandeja && !forzado && Math.hypot(p.x - this.bandeja.x, p.z - this.bandeja.z) < (mano.tipo === 'mouse' ? 0.16 : 0.12) && p.y > this.bandeja.y - 0.03 && p.y < this.bandeja.y + 0.35) {
      this.aBandeja(pz);
      return;
    }
    this.caer(pz);
  }

  aBandeja(pz) {
    const k = this.enBandeja.length;
    this.enBandeja.push(pz);
    const a = (k / 8) * Math.PI * 2 + 0.3;
    const r = k < 8 ? 0.04 : 0.018;
    const destino = this.bandeja.clone().add(v1.set(Math.cos(a) * r, 0.001, Math.sin(a) * r));
    const q = new THREE.Quaternion().setFromAxisAngle(ARRIBA, a * 3);
    this.animarA(pz, destino, q, 0.2, () => this.sonido.tocar('caeTuerca', destino, 0.6, 1.2));
  }

  tapaCercaDelAsiento(mano) {
    const p = this.tapa.pivote.position, a = this.tapaAsiento.pos;
    const dh = Math.hypot(p.x - a.x, p.z - a.z);
    const dv = p.y - a.y;
    // derecha (sin torcer) y con la misma orientación
    const arriba = v1.set(0, 1, 0).applyQuaternion(this.tapa.pivote.quaternion);
    const frente = v2.set(1, 0, 0).applyQuaternion(this.tapa.pivote.quaternion);
    const frente0 = v3.set(1, 0, 0).applyQuaternion(this.tapaAsiento.quat);
    frente.y = 0;
    frente0.y = 0;
    const angulo = deg(frente.angleTo(frente0));
    const tol = mano.tipo === 'mouse' ? 2 : 1;
    return dh < 0.05 * tol && dv > -0.01 && dv < 0.12 * tol && arriba.y > 0.85 && angulo < 18 * tol;
  }

  cercaDeColgar(pz) {
    return pz.pivote.position.distanceTo(pz.inicio.pos) < 0.09;
  }

  // ───────────────────────── la llave en la tuerca ─────────────────────────

  /** ¿La estría de esta llave está calzando en alguna tuerca? Devuelve el id o null. */
  buscarTuercaParaLlave(h, tolerancia = 1) {
    m1.multiplyMatrices(h.pivote.matrixWorld, h.estria);
    const c = v1.setFromMatrixPosition(m1);
    const eje = v2.set(0, 1, 0).transformDirection(m1);
    if (Math.abs(eje.y) < Math.cos(rad(40 * tolerancia))) return null;
    let mejor = null, md = 0.03 * tolerancia;
    for (const id of this.ids) {
      if (!this.tuercaEn(id)) continue;
      const d = this.centroTuerca(id, v3).distanceTo(c);
      if (d < md) {
        md = d;
        mejor = id;
      }
    }
    return mejor;
  }

  empezarLlave(mano, h, id) {
    const c = this.centroTuerca(id, new THREE.Vector3());
    m1.multiplyMatrices(h.pivote.matrixWorld, h.estria);
    const eje = v2.set(0, 1, 0).transformDirection(m1);
    // dirección del cuerpo de la llave (de la estría hacia el mango), horizontal
    const cuerpo = v3.set(-1, 0, 0).transformDirection(m1);
    cuerpo.y = 0;
    if (cuerpo.lengthSq() < 1e-6) cuerpo.set(1, 0, 0);
    mano.datos.id = id;
    mano.datos.signo = eje.y >= 0 ? 1 : -1;
    mano.datos.angLlave = anguloY(cuerpo.normalize());
    const hm = v1.copy(mano.obj.position).sub(c);
    mano.datos.k = mano.datos.angLlave - anguloY(hm);
    mano.datos.flex = 0;
    h.calzadaEn = id;
    this.ponerLlave(h, mano.datos);
  }

  /** Ubica la llave calzada: la estría en la tuerca y el cuerpo apuntando al ángulo pedido. */
  ponerLlave(h, d) {
    const c = this.centroTuerca(d.id, v1);
    const a = rad(d.angLlave + d.flex);
    const dirMango = v2.set(Math.cos(a), 0, -Math.sin(a));
    const Y = v3.set(0, d.signo, 0);
    const X = dirMango.clone().negate();
    const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
    m1.makeBasis(X, Y, Z).setPosition(c);
    m2.multiplyMatrices(m1, h.estriaInv);
    m2.decompose(h.pivote.position, h.pivote.quaternion, v1);
    h.pivote.updateMatrixWorld(true);
  }

  moverLlave(mano, h, dt) {
    const d = mano.datos;
    const c = this.centroTuerca(d.id, new THREE.Vector3());
    let delta;
    if (mano.tipo === 'mouse') {
      delta = mano.giroExtra;
      mano.giroExtra = 0;
      d.tiron = (d.tiron || 0) * Math.exp(-dt * 4) + delta;
      delta = d.tiron;
    } else {
      const hm = v1.copy(mano.obj.position).sub(c);
      const r = Math.hypot(hm.x, hm.z);
      if (r < 0.03 || r > 0.45 || Math.abs(hm.y) > 0.2) {
        // la mano se fue: suelta la llave de la tuerca
        h.calzadaEn = null;
        mano.modo = 'libre';
        mano.offset.multiplyMatrices(m1.copy(mano.obj.matrixWorld).invert(), h.pivote.matrixWorld);
        return;
      }
      delta = difAng(anguloY(hm) + d.k - d.angLlave);
    }
    const res = this.girarTuerca(d.id, delta, true, mano);
    d.angLlave += res.giro;
    if (mano.tipo === 'mouse' && res.giro) d.tiron -= res.giro;
    if (mano.tipo === 'mouse' && res.evento === 'despego') d.tiron = 0;
    // se nota que se está forzando: la llave se flexiona un poquito
    const objetivo = res.evento === 'forcejeo' || res.evento === 'de_mas' ? THREE.MathUtils.clamp(delta * 0.08, -3, 3) : 0;
    d.flex += (objetivo - d.flex) * Math.min(1, dt * 12);
    if (mano.tipo !== 'mouse' && Math.abs(delta) > 75) {
      h.calzadaEn = null;
      mano.modo = 'libre';
      mano.offset.multiplyMatrices(m1.copy(mano.obj.matrixWorld).invert(), h.pivote.matrixWorld);
      return;
    }
    this.ponerLlave(h, d);
    // si la tuerca quedó suelta, la llave sale sola de arriba
    const est = L.tuerca(this.tr, d.id);
    if (est.estado === 'suelta' && res.evento === 'salio') {
      h.calzadaEn = null;
      mano.modo = 'libre';
      if (mano.tipo === 'mouse') this.devolverAlaMano(mano, h);
      else mano.offset.multiplyMatrices(m1.copy(mano.obj.matrixWorld).invert(), h.pivote.matrixWorld);
    }
  }

  /** En la compu: la herramienta vuelve a la "mano" (adelante de la cámara). */
  devolverAlaMano(mano, h) {
    mano.offset.copy(mano.datos.ofsBase || mano.offset);
  }

  // ───────────────────────── actualización por cuadro ─────────────────────────

  actualizar(dt) {
    this.cuadro = (this.cuadro || 0) + 1;
    for (const m of this.manos) {
      if (!m.activa) {
        if (m.sostiene) this.soltar(m, true);
        m.hover?.resaltar(0);
        m.hover = null;
        continue;
      }
      if (m.tipo !== 'mouse') this.actualizarManoVR(m, dt);
      m.antes = m.apretado;
    }
    // resaltado: lo que está a mano
    const resaltadas = new Set(this.manos.filter((m) => m.activa && !m.sostiene && m.hover).map((m) => m.hover));
    for (const pz of this.piezas) pz.resaltar(resaltadas.has(pz) ? 1 : 0);
    this.correrAnims(dt);
    this.actualizarLinterna();
    this.actualizarOclusion();
  }

  actualizarManoVR(m, dt) {
    const p = m.obj.position;
    if (!m.sostiene) {
      const ahora = performance.now();
      if (!m.apretado) {
        const antes = m.hover;
        m.hover = this.buscar(p, m.tipo === 'mano' ? 0.035 : 0.03);
        // un toquecito en el control al llegar a algo que se puede agarrar
        if (m.hover && m.hover !== antes) m.vibrar(0.08, 12);
        // lo último que señaló la mano abierta (al pellizcar, los dedos se corren unos centímetros)
        if (m.hover) m.reciente = { pieza: m.hover, t: ahora, cuadro: this.cuadro };
      }
      if (m.apretado && !m.antes) {
        let pz = this.buscar(p, m.tipo === 'mano' ? 0.035 : 0.03);
        const fresco = m.reciente && (ahora - m.reciente.t < 350 || this.cuadro - m.reciente.cuadro <= 12);
        if (!pz && m.tipo === 'mano' && fresco && m.reciente.pieza.distancia(p) < 0.12) pz = m.reciente.pieza;
        if (pz && this.agarrable(pz)) this.agarrar(m, pz);
      }
      return;
    }
    if (!m.apretado) {
      this.soltar(m);
      return;
    }
    this.moverSostenida(m, dt);
    m.qPrev.copy(m.obj.quaternion);
  }

  moverSostenida(m, dt) {
    const pz = m.sostiene;
    const p = m.obj.position;
    switch (m.modo) {
      case 'libre': {
        m1.multiplyMatrices(m.obj.matrixWorld, m.offset);
        m1.decompose(pz.pivote.position, pz.pivote.quaternion, v1);
        pz.pivote.updateMatrixWorld(true);
        if (pz.esLlave) this.probarCalzar(m, pz);
        if (pz.tipo === 'tuerca' && pz.libre) this.avisarEsparragoCerca(pz);
        break;
      }
      case 'capo': {
        const g = m.datos.g;
        const local = this.enMarcoCapo(p);
        const bh = Math.atan2(local.y, -local.z);
        const bg = Math.atan2(g.y, -g.z);
        let a = deg(bh - bg);
        const minimo = this.tr.varilla === 'puesta' ? this.anguloVarilla - 0.5 : 0;
        a = THREE.MathUtils.clamp(a, minimo, L.CAPO_MAX);
        this.ponerCapo(a);
        if (this.tr.varilla === 'puesta') this.apuntarVarilla(this.slotMundo());
        break;
      }
      case 'varilla': {
        const pv = this.varilla.pivote.position;
        const hacia = p.clone();
        if (hacia.y < pv.y - 0.02) hacia.y = pv.y - 0.02;
        this.apuntarVarilla(hacia);
        break;
      }
      case 'manguera': {
        const pv = this.manguera.pivote.position;
        if (this.tr.manguera === 'puesta') {
          if (p.distanceTo(m.datos.inicio) > (m.tipo === 'mouse' ? 0.06 : 0.035)) {
            const r = L.sacarManguera(this.tr);
            if (r.ok) {
              this.sonido.tocar('goma', this.bocaMundo, 0.8);
              m.vibrar(0.5, 40);
              this.ui.paso?.();
            } else {
              this.avisar('manguera_no', r.motivo, this.bocaMundo, 'aviso', 2);
              m.datos.inicio.copy(p);
            }
          }
          break;
        }
        const desde = v1.copy(this.mangueraPunta).applyQuaternion(this.mangueraPuesta).normalize();
        const hacia = v2.copy(p).sub(pv).normalize();
        this.manguera.pivote.quaternion.setFromUnitVectors(desde, hacia).multiply(this.mangueraPuesta);
        this.manguera.pivote.updateMatrixWorld(true);
        break;
      }
      case 'riel': {
        const subir = Math.max(0, Math.min(0.05, p.y - m.datos.y0));
        this.tapa.pivote.position.copy(this.tapaAsiento.pos).addScaledVector(ARRIBA, subir);
        this.tapa.pivote.updateMatrixWorld(true);
        if (subir > 0.028) {
          const r = L.sacarTapa(this.tr);
          if (r.ok) {
            m.modo = 'libre';
            m.offset.multiplyMatrices(m1.copy(m.obj.matrixWorld).invert(), this.tapa.pivote.matrixWorld);
            this.sonido.tocar('tapa', this.tapa.pivote.position, 0.5, 1.3);
            m.vibrar(0.4, 30);
            this.avisar('tapa_afuera', '¡Afuera!', this.tapa.centro(), 'bien', 0.2);
            this.ui.paso?.();
          }
        }
        break;
      }
      case 'rosca': {
        const t = pz;
        // girar con los dedos: la torsión de la mano alrededor del eje del espárrago
        let g;
        if (m.tipo === 'mouse') {
          g = m.giroExtra;
          m.giroExtra = 0;
        } else {
          q1.copy(m.obj.quaternion).multiply(q2.copy(m.qPrev).invert());
          g = m.firme === false ? 0 : torsionY(q1);
        }
        if (Math.abs(g) > 0.01) this.girarTuerca(t.en, g, false, m);
        // levantar una tuerca suelta la saca del espárrago
        const est = L.tuerca(this.tr, t.en);
        const tirar = p.y - m.datos.y0;
        if (est.estado === 'suelta' && (tirar > 0.015 || m.tipo === 'mouse' && m.datos.sacar)) {
          L.sacarTuerca(this.tr, t.en);
          t.en = null;
          t.libre = true;
          m.modo = 'libre';
          if (m.tipo === 'mouse') m.offset.copy(m.datos.ofsBase);
          else m.offset.multiplyMatrices(m1.copy(m.obj.matrixWorld).invert(), t.pivote.matrixWorld);
          this.sonido.tocar('calzar', t.pivote.position, 0.3, 1.6);
          this.ui.paso?.();
        } else if (tirar > 0.03 && est.estado !== 'suelta') {
          const r = L.sacarTuerca(this.tr, t.en);
          if (!r.ok) this.avisar('tirar_tuerca', r.motivo, t.pivote.position, 'info', 3);
          m.datos.y0 = p.y;
        }
        break;
      }
      case 'llave':
        this.moverLlave(m, pz, dt);
        break;
    }
  }

  /** Con una llave en la mano: si la estría entra en una tuerca, calza. */
  probarCalzar(m, h) {
    if (m.tipo === 'mouse') return;
    const id = this.buscarTuercaParaLlave(h);
    if (!id) {
      m.datos.avisoLlave = null;
      return;
    }
    const no = L.llaveSirve(h.medida, 10);
    if (no) {
      if (m.datos.avisoLlave !== id) {
        m.datos.avisoLlave = id;
        this.avisar('llave_mal', no, this.centroTuerca(id, v3).clone().addScaledVector(ARRIBA, 0.08), 'aviso', 1.5);
        this.sonido.tocar('no', v3, 0.4);
        m.vibrar(0.3, 50);
      }
      return;
    }
    m.modo = 'llave';
    this.empezarLlave(m, h, id);
    this.sonido.tocar('calzar', h.pivote.position, 0.6);
    m.vibrar(0.6, 25);
  }

  avisarEsparragoCerca(pz) {
    // nada por ahora: el encastre se decide al soltar
  }

  // ───────────────────────── animaciones y caídas ─────────────────────────

  animarA(pz, pos, quat, seg, fin) {
    const p0 = pz.pivote.position.clone(), q0 = pz.pivote.quaternion.clone();
    this.anim(pz, seg, (k) => {
      const e = k * k * (3 - 2 * k);
      pz.pivote.position.lerpVectors(p0, pos, e);
      pz.pivote.quaternion.slerpQuaternions(q0, quat, e);
      pz.pivote.updateMatrixWorld(true);
    }, fin);
  }

  animarQuat(pz, quat, seg, fin) {
    const q0 = pz.pivote.quaternion.clone();
    this.anim(pz, seg, (k) => {
      pz.pivote.quaternion.slerpQuaternions(q0, quat, k * k * (3 - 2 * k));
      pz.pivote.updateMatrixWorld(true);
    }, fin);
  }

  animarCapo(a1, seg, fin) {
    const a0 = this.capoAngulo;
    this.anim(this.capo, seg, (k) => {
      this.ponerCapo(a0 + (a1 - a0) * (k * k * (3 - 2 * k)));
      if (this.tr.varilla === 'puesta') this.apuntarVarilla(this.slotMundo());
    }, fin);
  }

  caerCapo() {
    // cae acelerando y rebota apenas
    const a0 = this.capoAngulo;
    let w = 0, a = a0;
    this.anim(this.capo, 3, (_k, dt) => {
      w += 420 * dt;
      a -= w * dt;
      if (a <= 0) {
        a = 0;
        if (w > 30) {
          this.sonido.tocar('capo', this.capo.centro(), Math.min(1, w / 200));
          for (const m of this.manos) m.vibrar(Math.min(1, w / 250), 60);
        }
        w = -w * 0.18;
        if (Math.abs(w) < 8) {
          this.ponerCapo(0);
          return true;
        }
      }
      this.ponerCapo(a);
    });
  }

  animarVarillaGuardar() {
    const q0 = this.varilla.pivote.quaternion.clone();
    this.anim(this.varilla, 0.45, (k) => {
      this.varilla.pivote.quaternion.slerpQuaternions(q0, this.varilla.inicio.quat, k * k);
      this.varilla.pivote.updateMatrixWorld(true);
    }, () => this.sonido.tocar('varilla', this.varilla.pivote.position, 0.4, 0.8));
  }

  anim(pz, seg, fn, fin) {
    pz.anim = { t: 0, seg, fn, fin, bloquea: false };
    this.anims.push(pz);
  }

  correrAnims(dt) {
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const pz = this.anims[i];
      const a = pz.anim;
      if (!a) {
        this.anims.splice(i, 1);
        continue;
      }
      a.t += dt;
      const k = Math.min(1, a.t / a.seg);
      const termino = a.fn(k, dt) === true || k >= 1;
      if (termino) {
        pz.anim = null;
        this.anims.splice(i, 1);
        a.fin?.();
      }
    }
  }

  /** Orientación de reposo: acostada sobre su lado más ancho (herramientas) o derecha (tapa, tuercas). */
  orientacionReposo(pz) {
    const q = pz.pivote.quaternion.clone();
    if (pz.tipo === 'tapa' || pz.tipo === 'tuerca') {
      const f = v1.set(1, 0, 0).applyQuaternion(q);
      return new THREE.Quaternion().setFromAxisAngle(ARRIBA, Math.atan2(-f.z, f.x));
    }
    const s = pz.caja.getSize(v2);
    const eje = s.x < s.y && s.x < s.z ? new THREE.Vector3(1, 0, 0) : s.y < s.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const ahora = eje.clone().applyQuaternion(q);
    const destino = new THREE.Vector3(0, Math.sign(ahora.y) || 1, 0);
    return new THREE.Quaternion().setFromUnitVectors(ahora, destino).multiply(q);
  }

  /** Suelta en el aire: cae hasta lo que tenga abajo y queda acostada. */
  caer(pz) {
    const qr = this.orientacionReposo(pz);
    // punto más bajo de la pieza con esa orientación
    let minY = Infinity;
    const c = pz.caja;
    for (let i = 0; i < 8; i++) {
      v1.set(i & 1 ? c.max.x : c.min.x, i & 2 ? c.max.y : c.min.y, i & 4 ? c.max.z : c.min.z).applyQuaternion(qr);
      minY = Math.min(minY, v1.y);
    }
    const centro = pz.centro(new THREE.Vector3());
    this.ray.set(v1.set(centro.x, centro.y + 0.05, centro.z), v2.set(0, -1, 0));
    this.ray.far = 5;
    const hits = this.ray.intersectObjects(this.estaticos, false);
    let piso = 0;
    for (const h of hits) {
      if (h.object.material?.transparent) continue;
      piso = h.point.y;
      break;
    }
    const destinoY = piso - minY + 0.0008;
    const p0 = pz.pivote.position.clone();
    const q0 = pz.pivote.quaternion.clone();
    let y = p0.y, vy = 0;
    const altura = Math.max(0.001, p0.y - destinoY);
    let rebotes = 0;
    this.anim(pz, 4, (k, dt) => {
      vy -= 9.8 * dt;
      y += vy * dt;
      if (y <= destinoY) {
        y = destinoY;
        if (rebotes === 0) {
          const s = pz.tipo === 'tuerca' ? 'caeTuerca' : pz.esLlave || pz.tipo === 'herramienta' && pz !== this.linterna ? 'caeMetal' : pz.tipo === 'tapa' ? 'tapa' : 'caePlastico';
          this.sonido.tocar(s, pz.pivote.position, Math.min(1, 0.3 + altura * 1.5));
        }
        vy = -vy * 0.25;
        rebotes++;
        if (rebotes > 2 || Math.abs(vy) < 0.2) {
          pz.pivote.position.y = destinoY;
          pz.pivote.quaternion.copy(qr);
          pz.pivote.updateMatrixWorld(true);
          return true;
        }
      }
      const e = Math.min(1, (p0.y - y) / altura);
      pz.pivote.position.y = y;
      pz.pivote.quaternion.slerpQuaternions(q0, qr, Math.min(1, e * 1.2));
      pz.pivote.updateMatrixWorld(true);
    });
  }

  // ───────────────────────── luz y entorno ─────────────────────────

  actualizarLinterna() {
    if (!this.linterna || !this.luzAncla) return;
    if (this.luz.intensity <= 0) return;
    this.luzAncla.updateWorldMatrix(true, false);
    this.luzAncla.getWorldPosition(this.luz.position);
    const dir = v1.set(0, 1, 0).transformDirection(this.luzAncla.matrixWorld);
    this.luz.target.position.copy(this.luz.position).add(dir);
    this.luz.target.updateMatrixWorld();
  }

  actualizarOclusion() {
    for (const pz of this.piezas) {
      const o = this.oclusion.en(pz.centro(v1));
      const k = 0.12 + 0.88 * Math.pow(o, 1.6);
      for (const m of pz.materiales) if (m.userData.oclusion) m.userData.oclusion.value = k;
    }
  }

  // ───────────────────────── avisos y fin ─────────────────────────

  avisar(clave, texto, pos, tono = 'aviso', cada = 2) {
    const ahora = performance.now() / 1000;
    const ult = this.avisados.get(clave) || -99;
    if (ahora - ult < cada) return;
    this.avisados.set(clave, ahora);
    this.ui.aviso?.(texto, pos.clone ? pos.clone() : pos, tono);
  }

  revisarFin() {
    if (L.revisarFin(this.tr, Date.now())) {
      this.sonido.tocar('listo', this.tapa.centro(), 0.8);
      for (const m of this.manos) m.vibrar(0.6, 120);
      this.ui.paso?.();
      this.ui.fin?.();
    }
  }

  empezar() {
    if (this.tr.inicio == null) this.tr.inicio = Date.now();
  }

  /** Lo que tiene en la mano la mano principal (para el texto del paso). */
  enMano() {
    for (const m of this.manos) {
      const h = m.sostiene;
      if (h && h.tipo === 'herramienta') return { tipo: h.esLlave ? 'llave' : 'herramienta', medida: h.medida };
    }
    for (const h of Object.values(this.herramientas)) if (h.calzadaEn && h.medida) return { tipo: 'llave', medida: h.medida };
    return null;
  }
}
