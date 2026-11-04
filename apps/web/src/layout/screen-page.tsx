import type { ReactNode } from 'react';
import { BrandLogo } from './brand-logo';
import { UniverseBackdrop } from '../ui/universe-backdrop';

interface ScreenPageProps {
  /** The mock board the screen is built from; read by the parity check (data-screen). */
  code: string;
  children?: ReactNode;
}

/** A screen on the Universe backdrop: the logo top-left, the skip target, and the screen's own content. */
export function ScreenPage({ code, children }: ScreenPageProps): ReactNode {
  return (
    <UniverseBackdrop>
      <BrandLogo />
      <main id="content" className="screen" data-screen={code} data-id={`screen-${code}`}>
        {children}
      </main>
    </UniverseBackdrop>
  );
}
