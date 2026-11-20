import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { mergeTemplates, parseTemplateMap, readLetterhead, stripTemplate } from '../src/docx';
import { letterheadPage, plainPage } from '../src/printhtml';

const rels = (items: [string, string][]) =>
  strToU8(`<Relationships>${items.map(([id, target]) => `<Relationship Id="${id}" Type="x" Target="${target}"/>`).join('')}</Relationships>`);

const inlinePic = '<w:drawing><wp:inline><wp:extent cx="914400" cy="457200"/><a:blip r:embed="rId1"/></wp:inline></w:drawing>';
const rightPic =
  '<w:drawing><wp:anchor><wp:positionH relativeFrom="column"><wp:align>right</wp:align></wp:positionH><wp:extent cx="1828800" cy="914400"/><a:blip r:embed="rId2"/></wp:anchor></w:drawing>';

/** An invented letterhead: two logos in the header, an address in the footer. */
function fakeLetterhead(): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(
      '<w:document><w:body><w:p><w:r><w:t>old text</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="even" r:id="rId7"/><w:headerReference w:type="default" r:id="rId8"/><w:footerReference w:type="default" r:id="rId10"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1080" w:bottom="1440" w:left="1800" w:header="720" w:footer="360"/></w:sectPr></w:body></w:document>',
    ),
    'word/_rels/document.xml.rels': rels([
      ['rId7', 'header1.xml'],
      ['rId8', 'header2.xml'],
      ['rId10', 'footer2.xml'],
    ]),
    'word/header1.xml': strToU8('<w:hdr><w:p><w:r><w:t>EVEN PAGES ONLY</w:t></w:r></w:p></w:hdr>'),
    'word/header2.xml': strToU8(`<w:hdr><w:p><w:r>${inlinePic}</w:r><w:r>${rightPic}</w:r></w:p><w:p/></w:hdr>`),
    'word/_rels/header2.xml.rels': rels([
      ['rId1', 'media/image1.png'],
      ['rId2', '/media/logo.jpg'],
    ]),
    'word/media/image1.png': new Uint8Array([1, 2, 3]),
    'media/logo.jpg': new Uint8Array([4, 5, 6]),
    'word/footer2.xml': strToU8(
      '<w:ftr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">Example Health District </w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="18"/></w:rPr><w:t>EYE &amp; EAR </w:t></w:r><w:r><w:t>CLINIC</w:t></w:r></w:p><w:p/></w:ftr>',
    ),
  });
}

describe('reading a letterhead', () => {
  const view = readLetterhead(stripTemplate(fakeLetterhead()));

  it('finds the default header pictures with size and side', () => {
    expect(view.images).toEqual([
      { src: 'data:image/png;base64,AQID', widthIn: 1, heightIn: 0.5, align: 'left' },
      { src: 'data:image/jpeg;base64,BAUG', widthIn: 2, heightIn: 1, align: 'right' },
    ]);
    expect(view.headerLines).toEqual([]);
  });

  it('reads footer lines with alignment, size and bold', () => {
    expect(view.footerLines).toEqual([
      { text: 'Example Health District', align: 'right', sizePt: 9, bold: false },
      { text: 'EYE & EAR CLINIC', align: 'right', sizePt: 9, bold: true },
    ]);
  });

  it('reads the page margins in inches', () => {
    expect(view.page).toEqual({ top: 1, bottom: 1, left: 1.25, right: 0.75, header: 0.5, footer: 0.25 });
  });

  it('copes with a file that has no header or footer', () => {
    const bare = zipSync({ 'word/document.xml': strToU8('<w:document><w:body><w:p/><w:sectPr/></w:body></w:document>') });
    const v = readLetterhead(bare);
    expect(v.images).toEqual([]);
    expect(v.footerLines).toEqual([]);
    expect(v.page.top).toBe(1);
  });
});

