# yat320.github.io

Sitio de GitHub Pages de Juani: se publica solo al llegar a `main`, sin build. Cada carpeta es una página aparte.

- `juegos/` es la página de links de los juegos (https://yat320.github.io/juegos/): arriba los que vamos haciendo, abajo los que son para probar con el Meta Quest 3. **Cuando publiques un juego nuevo, acá o en otro repo con Pages (como `race-to-agi`), sumá su link ahí**, en la sección que va (si anda en el celu y en el visor, va en las dos), con ícono, nombre y una línea.
- `sospechoso/` y `pericia/` son copias del build de repos privados, para que se puedan jugar con link. Para actualizarlas: en `taller-mecanico` correr `npm run build:single` y copiar `dist-single/index.html` a `sospechoso/index.html`; en `pericia-3d` correr `node build.mjs` y copiar su `index.html` a `pericia/index.html`.
