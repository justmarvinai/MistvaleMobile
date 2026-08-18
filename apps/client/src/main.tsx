import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { registerServiceWorker } from './app/registerServiceWorker';
import './styles/global.scss';

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
