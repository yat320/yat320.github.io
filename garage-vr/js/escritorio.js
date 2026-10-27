// Versión de escritorio para probar en el navegador: primera persona con mouse y teclado.
// Clic: agarrar / soltar / usar. Mantené el clic sobre una tuerca para girarla (mouse a la izquierda afloja).
import * as THREE from 'three';
import * as L from './logica.js';
import { Mano } from './juego.js';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
const m1 = new THREE.Matrix4();
const q1 = new THREE.Quaternion();
const ARRIBA = new THREE.Vector3(0, 1, 0);
const ALTO_PARADO = 1.62, ALTO_AGACHADO = 1.18;
const LIMITES = { x0: -1.95, x1: 1.95, z0: -3.05, z1: 3.05 };

/** Orientación con la que se lleva cada cosa en la mano (relativa al rumbo de la cámara). */
function rotacionEnMano(pz) {
  if (pz.esLlave) return new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, Math.PI / 2 + 0.25, 0, 'YXZ'));
  if (pz.tipo === 'herramienta') return new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.3, 0.2, 0, 'YXZ'));
  return new THREE.Quaternion();
}

export class Escritorio {
  constructor({ juego, camara, dom, ui }) {
    this.j = juego;
    this.cam = camara;
    this.dom = dom;
    this.ui = ui;
    this.mano = juego.agregarMano(new Mano('mouse', 'derecha'));
    this.mano.activa = false;
    this.yaw = Math.PI; // mirando al auto
    this.pitch = -0.32;
    this.pos = new THREE.Vector3(-0.45, 0, -2.45);
    this.alto = ALTO_PARADO;
    this.altoObj = ALTO_PARADO;
    this.teclas = {};
    this.activo = false;
    this.bloqueado = false;
    this.ray = new THREE.Raycaster();
    this.ray.far = 3.5;
    this.apuntado = null; // { pieza, punto, distancia }
    this.boton = false;
    this.arrastre = 0;
    this._eventos();
  }

