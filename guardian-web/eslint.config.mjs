// Análisis estático de Guardián: encuentra errores antes de que lleguen al navegador
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', '.netlify/', 'test-results/', 'playwright-report/', 'docs/'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js', 'estado/**/*.js', 'sw.js'],
    languageOptions: {
      ecmaVersion: 2023, sourceType: 'module',
      globals: { ...globals.browser, ...globals.serviceworker, L: 'readonly', Chart: 'readonly', tf: 'readonly', mobilenet: 'readonly', cocoSsd: 'readonly', supabase: 'readonly', qrcode: 'readonly' }
    },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }], 'no-empty': ['error', { allowEmptyCatch: true }] }
  },
  {
    files: ['netlify/**/*.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs', 'tests-e2e/**/*.mjs', '*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }], 'no-empty': ['error', { allowEmptyCatch: true }] }
  }
];
