/* =========================================================
   GUARDIÁN · Reparar y abrir
   Si la app instalada se queda con una versión vieja guardada y no abre,
   a los 10 s aparece "Reparar y abrir": borra la copia guardada y recarga.
   (No borra avistamientos ni la sesión.)
   Va en un archivo aparte (no dentro del HTML) para cumplir la política de seguridad (CSP).
   ========================================================= */
setTimeout(function () {
  var b = document.getElementById('bootFix');
  var boot = document.getElementById('boot');
  if (!b || !boot || boot.classList.contains('done')) return;
  b.hidden = false;
  b.onclick = async function () {
    b.textContent = 'Reparando…';
    try {
      var regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(function (r) { return r.unregister(); }));
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (e) { /* sin service worker: igual se recarga */ }
    location.replace(location.pathname + '?r=' + Date.now());
  };
}, 10000);
