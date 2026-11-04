import type { ReactNode } from 'react';
import { AppShell } from '../layout/app-shell';

/** The screen of the Universe (board C09, states S04/S05). Built in its own file so each screen evolves without touching app.tsx. */
export function UniverseScreen(): ReactNode {
  return (
    <AppShell screen="C09">
      <div className="screen" data-id="universe-screen" />
    </AppShell>
  );
}
