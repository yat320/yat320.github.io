// Garage VR: arranque, interfaz y bucle de cuadros.
import * as THREE from 'three';
import { cargar } from './escena.js';
import { Juego } from './juego.js';
import { Escritorio } from './escritorio.js';
import { RealidadVirtual } from './xr.js';
import { Sonido } from './sonido.js';
import { Pizarra, Aviso } from './carteles.js';
import * as L from './logica.js';
import { AJUSTES } from './materiales.js';

const $ = (id) => document.getElementById(id);
const lienzo = $('juego');

// parámetros opcionales: ?px=0.5 (resolución en la compu), ?escala=0.8 (resolución en el visor)
const qs = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: !qs.has('sinaa'), powerPreference: 'high-performance' });
renderer.setPixelRatio(qs.has('px') ? +qs.get('px') : Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
renderer.xr.enabled = true;
if (qs.has('escala')) renderer.xr.setFramebufferScaleFactor(+qs.get('escala'));

const escena = new THREE.Scene();
escena.background = new THREE.Color(0x0b0c0d);
const camara = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.02, 40);
camara.position.set(0.9, 1.55, -2.85);
camara.lookAt(-0.5, 0.75, -1.2);
escena.add(camara);

addEventListener('resize', () => {
  camara.aspect = innerWidth / innerHeight;
  camara.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── interfaz
// la pizarra con el paso: a la derecha del frente del auto, mirando a donde arranca el jugador (solo en el visor)
const pizarra = new Pizarra();
pizarra.malla.position.set(0.5, 1.4, -2.0);
pizarra.malla.lookAt(-0.45, 1.55, -2.75);
pizarra.malla.visible = false;
escena.add(pizarra.malla);
const aviso = new Aviso();
escena.add(aviso.malla);
// el paso también sobre la mano izquierda, cuando se la lleva frente a la cara (para leerlo desde cualquier lado)
const muneca = new Pizarra(0.2, 0.077);
muneca.malla.visible = false;
escena.add(muneca.malla);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
function actualizarReloj(dt) {
  const m = rv?.manos.find((x) => x.lado === 'izquierda' && x.activa);
  let ver = false;
  if (modo === 'vr' && m && !m.sostiene) {
    camara.getWorldPosition(_v1);
    camara.getWorldDirection(_v2);
    _v3.copy(m.obj.position).sub(_v1);
    const d = _v3.length();
    ver = d > 0.15 && d < 0.55 && _v3.normalize().dot(_v2) > Math.cos(THREE.MathUtils.degToRad(28));
  }
  const op = muneca.malla.material.opacity;
  muneca.malla.material.opacity = THREE.MathUtils.clamp(op + (ver ? dt * 5 : -dt * 5), 0, 1);
  muneca.malla.visible = muneca.malla.material.opacity > 0.01;
  if (muneca.malla.visible && m) {
    muneca.malla.position.copy(m.obj.position).add(_v3.set(0, 0.07, 0));
    muneca.malla.quaternion.copy(camara.getWorldQuaternion(new THREE.Quaternion()));
  }
}

let juego = null, escritorio = null, rv = null, sonido = null;
let modo = 'inicio'; // 'inicio' | 'escritorio' | 'vr'

const ui = {
  paso() {
    if (!juego) return;
    const tr = juego.tr;
    const p = L.proximoPaso(tr, { enMano: juego.enMano(), escritorio: modo === 'escritorio' });
    let avance = null;
    const n = tr.tuercas.length;
    if (!tr.sacoTapa && tr.manguera === 'sacada') avance = { hechas: L.cuantas(tr, ['afuera']), total: n, etiqueta: 'tuercas afuera' };
    else if (tr.sacoTapa && tr.tapa === 'puesta') avance = { hechas: L.cuantas(tr, ['ajustada']), total: n, etiqueta: 'ajustadas' };
    pizarra.mostrar(p.titulo, p.detalle, avance, tr.terminado ? 'listo' : 'normal', ui.pie || '');
    muneca.mostrar(p.titulo, p.detalle, avance, tr.terminado ? 'listo' : 'normal');
    $('pasoTitulo').textContent = p.titulo;
    $('pasoDetalle').textContent = p.detalle;
    $('hud').classList.toggle('listo', tr.terminado);
  },
  aviso(texto, pos, tono) {
    if (modo === 'vr') aviso.mostrar(texto, pos, camara, tono);
    else {
      const t = $('aviso');
      t.textContent = texto;
      t.dataset.tono = tono;
      t.classList.remove('ver');
      void t.offsetWidth;
      t.classList.add('ver');
    }
  },
  mira(texto) {
    const e = $('miraTexto');
    if (e.textContent !== texto) e.textContent = texto;
  },
  bloqueo(si) {
    $('pausa').hidden = si || modo !== 'escritorio';
  },
  fin() {},
  salioVR() {
    modo = 'inicio';
    pizarra.malla.visible = false;
    $('inicio').hidden = false;
  },
};

// ── rendimiento (F en la compu): cuadros por segundo, llamadas de dibujo y triángulos
const rend = { t: 0, n: 0, fps: 0, peor: 0 };
function medir(dt, dtReal) {
  rend.t += dtReal;
  rend.n++;
  rend.peor = Math.max(rend.peor, dtReal);
  if (rend.t >= 0.5) {
    rend.fps = rend.n / rend.t;
    const info = renderer.info.render;
    $('rend').textContent = `${rend.fps.toFixed(0)} fps · peor ${(rend.peor * 1000).toFixed(1)} ms · ${info.calls} dibujos · ${(info.triangles / 1000).toFixed(0)}k triángulos`;
    window.garage && (window.garage.rendimiento = { fps: rend.fps, peorMs: rend.peor * 1000, dibujos: info.calls, triangulos: info.triangles });
    ui.pie = rv?.verRendimiento ? `${rend.fps.toFixed(0)} fps · peor ${(rend.peor * 1000).toFixed(0)} ms · ${info.calls} dibujos` : '';
    rend.t = rend.n = 0;
    rend.peor = 0;
  }
}

// ── carga
async function iniciar() {
  const barra = $('barra');
  const cargado = await cargar(renderer, escena, (f) => (barra.style.width = `${Math.round(f * 100)}%`));
  sonido = new Sonido(camara);
  sonido.usarEscena(escena);
  juego = new Juego({ escena, camara, cargado, sonido, ui });
  escritorio = new Escritorio({ juego, camara, dom: lienzo, ui });
  rv = new RealidadVirtual({ renderer, escena, camara, juego, ui });
  // los shaders se compilan antes de empezar (sin tirones al mirar algo por primera vez)
  await renderer.compileAsync(escena, camara);
  window.garage = { juego, escritorio, rv, renderer, escena, camara, L, ui, AJUSTES, THREE, cuadros: () => cuadros, dibujar: () => (pedirDibujo = true) };
  ui.paso();
  $('cargando').hidden = true;
  $('botones').hidden = false;
  const vrOk = navigator.xr && (await Promise.race([navigator.xr.isSessionSupported('immersive-vr'), new Promise((r) => setTimeout(() => r(false), 2500))]).catch(() => false));
  $('btnVR').disabled = !vrOk;
  $('notaVR').hidden = !!vrOk;
  renderer.setAnimationLoop(cuadro);
}

$('btnVR').addEventListener('click', async () => {
  sonido?.reanudar();
  try {
    await rv.entrar();
    modo = 'vr';
    pizarra.malla.visible = true;
    escritorio.activar(false);
    $('inicio').hidden = true;
    $('hud').hidden = true;
    juego.empezar();
    ui.paso();
  } catch (e) {
    $('notaVR').hidden = false;
    $('notaVR').textContent = 'No se pudo entrar en realidad virtual: ' + e.message;
  }
});

$('btnPC').addEventListener('click', () => {
  sonido?.reanudar();
  modo = 'escritorio';
  $('inicio').hidden = true;
  $('hud').hidden = false;
  escritorio.activar(true);
  juego.empezar();
  ui.paso();
  lienzo.requestPointerLock?.();
});

$('pausa').addEventListener('click', () => lienzo.requestPointerLock?.());

addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && modo === 'escritorio') $('rend').hidden = !$('rend').hidden;
});

let cuadros = 0;
const sinDibujo = qs.has('sindibujo');
let pedirDibujo = false;
const reloj = new THREE.Clock();
let pasoCada = 0;
function cuadro() {
  const dtReal = reloj.getDelta();
  const dt = Math.min(dtReal, 0.05);
  if (modo === 'escritorio') escritorio.actualizar(dt);
  if (modo === 'vr') rv.actualizar(dt);
  juego.actualizar(dt);
  aviso.actualizar(dt, camara);
  actualizarReloj(dt);
  // el texto del paso depende de lo que tiene en la mano: se revisa de vez en cuando
  pasoCada += dt;
  if (pasoCada > 0.3) {
    pasoCada = 0;
    ui.paso();
  }
  // ?sindibujo: corre la lógica sin dibujar (pruebas con WebGL por software); garage.dibujar() dibuja uno
  if (!sinDibujo || pedirDibujo) {
    renderer.render(escena, camara);
    pedirDibujo = false;
  }
  cuadros++;
  medir(dt, dtReal);
}

iniciar().catch((e) => {
  console.error(e);
  $('cargando').textContent = 'No se pudo cargar el garage: ' + e.message;
});
