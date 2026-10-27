// Realidad virtual (WebXR, Meta Quest 3): controles y seguimiento de manos.
// Agarrar: gatillo o botón de agarre; con las manos, pellizco o puño. Joystick izquierdo camina, derecho gira de a saltos.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { Mano } from './juego.js';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const LIMITES = { x0: -1.95, x1: 1.95, z0: -3.05, z1: 3.05 };
const PUNTAS = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];

export class RealidadVirtual {
  constructor({ renderer, escena, camara, juego, ui }) {
    this.r = renderer;
    this.esc = escena;
    this.cam = camara;
    this.j = juego;
    this.ui = ui;
    this.rig = new THREE.Group();
    this.rig.name = 'jugador';
    escena.add(this.rig);
    this.activa = false;
    this.giroListo = true;
    this.fuentes = [null, null];
    this.manos = [];
    const fabC = new XRControllerModelFactory();
    const fabM = new XRHandModelFactory();
    for (let i = 0; i < 2; i++) {
      const grip = renderer.xr.getControllerGrip(i);
      grip.add(fabC.createControllerModel(grip));
      this.rig.add(grip);
      const ctrl = renderer.xr.getController(i);
      this.rig.add(ctrl);
      const mano = renderer.xr.getHand(i);
      mano.add(fabM.createHandModel(mano, 'mesh'));
      this.rig.add(mano);
      const m = juego.agregarMano(new Mano('control', i === 0 ? 'izquierda' : 'derecha'));
      m.activa = false;
      m.grip = grip;
      m.ctrl = ctrl;
      m.handObj = mano;
      m.vibrar = (v, ms) => {
        const g = this.fuentes[i]?.gamepad;
        const h = g?.hapticActuators?.[0] || g?.vibrationActuator;
        try {
          if (h?.pulse) h.pulse(Math.min(1, v), ms);
          else if (h?.playEffect) h.playEffect('dual-rumble', { duration: ms, strongMagnitude: v, weakMagnitude: v });
        } catch (_) {}
      };
      ctrl.addEventListener('connected', (e) => {
        this.fuentes[i] = e.data;
        m.lado = e.data.handedness === 'left' ? 'izquierda' : 'derecha';
        m.tipo = e.data.hand ? 'mano' : 'control';
        m.activa = true;
      });
      ctrl.addEventListener('disconnected', () => {
        this.fuentes[i] = null;
        m.activa = false;
      });
      this.manos.push(m);
    }
  }

  /** Pone al jugador en el garage, frente al auto. */
  ubicar(pos = new THREE.Vector3(-0.45, 0, -2.5), mirarHacia = Math.PI) {
    this.rig.position.copy(pos);
    this.rig.rotation.set(0, mirarHacia, 0);
    this.rig.updateMatrixWorld(true);
  }

  async entrar() {
    const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    this.r.xr.setReferenceSpaceType('local-floor');
    await this.r.xr.setSession(s);
    this.r.xr.setFoveation(0.5);
    this.activa = true;
    this.ubicar();
    this.rig.add(this.cam);
    s.addEventListener('end', () => {
      this.activa = false;
      for (const m of this.manos) m.activa = false;
      this.esc.add(this.cam);
      this.ui.salioVR?.();
    });
    return s;
  }

