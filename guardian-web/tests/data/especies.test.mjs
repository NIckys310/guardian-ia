import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES } from '../../js/data/species.js';
import { COLOMBIA } from '../../js/data/species-colombia.js';
import { GROUPS } from '../../js/data/groups.js';
import { conservClass } from '../../js/core/dom.js';

const TODAS = [...COLOMBIA, ...SPECIES];
const CAMPOS = ['id', 'grupo', 'nombre', 'cientifico', 'estado', 'habitat', 'reproduccion', 'dieta', 'distribucion'];

test('el catálogo tiene suficientes especies', () => {
  assert.ok(TODAS.length >= 50, `solo hay ${TODAS.length}`);
});

test('cada especie tiene todos los datos de su ficha', () => {
  for (const s of TODAS) {
    for (const c of CAMPOS) assert.ok(typeof s[c] === 'string' && s[c].trim(), `${s.id || s.nombre} sin ${c}`);
  }
});

test('los identificadores de especie no se repiten', () => {
  const ids = TODAS.map((s) => s.id);
  const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(repetidos, []);
});

test('los identificadores son aptos para la base de datos (minúsculas, sin espacios)', () => {
  for (const s of TODAS) assert.match(s.id, /^[a-z0-9_-]+$/, s.id);
});

test('cada especie pertenece a un grupo con ícono en el mapa', () => {
  for (const s of TODAS) assert.ok(GROUPS[s.grupo], `${s.id}: grupo "${s.grupo}" no existe`);
});

test('el nombre científico es "Género especie", "Género sp."/"spp." o un grupo (familia, orden)', () => {
  // Varias opciones se separan con " / " (por ejemplo, elefante africano / asiático)
  const valido = /^([A-Z][a-z]+ [a-z]+( [a-z]+)?|[A-Z][a-z]+ spp?\.|[A-Z][a-z]+)$/;   // también subespecie: Canis lupus familiaris
  for (const s of TODAS) {
    for (const parte of s.cientifico.split(' / ')) assert.match(parte, valido, `${s.id}: ${s.cientifico}`);
  }
});

// Las fichas generales (búho, colibrí, ave…) agrupan muchas especies: su estado "varía"
const GENERAL = /Varía|No evaluado \(NE\)|Por determinar/;

test('el estado de conservación de cada especie silvestre se reconoce', () => {
  for (const s of TODAS.filter((x) => x.grupo !== 'domestico')) {
    assert.ok(conservClass(s.estado) !== 'na' || GENERAL.test(s.estado), `${s.id}: "${s.estado}"`);
  }
});

test('las especies con nombre científico completo tienen categoría UICN exacta', () => {
  const exactas = TODAS.filter((s) => /^[A-Z][a-z]+ [a-z]+$/.test(s.cientifico) && s.grupo !== 'domestico' && !GENERAL.test(s.estado));
  for (const s of exactas) assert.match(s.estado, /\((LC|NT|VU|EN|CR|EW|EX|DD)[,)]/, `${s.id}: "${s.estado}"`);
});

test('cada especie tiene palabras para reconocerla con la IA local', () => {
  for (const s of TODAS) {
    assert.ok(Array.isArray(s.match), `${s.id} sin lista de palabras`);
    // "ave" es la ficha de respaldo para aves que la IA no reconoce: no necesita palabras
    if (s.id !== 'ave') assert.ok(s.match.length, `${s.id} sin palabras de reconocimiento`);
    for (const k of s.match) assert.ok(typeof k === 'string' && k.trim(), `${s.id} con palabra vacía`);
  }
});
