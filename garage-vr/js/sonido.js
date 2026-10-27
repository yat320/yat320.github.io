// Sonidos sintetizados (sin archivos): se generan una vez al empezar y se tocan posicionados en la escena.
import * as THREE from 'three';

const SR = 44100;

function buffer(ctx, seg, fn) {
  const n = Math.floor(SR * seg);
  const b = ctx.createBuffer(1, n, SR);
  const d = b.getChannelData(0);
  let max = 1e-6;
  for (let i = 0; i < n; i++) {
    d[i] = fn(i / SR, i);
    max = Math.max(max, Math.abs(d[i]));
  }
  for (let i = 0; i < n; i++) d[i] /= max;
  return b;
}

// ruido con filtro pasa bajos simple
function ruidoFiltrado(corte) {
  let y = 0;
  const a = Math.exp((-2 * Math.PI * corte) / SR);
  return () => {
    y = a * y + (1 - a) * (Math.random() * 2 - 1);
    return y;
  };
}

function metal(t, f0, dec) {
  // parciales inarmónicos de una pieza de metal
  const p = [1, 2.76, 5.4, 8.93, 13.3];
  let s = 0;
  for (let k = 0; k < p.length; k++) s += Math.sin(2 * Math.PI * f0 * p[k] * t) * Math.exp(-t * dec * (1 + k * 0.7)) / (k + 1);
  return s;
}

const RECETAS = {
  // agarrar algo
  agarrar: (ctx) => { const r = ruidoFiltrado(3000); return buffer(ctx, 0.06, (t) => r() * Math.exp(-t * 90)); },
  // la tuerca despega (crac seco + golpe grave)
  crac: (ctx) => {
    const r = ruidoFiltrado(5000);
    return buffer(ctx, 0.25, (t) => r() * Math.exp(-t * 60) * 1.2 + Math.sin(2 * Math.PI * 95 * t) * Math.exp(-t * 25) * 0.8 + metal(t, 1900, 30) * 0.3);
  },
  // clic de apriete justo
  clic: (ctx) => buffer(ctx, 0.05, (t) => (t < 0.002 ? 1 : 0) * (Math.random() * 2 - 1) + metal(t, 3100, 140) * 0.6),
  // rosca girando (granulado)
  rosca: (ctx) => { const r = ruidoFiltrado(2500); return buffer(ctx, 0.09, (t, i) => r() * (0.5 + 0.5 * Math.sin(i * 0.05)) * Math.exp(-t * 20)); },
  // llave que calza en la tuerca
  calzar: (ctx) => buffer(ctx, 0.12, (t) => metal(t, 2400, 45)),
  // herramienta o tuerca que cae sobre concreto
  caeMetal: (ctx) => { const r = ruidoFiltrado(6000); return buffer(ctx, 0.6, (t) => metal(t, 1300, 9) * 0.8 + r() * Math.exp(-t * 80) * 0.6); },
  caeTuerca: (ctx) => { const r = ruidoFiltrado(8000); return buffer(ctx, 0.35, (t) => metal(t, 3600, 18) * 0.7 + r() * Math.exp(-t * 120) * 0.5); },
  caePlastico: (ctx) => { const r = ruidoFiltrado(1800); return buffer(ctx, 0.15, (t) => r() * Math.exp(-t * 45) + Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 40) * 0.5); },
  // capó que se cierra
  capo: (ctx) => {
    const r = ruidoFiltrado(900);
    return buffer(ctx, 0.7, (t) => Math.sin(2 * Math.PI * 62 * t) * Math.exp(-t * 9) + r() * Math.exp(-t * 18) * 0.7 + metal(t, 420, 12) * 0.25);
  },
  // varilla que entra en su lugar
  varilla: (ctx) => buffer(ctx, 0.2, (t) => metal(t, 1700, 22)),
  // manguera de goma que sale o entra
  goma: (ctx) => { const r = ruidoFiltrado(600); return buffer(ctx, 0.18, (t) => r() * Math.exp(-t * 30) + Math.sin(2 * Math.PI * (140 - 300 * t) * t) * Math.exp(-t * 25) * 0.6); },
  // tapa que apoya sobre la junta
  tapa: (ctx) => { const r = ruidoFiltrado(1400); return buffer(ctx, 0.35, (t) => metal(t, 650, 16) * 0.6 + r() * Math.exp(-t * 35)); },
  // terminado
  listo: (ctx) => buffer(ctx, 1.4, (t) => [523.25, 659.25, 783.99, 1046.5].reduce((s, f, k) => s + Math.sin(2 * Math.PI * f * t) * Math.exp(-Math.max(0, t - k * 0.12) * 3) * (t > k * 0.12 ? 1 : 0), 0)),
  // aviso suave (algo no se puede)
  no: (ctx) => buffer(ctx, 0.22, (t) => Math.sin(2 * Math.PI * (220 - 60 * t) * t) * Math.exp(-t * 14)),
};

export class Sonido {
  constructor(camara) {
    this.oyente = new THREE.AudioListener();
    camara.add(this.oyente);
    this.ctx = this.oyente.context;
    this.buf = {};
    for (const [k, f] of Object.entries(RECETAS)) this.buf[k] = f(this.ctx);
    this.pool = [];
    this.escena = null;
  }
  usarEscena(escena) {
    this.escena = escena;
    for (let i = 0; i < 10; i++) {
      const a = new THREE.PositionalAudio(this.oyente);
      a.setRefDistance(0.6);
      a.setRolloffFactor(1.2);
      escena.add(a);
      this.pool.push(a);
    }
  }
  reanudar() {
    if (this.ctx.state !== 'running') this.ctx.resume();
  }
  tocar(nombre, pos, vol = 1, tono = 1) {
    const b = this.buf[nombre];
    if (!b || !this.pool.length || this.ctx.state !== 'running') return;
    const a = this.pool.find((x) => !x.isPlaying) || this.pool[0];
    if (a.isPlaying) a.stop();
    a.setBuffer(b);
    a.setVolume(vol);
    a.setPlaybackRate(tono * (0.96 + Math.random() * 0.08));
    if (pos) a.position.copy(pos);
    a.updateMatrixWorld();
    a.play();
  }
}
