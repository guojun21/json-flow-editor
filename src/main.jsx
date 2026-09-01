import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '@antv/x6-plugin-selection/dist/index.css';
import '@antv/x6-plugin-transform/dist/index.css';
import '@antv/x6-plugin-snapline/dist/index.css';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);
