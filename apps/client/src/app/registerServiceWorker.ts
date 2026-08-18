/**
 * Registers the service worker, in production only.
 *
 * Never in development, and the reason is not tidiness: a worker that has claimed the page
 * intercepts Vite's module requests and its HMR socket, so one registered once would keep
 * serving yesterday's build to a developer editing today's — and the browser suite runs
 * against that same dev server. `import.meta.env.PROD` is the whole guard.
 *
 * Failure is silent on purpose. A browser with service workers switched off, a page served
 * over plain HTTP, a locked-down enterprise profile — all of them mean a player who cannot
 * install the game and can still play it perfectly. There is nothing to tell them.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  // After load rather than during it: registration competes with the first paint for the
  // network otherwise, and the worker is only ever of use on the *next* visit.
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  });
}
