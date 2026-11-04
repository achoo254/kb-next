import type { ReactNode } from 'react';
import { ScreenPage } from '../../layout/screen-page';
import { ErrorPanel, UNIVERSE_HREF } from '../../pages/error-screen';
import { Button } from '../../ui/button';
import './errors-board-page.css';

/** How long the sample retry and access request take, so their busy states can be seen. */
const SAMPLE_DELAY_MS = 1200;

function sampleWait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SAMPLE_DELAY_MS));
}

/**
 * Board X02-Errors: the four error states in a 2×2 grid (404, 403, 500, maintenance). Screens show one ErrorPanel
 * for their own error, or the whole-screen ErrorScreen (pages/error-screen.tsx).
 */
export function ErrorsBoardPage(): ReactNode {
  return (
    <ScreenPage
      code="X02-Errors"
      veil="gate"
      layout="board"
      actions={
        <Button variant="glass" href={UNIVERSE_HREF} className="start-ghost">
          Về vũ trụ
        </Button>
      }
    >
      <div className="x02-board">
        <ErrorPanel kind="not-found" />
        <ErrorPanel kind="forbidden" onRequestAccess={sampleWait} />
        <ErrorPanel kind="server" onRetry={sampleWait} />
        <ErrorPanel kind="maintenance" reopensAt="[GIỜ MỞ LẠI]" />
      </div>
    </ScreenPage>
  );
}