describe('footers in other shapes', () => {
  const docWith = (refs: string) =>
    `<w:document><w:body><w:p/><w:sectPr>${refs}<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1080" w:bottom="1440" w:left="1800" w:header="720" w:footer="360"/></w:sectPr></w:body></w:document>`;
  const build = (refs: string, footer: string) =>
    zipSync({
      'word/document.xml': strToU8(docWith(refs)),
      'word/_rels/document.xml.rels': rels([['rId1', 'footer1.xml']]),
      'word/footer1.xml': strToU8(footer),
      'word/_rels/footer1.xml.rels': rels([['rId5', 'media/f.png']]),
      'word/media/f.png': new Uint8Array([1, 2, 3]),
    });
  const box = '<w:r><mc:AlternateContent><mc:Choice><w:drawing><wps:txbx><w:txbxContent><w:p><w:r><w:t>Example Clinic, 1 Sample St</w:t></w:r></w:p></w:txbxContent></wps:txbx></w:drawing></mc:Choice><mc:Fallback><w:pict><w:txbxContent><w:p><w:r><w:t>Example Clinic, 1 Sample St</w:t></w:r></w:p></w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent></w:r>';

  it('reads footer text kept in a text box once', () => {
    const v = readLetterhead(build('<w:footerReference w:type="default" r:id="rId1"/>', `<w:ftr><w:p>${box}</w:p></w:ftr>`));
    expect(v.footerLines.map((l) => l.text)).toEqual(['Example Clinic, 1 Sample St']);
  });

  it('reads footer pictures', () => {
    const pic = '<w:drawing><wp:inline><wp:extent cx="914400" cy="457200"/><a:blip r:embed="rId5"/></wp:inline></w:drawing>';
    const v = readLetterhead(build('<w:footerReference w:type="default" r:id="rId1"/>', `<w:ftr><w:p><w:r>${pic}</w:r></w:p></w:ftr>`));
    expect(v.footerImages).toHaveLength(1);
    expect(v.footerImages[0].heightIn).toBe(0.5);
  });

  it('accepts a footer reference with no type, or only a first-page footer', () => {
    const f = '<w:ftr><w:p><w:r><w:t>Footer text</w:t></w:r></w:p></w:ftr>';
    expect(readLetterhead(build('<w:footerReference r:id="rId1"/>', f)).footerLines).toHaveLength(1);
    expect(readLetterhead(build('<w:footerReference w:type="first" r:id="rId1"/>', f)).footerLines).toHaveLength(1);
  });
});

describe('print layouts', () => {
  const view = readLetterhead(stripTemplate(fakeLetterhead()));

  it('draws the letterhead around the letter on A4', () => {
    const page = letterheadPage(view, '<p>LETTER</p>');
    expect(page.css).toContain('@page { size: A4; margin: 0; }');
    expect(page.html).toContain('class="lh-header" style="top:0.5in;left:1.25in;right:0.75in"');
    expect(page.html).toContain('<img src="data:image/png;base64,AQID" alt="" style="width:1in;height:0.5in;display:block">');
    expect(page.html).toContain('class="lh-footer" style="bottom:0.25in;left:1.25in;right:0.75in"');
    expect(page.html).toContain('EYE &amp; EAR CLINIC');
    // Letter starts below the taller logo: 0.5in header offset + 1in logo + gap.
    expect(page.html).toContain('<thead><tr><td style="height:1.65in">');
    expect(page.html).toContain('<td style="padding:0 0.75in 0 1.25in"><p>LETTER</p></td>');
  });

  it('plain layout leaves room for pre-printed paper', () => {
    const page = plainPage('<p>LETTER</p>', 45);
    expect(page.html).toBe('<p>LETTER</p>');
    expect(page.css).toContain('size: A4');
    expect(page.css).toContain('padding-top: 25mm');
  });
});

describe('stored letterheads', () => {
  it('keeps one per hospital and ignores malformed entries', () => {
    const text = JSON.stringify({ a: { name: 'a.docx', data: 'QQ==' }, b: { name: 'b.docx', data: 'Qg==' }, bad: { name: 1 } });
    expect(parseTemplateMap(text)).toEqual({ a: { name: 'a.docx', data: 'QQ==' }, b: { name: 'b.docx', data: 'Qg==' } });
    expect(parseTemplateMap('nope')).toEqual({});
    expect(parseTemplateMap(null)).toEqual({});
    expect(parseTemplateMap('[]')).toEqual({});
  });
});

describe('merging letterheads from the browser and an offline copy', () => {
  const t = (name: string) => ({ name, data: 'QQ==' });
  const stored = { a: t('stored-a'), b: t('stored-b') };
  const embedded = { a: t('copy-a'), c: t('copy-c') };

  it('a newer copy wins for the hospitals it has, and adds the ones the browser lacks', () => {
    const merged = mergeTemplates(stored, embedded, 100, 200);
    expect(merged.a.name).toBe('copy-a');
    expect(merged.b.name).toBe('stored-b');
    expect(merged.c.name).toBe('copy-c');
  });

  it('the browser wins when its letterheads changed after the copy was saved', () => {
    const merged = mergeTemplates(stored, embedded, 300, 200);
    expect(merged.a.name).toBe('stored-a');
    expect(merged.c.name).toBe('copy-c');
  });

  it('copes with nothing on either side', () => {
    expect(mergeTemplates({}, {}, 0, 0)).toEqual({});
    expect(mergeTemplates({}, embedded, 0, 0)).toEqual(embedded);
  });
});
