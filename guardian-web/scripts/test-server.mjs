/* =========================================================
   Servidor para las pruebas de interfaz (Playwright)
   Sirve la app tal cual, pero en "modo local": sin Supabase,
   así las pruebas no tocan datos reales ni necesitan cuenta.
   ========================================================= */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PUERTO || 4317);
const MIME_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

createServer(async (req, res) => {
  const route = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (route.startsWith('/.netlify/')) { res.writeHead(404).end(); return; }       // sin funciones del servidor
  const file = normalize(join(ROOT, route.endsWith('/') ? route + 'index.html' : route));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    let requestBody = await readFile(file);
    if (route === '/js/config.js') {
      requestBody = requestBody.toString().replace(/supabaseUrl: '[^']*'/, "supabaseUrl: ''").replace(/supabaseKey: '[^']*'/, "supabaseKey: ''");
    }
    res.writeHead(200, { 'content-type': MIME_TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(requestBody);
  } catch {
    res.writeHead(404).end();
  }
}).listen(PORT, () => console.log(`Guardián (modo local) en http://localhost:${PORT}`));
