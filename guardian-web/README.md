# Guardián · Vigilancia de fauna con IA

## Cómo ejecutarlo
1. Instala Visual Studio Code y la extensión **Live Server** (o usa Python).
2. Abre la carpeta `guardian-web` en VS Code.
3. Clic derecho sobre `index.html` → **Open with Live Server**.
   - Alternativa sin VS Code: en una terminal dentro de la carpeta ejecuta `python -m http.server 8000`
     y abre http://localhost:8000
4. Acepta los permisos de cámara, ubicación y notificaciones.

> La cámara solo funciona en `localhost` o en `https`. No abras el archivo con doble clic (file://).
> Se necesita internet la primera vez para descargar los modelos de IA (unos 20 MB).

## Qué archivo cambiar
| Quiero cambiar…                         | Archivo                         |
|-----------------------------------------|---------------------------------|
| Colores, tipografía, tamaños            | `css/styles.css` (bloque `:root`) |
| Textos, botones, pestañas               | `index.html`                    |
| Agregar o editar especies               | `js/species.js`                 |
| Lógica de IA, alertas, mapa, reportes   | `js/app.js`                     |
| Logo                                    | `assets/guardian.svg`           |

## Conectar drones y otros dispositivos
- **Dron o cámara por USB/HDMI**: con una capturadora o el control remoto conectado, aparece en la lista de cámaras.
- **Cámara IP / celular**: instala "IP Webcam" (Android), copia la URL `http://IP:8080/video` y elige "Cámara IP / dron (URL)".
- **Alertas automáticas a otros equipos**: en Ajustes pega una URL de webhook. Cada alerta se envía como JSON.

## IA avanzada (opcional)
En Ajustes pega tu API key de https://console.anthropic.com. La clave queda guardada solo en tu navegador;
para publicar la web en internet, mueve esa llamada a un servidor propio.

## Instalar Guardián como aplicación en cualquier PC
1. Publica la carpeta en internet (gratis): entra a https://app.netlify.com/drop, crea una cuenta
   y arrastra la carpeta `guardian-web`. Netlify te da una dirección como `https://guardian-xxxx.netlify.app`.
   Puedes cambiarle el nombre en *Site configuration → Change site name*.
2. Abre esa dirección en **Chrome** o **Edge**.
3. Pulsa el botón **Instalar app** de la barra superior (o el ícono de instalar a la derecha de la barra de direcciones).
4. Guardián aparece en el menú Inicio y en el escritorio con su logo, y abre en su propia ventana.
5. En otra PC: abre la misma dirección y repite el paso 3.

Para desinstalar: abre la app → menú ⋮ de la ventana → *Desinstalar Guardián*.

Si cambias el código: vuelve a arrastrar la carpeta a Netlify (en *Deploys*) y sube la versión en `sw.js`
(`guardian-v1` → `guardian-v2`). Las PCs que ya la instalaron se actualizan solas al abrirla.
