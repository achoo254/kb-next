import type { CSSProperties, ReactNode } from 'react';

interface Star {
  x: number;
  y: number;
  r: number;
  delay: number;
}

/** The twinkling stars of board C09: 46 points laid out by the same formula as the mock, so screens line up with it. */
export const STARS: readonly Star[] = Array.from({ length: 46 }, (_, j) => ({
  x: 380 + ((j * 197) % 1000),
  y: 20 + ((j * 83) % 520),
  r: j % 5 === 0 ? 2 : 1,
  delay: (j % 8) * 0.4,
}));

/** Art in apps/web/public/art (AI-drawn for KnowFlow, see CREDITS.md). */
const BG_DARK = '/art/bg-universe-dark.webp';
const BG_LIGHT = '/art/bg-universe-light.webp';

/**
 * The Universe backdrop every screen sits on (design/KIT-universe-style.txt §2): the AI landscape (the light theme's
 * own picture under prefers-color-scheme: light), the veil and the stars. Purely decorative: hidden from assistive
 * technology, the screen's content goes in `children`.
 */
export function UniverseBackdrop({ children }: { children?: ReactNode }): ReactNode {
  return (
    <div className="universe">
      <picture className="universe-bg">
        <source srcSet={BG_LIGHT} media="(prefers-color-scheme: light)" />
        <img src={BG_DARK} alt="" width={1440} height={900} decoding="async" />
      </picture>
      <div className="universe-veil" aria-hidden="true" />
      {STARS.map((star, index) => {
        const style: CSSProperties = { left: star.x, top: star.y, width: star.r, height: star.r, animationDelay: `${star.delay}s` };
        return <span key={index} className="universe-star" aria-hidden="true" style={style} />;
      })}
      {children}
    </div>
  );
}
