// Pictures pasted into an email referral (OCT, fundus photos, the patient details screenshot).
// They are held in memory only, as data: URLs, and gone when the page is closed or refreshed.

/** Longest side kept. OCT B-scans stay readable; larger screenshots are shrunk to this. */
const MAX_SIDE = 2000;
/** PNGs above this many bytes are re-saved as JPEG so the email stays a sensible size. */
const PNG_LIMIT = 1_500_000;

export interface PreparedImage {
  src: string;
  width: number;
  height: number;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the picture.'));
    reader.readAsDataURL(blob);
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare the picture.'))), type, quality));
}

/** Shrinks very large pictures and turns large PNGs into JPEGs. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let blob = await canvasBlob(canvas, 'image/png');
  if (blob.size > PNG_LIMIT) blob = await canvasBlob(canvas, 'image/jpeg', 0.9);
  return { src: await blobToDataUrl(blob), width, height };
}

function dataUrlToBlob(src: string): Blob {
  const [head, data = ''] = src.split(',', 2);
  const type = /^data:([^;,]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  return new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type });
}

/** The picture as a PNG blob: the only picture type browsers will put on the clipboard. */
export async function pngBlob(src: string): Promise<Blob> {
  const blob = dataUrlToBlob(src);
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvasBlob(canvas, 'image/png');
}

/** Copies one picture so it can be pasted into an email on its own. */
export async function copyImage(src: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
    // Handing the item a promise keeps the copy inside the click, as Safari and Chrome require.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(src) })]);
    return true;
  } catch {
    return false;
  }
}
