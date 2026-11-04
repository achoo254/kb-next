/** Below this many frames per second for FPS_WINDOW_MS, the Universe goes back to 2D (board Z02). */
export const MIN_FPS = 30;
export const FPS_WINDOW_MS = 2000;
/** A frame gap longer than this is a hidden tab or a paused page, not a slow device: measuring starts again. */
const PAUSE_GAP_MS = 500;
/** How often the rate is measured. */
const SAMPLE_MS = 250;

/**
 * Watches the frame rate of the 3D scene: `frame(now)` once per rendered frame; answers `low` once the rate has
 * stayed under `minFps` for `windowMs`. `fps` is the rate of the latest sample (0 before the first one).
 */
export class FpsGuard {
  fps = 0;
  private last: number | null = null;
  private sampleStart: number | null = null;
  private frames = 0;
  private lowSince: number | null = null;

  constructor(
    private readonly minFps = MIN_FPS,
    private readonly windowMs = FPS_WINDOW_MS,
  ) {}

  frame(now: number): 'ok' | 'low' {
    if (this.last !== null && now - this.last > PAUSE_GAP_MS) this.reset();
    this.last = now;
    if (this.sampleStart === null) {
      this.sampleStart = now;
      this.frames = 0;
      return 'ok';
    }
    this.frames += 1;
    const elapsed = now - this.sampleStart;
    if (elapsed < SAMPLE_MS) return 'ok';
    this.fps = (this.frames * 1000) / elapsed;
    this.sampleStart = now;
    this.frames = 0;
    if (this.fps >= this.minFps) {
      this.lowSince = null;
      return 'ok';
    }
    // The low stretch starts where the first slow sample began.
    this.lowSince ??= now - elapsed;
    return now - this.lowSince >= this.windowMs ? 'low' : 'ok';
  }

  private reset(): void {
    this.sampleStart = null;
    this.frames = 0;
    this.lowSince = null;
  }
}
