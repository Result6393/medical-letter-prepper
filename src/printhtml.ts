// Page layouts for printing (or "Save as PDF" in the print dialog).
import type { Align, LetterheadLine, LetterheadView } from './docx';

export interface PrintPage {
  html: string;
  css: string;
}

const PLAIN_MARGIN_MM = 20;

/** The letter alone, with topMm clear on the first page for pre-printed letterhead paper. */
export function plainPage(letterHtml: string, topMm: number): PrintPage {
  return {
    html: letterHtml,
    css: `@page { size: A4; margin: ${PLAIN_MARGIN_MM}mm; } #print-root { padding-top: ${Math.max(0, topMm - PLAIN_MARGIN_MM)}mm; }`,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => (Math.round(v * 1000) / 1000).toString();

function lineHtml(l: LetterheadLine): string {
  return `<div style="text-align:${l.align};font-size:${n(l.sizePt)}pt;line-height:1.2;${l.bold ? 'font-weight:bold;' : ''}">${l.text ? esc(l.text) : '&nbsp;'}</div>`;
}

const linesHeightIn = (lines: LetterheadLine[]) => lines.reduce((sum, l) => sum + (l.sizePt * 1.2) / 72, 0);

/**
 * The letter on the letterhead: logos and header text at the top of every page, footer text at
 * the bottom, and the letter between the template's own margins. The header and footer are
 * fixed to the page; an invisible table head and foot reserve their space on each page.
 */
export function letterheadPage(view: LetterheadView, letterHtml: string): PrintPage {
  const { page } = view;
  const group = (side: Align) =>
    view.images
      .filter((i) => i.align === side)
      .map((i) => `<img src="${i.src}" alt="" style="width:${n(i.widthIn)}in;height:${n(i.heightIn)}in;display:block">`)
      .join('');

  const imagesHeight = Math.max(0, ...view.images.map((i) => i.heightIn));
  const headerHeight = imagesHeight + linesHeightIn(view.headerLines);
  const footerHeight = linesHeightIn(view.footerLines);
  // The letter starts below the header, or at the top margin if that is lower (as Word does).
  const topSpace = Math.max(page.top, page.header + headerHeight + 0.15);
  const bottomSpace = Math.max(page.bottom, page.footer + footerHeight + 0.1);

  const html = [
    `<div class="lh-header" style="top:${n(page.header)}in;left:${n(page.left)}in;right:${n(page.right)}in">`,
    view.images.length ? `<div class="lh-images"><div>${group('left')}</div><div>${group('center')}</div><div>${group('right')}</div></div>` : '',
    view.headerLines.map(lineHtml).join(''),
    '</div>',
    `<div class="lh-footer" style="bottom:${n(page.footer)}in;left:${n(page.left)}in;right:${n(page.right)}in">${view.footerLines.map(lineHtml).join('')}</div>`,
    '<table class="lh-table">',
    `<thead><tr><td style="height:${n(topSpace)}in"></td></tr></thead>`,
    `<tfoot><tr><td style="height:${n(bottomSpace)}in"></td></tr></tfoot>`,
    `<tbody><tr><td style="padding:0 ${n(page.right)}in 0 ${n(page.left)}in">${letterHtml}</td></tr></tbody>`,
    '</table>',
  ].join('');

  const css = [
    '@page { size: A4; margin: 0; }',
    '#print-root { padding: 0; font-family: Arial, Helvetica, sans-serif; }',
    '#print-root .lh-header, #print-root .lh-footer { position: fixed; }',
    '#print-root .lh-images { display: flex; justify-content: space-between; align-items: flex-start; }',
    '#print-root .lh-table { width: 100%; border-collapse: collapse; }',
    '#print-root .lh-table td { padding: 0; vertical-align: top; }',
  ].join('\n');

  return { html, css };
}
