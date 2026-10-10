/* =========================================================
   GUARDIÁN · Grupos de animales para los íconos del mapa
   Cada grupo tiene un color propio y un dibujo. La guía de íconos
   del mapa se genera sola a partir de esta lista.
   ========================================================= */
export const GROUPS = {
  felino:    { nombre: 'Felinos',              color: '#f0a43a', ejemplo: 'Jaguar, puma, ocelote',
    svg: '<path d="M5 4l3 4h8l3-4v9a7 7 0 0 1-14 0z"/><path d="M9.5 13h.01M14.5 13h.01M11 16h2"/>' },
  ave:       { nombre: 'Aves',                 color: '#4cc3e0', ejemplo: 'Tucán, cóndor, colibrí',
    svg: '<path d="M16 7h.01M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.3-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3M14 17.7V21"/>' },
  primate:   { nombre: 'Primates',             color: '#c48d5c', ejemplo: 'Mono aullador, tití',
    svg: '<circle cx="12" cy="12" r="6"/><circle cx="4.5" cy="11" r="2"/><circle cx="19.5" cy="11" r="2"/><path d="M9 15c1.5 1.3 4.5 1.3 6 0M10 11h.01M14 11h.01"/>' },
  reptil:    { nombre: 'Reptiles',             color: '#8fb35a', ejemplo: 'Tortuga, iguana, caimán',
    svg: '<ellipse cx="12" cy="13" rx="7" ry="5"/><path d="M12 8v10M5 13h14M19 11l3-1M5 11 2 10M8 17l-1 3M16 17l1 3"/>' },
  anfibio:   { nombre: 'Anfibios',             color: '#3fd7a0', ejemplo: 'Rana dorada, sapo',
    svg: '<path d="M4 16c0-4 3.6-7 8-7s8 3 8 7"/><circle cx="8" cy="7" r="2.5"/><circle cx="16" cy="7" r="2.5"/><path d="M2 19l3-3M22 19l-3-3M9 14h6"/>' },
  acuatico:  { nombre: 'Fauna acuática',       color: '#3b7ddd', ejemplo: 'Delfín rosado, manatí, tiburón',
    svg: '<path d="M6.5 12c.9-3.5 4.9-6 8.5-6s6 2.5 7 6c-1 3.5-3.4 6-7 6s-7.6-2.5-8.5-6Z"/><path d="M18 12v.5"/><path d="M7 10.7C7 8 5.6 6 2.7 5.5c-1 1.5-1 5 .3 6.5-1.3 1.5-1.3 5-.3 6.5C5.6 18 7 16 7 13.3"/>' },
  oso:       { nombre: 'Osos',                 color: '#9b7be0', ejemplo: 'Oso de anteojos, panda',
    svg: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="13" r="7"/><ellipse cx="12" cy="16" rx="2.5" ry="2"/><path d="M9.5 11h.01M14.5 11h.01"/>' },
  herbivoro: { nombre: 'Grandes herbívoros',   color: '#e2cf5d', ejemplo: 'Danta, venado, elefante',
    svg: '<path d="M12 21c-3 0-4-3-4-6s1-5 4-5 4 2 4 5-1 6-4 6z"/><path d="M9 10 6 6M6 6 4 3M6 6l-3 1M15 10l3-4M18 6l2-3M18 6l3 1"/>' },
  mamifero:  { nombre: 'Otros mamíferos',      color: '#e07aa5', ejemplo: 'Perezoso, nutria, zorro',
    svg: '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.8 1.2 3 3 0 0 0-2.3-2.3A3.5 3.5 0 0 1 6.2 11 5 5 0 0 1 9 10z"/>' },
  insecto:   { nombre: 'Insectos',             color: '#d96fe0', ejemplo: 'Mariposa morpho',
    svg: '<path d="M12 6v14"/><path d="M12 9C9 4 3 4 3 9s5 5 9 3M12 9c3-5 9-5 9 0s-5 5-9 3M12 13c-3 0-7 1-6 5s5 1 6-1M12 13c3 0 7 1 6 5s-5 1-6-1"/>' },
  domestico: { nombre: 'Domésticos',           color: '#a8b0a2', ejemplo: 'Perro, gato, vaca',
    svg: '<path d="M3 11 12 3l9 8"/><path d="M5 9.5V21h14V9.5"/><circle cx="12" cy="15" r="2.5"/>' }
};

/* Íconos especiales del mapa (no son animales) */
export const MAP_SPECIAL = {
  alerta:      { nombre: 'Alerta de caza furtiva', color: '#e5533d', descripcion: 'Persona, vehículo o arma detectada en zona protegida. Late en rojo mientras está pendiente.',
    svg: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>' },
  dispositivo: { nombre: 'Celular conectado',      color: '#5fb3c9', descripcion: 'Última ubicación de un celular vinculado que está enviando fotos.',
    svg: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>' },
  yo:          { nombre: 'Tu ubicación',           color: '#ffffff', descripcion: 'Dónde estás ahora según el GPS del equipo.',
    svg: '<circle cx="12" cy="12" r="4"/>' }
};

export function groupOf(id) { return GROUPS[id] || GROUPS.mamifero; }

/* SVG del pin del mapa: gota del color del grupo con el dibujo en blanco */
export function pinSVG(color, glyph, size = 38) {
  return `<svg width="${size}" height="${size * 1.2}" viewBox="0 0 40 48" aria-hidden="true">
    <path d="M20 47s16-14.6 16-27A16 16 0 0 0 4 20c0 12.4 16 27 16 27z" fill="${color}" stroke="rgba(0,0,0,.45)" stroke-width="1.5"/>
    <circle cx="20" cy="20" r="12.5" fill="rgba(0,0,0,.22)"/>
    <g transform="translate(10 10) scale(.8333)" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
  </svg>`;
}

/* Ícono redondo pequeño (para la guía y las listas) */
export function badgeSVG(color, glyph, size = 30) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="15" fill="${color}"/>
    <g transform="translate(6 6) scale(.8333)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
  </svg>`;
}
