import { startErrorTelemetry } from '../../lib/telemetry';
import { createRoot } from 'react-dom/client';
import App from './App';
import './app.css';

startErrorTelemetry('panel');

const target = document.getElementById('app');
if (!target) throw new Error('sidepanel.html is missing its #app element');
createRoot(target).render(<App />);
