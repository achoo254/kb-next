import type { ReactNode } from 'react';
import { AppShell } from '../layout/app-shell';

/** The screen of a document (board C11). Built in its own file so each screen evolves without touching app.tsx. */
export function ReaderScreen({ id }: { id: string }): ReactNode {
  return (
    <AppShell screen="C11">
      <div className="screen" data-id="reader-screen" data-param={id} />
    </AppShell>
  );
}
