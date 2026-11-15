import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { fillTemplate, forceA4, fromBase64, letterBodyXml, parseStoredTemplate, replaceBody, stripTemplate, toBase64 } from '../src/docx';
import type { Letter } from '../src/letter';

const SECT = '<w:sectPr><w:headerReference w:type="default" r:id="rId8"/><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';
const DOC = `<?xml version="1.0"?><w:document xmlns:w="urn:w" xmlns:r="urn:r"><w:body><w:p><w:pPr><w:sectPr><w:pgSz w:w="1"/></w:sectPr></w:pPr><w:r><w:t>OLD LETTER TEXT</w:t></w:r></w:p><w:p><w:r><w:t>more old text</w:t></w:r></w:p>${SECT}</w:body></w:document>`;

/** An invented stand-in for a letterhead file. */
function fakeDocx(): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(DOC),
    'word/header2.xml': strToU8('<w:hdr>LOGO</w:hdr>'),
    'word/media/image1.png': new Uint8Array([1, 2, 3, 250]),
  });
}

const letter: Letter = {
  date: '2026-01-05',
  patient: [],
  summary: [
    { label: 'Diagnosis', lines: ['IOP <10 & stable'] },
    { label: 'Treatment', lines: ['Drop A nocte OU', 'Drop B BD RE'] },
  ],
  salutation: 'Dear Doctor,',
  paragraphs: ['First paragraph.', 'Second paragraph.'],
  closing: 'Yours sincerely,',
  signoff: ['Dr A Example, 000000X', 'Registrar to Dr B Sample'],
};

describe('word template', () => {
  it('replaces the body and keeps the final section (letterhead links)', () => {
    const out = replaceBody(DOC, '<w:p>NEW</w:p>');
    expect(out).toContain(`<w:body><w:p>NEW</w:p>${SECT}</w:body>`);
    expect(out).not.toContain('OLD LETTER TEXT');
    expect(out.startsWith('<?xml version="1.0"?><w:document')).toBe(true);
    expect(() => replaceBody('<nope/>', '')).toThrow();
  });

  it('strips the old letter when a template is loaded, keeping header and images', () => {
    const files = unzipSync(stripTemplate(fakeDocx()));
    const doc = strFromU8(files['word/document.xml']);
    expect(doc).not.toContain('OLD LETTER TEXT');
    expect(doc).not.toContain('more old text');
    expect(doc).toContain(SECT);
    expect(strFromU8(files['word/header2.xml'])).toBe('<w:hdr>LOGO</w:hdr>');
    expect([...files['word/media/image1.png']]).toEqual([1, 2, 3, 250]);
    expect(Object.keys(files)[0]).toBe('[Content_Types].xml');
  });

  it('fills the template with the letter', () => {
    const doc = strFromU8(unzipSync(fillTemplate(stripTemplate(fakeDocx()), letter))['word/document.xml']);
    expect(doc).toContain('<w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Diagnosis:</w:t>');
    expect(doc).toContain('IOP &lt;10 &amp; stable');
    expect(doc).toContain('Drop A nocte OU</w:t><w:br/><w:t xml:space="preserve">Drop B BD RE');
    expect(doc).toContain('First paragraph.');
    expect(doc).toContain('Registrar to Dr B Sample');
    expect(doc).toContain(SECT);
    expect(doc).not.toMatch(/<w:tbl|w:numPr/);
  });

  it('right-aligns the date in the Word letter only', () => {
    const xml = letterBodyXml(letter);
    expect(xml).toMatch(/<w:jc w:val="right"\/><\/w:pPr><w:r><w:t xml:space="preserve">2026-01-05<\/w:t>/);
    expect(xml.match(/w:val="right"/g)).toHaveLength(1);
  });

  it('leaves sticker space when no patient details were typed, and uses them when they were', () => {
    expect(letterBodyXml(letter)).toContain('RE:</w:t><w:br/><w:br/><w:br/>');
    const typed = letterBodyXml({ ...letter, patient: ['RE: Sam Smith', 'MRN: 123'] });
    expect(typed).toContain('RE: Sam Smith</w:t><w:br/><w:t xml:space="preserve">MRN: 123');
  });

  it('turns a US Letter letterhead into A4, moving header tab stops to match', () => {
    const letterDoc = '<w:document xmlns:w="urn:w"><w:body><w:p/><w:sectPr><w:pgSz w:w="12240" w:h="15840" w:code="1"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>';
    const styles = '<w:styles><w:tab w:val="center" w:pos="4680"/><w:tab w:val="right" w:pos="9360"/><w:tab w:val="left" w:pos="720"/></w:styles>';
    const usLetter = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8(letterDoc), 'word/styles.xml': strToU8(styles), 'word/header1.xml': strToU8('<w:hdr><w:tab w:val="right" w:pos="9360" /></w:hdr>') });

    for (const out of [stripTemplate(usLetter), fillTemplate(usLetter, letter), fillTemplate(stripTemplate(usLetter), letter)]) {
      const files = unzipSync(out);
      const all = Object.values(files).map((f) => strFromU8(f)).join(' ');
      expect(strFromU8(files['word/document.xml'])).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
      expect(all).not.toMatch(/12240|15840|w:code=|4680|9360/);
      expect(strFromU8(files['word/styles.xml'])).toBe('<w:styles><w:tab w:val="center" w:pos="4513"/><w:tab w:val="right" w:pos="9026"/><w:tab w:val="left" w:pos="720"/></w:styles>');
      expect(strFromU8(files['word/header1.xml'])).toContain('w:pos="9026"');
      expect(strFromU8(files['word/document.xml'])).toContain('w:left="1440"');
    }
  });

  it('keeps landscape pages landscape and leaves A4 files alone', () => {
    const mk = (sz: string) => ({ 'word/document.xml': strToU8(`<w:body><w:sectPr>${sz}<w:pgMar w:left="1440" w:right="1440"/></w:sectPr></w:body>`), 'word/styles.xml': strToU8('<w:tab w:val="right" w:pos="9026"/>') });
    const land = mk('<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>');
    forceA4(land);
    expect(strFromU8(land['word/document.xml'])).toContain('<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>');
    const a4 = mk('<w:pgSz w:w="11906" w:h="16838"/>');
    forceA4(a4);
    expect(strFromU8(a4['word/document.xml'])).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
    expect(strFromU8(a4['word/styles.xml'])).toBe('<w:tab w:val="right" w:pos="9026"/>');
  });

  it('rejects files that are not Word documents', () => {
    expect(() => stripTemplate(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => stripTemplate(zipSync({ 'hello.txt': strToU8('hi') }))).toThrow();
  });

  it('round-trips through base64 storage', () => {
    const bytes = stripTemplate(fakeDocx());
    expect([...fromBase64(toBase64(bytes))]).toEqual([...bytes]);
    expect(parseStoredTemplate(JSON.stringify({ name: 'a.docx', data: 'QQ==' }))).toEqual({ name: 'a.docx', data: 'QQ==' });
    expect(parseStoredTemplate('not json')).toBeNull();
    expect(parseStoredTemplate(JSON.stringify({ name: 'a.docx' }))).toBeNull();
    expect(parseStoredTemplate(null)).toBeNull();
  });
});
