import { h } from './dom';

/** Copies formatted text (for Word) and a plain-text fallback. Returns false if the browser refused. */
export async function copyRich(html: string, text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    // fall through to the selection method
  }
  const holder = h('div', { contenteditable: 'true', style: 'position:fixed;left:-9999px;top:0;white-space:pre-wrap' });
  holder.innerHTML = html;
  document.body.append(holder);
  const range = document.createRange();
  range.selectNodeContents(holder);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  sel?.removeAllRanges();
  holder.remove();
  return ok;
}

/** Copies plain text exactly as given. */
export async function copyPlain(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  const box = h('textarea', { style: 'position:fixed;left:-9999px;top:0' });
  box.value = text;
  document.body.append(box);
  box.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  box.remove();
  return ok;
}

/** Prints the given page alone (see printhtml.ts for the layouts). "Save as PDF" in the dialog makes a PDF. */
export function printPage(html: string, css: string): void {
  let root = document.getElementById('print-root');
  if (!root) {
    root = h('div', { id: 'print-root' });
    document.body.append(root);
  }
  let style = document.getElementById('page-style');
  if (!style) {
    style = h('style', { id: 'page-style' });
    document.head.append(style);
  }
  style.textContent = css;
  root.innerHTML = html;
  window.print();
}

const EMBEDDED_ID = 'embedded-settings';
const EMBEDDED_TEMPLATE_ID = 'embedded-template';

/** Letterhead template baked into this file when it was saved from the app, if any. */
export function embeddedTemplate(): string | null {
  const text = document.getElementById(EMBEDDED_TEMPLATE_ID)?.textContent?.trim();
  return text || null;
}

/** Settings baked into this file when it was saved from the app, if any. */
export function embeddedSettings(): string | null {
  const text = document.getElementById(EMBEDDED_ID)?.textContent?.trim();
  return text || null;
}

/** When (ms since 1970) the settings were built into this file; 0 for a file saved before this was recorded. */
export function embeddedSavedAt(): number {
  const n = Number(document.getElementById(EMBEDDED_ID)?.getAttribute('data-saved-at'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The page as it was before the app drew anything, so a copy can be saved with settings inside. */
export function capturePristine(): string {
  return '<!doctype html>\n' + document.documentElement.outerHTML;
}

/**
 * The pristine page with the given settings JSON inside, usable offline on any machine.
 * Done on a parsed copy (not by searching the text) because the app's own code mentions these tags.
 */
export function withEmbeddedSettings(pristine: string, settingsJson: string, templateJson: string | null = null, savedAt = Date.now()): string {
  const doc = new DOMParser().parseFromString(pristine, 'text/html');
  const embed = (id: string, json: string | null) => {
    doc.getElementById(id)?.remove();
    if (!json) return;
    const tag = doc.createElement('script');
    tag.id = id;
    tag.type = 'application/json';
    // So a browser that already holds older settings can tell this copy is newer.
    tag.setAttribute('data-saved-at', String(savedAt));
    tag.textContent = json.replace(/</g, '\\u003c');
    doc.head.prepend(tag);
  };
  embed(EMBEDDED_TEMPLATE_ID, templateJson);
  embed(EMBEDDED_ID, settingsJson);
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}
