import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import { listenForInstall } from './installApp';
import { keepFieldVisible } from "./keepFieldVisible";

// Chrome / Edge / Brave / Android offer installing early: catch it from the start
listenForInstall();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Phones: the box being typed in is never left behind the keyboard
keepFieldVisible();
