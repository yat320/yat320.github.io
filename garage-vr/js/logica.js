// Lógica del primer trabajo, sin 3D ni DOM: capó, varilla, manguera del respiradero, tuercas y tapa de válvulas.
// Los datos de la tapa (tuercas M6 de 10 mm a 10 Nm) salen del motor 1.6 tipo AP del taller (datos/ap16-tapa.json).

/** mm que sube la tuerca por vuelta (rosca M6 paso 1). */
export const PASO = 1.0;
/** vueltas de rosca desde asentada hasta que queda suelta arriba del espárrago */
export const VUELTAS = 2;
/** grados que hay que forzar la llave para despegar una tuerca ajustada */
export const DESPEGUE = 22;
/** grados de giro con la llave después de asentar para llegar al apriete (10 Nm en chapa: poquito) */
export const AJUSTE = 14;
/** pasado esto, es apretar de más */
export const DE_MAS = 34;
/** ángulo del capó (grados) a partir del cual se puede poner la varilla */
export const CAPO_VARILLA = 38;
export const CAPO_MAX = 58;

export const ESTADOS_TUERCA = ['ajustada', 'asentada', 'floja', 'suelta', 'afuera'];

export function nuevaTuerca(id, medida = 10) {
  return { id, medida, estado: 'ajustada', vueltas: 0, apriete: AJUSTE + 2, aviso: null };
}

/**
 * Gira una tuerca. `grados` > 0 afloja (antihorario visto desde arriba), < 0 aprieta.
 * Devuelve { giro, evento, tension }: cuánto giró de verdad, qué pasó y cuánto se está forzando (0..1).
 */
export function girar(t, grados, { conLlave = false } = {}) {
  const r = { giro: 0, evento: null, tension: 0 };
  if (t.estado === 'afuera' || Math.abs(grados) < 1e-6) return r;
  if (grados > 0) {
    // aflojar
    if (t.estado === 'ajustada') {
      if (!conLlave) return { ...r, evento: 'necesita_llave' };
      if (grados < DESPEGUE) return { ...r, evento: 'forcejeo', tension: grados / DESPEGUE };
      t.estado = 'floja';
      t.apriete = 0;
      t.vueltas = 0;
      return { giro: grados - DESPEGUE * 0.6, evento: 'despego', tension: 1 };
    }
    if (t.estado === 'asentada') {
      t.estado = 'floja';
      t.apriete = 0;
    }
    if (t.estado === 'floja') {
      const antes = t.vueltas;
      t.vueltas = Math.min(VUELTAS, t.vueltas + grados / 360);
      r.giro = (t.vueltas - antes) * 360;
      if (t.vueltas >= VUELTAS) {
        t.estado = 'suelta';
        r.evento = 'salio';
      }
      return r;
    }
    return r; // suelta: gira loca arriba del espárrago
  }
  // apretar
  const g = -grados;
  if (t.estado === 'suelta') {
    t.estado = 'floja';
    t.vueltas = VUELTAS;
    r.evento = 'enrosco';
  }
  if (t.estado === 'floja') {
    const antes = t.vueltas;
    t.vueltas = Math.max(0, t.vueltas - g / 360);
    r.giro = -(antes - t.vueltas) * 360;
    if (t.vueltas <= 0) {
      t.estado = 'asentada';
      t.apriete = 0;
      r.evento = r.evento || 'asento';
    }
    return r;
  }
  if (t.estado === 'asentada' || t.estado === 'ajustada') {
    if (!conLlave) return { ...r, evento: 'a_mano_no' };
    const resto = Math.max(0, DE_MAS - t.apriete);
    if (resto <= 0) return { ...r, evento: 'de_mas', tension: 1 };
    // cuesta más a medida que aprieta: la llave gira la mitad de lo que tira la mano
    const efectivo = Math.min(resto, g * 0.5);
    const antes = t.apriete;
    t.apriete += efectivo;
    r.giro = -efectivo;
    r.tension = Math.min(1, t.apriete / DE_MAS);
    if (antes < AJUSTE && t.apriete >= AJUSTE) {
      t.estado = 'ajustada';
      r.evento = 'ajustada';
    } else if (t.apriete >= DE_MAS * 0.85) {
      r.evento = 'de_mas';
    }
    return r;
  }
  return r;
}

/** Altura de la tuerca sobre su asiento, en mm. */
export function alturaTuerca(t) {
  if (t.estado === 'afuera') return null;
  if (t.estado === 'suelta') return VUELTAS * PASO + 0.5;
  return t.vueltas * PASO;
}