  activar(si) {
    this.activo = si;
    this.mano.activa = si;
    if (si) {
      this.cam.position.set(this.pos.x, this.alto, this.pos.z);
      this.cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
  }

  _eventos() {
    const d = this.dom;
    d.addEventListener('click', () => {
      if (this.activo && !this.bloqueado) d.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.bloqueado = document.pointerLockElement === d;
      this.ui.bloqueo?.(this.bloqueado);
      if (!this.bloqueado && this.boton) this._soltarBoton();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.activo || !this.bloqueado) return;
      const m = this.mano;
      // girando una tuerca: el mouse a la izquierda afloja, a la derecha aprieta
      if (this.boton && (m.modo === 'rosca' || m.modo === 'llave')) {
        m.giroExtra += -e.movementX * 0.45;
        this.arrastre += Math.abs(e.movementX) + Math.abs(e.movementY);
        return;
      }
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.45, 1.35);
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.activo || !this.bloqueado) return;
      if (e.button === 0) {
        this.boton = true;
        this.arrastre = 0;
        this._apretar();
      } else if (e.button === 2) this._soltarEnElPiso();
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.boton) this._soltarBoton();
    });
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (!this.activo) return;
      this.teclas[e.code] = true;
      if (e.code === 'KeyC' || e.code === 'ControlLeft') this.altoObj = this.altoObj === ALTO_PARADO ? ALTO_AGACHADO : ALTO_PARADO;
      if (e.code === 'KeyQ') this._soltarEnElPiso();
    });
    addEventListener('keyup', (e) => {
      this.teclas[e.code] = false;
    });
  }

  /** Rayo desde el centro de la pantalla: qué pieza y qué superficie hay adelante. */
  _apuntar() {
    this.cam.getWorldPosition(v1);
    this.cam.getWorldDirection(v2);
    this.ray.set(v1, v2);
    const mallas = [];
    for (const pz of this.j.piezas) if (pz !== this.mano.sostiene && !(pz.esLlave && pz.calzadaEn && this.mano.modo === 'llave')) mallas.push(...pz.mallas);
    const hp = this.ray.intersectObjects(mallas, false)[0];
    const hs = this.ray.intersectObjects(this.j.estaticos, false).find((h) => !h.object.material?.transparent);
    let pieza = null, dist = hs ? hs.distance : Infinity;
    if (hp && hp.distance <= dist + 0.01) {
      const pz = hp.object.userData.pieza;
      if (pz && this.j.agarrable(pz)) {
        pieza = pz;
        dist = hp.distance;
      }
    }
    // las piezas finas (tuercas, manguera, varilla, herramientas): alcanza con pasar cerca
    if (!pieza || pieza.tipo === 'tapa' || pieza.tipo === 'capo') {
      let mejor = Infinity;
      const tope = hs ? hs.distance + 0.03 : 3;
      for (const pz of this.j.piezas) {
        if (pz === this.mano.sostiene || !this.j.agarrable(pz)) continue;
        if (!['tuerca', 'manguera', 'varilla', 'herramienta'].includes(pz.tipo)) continue;
        for (const m of pz.muestras) {
          const c = v3.copy(m).applyMatrix4(pz.pivote.matrixWorld);
          const a = v1.copy(c).sub(this.ray.ray.origin).dot(this.ray.ray.direction);
          if (a < 0 || a > tope) continue;
          const d = this.ray.ray.distanceToPoint(c);
          const tol = (pz.tipo === 'tuerca' ? 0.016 : 0.012) + 0.006 * a;
          // gana la que pasa más cerca del rayo (las tuercas un poco favorecidas)
          const valor = d / tol;
          if (d < tol && valor < mejor) {
            mejor = valor;
            pieza = pz;
            dist = a;
          }
        }
      }
    }
    // mirando la bandeja magnética con tuercas: se agarra la de arriba
    const b = this.j.bandeja;
    if (!pieza && b && this.j.enBandeja.length && this.ray.ray.distanceToPoint(b) < 0.08) {
      pieza = this.j.enBandeja[this.j.enBandeja.length - 1];
      dist = v1.copy(b).sub(this.ray.ray.origin).length();
    }
    this.apuntado = { pieza, distancia: dist, superficie: hs || null };
    return this.apuntado;
  }

  /** Tuerca (espárrago) que se está mirando, para calzar la llave. */
  _tuercaApuntada(rango = 0.03) {
    let mejor = null, md = rango;
    for (const id of this.j.ids) {
      if (!this.j.tuercaEn(id)) continue;
      const c = this.j.centroTuerca(id, v3);
      const d = this.ray.ray.distanceToPoint(c);
      if (d < md) {
        md = d;
        mejor = id;
      }
    }
    return mejor;
  }

  _espárragoLibreApuntado() {
    let mejor = null, md = 0.035;
    for (const id of this.j.ids) {
      if (this.j.tuercaEn(id)) continue;
      const d = this.ray.ray.distanceToPoint(this.j.esparragos[id].pos);
      if (d < md) {
        md = d;
        mejor = id;
      }
    }
    return mejor;
  }

  _apretar() {
    const m = this.mano;
    const a = this._apuntar();
    const pz = m.sostiene;
    if (!pz) {
      if (!a.pieza) return;
      this._ponerPuntoMano(a.distancia);
      this.j.agarrar(m, a.pieza);
      if (!m.sostiene) return;
      m.datos.ofsBase = this._offsetEnMano(a.pieza);
      m.datos.dist = a.distancia;
      if (m.modo === 'libre') m.offset.copy(m.datos.ofsBase);
      return;
    }
    // con algo en la mano
    if (pz.esLlave) {
      const id = this._tuercaApuntada();
      if (id) {
        const no = L.llaveSirve(pz.medida, 10);
        if (no) {
          this.j.avisar('llave_mal', no, this.j.centroTuerca(id, new THREE.Vector3()).addScaledVector(ARRIBA, 0.08), 'aviso', 1);
          this.j.sonido.tocar('no', v3, 0.4);
          return;
        }
        m.modo = 'llave';
        this.j.empezarLlave(m, pz, id);
        this.j.sonido.tocar('calzar', pz.pivote.position, 0.6);
        return;
      }
    }
    this._soltarDondeApunta();
  }

  _soltarBoton() {
    this.boton = false;
    const m = this.mano;
    if (m.modo === 'llave') {
      const h = m.sostiene;
      h.calzadaEn = null;
      m.modo = 'libre';
      m.offset.copy(m.datos.ofsBase);
    } else if (m.modo === 'rosca') {
      const t = m.sostiene;
      const est = L.tuerca(this.j.tr, t.en);
      if (this.arrastre < 6 && est.estado === 'suelta') {
        // clic sin arrastrar en una tuerca suelta: se saca
        m.datos.sacar = true;
        this.j.moverSostenida(m, 0);
        if (m.modo === 'libre') return;
      }
      this.j.soltar(m);
    }
  }

  /** Suelta lo que tiene apuntando: a su lugar si está cerca, si no donde mira. */
  _soltarDondeApunta() {
    const m = this.mano;
    const pz = m.sostiene;
    const a = this.apuntado || this._apuntar();
    const ray = this.ray.ray;
    const j = this.j;
    switch (pz.tipo) {
      case 'capo':
      case 'varilla':
      case 'manguera':
        if (pz.tipo === 'varilla' && ray.distanceToPoint(j.slotMundo()) < 0.12) j.apuntarVarilla(j.slotMundo());
        if (pz.tipo === 'manguera' && ray.distanceToPoint(j.bocaMundo) < 0.08) {
          const desde = v1.copy(j.mangueraPunta).applyQuaternion(j.mangueraPuesta).normalize();
          const hacia = v2.copy(j.bocaMundo).sub(j.manguera.pivote.position).normalize();
          j.manguera.pivote.quaternion.setFromUnitVectors(desde, hacia).multiply(j.mangueraPuesta);
          j.manguera.pivote.updateMatrixWorld(true);
        }
        j.soltar(m);
        return;
      case 'tapa':
        if (j.tr.tapa === 'afuera' && ray.distanceToPoint(j.tapaAsiento.pos) < 0.14) {
          pz.pivote.position.copy(j.tapaAsiento.pos).addScaledVector(ARRIBA, 0.04);
          pz.pivote.quaternion.copy(j.tapaAsiento.quat);
          pz.pivote.updateMatrixWorld(true);
          j.soltar(m);
          return;
        }
        break;
      case 'tuerca': {
        const id = this._espárragoLibreApuntado();
        if (id) {
          pz.pivote.position.copy(j.esparragos[id].pos).addScaledVector(ARRIBA, 0.012);
          pz.pivote.updateMatrixWorld(true);
          j.soltar(m);
          return;
        }
        if (j.bandeja && ray.distanceToPoint(j.bandeja) < 0.12) {
          pz.pivote.position.copy(j.bandeja).addScaledVector(ARRIBA, 0.05);
          pz.pivote.updateMatrixWorld(true);
          j.soltar(m);
          return;
        }
        break;
      }
      case 'herramienta':
        if (ray.distanceToPoint(pz.inicio.pos) < 0.12) {
          pz.pivote.position.copy(pz.inicio.pos).addScaledVector(ray.direction, -0.05);
          pz.pivote.updateMatrixWorld(true);
          j.soltar(m);
          return;
        }
        break;
    }
    // en la superficie que mira (si está cerca), si no adelante
    if (a.superficie && a.superficie.distance < 2.5) {
      pz.pivote.position.copy(a.superficie.point).addScaledVector(ARRIBA, 0.06);
      pz.pivote.updateMatrixWorld(true);
    }
    j.soltar(m);
  }

  _soltarEnElPiso() {
    if (this.mano.sostiene && this.mano.modo !== 'llave' && this.mano.modo !== 'rosca') this.j.soltar(this.mano);
  }

  _offsetEnMano(pz) {
    return new THREE.Matrix4().makeRotationFromQuaternion(rotacionEnMano(pz));
  }

  /** La "mano" del mouse: adelante de la cámara. Para las bisagras, en el punto mirado a la distancia del agarre. */
  _ponerPuntoMano(dist) {
    const m = this.mano;
    const c = this.cam;
    c.updateMatrixWorld();
    c.getWorldPosition(v1);
    c.getWorldDirection(v2);
    const libre = !m.sostiene || m.modo === 'libre';
    if (libre && m.sostiene) {
      // abajo a la derecha de la vista
      const der = v3.set(1, 0, 0).applyQuaternion(c.quaternion);
      m.obj.position.copy(v1).addScaledVector(v2, 0.42).addScaledVector(der, 0.13).addScaledVector(ARRIBA, -0.11);
      if (m.sostiene.tipo === 'tapa') m.obj.position.addScaledVector(v2, 0.12);
    } else {
      m.obj.position.copy(v1).addScaledVector(v2, dist ?? m.datos.dist ?? 0.5);
    }
    // rumbo sin cabeceo (lo que se lleva no se inclina al mirar arriba o abajo); la linterna sí apunta adonde se mira
    if (m.sostiene && m.sostiene === this.j.linterna) m.obj.quaternion.copy(c.quaternion);
    else m.obj.quaternion.setFromAxisAngle(ARRIBA, this.yaw);
    m.obj.updateMatrixWorld(true);
  }

  actualizar(dt) {
    if (!this.activo) return;
    // caminar
    const k = this.teclas;
    const adelante = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const costado = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const vel = (k.ShiftLeft ? 2.2 : 1.3) * dt;
    if (adelante || costado) {
      const f = v1.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const r = v2.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.pos.addScaledVector(f, adelante * vel).addScaledVector(r, costado * vel);
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, LIMITES.x0, LIMITES.x1);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, LIMITES.z0, LIMITES.z1);
    }
    this.alto += (this.altoObj - this.alto) * Math.min(1, dt * 8);
    this.cam.position.set(this.pos.x, this.alto, this.pos.z);
    this.cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.cam.updateMatrixWorld();
    // la mano y lo que lleva
    const m = this.mano;
    this._ponerPuntoMano();
    if (m.sostiene) {
      if (m.modo === 'libre') {
        // la tapa y las tuercas se llevan derechas
        this.j.moverSostenida(m, dt);
        if (m.sostiene && (m.sostiene.tipo === 'tapa' || m.sostiene.tipo === 'tuerca')) {
          const pz = m.sostiene;
          if (pz.tipo === 'tapa') pz.pivote.quaternion.copy(this.j.tapaAsiento.quat);
          else pz.pivote.quaternion.identity();
          pz.pivote.updateMatrixWorld(true);
        }
      } else this.j.moverSostenida(m, dt);
    }
    const a = this._apuntar();
    m.hover = m.sostiene ? null : a.pieza;
    this.ui.mira?.(this._textoMira(a));
  }

  _textoMira(a) {
    const m = this.mano;
    const pz = m.sostiene;
    if (pz) {
      if (m.modo === 'llave') return 'Mouse a la izquierda: aflojar · derecha: apretar';
      if (m.modo === 'rosca') return 'Mouse a la izquierda: aflojar · derecha: enroscar';
      if (pz.esLlave && this._tuercaApuntada()) return 'Mantené el clic para calzar la llave';
      if (pz.tipo === 'capo') return 'Mirá arriba para abrir · clic para soltar';
      if (pz.tipo === 'varilla') return 'Apuntá al hueco del capó y hacé clic';
      if (pz.tipo === 'manguera') return this.j.tr.manguera === 'puesta' ? 'Mové la vista para sacarla' : 'Apuntá a la boca de la tapa y hacé clic';
      return 'Clic: dejar donde mirás · Q: soltar';
    }
    if (!a.pieza) return '';
    const n = {
      capo: 'Capó', varilla: 'Varilla del capó', manguera: 'Manguera del respiradero', tapa: 'Tapa de válvulas',
      tuerca: 'Tuerca M6 (10 mm)', herramienta: a.pieza.esLlave ? `Llave combinada de ${a.pieza.medida}` : a.pieza.nombre === 'linterna' ? 'Linterna' : a.pieza.nombre[0].toUpperCase() + a.pieza.nombre.slice(1),
    }[a.pieza.tipo];
    return n;
  }
}
