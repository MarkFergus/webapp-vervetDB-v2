import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { listenForInstall } from './installApp';

// Chrome / Edge / Brave / Android offer installing early: catch it from the start
listenForInstall();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
