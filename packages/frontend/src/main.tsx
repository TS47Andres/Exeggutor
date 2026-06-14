import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'react-mosaic-component/react-mosaic-component.css';
import 'xterm/css/xterm.css';

// Mounts the React application layout under the browser DOM root context.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
