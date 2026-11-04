import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './ui/tokens.css';
import './ui/app.css';
import { type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { I18nProvider } from './i18n/i18n';

/** The dev-only UI kit (/dev/kit); `import.meta.env.DEV` is false in builds, so the bundle never contains it. */
async function devKit(pathname: string): Promise<ReactNode | null> {
  if (!import.meta.env.DEV || !pathname.startsWith('/dev/kit')) return null;
  const { DevKitApp } = await import('./dev-kit/dev-kit-app');
  return <DevKitApp pathname={pathname} />;
}

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');
const pathname = window.location.pathname;
void devKit(pathname).then((kit) => {
  createRoot(root).render(
    <StrictMode>
      <I18nProvider>{kit ?? <App pathname={pathname} />}</I18nProvider>
    </StrictMode>,
  );
});