  actualizar(dt) {
    if (!this.activa) return;
    this.rig.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const m = this.manos[i];
      const src = this.fuentes[i];
      if (!src) {
        m.activa = false;
        continue;
      }
      m.tipo = src.hand ? 'mano' : 'control';
      if (m.tipo === 'mano') this.leerMano(m, src);
      else this.leerControl(m, src, dt);
      m.obj.updateMatrixWorld(true);
    }
  }

  leerControl(m, src, dt) {
    m.activa = true;
    m.grip.updateMatrixWorld(true);
    m.grip.getWorldPosition(m.obj.position);
    m.grip.getWorldQuaternion(m.obj.quaternion);
    // el punto de agarre, un poco adelante de la palma
    m.obj.position.add(v1.set(0, -0.01, -0.04).applyQuaternion(m.obj.quaternion));
    const g = src.gamepad;
    if (!g) return;
    const gatillo = g.buttons[0]?.value || 0;
    const agarre = g.buttons[1]?.value || 0;
    const v = Math.max(gatillo, agarre);
    m.apretado = m.apretado ? v > 0.35 : v > 0.6;
    m.firme = v > 0.5;
    // moverse
    const ax = g.axes.length >= 4 ? g.axes[2] : g.axes[0] || 0;
    const ay = g.axes.length >= 4 ? g.axes[3] : g.axes[1] || 0;
    if (m.lado === 'izquierda') this.caminar(ax, ay, dt);
    else this.girar(ax);
    // X (control izquierdo): mostrar u ocultar los cuadros por segundo en la pizarra
    const x = m.lado === 'izquierda' && g.buttons[4]?.pressed;
    if (x && !this.xAntes) this.verRendimiento = !this.verRendimiento;
    if (m.lado === 'izquierda') this.xAntes = x;
  }

  leerMano(m, src) {
    const joints = m.handObj.joints;
    const pulgar = joints['thumb-tip'], indice = joints['index-finger-tip'], muneca = joints['wrist'], palma = joints['middle-finger-metacarpal'];
    if (!pulgar || !indice || !muneca || !palma || !muneca.visible) {
      m.activa = false;
      return;
    }
    m.activa = true;
    pulgar.getWorldPosition(v1);
    indice.getWorldPosition(v2);
    const pellizco = v1.distanceTo(v2);
    muneca.getWorldPosition(v3);
    let cierre = 0;
    for (const n of PUNTAS) cierre += joints[n] ? joints[n].getWorldPosition(new THREE.Vector3()).distanceTo(v3) : 0.15;
    cierre /= PUNTAS.length;
    const pellizca = m.datosMano?.pellizca ? pellizco < 0.035 : pellizco < 0.02;
    const puno = m.datosMano?.puno ? cierre < 0.11 : cierre < 0.085;
    m.datosMano = { pellizca, puno };
    m.apretado = pellizca || puno;
    // firme: bien cerrada (al soltar, los dedos se abren de a poco y la muñeca ya se mueve)
    m.firme = pellizco < 0.024 || cierre < 0.08;
    // punto de agarre: entre la punta del pulgar y la del índice (abierta o cerrada, así lo que señala es lo que agarra)
    m.obj.position.copy(v1).add(v2).multiplyScalar(0.5);
    muneca.getWorldQuaternion(m.obj.quaternion);
  }

  caminar(ax, ay, dt) {
    if (Math.hypot(ax, ay) < 0.2) return;
    this.cam.getWorldDirection(v1);
    v1.y = 0;
    v1.normalize();
    v2.set(-v1.z, 0, v1.x);
    const vel = 1.3 * dt;
    this.rig.position.addScaledVector(v1, -ay * vel).addScaledVector(v2, ax * vel);
    // que la cabeza no salga del garage
    this.cam.getWorldPosition(v3);
    const dx = THREE.MathUtils.clamp(v3.x, LIMITES.x0, LIMITES.x1) - v3.x;
    const dz = THREE.MathUtils.clamp(v3.z, LIMITES.z0, LIMITES.z1) - v3.z;
    this.rig.position.x += dx;
    this.rig.position.z += dz;
  }

  girar(ax) {
    if (Math.abs(ax) < 0.3) {
      this.giroListo = true;
      return;
    }
    if (!this.giroListo || Math.abs(ax) < 0.75) return;
    this.giroListo = false;
    // gira alrededor de la cabeza
    const a = -Math.sign(ax) * THREE.MathUtils.degToRad(30);
    this.cam.getWorldPosition(v1);
    this.rig.position.sub(v1).applyAxisAngle(v2.set(0, 1, 0), a).add(v1);
    this.rig.rotation.y += a;
  }
}
