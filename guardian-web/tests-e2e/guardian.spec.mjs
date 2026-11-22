/* Pruebas de interfaz: Guardián en un navegador real, en PC y en celular (modo local, sin datos reales) */
import { test, expect } from '@playwright/test';

/** Va a una sección con el menú (en celular, algunas están dentro de "Más"). */
async function ir(page, vista) {
  const lateral = page.locator(`#nav [data-view="${vista}"]`);
  if (await lateral.isVisible()) return lateral.click();
  const abajo = page.locator(`.bottomnav [data-view="${vista}"]`);
  if (await abajo.isVisible()) return abajo.click();
  await page.locator('.bottomnav [data-more]').click();
  await page.locator(`[data-sheet="${vista}"]`).first().click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/panel');
  await expect(page.locator('#pageTitle')).toHaveText('Panel');
});

test('abre en el Panel con el resumen del día', async ({ page }) => {
  await expect(page.locator('#heroHello')).toContainText('guardaparques');
  await expect(page.locator('[data-kpi="pending"]')).toHaveText('0');
});

test('navegar rápido entre secciones nunca deja una pantalla equivocada', async ({ page }) => {
  for (const [vista, titulo] of [['alertas', 'Alertas'], ['panel', 'Panel'], ['mapa', 'Mapa'], ['panel', 'Panel']]) {
    await ir(page, vista);
    await expect(page.locator('#pageTitle')).toHaveText(titulo);
    await expect(page.locator(`#view-${vista}`)).toHaveClass(/active/);
  }
});

test('simular una alerta la muestra pendiente y en el contador del panel', async ({ page }) => {
  await ir(page, 'alertas');
  await page.locator('#btnSimulate').click();
  await expect(page.locator('#alertList')).toContainText('Persona');
  await expect(page.locator('#alertList')).toContainText('Pendiente');
  await ir(page, 'panel');
  await expect(page.locator('[data-kpi="pending"]')).toHaveText('1');
});

test('el tema claro y oscuro se cambia desde Ajustes', async ({ page }) => {
  await ir(page, 'ajustes');
  await page.locator('#setTheme').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('#setTheme').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('el idioma inglés traduce la app y se puede volver a español', async ({ page }) => {
  await ir(page, 'ajustes');
  await page.locator('#setLang').selectOption('en');
  await expect(page.locator('#pageTitle')).toHaveText('Settings', { timeout: 20_000 });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en', { timeout: 20_000 });
  await page.locator('#setLang').selectOption('es');
  await expect(page.locator('#pageTitle')).toHaveText('Ajustes', { timeout: 20_000 });
});

test('las ventanas se cierran con Escape y devuelven el foco', async ({ page }) => {
  await ir(page, 'alertas');
  await page.locator('#btnSimulate').click();
  const borrar = page.locator('#alertDeleteAll');
  await borrar.focus();
  await borrar.press('Enter');
  const ventana = page.getByRole('dialog');
  await expect(ventana).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ventana).toBeHidden();
  await expect(borrar).toBeFocused();
});

test('sin errores en la consola al recorrer todas las secciones', async ({ page }) => {
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  for (const v of ['escaner', 'mapa', 'estadisticas', 'registros', 'alertas', 'reportes', 'asistente', 'dispositivos', 'papelera', 'pro', 'ajustes']) {
    await ir(page, v);
    await expect(page.locator(`#view-${v}`)).toHaveClass(/active/);
  }
  expect(errores).toEqual([]);
});
