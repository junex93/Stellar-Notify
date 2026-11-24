// Web Push service worker (skeleton): shows the notification; decryption comes later.
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Stellar Notify", { body: data.body }),
  );
});
