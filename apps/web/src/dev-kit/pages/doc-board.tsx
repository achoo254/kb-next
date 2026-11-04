import type { ReactNode } from 'react';
import { setTheme, useTheme } from '../../ui/theme';
import { UniverseBackdrop } from '../../ui/universe-backdrop';
import './doc-board.css';

/** The app route of each board code that has a screen already (the rest are documented, not linked). */
export const BOARD_ROUTES: Readonly<Record<string, string>> = {
  S01: '/',
  S02: '/login',
  S03: '/u?tour=1',
  C08: '/me',
  C09: '/u',
  C10: '/s/networking',
  C12: '/search',
  C13: '/graph',
  C14: '/copilot',
  C15: '/canvas',
  C20: '/inbox',
  H03: '/settings',
  F03: '/settings/keys',
  A01: '/admin',
};

/** A board code's screen as a link when it has a route, else as plain text with the same look. */
export function BoardLink({ code, className, children }: { code: string; className: string; children: ReactNode }): ReactNode {
  const href = BOARD_ROUTES[code];
  return href ? (
    <a className={className} href={href}>
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );
}

interface DocBoardProps {
  /** Board name (data-screen) and its 1200px-tall page. */
  board: string;
  kicker: string;
  title: string;
  className?: string;
  children?: ReactNode;
}

/**
 * The frame of the two documentation boards (Z01 Sitemap, Z02 Spatial3D): the landscape behind a fading veil, the
 * kicker and title, and the theme switch of the boards.
 */
export function DocBoard({ board, kicker, title, className, children }: DocBoardProps): ReactNode {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <UniverseBackdrop stars={false} artPosition="16% 40%" className="doc-board">
      <main className={className ? `doc-board-main ${className}` : 'doc-board-main'} data-screen={board} data-id={`screen-${board}`}>
        <header className="doc-board-head">
          <div>
            <div className="doc-board-kicker">{kicker}</div>
            <h1 className="doc-board-title">{title}</h1>
          </div>
          <button type="button" className="doc-board-theme" onClick={() => setTheme(next)}>
            {next === 'light' ? 'Chuyển sang Sáng' : 'Chuyển sang Tối'}
          </button>
        </header>
        {children}
      </main>
    </UniverseBackdrop>
  );
}
