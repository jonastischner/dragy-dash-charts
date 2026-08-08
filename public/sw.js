// Share Target – später durch native Intent ersetzbar.
// Dieser Service Worker cached NICHTS. Er existiert ausschließlich, um den
// POST-Request des iOS/Android-Share-Sheets an /import abzufangen, die Datei
// in der Cache Storage zwischenzuspeichern und dann per Redirect an die
// App-Route /import weiterzugeben (ein POST kann keine SPA-Route rendern).

const SHARE_CACHE = "dragy-share-target-v1";
const SHARE_KEY = "/__shared-dragy-file";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "POST") return;

  const url = new URL(request.url);
  if (url.pathname !== "/import") return;

  event.respondWith(
    (async () => {
      try {
        const formData = await request.formData();
        const file =
          formData.get("dragyData") ||
          formData.get("files") ||
          [...formData.values()].find((v) => typeof v !== "string");

        if (file && typeof file !== "string") {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put(
            SHARE_KEY,
            new Response(file, {
              headers: {
                "Content-Type": file.type || "application/octet-stream",
                "X-Shared-Filename": encodeURIComponent(file.name || "shared.data"),
              },
            }),
          );
          return Response.redirect("/import?shared=1", 303);
        }
      } catch (err) {
        // Fällt unten auf die Fehlerseite zurück
      }
      return Response.redirect("/import?shared=error", 303);
    })(),
  );
});
