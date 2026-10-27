// Saca del repo del taller (solo lectura) los datos de la tapa de válvulas del motor 1.6 tipo AP.
// Uso: npx tsx extraer-ap16.mts <ruta a taller-mecanico> > ../datos/ap16-tapa.json
const raiz = process.argv[2] ?? '../../../taller-mecanico';
const { AP16, G } = await import(`${raiz}/src/data/ap16.ts`);
const ids = ['tapa-cilindros', 'junta-tapa-valvulas', 'tapa-valvulas'];
const piezas = AP16.parts
  .filter((p: any) => ids.includes(p.id))
  .map((p: any) => ({
    id: p.id,
    nombre: p.name,
    descripcion: p.description,
    material: p.material,
    sobre: p.mountsOn,
    unSoloUso: !!p.singleUse,
    sale: p.removeDir,
    datos: p.specs ?? [],
    fijaciones: p.id === 'tapa-valvulas' ? p.fasteners.map((f: any) => ({
      id: f.id, nombre: f.label, encastre: f.drive, medida: f.size, rosca: f.thread, largo: f.length,
      apriete: f.stages, pos: f.pos, dir: f.dir,
    })) : [],
  }));
console.log(JSON.stringify({ origen: 'taller-mecanico/src/data/ap16.ts', unidades: 'mm; X a lo largo del cigüeñal (cil. 1 = lado distribución), Y arriba, Z a lo ancho (admisión y escape en -Z)', geometria: { headTopY: G.headTopY, camY: G.camY, deckY: G.deckY, cylX: G.cylX }, piezas }, null, 2));
