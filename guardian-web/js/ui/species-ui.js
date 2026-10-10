/* =========================================================
   GUARDIÁN · Piezas visuales de especies (reutilizables)
   ========================================================= */
import { esc, conservClass, pct } from '../core/dom.js';
import { GROUPS, groupOf, badgeSVG } from '../data/groups.js';
import { ALL_SPECIES } from '../services/ai-local.js';
import { icon } from './icons.js';

export const findSpecies = (id) => ALL_SPECIES.find((s) => s.id === id) || null;

export function groupBadge(grupo, size = 26) {
  const g = groupOf(grupo);
  return `<span title="${esc(g.nombre)}" style="display:inline-flex">${badgeSVG(g.color, g.svg, size)}</span>`;
}

export const conservChip = (estado) => `<span class="conserv ${conservClass(estado)}">${esc(estado || 'Sin evaluar')}</span>`;

export function groupOptions(selected = '') {
  return Object.entries(GROUPS).map(([id, g]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('');
}

/* Ficha de especie con estilo de lámina de guía de campo */
export function plateHTML(sp, conf, fuente, count) {
  return `
    <article class="plate">
      <div class="src"><span>${icon(fuente === 'IA avanzada' ? 'spark' : 'ai')} ${esc(fuente)}</span><span>Confianza ${pct(conf)}</span></div>
      <div class="head">${groupBadge(sp.grupo, 34)}<div><h2>${esc(sp.nombre)}</h2><div class="sci">${esc(sp.cientifico)}</div></div></div>
      <div class="meter"><div class="progress"><i style="--p:${Math.round(conf * 100)}%"></i></div></div>
      <div style="margin-top:12px">${conservChip(sp.estado)}</div>
      <dl>
        <div><dt>Hábitat</dt><dd>${esc(sp.habitat)}</dd></div>
        <div><dt>Reproducción</dt><dd>${esc(sp.reproduccion)}</dd></div>
        <div><dt>Alimentación</dt><dd>${esc(sp.dieta)}</dd></div>
        <div><dt>Distribución</dt><dd>${esc(sp.distribucion)}</dd></div>
      </dl>
      <div class="plate-actions">
        <button class="btn primary sm" data-act="range">${icon('map')}Ver distribución</button>
        <button class="btn sm" data-act="stats">${icon('chart')}Estadísticas</button>
        <button class="btn sm" data-act="ask">${icon('spark')}Preguntar a la IA</button>
      </div>
      <div class="meta">Avistamientos registrados de esta especie: <b>${count}</b></div>
    </article>`;
}
