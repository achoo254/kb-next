import type { ReactNode } from 'react';
import './navigation.css';

/**
 * The thin bar at the top of the window while a navigation waits for its screen (navigation.ts). It fades in after a
 * short delay (navigation.css), so a screen that is ready at once never shows it. Decorative: the new screen's title
 * is announced when it shows (app.tsx).
 */
export function NavigationProgress({ pending }: { pending: boolean }): ReactNode {
  if (!pending) return null;
  return (
    <div className="nav-progress" aria-hidden="true" data-id="nav-progress">
      <span className="nav-progress-bar" />
    </div>
  );
}
