// Pruebas de interfaz de Guardián: un navegador real abre la app y la usa como una persona.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests-e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4317',
    locale: 'es-CO',
    serviceWorkers: 'block',          // cada prueba ve la versión actual, sin caché
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node scripts/servidor-prueba.mjs',
    url: 'http://localhost:4317',
    reuseExistingServer: !process.env.CI,
  },
});
