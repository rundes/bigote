// Service worker de bigote: solo push. No cachea nada — la app es dinámica y
// un caché mal invalidado mostraría reservas o stock viejos.

self.addEventListener("push", (evento) => {
  if (!evento.data) return;

  let datos;
  try {
    datos = evento.data.json();
  } catch {
    datos = { titulo: "bigote", cuerpo: evento.data.text(), url: "/" };
  }

  evento.waitUntil(
    self.registration.showNotification(datos.titulo || "bigote", {
      body: datos.cuerpo || "",
      icon: "/logo-nueva-tierra.png",
      badge: "/logo-nueva-tierra.png",
      data: { url: datos.url || "/" },
      // Sin esto, dos avisos seguidos se pisan en Android.
      tag: datos.tag || undefined,
    })
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || "/";

  // Si ya hay una pestaña de la app abierta, se enfoca en vez de abrir otra.
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((pestanas) => {
      for (const p of pestanas) {
        if (p.url.startsWith(self.registration.scope) && "focus" in p) {
          p.navigate(destino);
          return p.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
