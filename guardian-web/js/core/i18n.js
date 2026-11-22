/* =========================================================
   GUARDIÁN · Idioma (español / inglés)
   La app se escribe en español. Si se elige inglés, un traductor
   cambia los textos justo cuando aparecen en pantalla, así las
   vistas no tienen que saber nada de idiomas.
   - El diccionario está en js/data/i18n-en.js ('español': 'inglés').
   - {} es un dato cualquiera; {#} solo un número ("5", "1,2 MB").
   - El idioma se guarda en este equipo. Por defecto: español.
   ========================================================= */
const STORAGE_KEY = 'guardian.idioma';

function storedLanguage() {
  try { return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'es'; } catch { return 'es'; }
}

export const language = storedLanguage();
export const LOCALE = language === 'en' ? 'en-US' : 'es-CO';

export function changeLanguage(newValue) {
  try { localStorage.setItem(STORAGE_KEY, newValue === 'en' ? 'en' : 'es'); } catch { /* sin almacenamiento */ }
  location.reload();     // fechas, gráficas y textos quedan parejos
}

/* ---------- Traductor (sin DOM: se puede probar) ---------- */
const NUMBER_PATTERN = '[\\d.,:]+(?:\\s?[a-zA-Z%]{1,3})?';
const PLACEHOLDER = /\{#?\}/;
const MAX_LENGTH = 260;   // un texto más largo es contenido de la persona, no de la app

function compile(es, en) {
  const parts = es.split(/(\{#?\})/);
  const source = parts.map((p) => (p === '{}' ? '(.+?)' : p === '{#}' ? `(${NUMBER_PATTERN})` : p.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&'))).join('');
  return { re: new RegExp(`^${source}$`, 's'), en, peso: parts.filter((p) => !PLACEHOLDER.test(p)).join('').length };
}

export function createTranslator(dictionary) {
  const exact = new Map(), patterns = [];
  for (const [es, en] of Object.entries(dictionary)) {
    if (PLACEHOLDER.test(es)) patterns.push(compile(es, en)); else exact.set(es, en);
  }
  patterns.sort((a, b) => b.peso - a.peso);
  const memo = new Map();

  const translate = (clean, level) => {
    if (exact.has(clean)) return exact.get(clean);
    if (level > 3 || clean.length > MAX_LENGTH) return clean;
    for (const p of patterns) {
      const m = clean.match(p.re);
      if (!m) continue;
      let i = 1;
      return p.en.replace(/\{#?\}/g, () => translate(m[i++].trim(), level + 1));
    }
    // "9:56 AM · hace un momento": se traduce cada parte
    if (clean.includes(' · ')) return clean.split(' · ').map((p) => translate(p, level + 1)).join(' · ');
    return clean;
  };

  return (textValue) => {
    if (typeof textValue !== 'string' || !/\p{L}{2}/u.test(textValue)) return textValue;
    if (memo.has(textValue)) return memo.get(textValue);
    const startedAt = textValue.match(/^\s*/)[0], endIndex = textValue.match(/\s*$/)[0];
    const clean = textValue.trim().replace(/\s+/g, ' ');
    const result = translate(clean, 0);
    const output = result === clean ? textValue : startedAt + result + endIndex;
    if (memo.size > 4000) memo.clear();
    memo.set(textValue, output);
    return output;
  };
}

let translator = (s) => s;
/** Para lo que no es DOM: dibujos en canvas, gráficas y notificaciones. */
export const t = (textValue) => translator(textValue);

/* ---------- Traducir la pantalla ---------- */
const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP_SELECTOR = 'script,style,textarea,code,pre,[data-no-i18n],.msg .bubble:not(.error)';

function translateText(n) {
  if (!n.nodeValue?.trim() || n.parentElement?.closest(SKIP_SELECTOR)) return;
  const newValue = t(n.nodeValue);
  if (newValue !== n.nodeValue) n.nodeValue = newValue;
}

function translateElement(el) {
  for (const a of ATTRIBUTES) {
    const v = el.getAttribute(a);
    if (v) { const newValue = t(v); if (newValue !== v) el.setAttribute(a, newValue); }
  }
}

function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) return translateText(root);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) translateElement(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (w.nextNode()) w.currentNode.nodeType === Node.TEXT_NODE ? translateText(w.currentNode) : translateElement(w.currentNode);
}

/** Los reportes guardados son una página aparte (HTML dentro de un iframe). */
export function translateHtml(html) {
  if (language !== 'en') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) w.currentNode.nodeValue = t(w.currentNode.nodeValue);
  doc.documentElement.lang = 'en';
  return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
}

/** Se llama una vez al arrancar. En español no hace nada ni descarga nada. */
export async function prepareLanguage() {
  if (language !== 'en') return;
  const [{ EN }, { englishSpeciesRecords }, { SPECIES }, { COLOMBIA }] = await Promise.all([
    import('../data/i18n-en.js'), import('../data/species-en.js'), import('../data/species.js'), import('../data/species-colombia.js')
  ]);
  translator = createTranslator({ ...englishSpeciesRecords([...COLOMBIA, ...SPECIES]), ...EN });
  document.documentElement.lang = 'en';
  translateTree(document.documentElement);
  new MutationObserver((changes) => {
    for (const c of changes) {
      if (c.type === 'characterData') translateText(c.target);
      else if (c.type === 'attributes') translateElement(c.target);
      else c.addedNodes.forEach(translateTree);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
}
