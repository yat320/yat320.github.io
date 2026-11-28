/* Dibujo de un ser del Mundo (SVG en texto). Lo usan el visor y los juegos.
   MundoDibujo.dibujo(especie) → '<svg ...>'; MundoDibujo.describir(especie) → frase. */
(function (raiz) {
'use strict';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function medida(x){return x>=1?x.toLocaleString('es-AR',{maximumFractionDigits:1})+' m':x>=0.01?Math.round(x*100)+' cm':Math.max(1,Math.round(x*1000))+' mm'}
function describir(e){const c=e.cuerpo;
  if(e.reino!=='animal')return 'Es '+(c.tipo==='árbol'?'un ':'')+c.tipo+', vive en '+c.medio+', mide unos '+medida(c.tamanoM)+(c.hojas?', '+c.hojas+' hojas por rama':'')+'.';
  return 'Es '+c.tipo+', de simetría '+c.simetria+', '+c.patas+' patas, '+c.ojos+' ojos'+(c.aletas?', '+c.aletas+' aletas':'')+(c.alas?', '+c.alas+' alas':'')+', cubierto de '+c.cubierta+'. Vive en '+c.medio+' y mide unos '+medida(c.tamanoM)+'.';}
function dibujo(e){
  if(!e.cuerpo){
    let g='<rect width="160" height="110" fill="#cfe8ff"/>';const col=e.reino==='animal'?'#e8a598':e.reino==='planta'?'#69db7c':e.reino==='hongo'?'#ced4da':e.nivel===0?'#c9a227':'#f0954a';
    if(e.nivel===0)for(let i=0;i<5;i++)g+='<rect x="'+(30+i*22)+'" y="'+(40+(i%2)*18)+'" width="18" height="9" rx="4.5" fill="'+col+'" transform="rotate('+(i*23-30)+' '+(39+i*22)+' '+(44+(i%2)*18)+')"/>';
    else if(e.nivel===1)g+='<circle cx="80" cy="55" r="30" fill="'+col+'" opacity=".75"/><circle cx="86" cy="50" r="10" fill="#7f3b08"/><circle cx="66" cy="64" r="4" fill="#fff" opacity=".7"/>';
    else for(let i=0;i<9;i++)g+='<circle cx="'+(64+(i%3)*16)+'" cy="'+(38+Math.floor(i/3)*16)+'" r="9" fill="'+col+'" stroke="#fff"/>';
    return '<svg class="bicho" viewBox="0 0 160 110" role="img" aria-label="Dibujo de '+esc(e.nombre)+'">'+g+'</svg>';
  }
  const c=e.cuerpo,P={piel:'#e8a598',caparazón:'#8d6e63',escamas:'#4dabf7',pelo:'#b5651d',plumas:'#f2c230'};
  const fondo=c.medio==='agua'?'#cfe8ff':c.medio==='aire'?'#e7f5ff':'#f1ead7';
  let g='<rect width="160" height="110" fill="'+fondo+'"/>'+(c.medio!=='agua'?'<rect y="95" width="160" height="15" fill="#c8b48a"/>':'');
  const fondoLen=g.length;
  const L=(x1,y1,x2,y2,col,w)=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+col+'" stroke-width="'+(w||3)+'" stroke-linecap="round"/>';
  if(e.reino==='planta'){
    if(c.tipo==='alga')for(let i=0;i<4;i++)g+='<path d="M'+(50+i*18)+' 105 q-8 -20 0 -40 t0 -40" fill="none" stroke="#2f9e44" stroke-width="4"/>';
    else if(c.tipo==='musgo')for(let i=0;i<9;i++)g+=L(40+i*10,95,38+i*10+(i%3),82,'#5c940d',4);
    else if(c.tipo==='árbol')g+=L(80,95,80,45,'#6b4f2a',9)+'<circle cx="80" cy="38" r="28" fill="#2f9e44"/>';
    else{g+=L(80,95,80,30,'#2f9e44',3);for(let i=0;i<Math.min(c.hojas,8);i++){const y=88-i*7,s=i%2?1:-1;g+='<ellipse cx="'+(80+s*12)+'" cy="'+y+'" rx="11" ry="4" fill="#40c057" transform="rotate('+(s*-25)+' '+(80+s*12)+' '+y+')"/>'}if(c.tipo==='planta con flor')g+='<circle cx="80" cy="28" r="9" fill="#f783ac"/><circle cx="80" cy="28" r="3.5" fill="#ffd43b"/>'}
  }else if(e.reino==='hongo'){
    if(c.tipo==='seta')g+='<rect x="74" y="60" width="12" height="35" rx="4" fill="#f1e3c8"/><path d="M50 62 Q80 20 110 62 Z" fill="#c92a2a"/><circle cx="70" cy="48" r="4" fill="#fff"/><circle cx="90" cy="44" r="3" fill="#fff"/>';
    else for(let i=0;i<14;i++)g+='<circle cx="'+(55+(i*37)%50)+'" cy="'+(70+(i*23)%25)+'" r="'+(4+i%4)+'" fill="#868e96" opacity=".8"/>';
  }else{
    const col=P[c.cubierta]||'#adb5bd',cy=c.medio==='agua'?55:60;
    if(c.simetria==='radial'){g+='<circle cx="80" cy="50" r="22" fill="'+col+'"/>';for(let i=0;i<8;i++){const a=i*Math.PI/4;g+=L(80+22*Math.cos(a),50+22*Math.sin(a),80+38*Math.cos(a),50+38*Math.sin(a),col,3)}for(let i=0;i<c.ojos;i++){const a=i*2*Math.PI/Math.max(1,c.ojos);g+='<circle cx="'+(80+12*Math.cos(a))+'" cy="'+(50+12*Math.sin(a))+'" r="2.5" fill="#222"/>'}}
    else{
      const pares=c.patas/2;for(let i=0;i<pares;i++){const x=60+(pares>1?i*40/(pares-1):20);g+=L(x,cy+10,x-4,95,'#495057')+L(x+6,cy+10,x+10,95,'#495057')}
      if(c.alas)for(let i=0;i<c.alas/2;i++)g+='<ellipse cx="'+(72+i*16)+'" cy="'+(cy-22)+'" rx="18" ry="9" fill="#fff" stroke="#868e96" opacity=".85"/>';
      if(c.aletas)g+='<path d="M48 '+cy+' l-16 -12 v24 Z" fill="'+col+'"/><path d="M78 '+(cy-14)+' l10 -14 l6 14 Z" fill="'+col+'"/>'+(c.aletas>2?'<path d="M76 '+(cy+12)+' l8 12 l6 -12 Z" fill="'+col+'"/>':'');
      g+='<ellipse cx="80" cy="'+cy+'" rx="34" ry="16" fill="'+col+'"/>';
      for(let i=0;i<c.ojos;i++)g+='<circle cx="'+(104+(i%2)*6)+'" cy="'+(cy-6+Math.floor(i/2)*4)+'" r="2.5" fill="#222"/>';
    }
  }
  // Cada uno con su color (del ADN de su gen de forma) y su tamaño (del gen de tamaño).
  const fo=e.adn.slice(-72);let h=0;for(let i=0;i<fo.length;i++)h=(h*31+fo.charCodeAt(i))%360;
  const sc=(0.6+0.5*e.rasgos.tamano).toFixed(2),oy=c.medio==='agua'?55:95;
  g=g.slice(0,fondoLen)+'<g style="filter:hue-rotate('+(h-180)*0.5+'deg)" transform="translate(80 '+oy+') scale('+sc+') translate(-80 -'+oy+')">'+g.slice(fondoLen)+'</g>';
  return '<svg class="bicho" viewBox="0 0 160 110" role="img" aria-label="Dibujo de '+esc(e.nombre)+'">'+g+'</svg>';
}
raiz.MundoDibujo={dibujo,describir,medida};
})(typeof self!=='undefined'?self:this);
