import type { ReactNode } from 'react';
import { ILLUSTRATIONS } from './art';
import './motion.css';
import './loader.css';

/**
 * The loaders of X01 "Đang tải":
 * - `orbit`: a planet with a satellite circling (opening the Universe);
 * - `ai`: the AI core with three bouncing dots (AI writing);
 * - `bar`: a labelled progress bar (upload), indeterminate without `value`;
 * - `ring`: a circular progress with a title and a note (Jev sorting a file);
 * - `spinner`: the small inline ring (reconnecting, saving).
 */
export type LoaderVariant = 'orbit' | 'ai' | 'bar' | 'ring' | 'spinner';

interface LoaderProps {
  variant: LoaderVariant;
  /** What is loading; the accessible name of the status. */
  label: string;
  /** A second line (bar, ring): what the user can do meanwhile. */
  note?: string;
  /** Progress 0–100 (bar, ring); without it the bar runs back and forth. */
  value?: number;
  /** Hides the visible label (the spinner inside a pill or button). */
  hideLabel?: boolean;
  className?: string;
}

const RING_LENGTH = 151;

/** A loading status: announced by its label, animated only without reduced motion. */
export function Loader({ variant, label, note, value, hideLabel = false, className }: LoaderProps): ReactNode {
  const classes = className ? `kf-loader ${className}` : 'kf-loader';
  const progress = value === undefined ? undefined : Math.max(0, Math.min(100, value));
  const visibleLabel = !hideLabel && <span className="kf-loader-label">{label}</span>;
  if (variant === 'spinner') {
    return <span role="status" aria-label={label} className={classes} data-variant="spinner" />;
  }
  if (variant === 'bar') {
    return (
      <div role="status" aria-label={label} className={classes} data-variant="bar">
        <span className="kf-loader-title">{label}</span>
        <span
          className="kf-loader-track"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span className="kf-loader-fill" data-indeterminate={progress === undefined || undefined} style={progress === undefined ? undefined : { width: `${progress}%` }} />
        </span>
        {note && <span className="kf-loader-note">{note}</span>}
      </div>
    );
  }
  if (variant === 'ring') {
    const offset = progress === undefined ? 100 : RING_LENGTH * (1 - progress / 100);
    return (
      <div role="status" aria-label={label} className={classes} data-variant="ring">
        <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true">
          <circle className="kf-loader-ring-track" cx="30" cy="30" r="24" fill="none" strokeWidth="6" />
          <circle
            className="kf-loader-ring-arc"
            data-indeterminate={progress === undefined || undefined}
            cx="30"
            cy="30"
            r="24"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={offset}
            transform="rotate(-90 30 30)"
          />
        </svg>
        <span className="kf-loader-text">
          <span className="kf-loader-title">{label}</span>
          {note && <span className="kf-loader-note">{note}</span>}
        </span>
      </div>
    );
  }
  if (variant === 'ai') {
    return (
      <div role="status" aria-label={label} className={classes} data-variant="ai">
        <img className="kf-loader-core" src={ILLUSTRATIONS['ai-core']} alt="" aria-hidden="true" />
        <span className="kf-loader-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {visibleLabel}
      </div>
    );
  }
  return (
    <div role="status" aria-label={label} className={classes} data-variant="orbit">
      <span className="kf-loader-system" aria-hidden="true">
        <span className="kf-loader-path">
          <span className="kf-loader-satellite" />
        </span>
        <span className="kf-loader-planet" />
      </span>
      {visibleLabel}
    </div>
  );
}
