# Pruebas de Guardián

```bash
npm run test:syntax   # revisa que todo el JavaScript sea válido
npm test                # 152 pruebas de lógica (node:test)
npm run test:e2e        # 14 pruebas de interfaz: 7 en PC y 7 en celular (Playwright)
```
Las de interfaz abren la app en modo local (sin datos reales) y revisan: panel, navegación rápida, alertas,
tema claro/oscuro, idioma, ventanas accesibles (Escape y foco) y que ninguna sección tenga errores en la consola.
GitHub las corre en cada cambio (`.github/workflows/tests.yml`).
