/**
 * The window widths where KnowFlow changes layout (layout/device.ts): up to PHONE_MAX_WIDTH a phone, up to
 * TABLET_MAX_WIDTH a tablet, wider a desktop. Kept in the kit so its components (the backdrop's portrait art) and the
 * layout share one value.
 */
export const PHONE_MAX_WIDTH = 640;
/** From 1280px up the desktop boards fit well enough. */
export const TABLET_MAX_WIDTH = 1279;
export const PHONE_MEDIA = `(max-width: ${PHONE_MAX_WIDTH}px)`;
