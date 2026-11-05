/**
 * Whether the Universe may run in 3D on this device (board Z02): not when the system or the app's own switch (H03)
 * asks for reduced motion, not without WebGL. The frame rate is watched once it runs (fps-guard.ts).
 */
import { prefersReducedMotion } from '../ui/display-prefs';

export type Fallback2dReason = 'reduced-motion' | 'no-webgl' | 'fps' | 'context-lost' | 'load-failed';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Why the Universe stays in 2D on this device, or null when 3D may start. */
export function reasonFor2d(): Fallback2dReason | null {
  if (prefersReducedMotion()) return 'reduced-motion';
  if (!hasWebGL()) return 'no-webgl';
  return null;
}
