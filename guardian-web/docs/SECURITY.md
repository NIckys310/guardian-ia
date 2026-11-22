# Seguridad de Guardián

| Tema | Cómo se protege |
|---|---|
| Contraseñas | Nunca se guardan en el navegador ni en el código: Supabase Auth guarda solo su huella **bcrypt**. Mínimo 10 caracteres con minúscula, mayúscula, número y símbolo, en la app **y en el servidor**. |
| Al escribir contraseñas | Campos `type="password"` con `autocomplete` correcto para gestores de contraseñas. |
| Inicio de sesión | Bloqueo de 15 minutos tras 5 intentos fallidos, verificación en dos pasos (TOTP), cierre por inactividad y "cerrar sesión en todos los equipos". El correo de los intentos se guarda como huella SHA-256. |
| Datos | 27 tablas con seguridad por filas (RLS); las funciones con privilegios fijan `search_path`. |
| Navegador | Política de contenido (CSP) estricta: sin `unsafe-eval` ni scripts en línea; solo dominios conocidos. |
| IA | La clave de Claude vive solo en Netlify; las funciones exigen sesión y tienen límite diario por plan. |
| Pagos | Modo prueba sin dinero real; los pagos reales solo por la página oficial de Wompi y con firma verificada. |
| Privacidad | No se guardan direcciones IP. |
| Fallos | Se registran en este navegador (últimos 50), sin enviarse a terceros. |
