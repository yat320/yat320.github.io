# Texturas PBR que se repiten sin costura, generadas con ruido periódico (FFT).
# Cada juego tiene: <nombre>_color.png (sRGB), <nombre>_normal.png (OpenGL, Y+), <nombre>_orm.png (oclusión, rugosidad, metal).
# Uso: ~/venv/bin/python texturas.py <carpeta-salida>
import os
import sys
import numpy as np
from PIL import Image

SALIDA = sys.argv[1] if len(sys.argv) > 1 else 'texturas'
os.makedirs(SALIDA, exist_ok=True)


def ruido(n, beta=2.0, semilla=0, fmin=1.0, fmax=None, estirar=(1.0, 1.0)):
    """Ruido fractal periódico: espectro 1/f^beta con fase al azar. Devuelve 0..1."""
    r = np.random.default_rng(semilla)
    fx = np.fft.fftfreq(n) * n * estirar[0]
    fy = np.fft.fftfreq(n) * n * estirar[1]
    f = np.sqrt(fx[None, :] ** 2 + fy[:, None] ** 2)
    f[0, 0] = 1
    amp = 1.0 / f ** (beta / 2)
    amp[f < fmin] = 0
    if fmax:
        amp[f > fmax] = 0
    fase = r.uniform(0, 2 * np.pi, (n, n))
    esp = amp * np.exp(1j * fase)
    v = np.real(np.fft.ifft2(esp))
    v -= v.min()
    v /= v.max() + 1e-9
    return v


def normal_desde_alto(h, fuerza):
    """Normal en formato OpenGL (Y hacia arriba) desde un mapa de altura periódico."""
    k = fuerza * h.shape[0] / 256  # la fuerza no depende de la resolución
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * k
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * k
    nx, ny, nz = -dx, dy, np.ones_like(h)
    l = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    return np.stack([nx / l, ny / l, nz / l], -1)


def oclusion_desde_alto(h, radio=8, fuerza=1.5):
    """Oclusión barata: cuánto más bajo está cada punto que su entorno."""
    from numpy.fft import fft2, ifft2
    n = h.shape[0]
    k = np.zeros_like(h)
    yy, xx = np.mgrid[:n, :n]
    d = np.minimum(xx, n - xx) ** 2 + np.minimum(yy, n - yy) ** 2
    k = np.exp(-d / (2 * radio ** 2))
    k /= k.sum()
    prom = np.real(ifft2(fft2(h) * fft2(k)))
    return np.clip(1 - np.maximum(prom - h, 0) * fuerza, 0, 1)


def a_srgb(lin):
    lin = np.clip(lin, 0, 1)
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)


def guardar(nombre, color_lin, normal, ao, rug, metal):
    n = color_lin.shape[0]
    Image.fromarray((a_srgb(color_lin) * 255 + 0.5).astype(np.uint8), 'RGB').save(os.path.join(SALIDA, f'{nombre}_color.png'))
    Image.fromarray(((normal * 0.5 + 0.5) * 255 + 0.5).clip(0, 255).astype(np.uint8), 'RGB').save(os.path.join(SALIDA, f'{nombre}_normal.png'))
    orm = np.stack([ao, rug, metal if np.ndim(metal) else np.full_like(rug, metal)], -1)
    Image.fromarray((orm * 255 + 0.5).clip(0, 255).astype(np.uint8), 'RGB').save(os.path.join(SALIDA, f'{nombre}_orm.png'))
    print('textura', nombre, n)


