import { describe, expect, it } from 'vitest';
import {
  buildLetter,
  buildSummary,
  emptyPatient,
  emptySummary,
  fillHospital,
  fillTokens,
  findPlaceholders,
  patientRef,
  possessiveTime,
  toHtml,
  toPlainText,
  type LetterState,
} from '../src/letter';
import { DEFAULT_PHRASES, SECTIONS } from '../src/phrases';
import { defaultSettings, effectivePhrases, exportSettings, importSettings, phrasesFor, pickSettingsText } from '../src/settings';

function state(over: Partial<LetterState> = {}): LetterState {
  return {
    type: 'review',
    clinic: 'general',
    date: '2026-01-05',
    salutation: 'Dear Doctor,',
    patient: { ...emptyPatient(), title: 'Mr', surname: 'Smith', first: 'Sam' },
    summary: { ...emptySummary(), diagnosis: 'RE uveitis', vaRE: '6/9', vaLE: '6/6' },
    reason: '',
    ticks: {},
    freeText: {},
    consultantId: '',
    siteId: '',
    bodyOverride: null,
    ...over,
  };
}

describe('tokens', () => {
  it('fills pronouns for each sex', () => {
    expect(fillTokens('{He} report{s} {his} pain to {him}.', state({ patient: { ...emptyPatient(), sex: 'm' } }))).toBe('He reports his pain to him.');
    expect(fillTokens('{He} report{s} {his} pain to {him}.', state({ patient: { ...emptyPatient(), sex: 'f' } }))).toBe('She reports her pain to her.');
    expect(fillTokens('{He} report{s} {his} pain to {him}.', state({ patient: { ...emptyPatient(), sex: 'x' } }))).toBe('They report their pain to them.');
  });

  it('conjugates verbs for they', () => {
    const they = state({ patient: { ...emptyPatient(), sex: 'x' } });
    expect(fillTokens('{He} {is} legally blind and {has} low vision.', they)).toBe('They are legally blind and have low vision.');
    expect(fillTokens('{He} {is} legally blind.', state())).toBe('He is legally blind.');
  });

  it('names the patient as chosen, with a stand-in when missing', () => {
    expect(patientRef({ ...emptyPatient(), title: 'Ms', surname: 'Jones', refer: 'title' })).toBe('Ms Jones');
    expect(patientRef({ ...emptyPatient(), first: 'Alex', refer: 'first' })).toBe('Alex');
    expect(patientRef({ ...emptyPatient(), refer: 'this' })).toBe('this patient');
    expect(patientRef({ ...emptyPatient(), refer: 'title' })).toBe('PATIENT');
    expect(fillTokens('{Pt} was seen.', state({ patient: { ...emptyPatient(), refer: 'this' } }))).toBe('This patient was seen.');
  });

  it('uses the review interval and keeps unknown tokens', () => {
    expect(fillTokens('See in {reviewtime}.', state({ summary: { ...emptySummary(), interval: '6m' } }))).toBe("See in 6 months' time.");
    expect(fillTokens('See in {reviewtime}.', state({ summary: { ...emptySummary(), interval: '1w' } }))).toBe("See in 1 week's time.");
    expect(fillTokens('See in {reviewtime}.', state({ summary: { ...emptySummary(), interval: 'dc' } }))).toBe('See in [review interval].');
    expect(fillTokens('{nonsense}', state())).toBe('{nonsense}');
    expect(possessiveTime('2 years')).toBe("2 years' time");
  });

  it('takes the reason from the diagnosis unless typed', () => {
    expect(fillTokens('for {reason}', state())).toBe('for RE uveitis');
    expect(fillTokens('for {reason}', state({ reason: 'glaucoma' }))).toBe('for glaucoma');
    expect(fillTokens('for {reason}', state({ summary: emptySummary() }))).toBe('for [reason for review]');
  });

  it('fills visual acuity and DOB, with prompts when blank', () => {
    expect(fillTokens('{vaRE} / {vaLE}', state())).toBe('6/9 / 6/6');
    expect(fillTokens('{vaRE}', state({ summary: emptySummary() }))).toBe('[RE VA]');
    expect(fillTokens('DOB {dob}', state())).toBe('DOB [DOB]');
  });
});

