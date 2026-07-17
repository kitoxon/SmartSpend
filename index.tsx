import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/sw.js').then((registration) => registration.update());
    });
  } else {
    // Production service workers cache Vite's stable development URLs and can
    // otherwise serve stale JS/CSS. Remove only SmartSpend's development state.
    window.addEventListener('load', () => {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      );
      if ('caches' in window) {
        void caches.keys().then((keys) => Promise.all(
          keys.filter((key) => key.startsWith('smartspend-')).map((key) => caches.delete(key))
        ));
      }
    });
  }
}
