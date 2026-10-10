/* =========================================================
   GUARDIÁN · Tema de las gráficas (Chart.js) según los colores de la app
   ========================================================= */
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function chartTheme() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = cssVar('--muted');
  Chart.defaults.font.family = 'Archivo, sans-serif';
  Chart.defaults.borderColor = cssVar('--line');
  Chart.defaults.animation.duration = document.documentElement.dataset.motion === 'off' ? 0 : 700;
  Chart.defaults.animation.easing = 'easeOutQuart';
  Chart.defaults.plugins.tooltip.backgroundColor = cssVar('--panel-3');
  Chart.defaults.plugins.tooltip.titleColor = cssVar('--text');
  Chart.defaults.plugins.tooltip.bodyColor = cssVar('--text');
  Chart.defaults.plugins.tooltip.borderColor = cssVar('--line-2');
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
}