describe('phrase bank', () => {
  it('has unique ids and valid sections', () => {
    const ids = DEFAULT_PHRASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ph of DEFAULT_PHRASES) {
      expect(SECTIONS[ph.type].some((s) => s.id === ph.section), ph.id).toBe(true);
    }
  });

  it('only uses tokens the engine knows', () => {
    const known = new Set(['pt', 'reason', 'he', 'his', 'him', 'himself', 'is', 'has', 'does', 'was', 's', 'eye', 'review', 'reviewtime', 'vare', 'vale', 'dob']);
    for (const ph of DEFAULT_PHRASES) {
      for (const m of ph.text.matchAll(/\{([A-Za-z]+)\}/g)) expect(known.has(m[1].toLowerCase()), `${ph.id} {${m[1]}}`).toBe(true);
    }
  });

  it('contains no email addresses', () => {
    expect(DEFAULT_PHRASES.some((ph) => /@/.test(ph.text))).toBe(false);
  });

  it('shows clinic-specific phrases only in their clinic, unless showing all', () => {
    const all = effectivePhrases(defaultSettings());
    const inGeneral = phrasesFor(all, 'review', 'status', 'general', false).map((p) => p.id);
    const inGlaucoma = phrasesFor(all, 'review', 'status', 'glaucoma', false).map((p) => p.id);
    expect(inGeneral).not.toContain('rv-s15');
    expect(inGlaucoma).toContain('rv-s15');
    expect(phrasesFor(all, 'review', 'status', 'general', true).map((p) => p.id)).toContain('rv-s15');
  });
});

describe('letter', () => {
  it('builds paragraphs from ticks and free text, grouped by paragraph', () => {
    const s = state({
      ticks: { 'rv-o1': true, 'rv-s1': true, 'rv-s2': true, 'rv-p1': true, 'rv-f1': true },
      freeText: { 'review.status': 'Pressure was 14.' },
    });
    const l = buildLetter(s, defaultSettings(), effectivePhrases(defaultSettings()));
    expect(l.paragraphs).toEqual([
      'Thank you for your ongoing care of Mr Smith. We reviewed him today for RE uveitis. His condition appears inactive and stable. He reports no changes. Pressure was 14.',
      "He should continue his current drops unchanged. We will review him in 6 months' time.",
    ]);
  });

  it('uses a hand-edited body in place of the ticks', () => {
    const s = state({ ticks: { 'rv-o1': true }, bodyOverride: 'First paragraph.\n\nSecond paragraph.' });
    expect(buildLetter(s, defaultSettings(), effectivePhrases(defaultSettings())).paragraphs).toEqual(['First paragraph.', 'Second paragraph.']);
  });

  it('builds the summary block and skips empty parts', () => {
    const sm = { ...emptySummary(), diagnosis: 'RE uveitis\nLE normal', vaRE: '6/9', iopRE: '13', iopLE: '8', iopTarget: '<=14', treatment: 'Lumigan nocte OU', interval: '3m', planExtra: 'Avoid steroids' };
    expect(buildSummary(sm)).toEqual([
      { label: 'Diagnosis', lines: ['RE uveitis', 'LE normal'] },
      { label: 'Visual Acuity', lines: ['RE 6/9'] },
      { label: 'IOP', lines: ['RE 13 LE 8 mmHg', 'Target IOP <=14'] },
      { label: 'Treatment', lines: ['Lumigan nocte OU'] },
      { label: 'Plan', lines: ['Review in 3 months. Avoid steroids'] },
    ]);
    expect(buildSummary(emptySummary()).map((e) => e.label)).toEqual(['Plan']);
  });

  it('builds the sign-off from settings', () => {
    const settings = defaultSettings();
    settings.signer = { name: 'Dr A Example', rolePrefix: 'Registrar to', position: '' };
    settings.sites = [{ id: 'a', name: 'Example Hospital', provider: '000000X' }];
    settings.consultants = [{ id: 'c1', name: 'Dr B Sample', provider: '', titles: ['Consultant Ophthalmologist, Example Hospital'], clinics: [] }];
    const l = buildLetter(state({ consultantId: 'c1', siteId: 'a' }), settings, []);
    expect(l.signoff).toEqual(['Dr A Example, 000000X', 'Registrar to Dr B Sample', 'Consultant Ophthalmologist, Example Hospital']);
    settings.consultants[0].provider = '111111Y';
    expect(buildLetter(state({ consultantId: 'c1', siteId: 'a' }), settings, []).signoff[1]).toBe('Registrar to Dr B Sample, 111111Y');
    expect(buildLetter(state(), defaultSettings(), []).signoff).toEqual(['[Your name]']);
  });

  it('signs in your own name with your position when no consultant is chosen', () => {
    const settings = defaultSettings();
    settings.signer = { name: 'Dr A Example', rolePrefix: 'Registrar to', position: 'Ophthalmology Registrar' };
    settings.sites = [{ id: 'a', name: 'Example Eye Clinic', provider: '1111111A\nSecond line' }];
    settings.consultants = [{ id: 'c1', name: 'Dr B Sample', provider: '', titles: [], clinics: [] }];
    expect(buildLetter(state({ siteId: 'a' }), settings, []).signoff).toEqual(['Dr A Example', 'Ophthalmology Registrar', 'Example Eye Clinic', 'Provider number: 1111111A', 'Second line']);
    // A consultant still gives the "Registrar to" layout.
    expect(buildLetter(state({ siteId: 'a', consultantId: 'c1' }), settings, []).signoff).toEqual(['Dr A Example, 1111111A', 'Second line', 'Registrar to Dr B Sample']);
    // {hospital} in the position replaces the separate hospital line; a labelled number is kept as typed.
    settings.signer.position = 'Registrar, {hospital}';
    settings.sites[0].provider = 'Provider no. 1111111A';
    expect(buildLetter(state({ siteId: 'a' }), settings, []).signoff).toEqual(['Dr A Example', 'Registrar, Example Eye Clinic', 'Provider no. 1111111A']);
    expect(buildLetter(state(), settings, []).signoff).toEqual(['Dr A Example', 'Registrar']);
  });

  it('names the chosen hospital in consultant lines, and copes with none', () => {
    const settings = defaultSettings();
    settings.sites = [
      { id: 'a', name: 'Example Eye Hospital', provider: '1111111A' },
      { id: 'b', name: 'Sample General Hospital', provider: '2222222B' },
    ];
    settings.consultants = [{ id: 'c1', name: 'Dr B Sample', provider: '', titles: ['Professor of Examples', 'Consultant Ophthalmologist, {hospital}'], clinics: [] }];
    const at = (siteId: string) => buildLetter(state({ consultantId: 'c1', siteId }), settings, []).signoff.slice(2);
    expect(at('a')).toEqual(['Professor of Examples', 'Consultant Ophthalmologist, Example Eye Hospital']);
    expect(at('b')).toEqual(['Professor of Examples', 'Consultant Ophthalmologist, Sample General Hospital']);
    expect(at('')).toEqual(['Professor of Examples', 'Consultant Ophthalmologist']);
    expect(fillHospital('{hospital}', '')).toBe('');
  });

  it('uses the provider number of the chosen hospital', () => {
    const settings = defaultSettings();
    settings.signer.name = 'Dr A Example';
    settings.sites = [
      { id: 'a', name: 'Example Eye Hospital', provider: '1111111A' },
      { id: 'b', name: 'Sample General Hospital', provider: '2222222B' },
      { id: 'c', name: 'No Number Hospital', provider: '' },
    ];
    const first = (siteId: string) => buildLetter(state({ siteId }), settings, []).signoff[0];
    expect(first('a')).toBe('Dr A Example, 1111111A');
    expect(first('b')).toBe('Dr A Example, 2222222B');
    expect(first('c')).toBe('Dr A Example');
    expect(first('')).toBe('Dr A Example');
  });

  it('puts extra provider lines on their own lines under the name', () => {
    const settings = defaultSettings();
    settings.signer.name = 'Dr A Example';
    settings.sites = [{ id: 'a', name: 'Example Eye Hospital', provider: '1111111A\nSecond line\n\nThird line' }];
    expect(buildLetter(state({ siteId: 'a' }), settings, []).signoff).toEqual(['Dr A Example, 1111111A', 'Second line', 'Third line']);
  });

  it('formats the date', () => {
    const settings = defaultSettings();
    expect(buildLetter(state(), settings, []).date).toBe('2026-01-05');
    settings.dateFormat = 'dmy';
    expect(buildLetter(state(), settings, []).date).toBe('05/01/2026');
  });
});

