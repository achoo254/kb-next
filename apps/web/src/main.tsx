import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './ui/tokens.css';
import './ui/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { I18nProvider } from './i18n/i18n';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');
createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <App pathname={window.location.pathname} />
    </I18nProvider>
  </StrictMode>,
);
