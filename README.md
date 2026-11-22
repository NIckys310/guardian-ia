# Guardián · Vigilancia de fauna con IA

App web instalable (PWA) para guardaparques: reconoce fauna con la cámara, registra avistamientos y alerta
ante posible caza furtiva. En línea: **https://guardian-fauna.netlify.app** · Estado de los servicios:
**https://guardian-fauna.netlify.app/estado/**

## Estructura del repositorio
```
guardian-ia/
├─ README.md                      ← estás aquí
├─ .github/workflows/pruebas.yml  ← sintaxis, 152 pruebas y 14 pruebas de interfaz en cada cambio
└─ guardian-web/                  ← la app
   ├─ README.md                   ← instalación y puesta en marcha paso a paso
   ├─ index.html · sw.js · manifest.json   ← página, modo sin internet e instalación
   ├─ css/                        ← estilos (base, componentes y uno por sección)
   ├─ js/
   │  ├─ core/                    ← utilidades: DOM, eventos, idioma, registro de fallos, base local
   │  ├─ data/                    ← 79 especies, grupos y traducciones
   │  ├─ services/                ← sesión, IA, nube, plan Pro, Bluetooth, GPS
   │  ├─ ui/                      ← ventanas, avisos, gráficas, íconos
   │  └─ views/                   ← una por sección (12)
   ├─ estado/                     ← página que revisa y despierta los servicios
   ├─ netlify/functions/          ← servidor: chat, identificación con IA y pagos
   ├─ supabase/migrations/        ← base de datos en orden (27 tablas con RLS)
   ├─ tests/                      ← 152 pruebas de lógica (node:test)
   ├─ tests-e2e/                  ← 14 pruebas de interfaz en PC y celular (Playwright)
   └─ docs/                       ← SEGURIDAD.md, PRUEBAS.md y el programa del ESP32
```
