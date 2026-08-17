import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safely suppress benign cross-origin script errors and transient network offline warnings
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (event.message === 'Script error.' || !event.message) {
      event.preventDefault();
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (
      event.reason?.message?.includes?.('Could not reach Cloud Firestore') ||
      event.reason?.message?.includes?.('offline') ||
      event.reason?.code === 'unavailable'
    ) {
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
