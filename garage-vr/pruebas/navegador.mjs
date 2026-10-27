// Ayudas para probar el juego en Chromium (Playwright) con WebGL por software.
// Sirve el sitio desde una carpeta local y redirige las librerías de la CDN a copias locales.
// Variables: NODE_DIR (carpeta con node_modules de three, iwer y @webxr-input-profiles/assets), SITIO (raíz del sitio).
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire('/opt/node22/lib/node_modules/');
export const { chromium } = require('playwright');

export const NODE_DIR = process.env.NODE_DIR || path.join(process.env.HOME, 'gvr-node');
export const SITIO = process.env.SITIO || path.resolve(new URL('../..', import.meta.url).pathname);

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream', '.png': 'image/png' };

export function servir(raiz = SITIO) {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const ruta = path.join(raiz, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      fs.readFile(ruta.endsWith('/') ? path.join(ruta, 'index.html') : ruta, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { 'content-type': TIPOS[path.extname(ruta)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    s.listen(0, '127.0.0.1', () => ok({ servidor: s, puerto: s.address().port }));
  });
}

/** Abre el navegador con la CDN redirigida a copias locales. */
export async function abrir({ ancho = 1280, alto = 800, iwer = false } = {}) {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, (route) => {
    const rel = route.request().url().replace(/^.*three@[^/]+\//, '');
    route.fulfill({ path: path.join(NODE_DIR, 'node_modules/three', rel) });
  });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@webxr-input-profiles\/assets@[^/]+\/(.*)$/, (route) => {
    const rel = route.request().url().replace(/^.*assets@[^/]+\//, '');
    const f = path.join(NODE_DIR, 'node_modules/@webxr-input-profiles/assets', rel);
    if (fs.existsSync(f)) route.fulfill({ path: f });
    else route.fulfill({ status: 404 });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: '' }));
  if (iwer) {
    const js = fs.readFileSync(path.join(NODE_DIR, 'node_modules/iwer/build/iwer.min.js'), 'utf8');
    await ctx.addInitScript({ content: `${js}\n;(() => { const d = new IWER.XRDevice(IWER.metaQuest3); d.installRuntime({ forceInstall: true }); window.__xr = d; })();` });
  }
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });
  return { browser, ctx, page, errores };
}
