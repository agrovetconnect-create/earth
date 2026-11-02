import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
<<<<<<< HEAD
import { OfflineIndicator } from './components/OfflineIndicator.js';
import { registerOfflineServiceWorker } from './services/offlineCache.js';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './theme.css';

maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

if (typeof window !== 'undefined') {
  // Suppress benign AbortError rejections from cancelled map/tile requests on unmount
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { name?: string } | undefined;
    if (reason && reason.name === 'AbortError') {
      event.preventDefault();
    }
  });

  if (document.readyState === 'complete') {
    void registerOfflineServiceWorker();
  } else {
    window.addEventListener('load', () => {
      void registerOfflineServiceWorker();
    });
  }
}

=======
import './theme.css';

>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
<<<<<<< HEAD
        <OfflineIndicator />
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      </ErrorBoundary>
    </React.StrictMode>
  );
}
