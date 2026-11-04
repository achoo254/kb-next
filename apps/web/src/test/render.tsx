import { type RenderResult, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../i18n/i18n';

/** Renders inside the app's I18nProvider (jsdom reads English: navigator.languages is en-US). */
export function renderWithI18n(ui: ReactElement): RenderResult {
  return render(<I18nProvider>{ui}</I18nProvider>);
}
