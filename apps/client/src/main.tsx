import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { registerServiceWorker } from './app/registerServiceWorker';
import './styles/global.scss';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installability and a second visit that starts instantly. Production only — see the
// module for why a worker in development is actively harmful.
registerServiceWorker();