/** Estado completo del trabajo. */
export function nuevoTrabajo(idsTuercas) {
  return {
    capo: 0, // grados de apertura
    varilla: 'guardada', // 'guardada' | 'puesta'
    manguera: 'puesta', // 'puesta' | 'sacada'
    tapa: 'puesta', // 'puesta' | 'afuera'
    tuercas: idsTuercas.map((id) => nuevaTuerca(id)),
    sacoTapa: false, // ya la sacó al menos una vez
    terminado: false,
    inicio: null,
    fin: null,
  };
}

export function tuerca(tr, id) {
  return tr.tuercas.find((t) => t.id === id);
}

export function cuantas(tr, estados) {
  return tr.tuercas.filter((t) => estados.includes(t.estado)).length;
}

/** ¿Se puede levantar la tapa? Devuelve null si sí, o el motivo. */
export function puedeSacarTapa(tr) {
  if (tr.tapa !== 'puesta') return null;
  if (tr.manguera === 'puesta') return 'Primero sacá la manguera del respiradero.';
  const quedan = tr.tuercas.filter((t) => t.estado !== 'afuera').length;
  if (quedan) return quedan === 1 ? 'Falta sacar una tuerca.' : `Faltan sacar ${quedan} tuercas.`;
  return null;
}

export function sacarTapa(tr) {
  const no = puedeSacarTapa(tr);
  if (no) return { ok: false, motivo: no };
  tr.tapa = 'afuera';
  tr.sacoTapa = true;
  return { ok: true };
}

export function ponerTapa(tr) {
  if (tr.tapa === 'puesta') return { ok: false, motivo: 'Ya está puesta.' };
  if (tr.tuercas.some((t) => t.estado !== 'afuera')) return { ok: false, motivo: 'Hay una tuerca en un espárrago: sacala antes.' };
  tr.tapa = 'puesta';
  return { ok: true };
}

/** Pone una tuerca arriba de su espárrago (sin enroscar). */
export function ponerTuerca(tr, id) {
  const t = tuerca(tr, id);
  if (!t || t.estado !== 'afuera') return { ok: false, motivo: 'Ese espárrago ya tiene su tuerca.' };
  if (tr.tapa !== 'puesta') return { ok: false, motivo: 'Primero poné la tapa: si no, la tuerca no apoya en nada.' };
  t.estado = 'suelta';
  t.vueltas = VUELTAS;
  t.apriete = 0;
  return { ok: true };
}

/** Saca una tuerca suelta del espárrago (con la mano). */
export function sacarTuerca(tr, id) {
  const t = tuerca(tr, id);
  if (!t) return { ok: false };
  if (t.estado === 'suelta') {
    t.estado = 'afuera';
    return { ok: true };
  }
  if (t.estado === 'afuera') return { ok: true };
  return { ok: false, motivo: t.estado === 'floja' ? 'Todavía está enroscada: girala un poco más.' : 'Está apretada: aflojala con la llave de 10.' };
}

export function sacarManguera(tr) {
  if (tr.manguera === 'sacada') return { ok: true };
  if (tr.capo < CAPO_VARILLA) return { ok: false, motivo: 'Abrí el capó primero.' };
  tr.manguera = 'sacada';
  return { ok: true };
}

export function ponerManguera(tr) {
  if (tr.tapa !== 'puesta') return { ok: false, motivo: 'La manguera va en la tapa: primero poné la tapa.' };
  tr.manguera = 'puesta';
  revisarFin(tr);
  return { ok: true };
}

/** El capó sin varilla se cae; con varilla queda. */
export function soltarCapo(tr) {
  if (tr.varilla === 'puesta') return 'queda';
  return 'cae';
}

export function ponerVarilla(tr) {
  if (tr.capo < CAPO_VARILLA) return { ok: false, motivo: 'Levantá más el capó.' };
  tr.varilla = 'puesta';
  return { ok: true };
}

export function guardarVarilla(tr) {
  tr.varilla = 'guardada';
  return { ok: true };
}

export function revisarFin(tr, ahora = Date.now()) {
  const listo = tr.sacoTapa && tr.tapa === 'puesta' && tr.manguera === 'puesta' && tr.tuercas.every((t) => t.estado === 'ajustada');
  if (listo && !tr.terminado) {
    tr.terminado = true;
    tr.fin = ahora;
    return true;
  }
  return false;
}

/** Qué medida de llave usar con una tuerca: mensaje si no sirve, o null si sirve. */
export function llaveSirve(medidaLlave, medidaTuerca = 10) {
  if (medidaLlave === medidaTuerca) return null;
  if (medidaLlave < medidaTuerca) return `La de ${medidaLlave} no entra: la tuerca es de ${medidaTuerca}.`;
  return `La de ${medidaLlave} le queda grande y baila. Las tuercas de la tapa son de ${medidaTuerca}.`;
}