def mezclar(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return a * (1 - t) + b * t


def color(rgb_srgb):
    c = np.array(rgb_srgb, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def suave(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ───────────────────────── Concreto del piso (1 tile = 2 m) ─────────────────────────
def concreto(n=1024):
    base = ruido(n, 2.2, 1, fmin=1)
    medio = ruido(n, 1.6, 2, fmin=8)
    grano = ruido(n, 0.6, 3, fmin=60)
    piedritas = (ruido(n, 0.3, 4, fmin=150) > 0.72).astype(float)
    grietas_r = ruido(n, 2.4, 5, fmin=2, fmax=40)
    grieta = 1 - suave(0.0, 0.006, np.abs(grietas_r - 0.5))
    grieta *= suave(0.45, 0.7, ruido(n, 2.0, 6, fmin=1, fmax=8))
    manchas = suave(0.66, 0.86, ruido(n, 2.0, 7, fmin=4, fmax=60)) * suave(0.4, 0.7, ruido(n, 2.0, 8, fmin=1, fmax=6))
    c = color((0.60, 0.59, 0.56)) * (0.78 + 0.32 * base[..., None]) * (0.92 + 0.12 * medio[..., None])
    c = c * (0.94 + 0.1 * grano[..., None])
    c = mezclar(c, c * 0.72, piedritas * 0.6)
    c = mezclar(c, color((0.33, 0.32, 0.30)), manchas * 0.45)
    c = mezclar(c, color((0.2, 0.19, 0.18)), grieta * 0.8)
    alto = 0.6 * grano + 0.3 * medio - 0.8 * grieta + 0.2 * piedritas
    rug = 0.86 - 0.1 * base - 0.38 * manchas + 0.05 * grano
    guardar('concreto', c, normal_desde_alto(alto, 3.0), oclusion_desde_alto(alto, 4, 1.2), np.clip(rug, 0.2, 1), 0.0)


# ───────────────────────── Revoque pintado (paredes y losa, 1 tile = 1.5 m) ─────────────────────────
def revoque(n=1024):
    llana = ruido(n, 2.0, 11, fmin=3, estirar=(1.0, 0.6))
    grano = ruido(n, 0.8, 12, fmin=80)
    sucio = suave(0.5, 0.85, ruido(n, 2.4, 13, fmin=1, fmax=16))
    c = np.ones((n, n, 3)) * (0.9 + 0.08 * llana[..., None]) * (0.96 + 0.06 * grano[..., None])
    c = mezclar(c, c * np.array([0.82, 0.8, 0.74]), sucio * 0.5)
    alto = 0.7 * grano + 0.6 * llana
    rug = 0.88 - 0.05 * llana
    guardar('revoque', c, normal_desde_alto(alto, 1.6), oclusion_desde_alto(alto, 6, 0.8), rug, 0.0)


# ───────────────────────── Metal pintado con desgaste (1 tile = 0.6 m) ─────────────────────────
def metal_pintado(n=512):
    base = ruido(n, 1.8, 21, fmin=2)
    rayas = ruido(n, 1.0, 22, fmin=20, estirar=(0.08, 1.0))
    picado = suave(0.78, 0.86, ruido(n, 1.4, 23, fmin=6)) * suave(0.55, 0.75, ruido(n, 2.0, 24, fmin=1, fmax=8))
    rayon = suave(0.93, 0.97, rayas)
    pintura = np.ones((n, n, 3)) * (0.9 + 0.1 * base[..., None])
    metal_c = color((0.42, 0.42, 0.42))
    c = mezclar(pintura, metal_c, np.maximum(picado, rayon * 0.7))
    sucio = suave(0.5, 0.9, ruido(n, 1.8, 25, fmin=3, fmax=40))
    c = c * (1 - 0.12 * sucio[..., None])
    rug = 0.45 + 0.15 * base + 0.2 * sucio - 0.1 * picado
    metal = np.maximum(picado, rayon * 0.7)
    alto = -0.6 * picado + 0.3 * base
    guardar('metal_pintado', c, normal_desde_alto(alto, 2.0), np.ones((n, n)), np.clip(rug, 0.2, 1), metal)


# ───────────────────────── Metal crudo cepillado (1 tile = 0.3 m) ─────────────────────────
def metal_crudo(n=512):
    cepillo = ruido(n, 0.8, 31, fmin=10, estirar=(0.03, 1.0))
    huellas = suave(0.6, 0.85, ruido(n, 2.2, 32, fmin=2, fmax=20))
    base = ruido(n, 2.0, 33, fmin=1, fmax=10)
    c = np.ones((n, n, 3)) * (0.92 + 0.08 * cepillo[..., None]) * (0.95 + 0.05 * base[..., None])
    rug = 0.28 + 0.12 * cepillo + 0.2 * huellas
    guardar('metal_crudo', c, normal_desde_alto(cepillo, 0.8), np.ones((n, n)), np.clip(rug, 0.05, 1), 1.0)


# ───────────────────────── Fundición (aluminio y hierro, 1 tile = 0.25 m) ─────────────────────────
def fundido(n=512):
    arena = ruido(n, 0.4, 41, fmin=60)
    poros = suave(0.8, 0.9, ruido(n, 0.5, 42, fmin=90))
    base = ruido(n, 2.0, 43, fmin=1, fmax=12)
    mugre = suave(0.45, 0.85, ruido(n, 1.8, 44, fmin=3, fmax=40))
    c = np.ones((n, n, 3)) * (0.82 + 0.18 * arena[..., None]) * (0.9 + 0.1 * base[..., None])
    c = mezclar(c, color((0.25, 0.22, 0.18)), mugre * 0.35)
    c = c * (1 - 0.35 * poros[..., None])
    rug = 0.55 + 0.2 * arena + 0.15 * mugre
    alto = 0.6 * arena - 0.8 * poros
    guardar('fundido', c, normal_desde_alto(alto, 2.5), oclusion_desde_alto(alto, 3, 1.0), np.clip(rug, 0, 1), 1.0 - 0.6 * mugre)


# ───────────────────────── Óxido (1 tile = 0.3 m) ─────────────────────────
def oxido(n=512):
    a = ruido(n, 1.6, 51, fmin=2)
    b = ruido(n, 0.7, 52, fmin=30)
    escamas = suave(0.6, 0.75, ruido(n, 1.2, 53, fmin=8))
    c = mezclar(color((0.42, 0.20, 0.09)), color((0.20, 0.10, 0.06)), a)
    c = mezclar(c, color((0.55, 0.30, 0.12)), escamas * 0.5)
    c = c * (0.85 + 0.2 * b[..., None])
    alto = 0.5 * b + 0.6 * escamas
    guardar('oxido', c, normal_desde_alto(alto, 3.0), oclusion_desde_alto(alto, 3, 1.2), 0.82 + 0.15 * b, 0.15 * (1 - escamas))


# ───────────────────────── Plástico y goma texturados (1 tile = 0.15 m) ─────────────────────────
def plastico(n=512):
    grano = ruido(n, 0.3, 61, fmin=100)
    base = ruido(n, 2.0, 62, fmin=1, fmax=8)
    polvo = suave(0.55, 0.9, ruido(n, 2.0, 63, fmin=1, fmax=10))
    c = np.ones((n, n, 3)) * (0.95 + 0.05 * base[..., None])
    c = mezclar(c, np.ones(3) * 1.6, polvo * 0.12)
    rug = 0.5 + 0.12 * grano + 0.2 * polvo
    guardar('plastico', c, normal_desde_alto(grano, 1.2), np.ones((n, n)), np.clip(rug, 0, 1), 0.0)


# ───────────────────────── Tela (tapizado y trapo, 1 tile = 0.08 m) ─────────────────────────
def tela(n=512):
    yy, xx = np.mgrid[:n, :n] / n
    k = 64
    trama = (np.sin(2 * np.pi * k * xx) * np.sin(2 * np.pi * k * yy))
    hilos = 0.5 + 0.5 * np.sign(trama) * np.abs(trama) ** 0.5
    fibra = ruido(n, 0.6, 71, fmin=80)
    c = np.ones((n, n, 3)) * (0.85 + 0.15 * hilos[..., None]) * (0.92 + 0.1 * fibra[..., None])
    alto = 0.7 * hilos + 0.3 * fibra
    guardar('tela', c, normal_desde_alto(alto, 2.5), oclusion_desde_alto(alto, 2, 0.6), 0.92 - 0.05 * hilos, 0.0)


# ───────────────────────── Madera del banco (1 tile = 0.8 m) ─────────────────────────
def madera(n=1024):
    yy, xx = np.mgrid[:n, :n] / n
    deform = ruido(n, 2.0, 81, fmin=1, fmax=12, estirar=(0.15, 1.0))
    vetas = 0.5 + 0.5 * np.sin(2 * np.pi * (yy * 22 + deform * 1.2))
    vetas = vetas ** 4 * (0.6 + 0.4 * ruido(n, 1.5, 84, fmin=2, estirar=(0.1, 1.0)))
    fibra = ruido(n, 0.6, 82, fmin=40, estirar=(0.05, 1.0))
    manchas = suave(0.6, 0.85, ruido(n, 2.4, 83, fmin=1, fmax=10))
    c = mezclar(color((0.55, 0.38, 0.22)), color((0.38, 0.24, 0.12)), vetas)
    c = c * (0.9 + 0.12 * fibra[..., None])
    c = mezclar(c, color((0.12, 0.08, 0.05)), manchas * 0.6)
    rug = 0.7 + 0.1 * vetas - 0.25 * manchas
    alto = 0.4 * fibra - 0.3 * vetas
    guardar('madera', c, normal_desde_alto(alto, 2.0), np.ones((n, n)), rug, 0.0)


# ───────────────────────── Tablero perforado (1 tile = 0.254 m, 10 x 10 agujeros) ─────────────────────────
def tablero(n=512):
    yy, xx = np.mgrid[:n, :n] / n
    k = 10
    d = np.sqrt(((xx * k) % 1 - 0.5) ** 2 + ((yy * k) % 1 - 0.5) ** 2)
    agujero = 1 - suave(0.11, 0.135, d)
    fibra = ruido(n, 0.8, 91, fmin=30)
    c = np.ones((n, n, 3)) * color((0.66, 0.54, 0.40)) / color((0.62, 0.50, 0.36)) * (0.93 + 0.07 * fibra[..., None])
    c = mezclar(c, np.array([0.02, 0.02, 0.02]), agujero)
    alto = -agujero * 1.0 + 0.1 * fibra
    guardar('tablero', c, normal_desde_alto(alto, 6.0), 1 - 0.8 * agujero, 0.85 + 0.0 * fibra, 0.0)


# ───────────────────────── Pintura del auto: piel de naranja y polvo (1 tile = 0.5 m) ─────────────────────────
def pintura(n=512):
    piel = ruido(n, 1.2, 101, fmin=25, fmax=120)
    polvo = suave(0.5, 0.95, ruido(n, 2.2, 102, fmin=1, fmax=16))
    rayitas = suave(0.965, 0.99, ruido(n, 1.0, 103, fmin=30, estirar=(0.05, 1.0)))
    c = np.ones((n, n, 3)) * (1 - 0.12 * polvo[..., None])
    c = mezclar(c, np.ones(3) * 1.4, rayitas * 0.15)
    rug = 0.16 + 0.22 * polvo + 0.15 * rayitas
    guardar('pintura', c, normal_desde_alto(piel, 0.35), np.ones((n, n)), rug, 0.0)


# ───────────────────────── Manchas de aceite del piso (calco RGBA, sin repetir) ─────────────────────────
def manchas_piso(n=1024):
    yy, xx = np.mgrid[:n, :n] / n
    r = np.random.default_rng(7)
    alfa = np.zeros((n, n))
    # charco grande bajo el motor (adelante del auto) y gotas sueltas
    for cx, cy, rad, f in [(0.5, 0.82, 0.13, 1.0), (0.42, 0.74, 0.06, 0.8), (0.58, 0.9, 0.05, 0.7), (0.5, 0.25, 0.07, 0.5), (0.3, 0.55, 0.04, 0.4)]:
        d = np.sqrt(((xx - cx) * 1.6) ** 2 + (yy - cy) ** 2)
        borde = ruido(n, 2.0, int(cx * 100 + cy * 1000), fmin=2, fmax=30)
        alfa = np.maximum(alfa, f * (1 - suave(rad * 0.4, rad * (1.0 + 0.8 * borde), d)))
    gotas = (ruido(n, 0.4, 111, fmin=120) > 0.82) * suave(0.5, 0.8, ruido(n, 2.0, 112, fmin=1, fmax=6))
    alfa = np.clip(np.maximum(alfa * (0.7 + 0.3 * ruido(n, 1.0, 113, fmin=20)), gotas * 0.5), 0, 1)
    # huellas de cubiertas (dos franjas tenues a lo largo)
    for cx in (0.33, 0.67):
        alfa = np.maximum(alfa, 0.12 * (1 - suave(0.0, 0.03, np.abs(xx - cx))) * (0.5 + 0.5 * ruido(n, 1.0, 114, fmin=40, estirar=(1.0, 0.1))))
    rgba = np.zeros((n, n, 4))
    rgba[..., :3] = a_srgb(np.ones((n, n, 3)) * color((0.08, 0.07, 0.06)))
    rgba[..., 3] = alfa
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(SALIDA, 'manchas_piso.png'))
    print('textura manchas_piso')


if __name__ == '__main__':
    for f in (concreto, revoque, metal_pintado, metal_crudo, fundido, oxido, plastico, tela, madera, tablero, pintura, manchas_piso):
        f()
