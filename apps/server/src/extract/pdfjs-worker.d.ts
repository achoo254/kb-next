/** pdf.js ships no types for its worker module; only its message handler is read (the main-thread "fake worker"). */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
