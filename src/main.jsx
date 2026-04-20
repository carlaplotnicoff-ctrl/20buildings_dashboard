import { render } from 'preact';
import { ThemeProvider } from '@vibe/core';
import '@vibe/core/tokens';
import './styles/global.css';
import { App } from './app.jsx';

render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
  document.getElementById('app')
);
