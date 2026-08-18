import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { registerServiceWorker } from './app/registerServiceWorker';
import './styles/global.scss';
// The vendored library, then Mistvale's layer over it. Order matters: `mistvale.css`
// re-declares the same selector as the theme it overrides and wins on source order.
import './fui/styles.css';
import './fui/mistvale.css';
import { setAssetBase } from './fui/core/assets.ts';

// Art is served from this origin, never from the library's CDN: nginx sends
// `img-src 'self' data: blob:`, so a component reaching for a third-party host renders
// nothing in production — and a game must not depend on somebody else's uptime to draw
// its own buttons. `tools/fui-vendor` is what puts the files under `public/fui/`.
setAssetBase('/fui');

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    {/* The outer net. The one inside the shell keeps a broken screen from taking the dock
        with it; this one catches everything above that — a failed boot, a store that
        throws on its first read — where there is nothing left to preserve and the honest
        offer is a reload. */}
    <ErrorBoundary area="game">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Installability and a second visit that starts instantly. Production only — see the
// module for why a worker in development is actively harmful.
registerServiceWorker();
