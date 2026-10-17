/* Revisa que todos los archivos JavaScript de Guardián se puedan leer (sin errores de sintaxis). */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const carpetas = ['js', 'netlify', 'scripts'];
const archivos = carpetas.flatMap((c) => readdirSync(c, { recursive: true })
  .filter((f) => /\.(m?js)$/.test(f)).map((f) => `${c}/${f.replaceAll('\\', '/')}`));
archivos.push('sw.js');

let malos = 0;
for (const f of archivos) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { malos++; console.error(`✗ ${f}\n${e.stderr}`); }
}
console.log(`${archivos.length - malos} de ${archivos.length} archivos sin errores de sintaxis`);
process.exit(malos ? 1 : 0);
