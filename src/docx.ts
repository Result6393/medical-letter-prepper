// Fills the user's own letterhead .docx with a letter.
// The template is private: it is loaded by the user, kept in their browser, and never part of this repo.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Letter } from './letter';

const DOCUMENT = 'word/document.xml';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const escapeXml = (s: string) =>
  s
    // Characters XML 1.0 does not allow.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** One run of text; line breaks in the text become Word line breaks. */
function run(text: string, bold = false): string {
  const props = bold ? '<w:rPr><w:b/><w:bCs/></w:rPr>' : '';
  const parts = text.split('\n').map((line) => (line ? `<w:t xml:space="preserve">${escapeXml(line)}</w:t>` : ''));
  return `<w:r>${props}${parts.join('<w:br/>')}</w:r>`;
}

/** A left-aligned paragraph with the given space after it (points). No indents, no tables. */
function para(runs: string, afterPt: number, align: 'left' | 'right' = 'left'): string {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="${Math.round(afterPt * 20)}"/><w:ind w:left="0" w:right="0" w:firstLine="0"/><w:jc w:val="${align}"/></w:pPr>${runs}</w:p>`;
}

/** The letter as Word paragraphs, laid out like the on-screen preview. */
export function letterBodyXml(l: Letter): string {
  const out: string[] = [para(run(l.date), 10, 'right')];
  // No details typed: leave room for a patient sticker.
  out.push(para(run(l.patient.length ? l.patient.join('\n') : 'RE:\n\n\n\n'), 10));

  l.summary.forEach((e, i) => {
    const last = i === l.summary.length - 1;
    const body = e.lines.length === 1 ? ` ${e.lines[0]}` : `\n${e.lines.join('\n')}`;
    out.push(para(run(`${e.label}:`, true) + run(body), last ? 12 : 4));
  });

  out.push(para(run(l.salutation), 10));
  for (const p of l.paragraphs) out.push(para(run(p), 10));
  // Gap for a signature.
  out.push(para(run(`${l.closing}\n\n\n${l.signoff.join('\n')}`), 0));
  return out.join('');
}

/**
 * Swaps everything in the document body for bodyXml, keeping the final section properties
 * (page size, margins, and the links to the header and footer that make up the letterhead).
 */
export function replaceBody(documentXml: string, bodyXml: string): string {
  const m = /<w:body>([\s\S]*)<\/w:body>/.exec(documentXml);
  if (!m) throw new Error('This file has no document body. Is it a Word .docx letter?');
  const inner = m[1];
  const at = inner.lastIndexOf('<w:sectPr');
  let section = '';
  if (at >= 0) {
    const tail = inner.slice(at);
    // Only the body-level section (nothing but its own tags after it), not one inside a paragraph.
    if (!tail.includes('</w:p>')) section = tail.trim();
  }
  return `${documentXml.slice(0, m.index)}<w:body>${bodyXml}${section}</w:body>${documentXml.slice(m.index + m[0].length)}`;
}

// ---------- A4 ----------

/** A4 in twentieths of a point (210 x 297 mm). */
const A4_W = 11906;
const A4_H = 16838;

const attr = (tag: string, name: string): number | null => {
  const m = new RegExp(`\\b${name}="(\\d+)"`).exec(tag);
  return m ? Number(m[1]) : null;
};

/**
 * Makes every page A4, whatever size the letterhead file was saved in (hospital templates are
 * often US Letter). Tab stops that were set to the old text width or its centre, as Word's
 * Header and Footer styles are, move to the A4 width so centred and right-aligned header text
 * still lines up. Margins are kept.
 */
export function forceA4(files: Record<string, Uint8Array>): void {
  const doc = strFromU8(files[DOCUMENT]);
  const sizes = doc.match(/<w:pgSz\b[^>]*\/>/g) ?? [];
  const lastSize = sizes[sizes.length - 1];
  const margins = (doc.match(/<w:pgMar\b[^>]*\/>/g) ?? []).pop();

  const landscape = (tag: string) => /w:orient="landscape"/.test(tag) || (attr(tag, 'w:w') ?? 0) > (attr(tag, 'w:h') ?? 1);
  const a4Tag = (tag: string) => (landscape(tag) ? `<w:pgSz w:w="${A4_H}" w:h="${A4_W}" w:orient="landscape"/>` : `<w:pgSz w:w="${A4_W}" w:h="${A4_H}"/>`);

  // Old and new width between the margins, for moving tab stops.
  let oldText = 0;
  let newText = 0;
  if (lastSize && margins) {
    const side = (attr(margins, 'w:left') ?? 0) + (attr(margins, 'w:right') ?? 0);
    oldText = (attr(lastSize, 'w:w') ?? 0) - side;
    newText = (landscape(lastSize) ? A4_H : A4_W) - side;
  }

  files[DOCUMENT] = strToU8(doc.replace(/<w:pgSz\b[^>]*\/>/g, a4Tag));

  if (oldText > 0 && newText > 0 && oldText !== newText) {
    const half = Math.round(oldText / 2);
    for (const path of Object.keys(files)) {
      if (!/^word\/(styles|header\d*|footer\d*)\.xml$/.test(path)) continue;
      const before = strFromU8(files[path]);
      const after = before.replace(/<w:tab\b[^>]*\/>/g, (tag) =>
        tag.replace(/w:pos="(\d+)"/, (whole, pos: string) => {
          const n = Number(pos);
          if (n === oldText) return `w:pos="${newText}"`;
          if (n === half) return `w:pos="${Math.round(newText / 2)}"`;
          return whole;
        }),
      );
      if (after !== before) files[path] = strToU8(after);
    }
  }
}

function open(bytes: Uint8Array): Record<string, Uint8Array> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('Could not open that file. Choose a Word .docx file (not .doc or PDF).');
  }
  if (!files[DOCUMENT]) throw new Error('That file isn’t a Word .docx document.');
  return files;
}

/**
 * Prepares a letterhead template from any letter on that letterhead: the body text is removed
 * straight away, so nothing a previous letter said is ever stored. Header, footer, logos and
 * margins are kept, and the page size is set to A4.
 */
export function stripTemplate(bytes: Uint8Array): Uint8Array {
  const files = open(bytes);
  files[DOCUMENT] = strToU8(replaceBody(strFromU8(files[DOCUMENT]), '<w:p/>'));
  forceA4(files);
  return zipSync(files, { level: 6 });
}

/** A finished .docx: the template with the letter as its body. */
export function fillTemplate(template: Uint8Array, l: Letter): Uint8Array {
  const files = open(template);
  files[DOCUMENT] = strToU8(replaceBody(strFromU8(files[DOCUMENT]), letterBodyXml(l)));
  // Also done here so a letterhead stored by an older version still comes out A4.
  forceA4(files);
  return zipSync(files, { level: 6 });
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

// ---------- Stored template ----------

export interface StoredTemplate {
  /** File name it was loaded from, for display only. */
  name: string;
  /** Base64 of the stripped .docx. */
  data: string;
}

/** Where a single letterhead was kept before hospitals were added. Read once, then moved. */
export const TEMPLATE_KEY = 'letter-builder.template';
/** Letterheads by hospital id. Kept in this browser only. */
export const TEMPLATES_KEY = 'letter-builder.templates';

export type TemplateMap = Record<string, StoredTemplate>;

export function parseTemplateMap(text: string | null | undefined): TemplateMap {
  const out: TemplateMap = {};
  if (!text) return out;
  try {
    const data = JSON.parse(text) as unknown;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return out;
    for (const [id, value] of Object.entries(data)) {
      const t = parseStoredTemplate(JSON.stringify(value));
      if (t) out[id] = t;
    }
  } catch {
    // Unreadable: treat as none stored.
  }
  return out;
}

// ---------- Reading the letterhead for printing ----------

export type Align = 'left' | 'center' | 'right';

export interface LetterheadImage {
  /** data: URL of the picture. */
  src: string;
  widthIn: number;
  heightIn: number;
  align: Align;
}

export interface LetterheadLine {
  text: string;
  align: Align;
  sizePt: number;
  bold: boolean;
}

/** What is needed to draw the letterhead around a printed letter. Measurements in inches. */
export interface LetterheadView {
  images: LetterheadImage[];
  headerLines: LetterheadLine[];
  footerLines: LetterheadLine[];
  page: { top: number; bottom: number; left: number; right: number; header: number; footer: number };
}

const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' };
const EMU_PER_INCH = 914400;

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Resolves a relationship target against the folder of the part that refers to it. */
function resolvePath(dir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = dir ? dir.split('/') : [];
  for (const piece of target.split('/')) {
    if (piece === '..') parts.pop();
    else if (piece !== '.') parts.push(piece);
  }
  return parts.join('/');
}

/** Relationship id -> file path, for one part of the document. */
function relationships(files: Record<string, Uint8Array>, part: string): Record<string, string> {
  const slash = part.lastIndexOf('/');
  const dir = slash >= 0 ? part.slice(0, slash) : '';
  const name = part.slice(slash + 1);
  const rels = files[`${dir ? `${dir}/` : ''}_rels/${name}.rels`];
  const out: Record<string, string> = {};
  if (!rels) return out;
  for (const tag of strFromU8(rels).match(/<Relationship\b[^>]*>/g) ?? []) {
    const id = /\bId="([^"]*)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]*)"/.exec(tag)?.[1];
    if (id && target && !/TargetMode="External"/.test(tag)) out[id] = resolvePath(dir, unescapeXml(target));
  }
  return out;
}

const toAlign = (value: string | undefined): Align => (value === 'right' || value === 'end' ? 'right' : value === 'center' ? 'center' : 'left');

/** Text paragraphs of a header or footer, ignoring pictures and text boxes. */
function textLines(xml: string): LetterheadLine[] {
  const plain = xml
    .replace(/<mc:AlternateContent>[\s\S]*?<\/mc:AlternateContent>/g, '')
    .replace(/<w:drawing>[\s\S]*?<\/w:drawing>/g, '')
    .replace(/<w:pict>[\s\S]*?<\/w:pict>/g, '');
  const lines = (plain.match(/<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g) ?? []).map((p): LetterheadLine => {
    const text = [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => unescapeXml(m[1])).join('');
    const size = /<w:sz w:val="(\d+)"/.exec(p)?.[1];
    return {
      text: text.trim(),
      align: toAlign(/<w:jc w:val="(\w+)"/.exec(p)?.[1]),
      sizePt: size ? Number(size) / 2 : 11,
      bold: /<w:b\/>|<w:b w:val="(?:1|true|on)"\/>/.test(p),
    };
  });
  while (lines.length && !lines[0].text) lines.shift();
  while (lines.length && !lines[lines.length - 1].text) lines.pop();
  return lines;
}

/**
 * Reads the default header and footer of a letterhead file: pictures with their size and side,
 * text lines, and page margins. Enough to draw the same letterhead in the browser for printing.
 */
export function readLetterhead(template: Uint8Array): LetterheadView {
  const files = open(template);
  const doc = strFromU8(files[DOCUMENT]);
  const docRels = relationships(files, DOCUMENT);

  const margins = (doc.match(/<w:pgMar\b[^>]*\/>/g) ?? []).pop() ?? '';
  const inches = (name: string, fallback: number) => {
    const v = attr(margins, name);
    return v === null ? fallback : v / 1440;
  };

  const partFor = (kind: 'header' | 'footer'): string | null => {
    const refs = doc.match(new RegExp(`<w:${kind}Reference\\b[^>]*/>`, 'g')) ?? [];
    const ref = refs.filter((t) => /w:type="default"/.test(t)).pop();
    const id = ref && /r:id="([^"]*)"/.exec(ref)?.[1];
    const path = id ? docRels[id] : undefined;
    return path && files[path] ? path : null;
  };

  const view: LetterheadView = {
    images: [],
    headerLines: [],
    footerLines: [],
    page: { top: inches('w:top', 1), bottom: inches('w:bottom', 1), left: inches('w:left', 1), right: inches('w:right', 1), header: inches('w:header', 0.5), footer: inches('w:footer', 0.5) },
  };

  const headerPath = partFor('header');
  if (headerPath) {
    const xml = strFromU8(files[headerPath]);
    const rels = relationships(files, headerPath);
    for (const drawing of xml.match(/<w:drawing>[\s\S]*?<\/w:drawing>/g) ?? []) {
      const id = /r:embed="([^"]*)"/.exec(drawing)?.[1];
      const path = id ? rels[id] : undefined;
      const type = path ? IMAGE_TYPES[path.split('.').pop()?.toLowerCase() ?? ''] : undefined;
      const extent = /<wp:extent\b[^>]*>/.exec(drawing)?.[0] ?? '';
      const cx = attr(extent, 'cx');
      const cy = attr(extent, 'cy');
      if (!path || !type || !files[path] || !cx || !cy) continue;
      const floating = /<wp:anchor\b/.test(drawing);
      const side = /<wp:positionH\b[^>]*>\s*<wp:align>(\w+)<\/wp:align>/.exec(drawing)?.[1];
      view.images.push({
        src: `data:${type};base64,${toBase64(files[path])}`,
        widthIn: cx / EMU_PER_INCH,
        heightIn: cy / EMU_PER_INCH,
        align: floating ? toAlign(side) : 'left',
      });
    }
    view.headerLines = textLines(xml);
  }

  const footerPath = partFor('footer');
  if (footerPath) view.footerLines = textLines(strFromU8(files[footerPath]));
  return view;
}

export function parseStoredTemplate(text: string | null | undefined): StoredTemplate | null {
  if (!text) return null;
  try {
    const t = JSON.parse(text) as Partial<StoredTemplate> | null;
    return t && typeof t.name === 'string' && typeof t.data === 'string' && t.data ? { name: t.name, data: t.data } : null;
  } catch {
    return null;
  }
}
