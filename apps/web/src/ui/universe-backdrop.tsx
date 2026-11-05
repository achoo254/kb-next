import type { CSSProperties, ReactNode } from 'react';
import { PHONE_MEDIA } from './breakpoints';
import { useTheme } from './theme';
import './motion.css';
import './universe-backdrop.css';

export interface Star {
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
export const BACKDROP_ART = {
  dark: '/art/bg-universe-dark.webp',
  light: '/art/bg-universe-light.webp',
  mobile: '/art/bg-universe-mobile.webp',
} as const;

/** Phone windows get the portrait landscape (dark theme; the light landscape covers both shapes). */
const MOBILE_MEDIA = PHONE_MEDIA;

/**
 * How strongly the landscape is veiled: `scene` is C09's (the Universe screens), `strong` keeps reading and editing
 * screens readable (KIT §2), `radial` and `fade` are the veils of the kit boards (X01/X03 and Interaction), `station`
 * the lighter centre of the settings station (H03), `phone` the sky and fading veil of the phone boards (Mobile, M02–M06).
 */
export type BackdropVeil = 'scene' | 'strong' | 'radial' | 'fade' | 'station' | 'phone';

interface UniverseBackdropProps {
  veil?: BackdropVeil;
  /** The twinkling stars of C09 (off on work screens, which have no background motion). */
  stars?: boolean;
  /** The stars' places when a board lays them out its own way (the phone boards); C09's by default. */
  starField?: readonly Star[];
  /** CSS object-position of the landscape, e.g. `16% 40%` (Interaction board); centred by default. */
  artPosition?: string;
  className?: string;
  children?: ReactNode;
}

/**
 * The Universe backdrop every screen sits on (design/KIT-universe-style.txt §2): the AI landscape of the theme in use
 * (`data-theme`, else the system scheme), the veil and the stars. The art is decorative and hidden from assistive
 * technology; the screen's content goes in `children`.
 */
export function UniverseBackdrop({ veil = 'scene', stars = true, starField = STARS, artPosition, className, children }: UniverseBackdropProps): ReactNode {
  const theme = useTheme();
  const artStyle: CSSProperties | undefined = artPosition ? { objectPosition: artPosition } : undefined;
  return (
    <div className={className ? `universe ${className}` : 'universe'} data-veil={veil}>
      <picture className="universe-bg">
        {theme === 'dark' && <source srcSet={BACKDROP_ART.mobile} media={MOBILE_MEDIA} />}
        <img src={BACKDROP_ART[theme]} alt="" width={1440} height={900} decoding="async" style={artStyle} />
      </picture>
      <div className="universe-veil" aria-hidden="true" />
      {stars &&
        starField.map((star, index) => {
          const style: CSSProperties = { left: star.x, top: star.y, width: star.r, height: star.r, animationDelay: `${star.delay}s` };
          return <span key={index} className="universe-star" aria-hidden="true" style={style} />;
        })}
      {children}
    </div>
  );
}
