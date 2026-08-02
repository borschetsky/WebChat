import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

import App from './components/App';

// React 18+ entry point. ReactDOM.render still works in 18 but warns, and is removed in 19.
const root = createRoot(document.getElementById('root'));
root.render(<App />);
