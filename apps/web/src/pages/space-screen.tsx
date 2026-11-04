import type { ReactNode } from 'react';
import { AppShell } from '../layout/app-shell';

/** The screen of a Space (board C10). Built in its own file so each screen evolves without touching app.tsx. */
export function SpaceScreen({ slug }: { slug: string }): ReactNode {
  return (
    <AppShell screen="C10">
      <div className="screen" data-id="space-screen" data-param={slug} />
    </AppShell>
  );
}
