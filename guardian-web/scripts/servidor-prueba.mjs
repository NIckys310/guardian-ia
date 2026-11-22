/* =========================================================
   Servidor para las pruebas de interfaz (Playwright)
   Sirve la app tal cual, pero en "modo local": sin Supabase,
   así las pruebas no tocan datos reales ni necesitan cuenta.
   ========================================================= */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PUERTO = Number(process.env.PUERTO || 4317);
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta.startsWith('/.netlify/')) { res.writeHead(404).end(); return; }       // sin funciones del servidor
  const archivo = normalize(join(RAIZ, ruta.endsWith('/') ? ruta + 'index.html' : ruta));
  if (!archivo.startsWith(RAIZ)) { res.writeHead(403).end(); return; }
  try {
    let cuerpo = await readFile(archivo);
    if (ruta === '/js/config.js') {
      cuerpo = cuerpo.toString().replace(/supabaseUrl: '[^']*'/, "supabaseUrl: ''").replace(/supabaseKey: '[^']*'/, "supabaseKey: ''");
    }
    res.writeHead(200, { 'content-type': TIPOS[extname(archivo)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(cuerpo);
  } catch {
    res.writeHead(404).end();
  }
}).listen(PUERTO, () => console.log(`Guardián (modo local) en http://localhost:${PUERTO}`));
