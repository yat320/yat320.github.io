// El reconocedor de pájaros, aparte del dibujo (un Web Worker): así buscar
// pájaros no traba el juego. Recibe cuadros de la cámara y devuelve los pájaros
// con cuánto parece paloma cada uno.
//   detector: EfficientDet-Lite0 (COCO, solo "bird")
//   especies: MobileNet v2 de aves de iNaturalist (964 especies)

var exports = {}
importScripts('mediapipe.js')
// todo adentro de un bloque: MediaPipe declara nombres sueltos (g, t, …) en el mismo lugar
;(() => {
const mp = exports

// las palomas en la lista de especies (familia Columbidae)
const COLUMBIDAE = /^(Columba|Patagioenas|Zenaida|Streptopelia|Columbina|Leptotila|Geopelia|Ocyphaps|Hemiphaga|Spilopelia|Treron|Ducula|Ptilinopus) /
let detector, clasificador, nombres, esPaloma
const recorte = new OffscreenCanvas(224, 224)
const g = recorte.getContext('2d', { willReadFrequently: true })

onmessage = async e => {
  const m = e.data
  if (m.tipo === 'iniciar') {
    try {
      const fs = await mp.FilesetResolver.forVisionTasks(m.base + 'wasm')
      detector = await mp.ObjectDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: m.base + 'efficientdet_lite0.tflite', delegate: 'CPU' }, scoreThreshold: m.umbral, maxResults: 6, runningMode: 'IMAGE', categoryAllowlist: ['bird'] })
      clasificador = await mp.ImageClassifier.createFromOptions(fs, { baseOptions: { modelAssetPath: m.base + 'inat_aves.tflite', delegate: 'CPU' }, maxResults: 8, runningMode: 'IMAGE' })
      nombres = (await (await fetch(m.base + 'inat_aves.txt')).text()).split('\n')
      esPaloma = nombres.map(n => COLUMBIDAE.test(n))
      postMessage({ tipo: 'listo' })
    } catch (err) { postMessage({ tipo: 'error', error: String(err && err.message || err) }) }
    return
  }
  if (m.tipo === 'cuadro') {
    const img = m.imagen, W = img.width, H = img.height
    const t0 = performance.now()
    const cajas = []
    try {
      for (const d of detector.detect(img).detections) {
        const b = d.boundingBox
        const caja = { x: b.originX / W, y: b.originY / H, w: b.width / W, h: b.height / H, puntaje: d.categories[0].score }
        // la especie, con un recorte cuadrado un poco más grande que el pájaro
        const lado = Math.max(b.width, b.height) * 1.2, cx = b.originX + b.width / 2, cy = b.originY + b.height / 2
        g.fillStyle = '#000'; g.fillRect(0, 0, 224, 224)
        g.drawImage(img, cx - lado / 2, cy - lado / 2, lado, lado, 0, 0, 224, 224)
        const cats = clasificador.classify(recorte).classifications[0].categories
        let p = 0
        for (const c of cats) if (esPaloma[c.index]) p += c.score
        caja.p = p
        caja.seguro = cats[0] ? cats[0].score : 0 // qué tan seguro está de la especie: bajo = puede no ser un pájaro
        caja.especie = cats[0] ? nombres[cats[0].index] || '' : ''
        cajas.push(caja)
      }
    } catch (err) { postMessage({ tipo: 'error', error: String(err && err.message || err) }) }
    img.close()
    postMessage({ tipo: 'resultado', id: m.id, cajas, ms: performance.now() - t0 })
  }
}
})()
