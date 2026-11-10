/* =========================================================
   GUARDIÁN · Idioma (español / inglés)
   La app se escribe en español. Si se elige inglés, un traductor
   cambia los textos justo cuando aparecen en pantalla, así las
   vistas no tienen que saber nada de idiomas.
   - El diccionario está en js/data/i18n-en.js ('español': 'inglés').
   - {} es un dato cualquiera; {#} solo un número ("5", "1,2 MB").
   - El idioma se guarda en este equipo. Por defecto: español.
   ========================================================= */
const CLAVE = 'guardian.idioma';

function guardado() {
  try { return localStorage.getItem(CLAVE) === 'en' ? 'en' : 'es'; } catch { return 'es'; }
}

export const idioma = guardado();
export const LOCALE = idioma === 'en' ? 'en-US' : 'es-CO';

export function cambiarIdioma(nuevo) {
  try { localStorage.setItem(CLAVE, nuevo === 'en' ? 'en' : 'es'); } catch { /* sin almacenamiento */ }
  location.reload();     // fechas, gráficas y textos quedan parejos
}

/* ---------- Traductor (sin DOM: se puede probar) ---------- */
const NUMERO = '[\\d.,:]+(?:\\s?[a-zA-Z%]{1,3})?';
const HUECO = /\{#?\}/;
const LARGO_MAXIMO = 260;   // un texto más largo es contenido de la persona, no de la app

function compilar(es, en) {
  const partes = es.split(/(\{#?\})/);
  const fuente = partes.map((p) => (p === '{}' ? '(.+?)' : p === '{#}' ? `(${NUMERO})` : p.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&'))).join('');
  return { re: new RegExp(`^${fuente}$`, 's'), en, peso: partes.filter((p) => !HUECO.test(p)).join('').length };
}

export function crearTraductor(dic) {
  const exactas = new Map(), patrones = [];
  for (const [es, en] of Object.entries(dic)) {
    if (HUECO.test(es)) patrones.push(compilar(es, en)); else exactas.set(es, en);
  }
  patrones.sort((a, b) => b.peso - a.peso);
  const memoria = new Map();

  const traducir = (limpio, nivel) => {
    if (exactas.has(limpio)) return exactas.get(limpio);
    if (nivel > 3 || limpio.length > LARGO_MAXIMO) return limpio;
    for (const p of patrones) {
      const m = limpio.match(p.re);
      if (!m) continue;
      let i = 1;
      return p.en.replace(/\{#?\}/g, () => traducir(m[i++].trim(), nivel + 1));
    }
    // "9:56 AM · hace un momento": se traduce cada parte
    if (limpio.includes(' · ')) return limpio.split(' · ').map((p) => traducir(p, nivel + 1)).join(' · ');
    return limpio;
  };

  return (texto) => {
    if (typeof texto !== 'string' || !/\p{L}{2}/u.test(texto)) return texto;
    if (memoria.has(texto)) return memoria.get(texto);
    const inicio = texto.match(/^\s*/)[0], fin = texto.match(/\s*$/)[0];
    const limpio = texto.trim().replace(/\s+/g, ' ');
    const hecho = traducir(limpio, 0);
    const salida = hecho === limpio ? texto : inicio + hecho + fin;
    if (memoria.size > 4000) memoria.clear();
    memoria.set(texto, salida);
    return salida;
  };
}

let traductor = (s) => s;
/** Para lo que no es DOM: dibujos en canvas, gráficas y notificaciones. */
export const t = (texto) => traductor(texto);

/* ---------- Traducir la pantalla ---------- */
const ATRIBUTOS = ['placeholder', 'title', 'aria-label', 'alt'];
const NO_TOCAR = 'script,style,textarea,code,pre,[data-no-i18n],.msg .bubble:not(.error)';

function traducirTexto(n) {
  if (!n.nodeValue?.trim() || n.parentElement?.closest(NO_TOCAR)) return;
  const nuevo = t(n.nodeValue);
  if (nuevo !== n.nodeValue) n.nodeValue = nuevo;
}

function traducirElemento(el) {
  for (const a of ATRIBUTOS) {
    const v = el.getAttribute(a);
    if (v) { const nuevo = t(v); if (nuevo !== v) el.setAttribute(a, nuevo); }
  }
}

function traducirArbol(raiz) {
  if (raiz.nodeType === Node.TEXT_NODE) return traducirTexto(raiz);
  if (raiz.nodeType !== Node.ELEMENT_NODE && raiz.nodeType !== Node.DOCUMENT_NODE) return;
  if (raiz.nodeType === Node.ELEMENT_NODE) traducirElemento(raiz);
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (w.nextNode()) w.currentNode.nodeType === Node.TEXT_NODE ? traducirTexto(w.currentNode) : traducirElemento(w.currentNode);
}

/** Los reportes guardados son una página aparte (HTML dentro de un iframe). */
export function traducirHtml(html) {
  if (idioma !== 'en') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) w.currentNode.nodeValue = t(w.currentNode.nodeValue);
  doc.documentElement.lang = 'en';
  return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
}

/** Se llama una vez al arrancar. En español no hace nada ni descarga nada. */
export async function prepararIdioma() {
  if (idioma !== 'en') return;
  const [{ EN }, { fichasEnIngles }, { SPECIES }, { COLOMBIA }] = await Promise.all([
    import('../data/i18n-en.js'), import('../data/species-en.js'), import('../data/species.js'), import('../data/species-colombia.js')
  ]);
  traductor = crearTraductor({ ...fichasEnIngles([...COLOMBIA, ...SPECIES]), ...EN });
  document.documentElement.lang = 'en';
  traducirArbol(document.documentElement);
  new MutationObserver((cambios) => {
    for (const c of cambios) {
      if (c.type === 'characterData') traducirTexto(c.target);
      else if (c.type === 'attributes') traducirElemento(c.target);
      else c.addedNodes.forEach(traducirArbol);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
}