/**
 * El próximo paso, en una línea (y una más con el detalle), según el estado.
 * `ctx` dice lo que no está en el trabajo: qué tiene en la mano.
 */
export function proximoPaso(tr, ctx = {}) {
  const { enMano = null, escritorio = false } = ctx;
  const n = tr.tuercas.length;
  if (tr.terminado) {
    const s = tr.fin != null && tr.inicio != null ? Math.round((tr.fin - tr.inicio) / 1000) : null;
    const t = s == null ? '' : ` en ${Math.floor(s / 60)} min ${s % 60} s`;
    return { titulo: '¡Listo! Tapa de válvulas sacada y puesta' + t + '.', detalle: 'Podés cerrar el capó: sacá la varilla y bajalo.' };
  }
  if (tr.capo < CAPO_VARILLA && tr.varilla === 'guardada') {
    return {
      titulo: 'Abrí el capó.',
      detalle: escritorio ? 'Apuntá al borde de adelante del capó y hacé clic.' : 'Agarralo del borde de adelante y levantalo.',
    };
  }
  if (tr.varilla === 'guardada') {
    return { titulo: 'Sostené el capó con la varilla.', detalle: 'Está acostada sobre el frente, a la izquierda: levantala hasta el hueco del capó.' };
  }
  if (!tr.sacoTapa) {
    if (tr.manguera === 'puesta') return { titulo: 'Sacá la manguera del respiradero.', detalle: 'Es la manguera finita que va de la tapa al filtro de aire. Tirala hacia afuera.' };
    const ajustadas = tr.tuercas.filter((t) => t.estado !== 'afuera').length;
    if (ajustadas) {
      const enEsparrago = tr.tuercas.filter((t) => t.estado === 'suelta').length;
      if (!(enMano && enMano.medida === 10) && cuantas(tr, ['ajustada']) > 0) {
        if (enMano && enMano.tipo === 'llave') return { titulo: llaveSirve(enMano.medida), detalle: 'Volvé al tablero y buscá la de 10.' };
        return { titulo: 'Buscá la llave de 10 en el tablero.', detalle: 'Está colgada en la pared del fondo, arriba del banco.' };
      }
      if (cuantas(tr, ['ajustada', 'asentada', 'floja']) > 0)
        return { titulo: `Aflojá las tuercas de la tapa (faltan ${ajustadas} de ${n}).`, detalle: escritorio ? 'Apuntá a una tuerca, mantené el clic y mové el mouse a la izquierda.' : 'Calzá la estría en la tuerca y girá a la izquierda. Al despegar, termina de salir girando.' };
      return { titulo: `Sacá las tuercas sueltas (${enEsparrago}).`, detalle: 'Ya están flojas arriba del espárrago: levantalas con la mano y dejalas a un costado.' };
    }
    return { titulo: 'Sacá la tapa de válvulas.', detalle: 'Levantala derecho para arriba, sin torcerla, y dejala sobre el banco o el carrito.' };
  }
  if (tr.tapa === 'afuera') return { titulo: '¡Afuera! Ahí ves el árbol de levas y los botadores.', detalle: 'Ahora volvé a poner la tapa: llevala a su lugar y bajala derecha por los espárragos.' };
  const afuera = cuantas(tr, ['afuera']);
  if (afuera) return { titulo: `Poné las tuercas en los espárragos (faltan ${afuera}).`, detalle: 'Apoyalas arriba de cada espárrago y enroscalas un poco con los dedos.' };
  const sinAsentar = cuantas(tr, ['suelta', 'floja']);
  if (sinAsentar) return { titulo: `Enroscá las tuercas hasta que apoyen (${n - sinAsentar} de ${n}).`, detalle: escritorio ? 'Mantené el clic sobre la tuerca y mové el mouse a la derecha.' : 'Girá a la derecha con los dedos o con la llave.' };
  const sinAjustar = cuantas(tr, ['asentada']);
  if (sinAjustar) return { titulo: `Ajustalas con la llave de 10 (faltan ${sinAjustar}).`, detalle: 'Poquito: son 10 Nm sobre chapa. Cuando hace clic, está.' };
  if (tr.manguera === 'sacada') return { titulo: 'Volvé a poner la manguera del respiradero.', detalle: 'Encastrala en la boca de la tapa.' };
  return { titulo: 'Revisá que todo esté en su lugar.', detalle: '' };
}
