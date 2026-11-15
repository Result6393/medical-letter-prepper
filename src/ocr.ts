/**
 * Reads the text in a screenshot with Tesseract, entirely in this browser and offline: the OCR
 * engine, its worker and its English data are built into the page, nothing is downloaded, and
 * the picture never leaves the computer. Same approach as the Theatre List Prepper app.
 */
import Tesseract from 'tesseract.js/dist/tesseract.esm.min.js';
import workerSource from 'tesseract.js/dist/worker.min.js?raw';
import coreSource from 'tesseract.js-core/tesseract-core-lstm.wasm.js?raw';
import languageBase64 from '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?base64';

/** Where the worker asks for the English data; it never goes to the network (see below). */
const LANG_PATH = 'https://offline.invalid/tessdata';

let engine: Promise<Tesseract.Worker> | null = null;

async function start(): Promise<Tesseract.Worker> {
  // A worker started from a page opened from disk can't load any other file, so it gets everything
  // in one script: the engine, the English data (handed over when the worker asks for
  // "<langPath>/eng.traineddata.gz"), and Tesseract's worker code.
  const script = [
    coreSource,
    'self.TesseractCore = TesseractCore;',
    `const LANGUAGE = ${JSON.stringify(languageBase64)};`,
    `const LANG_PATH = ${JSON.stringify(LANG_PATH)};`,
    'const realFetch = self.fetch.bind(self);',
    'self.fetch = (url, options) => String(url).startsWith(LANG_PATH)',
    '  ? Promise.resolve(new Response(Uint8Array.from(atob(LANGUAGE), (c) => c.charCodeAt(0))))',
    '  : realFetch(url, options);',
    workerSource,
  ].join('\n');
  return Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
    workerPath: URL.createObjectURL(new Blob([script], { type: 'text/javascript' })),
    workerBlobURL: false,
    langPath: LANG_PATH,
    gzip: true,
    cacheMethod: 'none',
  });
}

/** Small screenshots are enlarged to about this width first: at screen size OCR misreads digits. */
const READ_WIDTH = 1900;

/**
 * Enlarged, grey copy of the picture. The record system's banner is white text on dark blue,
 * which reads far better as dark text on a light background, so dark pictures are inverted.
 */
async function prepared(image: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(image);
  const scale = Math.min(4, Math.max(1, READ_WIDTH / bitmap.width));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    const grey = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = grey;
    total += grey;
  }
  if (total / (d.length / 4) < 128) for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i];
  context.putImageData(pixels, 0, 0);
  return canvas;
}

/** The text in a picture, line by line. */
export async function readText(image: Blob): Promise<string> {
  engine ??= start().catch((e) => {
    engine = null;
    throw e;
  });
  const worker = await engine;
  const { data } = await worker.recognize(await prepared(image));
  return data.text ?? '';
}