describe('output', () => {
  const settings = defaultSettings();
  const body = state({ ticks: { 'rv-o1': true } });

  it('plain text has headings on their own line and no symbols', () => {
    const text = toPlainText(buildLetter(body, settings, effectivePhrases(settings)));
    expect(text).toContain('Diagnosis:\nRE uveitis\n\nVisual Acuity:\nRE 6/9 LE 6/6\n\nPlan:\nReview in 6 months\n\nDear Doctor,');
    expect(text).toContain('Yours sincerely,\n[Your name]');
    expect(text).not.toMatch(/[*#|<>]/);
    expect(text).not.toMatch(/^ /m);
  });

  it('plain text leaves out the patient block when blank, includes it when typed', () => {
    const blank = state({ patient: emptyPatient() });
    const plain = toPlainText(buildLetter(blank, settings, []));
    expect(plain).not.toContain('RE:');
    expect(plain).not.toContain('DOB');
    const typed = state({ patient: { ...emptyPatient(), first: 'Sam', surname: 'Smith', dob: '01/01/1970', mrn: '123' } });
    expect(toPlainText(buildLetter(typed, settings, []))).toContain('RE: Sam Smith\nDOB: 01/01/1970\nMRN: 123');
  });

  it('HTML leaves sticker space when blank and has no tables', () => {
    const html = toHtml(buildLetter(state({ patient: emptyPatient() }), settings, []), { mark: false, inline: true });
    expect(html).toContain('RE:<br><br>');
    expect(html).not.toMatch(/<table|<ul|<li|text-indent|margin-left/);
    expect(html).toContain('<strong>Diagnosis:</strong> RE uveitis');
  });

  it('right-aligns the date on the page but not in the PowerChart text', () => {
    const l = buildLetter(state(), settings, []);
    const html = toHtml(l, { mark: false, inline: true });
    const firstLine = html.slice(0, html.indexOf('</p>') + 4);
    expect(firstLine).toMatch(/text-align:right;[^>]*>2026-01-05<\/p>/);
    expect(firstLine).not.toContain('text-align:left');
    expect(toPlainText(l).startsWith('2026-01-05')).toBe(true);
    expect(toPlainText(l)).not.toMatch(/^\s/);
  });

  it('escapes HTML in typed text', () => {
    const l = buildLetter(state({ summary: { ...emptySummary(), diagnosis: 'IOP <10 & stable' } }), settings, []);
    const html = toHtml(l, { mark: false, inline: false });
    expect(html).toContain('IOP &lt;10 &amp; stable');
  });

  it('flags placeholders left in the letter', () => {
    const blank = state({ patient: emptyPatient(), ticks: { 'rv-o1': true, 'rf-r1': true } });
    const l = buildLetter(blank, settings, effectivePhrases(settings));
    expect(findPlaceholders(l)).toContain('PATIENT');
    expect(findPlaceholders(l)).toContain('[Your name]');
    const html = toHtml(l, { mark: true, inline: false });
    expect(html).toContain('<mark class="ph">PATIENT</mark>');
  });
});

describe('settings', () => {
  it('round-trips and fills defaults for anything missing', () => {
    const s = defaultSettings();
    s.signer.name = 'Dr A Example';
    s.recipients = ['Dr Jones'];
    s.sites = [{ id: 'a', name: 'Example Eye Hospital', provider: '1111111A' }];
    s.hiddenPhrases = ['rv-s1'];
    s.phraseEdits = { 'rv-s2': 'Edited.' };
    const back = importSettings(exportSettings(s));
    expect(back).toEqual(s);
    expect(importSettings('{}')).toEqual(defaultSettings());
    expect(() => importSettings('[]')).toThrow();
  });

  it('keeps a provider number saved by an earlier version for hospitals without their own', () => {
    const old = JSON.stringify({ signer: { name: 'Dr A Example', provider: '3333333C' }, sites: [{ id: 'a', name: 'One' }, { id: 'b', name: 'Two', provider: '4444444D' }] });
    const back = importSettings(old);
    expect(back.sites.map((x) => x.provider)).toEqual(['3333333C', '4444444D']);
    expect('provider' in back.signer).toBe(false);
  });

  it('applies hides, edits and custom phrases', () => {
    const s = defaultSettings();
    s.hiddenPhrases = ['rv-s1'];
    s.phraseEdits = { 'rv-s2': 'Edited.' };
    s.customPhrases = [{ id: 'custom-1', type: 'review', section: 'status', text: 'Mine.', custom: true }];
    const phrases = effectivePhrases(s);
    expect(phrases.find((p) => p.id === 'rv-s1')).toBeUndefined();
    expect(phrases.find((p) => p.id === 'rv-s2')?.text).toBe('Edited.');
    expect(phrases.find((p) => p.id === 'custom-1')?.text).toBe('Mine.');
  });

  it('drops malformed custom phrases and out-of-range margins', () => {
    const back = importSettings(JSON.stringify({ customPhrases: [{ type: 'nope', text: 'x' }, { type: 'review', section: 'open', text: ' ' }], topMarginMm: 9999 }));
    expect(back.customPhrases).toEqual([]);
    expect(back.topMarginMm).toBe(defaultSettings().topMarginMm);
  });
});

describe('which settings an offline copy starts with', () => {
  const stored = '{"stored":true}';
  const built = '{"built":true}';

  it('uses the browser\'s own settings when there is no built-in copy', () => {
    expect(pickSettingsText(stored, 100, null, 0)).toEqual({ text: stored, fromEmbedded: false });
    expect(pickSettingsText(null, 0, null, 0)).toEqual({ text: null, fromEmbedded: false });
  });

  it('uses the built-in copy when the browser has none', () => {
    expect(pickSettingsText(null, 0, built, 50)).toEqual({ text: built, fromEmbedded: true });
  });

  it('prefers a built-in copy saved after the browser\'s settings last changed', () => {
    expect(pickSettingsText(stored, 100, built, 200)).toEqual({ text: built, fromEmbedded: true });
  });

  it('keeps edits made in the browser after the copy was saved', () => {
    expect(pickSettingsText(stored, 300, built, 200)).toEqual({ text: stored, fromEmbedded: false });
  });

  it('keeps the browser\'s settings for a copy saved before the time was recorded', () => {
    expect(pickSettingsText(stored, 100, built, 0)).toEqual({ text: stored, fromEmbedded: false });
  });
});
