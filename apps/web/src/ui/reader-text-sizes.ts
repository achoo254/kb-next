/** The reader's text sizes in px (A−/A+, reader-text-size.ts); no DOM here, the API layer shares it. */
export const READER_TEXT_SIZES = [16, 17, 18, 20] as const;
export type ReaderTextSize = (typeof READER_TEXT_SIZES)[number];
export const DEFAULT_READER_TEXT_SIZE: ReaderTextSize = 17;
