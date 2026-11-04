import type { ReactNode } from 'react';
import { DesignSystemPage } from './pages/design-system-page';
import { FeedbackPage } from './pages/feedback-page';
import { InteractionPage } from './pages/interaction-page';
import { StatesPage } from './pages/states-page';

/**
 * /dev/kit: the shared UI kit laid out like the four kit boards of the mock, for the parity check and for building
 * screens. Only in the dev server: main.tsx loads this module behind `import.meta.env.DEV`, so production builds
 * leave it out.
 */
export const KIT_PAGES = [
  { path: '/dev/kit/design-system', board: 'DesignSystem', Page: DesignSystemPage },
  { path: '/dev/kit/interaction', board: 'Interaction', Page: InteractionPage },
  { path: '/dev/kit/feedback', board: 'X01-Feedback', Page: FeedbackPage },
  { path: '/dev/kit/states', board: 'X03-StatesCoverage', Page: StatesPage },
] as const;

export const KIT_PREFIX = '/dev/kit';

export function DevKitApp({ pathname }: { pathname: string }): ReactNode {
  const path = pathname.replace(/\/+$/, '');
  const page = KIT_PAGES.find((entry) => entry.path === path);
  if (page) return <page.Page />;
  return (
    <main className="dev-kit-index" data-id="dev-kit-index">
      <h1>UI kit</h1>
      <ul>
        {KIT_PAGES.map((entry) => (
          <li key={entry.path}>
            <a href={entry.path}>{entry.board}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
