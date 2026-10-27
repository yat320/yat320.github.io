// Carteles flotantes (pizarra con el paso y avisos cortos) dibujados en un canvas.
import * as THREE from 'three';

const FUENTE = '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif';

function partirLineas(ctx, texto, ancho) {
  const palabras = texto.split(/\s+/);
  const lineas = [];
  let l = '';
  for (const p of palabras) {
    const prueba = l ? l + ' ' + p : p;
    if (ctx.measureText(prueba).width > ancho && l) {
      lineas.push(l);
      l = p;
    } else l = prueba;
  }
  if (l) lineas.push(l);
  return lineas;
}

/** Pizarra con el próximo paso, el detalle y el avance de las tuercas. */
export class Pizarra {
  constructor(ancho = 0.78, alto = 0.3) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = Math.round((1024 * alto) / ancho);
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthWrite: false });
    this.malla = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), mat);
    this.malla.renderOrder = 10;
    this.ultimo = '';
  }
  mostrar(titulo, detalle = '', avance = null, tono = 'normal', pie = '') {
    const clave = [titulo, detalle, JSON.stringify(avance), tono, pie].join('|');
    if (clave === this.ultimo) return;
    this.ultimo = clave;
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    // fondo: placa oscura con borde de cinta amarilla
    ctx.fillStyle = 'rgba(14,16,18,0.86)';
    redondeado(ctx, 0, 0, W, H, 26);
    ctx.fill();
    ctx.fillStyle = tono === 'listo' ? '#58c27d' : '#e8b62c';
    ctx.fillRect(0, 0, 14, H);
    ctx.fillStyle = '#f2efe6';
    ctx.font = `600 54px ${FUENTE}`;
    let y = 78;
    for (const l of partirLineas(ctx, titulo, W - 90).slice(0, 2)) {
      ctx.fillText(l, 46, y);
      y += 62;
    }
    ctx.fillStyle = '#b9bcc0';
    ctx.font = `400 38px ${FUENTE}`;
    y += 6;
    for (const l of partirLineas(ctx, detalle, W - 90).slice(0, 3)) {
      ctx.fillText(l, 46, y);
      y += 48;
    }
    if (pie) {
      ctx.font = `500 26px ui-monospace, monospace`;
      ctx.fillStyle = '#7d8186';
      ctx.fillText(pie, 46, H - 30);
    }
    if (avance) {
      const { hechas, total, etiqueta } = avance;
      const r = 13, sep = 40;
      const x0 = W - 46 - total * sep + sep / 2;
      const yy = H - 40;
      ctx.font = `500 30px ${FUENTE}`;
      ctx.fillStyle = '#8d9196';
      ctx.textAlign = 'right';
      ctx.fillText(etiqueta || '', x0 - 26, yy + 10);
      ctx.textAlign = 'left';
      for (let i = 0; i < total; i++) {
        ctx.beginPath();
        ctx.arc(x0 + i * sep, yy, r, 0, Math.PI * 2);
        ctx.fillStyle = i < hechas ? '#e8b62c' : 'rgba(255,255,255,0.12)';
        ctx.fill();
      }
    }
    this.tex.needsUpdate = true;
  }
}

/** Aviso corto que aparece cerca de donde pasó algo y se desvanece. */
export class Aviso {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 160;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthTest: false, depthWrite: false });
    this.malla = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42 * (160 / 1024)), mat);
    this.malla.renderOrder = 20;
    this.malla.visible = false;
    this.vida = 0;
  }
  mostrar(texto, pos, camara, tono = 'aviso') {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `600 52px ${FUENTE}`;
    const lineas = partirLineas(ctx, texto, canvas.width - 80).slice(0, 2);
    ctx.font = `600 ${lineas.length > 1 ? 44 : 52}px ${FUENTE}`;
    const ancho = Math.min(canvas.width, Math.max(...lineas.map((l) => ctx.measureText(l).width)) + 80);
    const x0 = (canvas.width - ancho) / 2;
    ctx.fillStyle = tono === 'bien' ? 'rgba(30,70,44,0.92)' : tono === 'info' ? 'rgba(20,22,26,0.9)' : 'rgba(90,40,14,0.92)';
    redondeado(ctx, x0, 6, ancho, canvas.height - 12, 40);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    lineas.forEach((l, i) => ctx.fillText(l, canvas.width / 2, (lineas.length > 1 ? 66 : 98) + i * 50));
    ctx.textAlign = 'left';
    this.tex.needsUpdate = true;
    this.malla.position.copy(pos);
    this.malla.quaternion.copy(camara.getWorldQuaternion(new THREE.Quaternion()));
    this.malla.visible = true;
    this.vida = 2.6;
    this.malla.material.opacity = 1;
  }
  actualizar(dt, camara) {
    if (!this.malla.visible) return;
    this.vida -= dt;
    this.malla.material.opacity = Math.min(1, this.vida * 2);
    // siempre mirando a la cabeza
    const q = camara.getWorldQuaternion(new THREE.Quaternion());
    this.malla.quaternion.slerp(q, Math.min(1, dt * 6));
    if (this.vida <= 0) this.malla.visible = false;
  }
}

function redondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
