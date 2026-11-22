/* Revisa que todos los archivos JavaScript de Guardián se puedan leer (sin errores de sintaxis). */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const folders = ['js', 'netlify', 'scripts', 'status'];
const files = folders.flatMap((c) => readdirSync(c, { recursive: true })
  .filter((f) => /\.(m?js)$/.test(f)).map((f) => `${c}/${f.replaceAll('\\', '/')}`));
files.push('sw.js');

let bad = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { bad++; console.error(`✗ ${f}\n${e.stderr}`); }
}
console.log(`${files.length - bad} de ${files.length} archivos sin errores de sintaxis`);
process.exit(bad ? 1 : 0);
