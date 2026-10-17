# Guardián · Estación de fauna con IA

Aplicación web (instalable como app) para vigilar y conservar fauna: identifica animales con IA,
registra avistamientos en un mapa, detecta posible caza furtiva, guarda reportes en el sistema y
tiene un asistente con IA para resolver dudas.

## Secciones
| Sección | Qué hace |
|---|---|
| Panel | Resumen del día: avistamientos, especies, alertas pendientes y dispositivos activos |
| Escáner | Cámara del PC o del celular, cámara IP/dron o foto. La imagen se ajusta al visor; tócala para ampliarla |
| Mapa | Un ícono y color por grupo de animales, guía de íconos, alertas, celulares y distribución natural |
| Alertas | Posible caza furtiva: atender, ver en el mapa, eliminar una, varias o todas |
| Estadísticas | Gráficas en vivo con filtros por rango y grupo |
| Registros | Buscar y eliminar avistamientos uno a uno, por selección o todos (con Deshacer) |
| Cápsula de reportes | Los reportes se guardan en el sistema (no se descargan) y se abren cuando quieras |
| Asistente IA | Chat con Claude que conoce los datos de tu estación |
| Dispositivos | Conectar un celular con un código QR (como Bluetooth, pero sin cables) |
| Papelera | Recuperar lo eliminado durante 30 días o borrarlo para siempre |
| Ajustes | Seguridad (2 pasos, contraseña, inactividad), tema, IA, alertas y datos |

## Estructura
```
guardian-web/
├── index.html            estructura de todas las secciones
├── css/                  base, estructura, componentes, animaciones y views/ (una hoja por sección)
├── js/
│   ├── app.js            arranque y navegación
│   ├── config.js         URL y clave publishable de Supabase (vacías = modo local)
│   ├── core/             utilidades, eventos y base de datos local (IndexedDB)
│   ├── data/             especies (79, prioridad Colombia) y grupos con su ícono
│   ├── services/         cuentas, datos, IA local, IA avanzada, GPS, alertas
│   ├── ui/               íconos, avisos, ventanas, visor de imagen, gráficas
│   └── views/            una por sección
├── netlify/functions/    identify (Claude visión) y chat (asistente)
├── supabase/migrations/  base de datos: 24 tablas con seguridad RLS
└── sw.js                 funciona sin internet
```

## Cómo probarlo en el PC
```bash
npm install
npx netlify-cli dev
```
Abre http://localhost:8888. Sin Netlify también funciona (sin IA avanzada): `python -m http.server 8000`.

## Nube (Supabase)
1. Crea el proyecto en https://supabase.com y aplica las migraciones: `npx supabase link` y `npx supabase db push`.
2. En **Authentication → Sign In / Providers** activa *Anonymous sign-ins* (para los celulares vinculados)
   y en **Multi-Factor** activa *TOTP*.
3. Copia la URL y la clave **publishable** en `js/config.js`. Nunca pongas la clave `service_role`.

## IA avanzada (Claude)
En Netlify → *Site configuration → Environment variables* agrega:
- `ANTHROPIC_API_KEY` (secreta) · `ANTHROPIC_MODEL` (opcional, por defecto `claude-sonnet-5-5`)
- `SUPABASE_URL` y `SUPABASE_ANON_KEY` (para comprobar la sesión) · `AI_LIMITE_HORA` (opcional, 60)

La clave nunca llega al navegador.

## Seguridad
- Contraseñas de 10+ caracteres con mayúscula, minúscula, número y símbolo.
- Bloqueo de 15 minutos tras 5 intentos fallidos.
- Verificación en dos pasos (app autenticadora) y cierre por inactividad.
- Reglas RLS: cada cuenta solo ve sus datos; los celulares vinculados trabajan para su cuenta principal.
- Bitácora de auditoría de inicios de sesión y cambios de seguridad.

## Pruebas automáticas

Guardián tiene **110 pruebas** que usan el probador que ya trae Node (no hay que instalar nada extra).

```bash
npm test               # todas las pruebas
npm run test:sintaxis  # revisa que todo el JavaScript se pueda leer
```

| Carpeta | Qué revisa |
|---|---|
| `tests/core` | Utilidades: texto seguro (HTML), fechas, porcentajes, categorías UICN, bus de eventos |
| `tests/data` | Catálogo de especies (79) y grupos del mapa: datos completos, sin repetidos |
| `tests/services` | IA local: reconocer especies y colores de los recuadros |
| `tests/netlify` | Funciones del servidor: sesión, límites de IA, validación de fotos y chat, pagos Wompi (sin gastar IA real) |
| `tests/supabase` | Migraciones: todas las tablas con RLS, políticas y funciones seguras |
| `tests/seguridad` | Ninguna clave secreta en el código y encabezados de seguridad del sitio |
| `tests/pwa` | App instalable: service worker, manifest e index sin archivos perdidos |

En GitHub, cada cambio en `main` corre las pruebas solo (`.github/workflows/pruebas.yml`).
