import { describe, expect, it } from 'vitest';
import { emptyPatient } from '../src/letter';
import {
  buildReferralEmail,
  composeLink,
  contactText,
  DEFAULT_REFERRAL_BODY,
  emptyReferral,
  fillReferral,
  firstName,
  indicationText,
  newDestination,
  parseContactDetails,
  parseEmails,
  referralHtml,
  referralPlaceholders,
  referralPlainText,
  referralSignoff,
  tidyPhone,
  type ReferralContext,
  type ReferralImage,
} from '../src/referral';
import { defaultSettings, exportSettings, importSettings } from '../src/settings';

// Invented people, places and addresses only.
function context(over: Partial<ReferralContext> = {}): ReferralContext {
  const settings = { ...defaultSettings(), signer: { name: 'Dr Alex Example', rolePrefix: 'Registrar to' }, sites: [{ id: 's1', name: 'Example Eye Clinic', provider: '1234567A' }] };
  const dest = { ...newDestination('d1'), label: 'Retina rooms', to: ['rooms@example.org', 'desk@example.org'], recipient: 'Dr B Sample' };
  return {
    patient: { ...emptyPatient(), first: 'Sam', surname: 'Smith', dob: '01/02/1950', mrn: '1234567' },
    referral: { ...emptyReferral(dest), condition: 'CRVO', eye: 'right', phone: '0400 000 000', address: '1 Example St, Sampleton NSW 2000' },
    dest,
    settings,
    site: settings.sites[0],
    date: '2026-01-05',
    ...over,
  };
}

const image = (over: Partial<ReferralImage> = {}): ReferralImage => ({ id: 'i1', src: 'data:image/png;base64,AAAA', width: 1200, height: 600, label: 'RE OCT', patientInfo: false, ...over });

describe('referral email text', () => {
  it('fills every token in the built-in text', () => {
    const text = fillReferral(DEFAULT_REFERRAL_BODY, context());
    expect(text).not.toMatch(/\{[a-z]+\}/i);
    expect(text).not.toMatch(/\[[^\]]+\]/);
    expect(text).toContain('RE: Sam Smith\nDOB: 01/02/1950\nMRN: 1234567\nPhone: 0400 000 000\nAddress: 1 Example St, Sampleton NSW 2000');
    expect(text).toContain("I'm one of the ophthalmology registrars at Example Eye Clinic.");
    expect(text).toContain('refer the above patient to Dr B Sample for intravitreal anti-VEGF injections for CRVO in the right eye.');
    expect(text).toContain('I have attached clinic notes.');
    expect(text).toContain('They should ideally be seen within a week.');
    expect(text.endsWith('All the best,\nAlex\n\nDr Alex Example, 1234567A\nExample Eye Clinic')).toBe(true);
  });

  it('leaves highlighted prompts for missing details', () => {
    const c = context({ patient: emptyPatient() });
    c.referral = { ...c.referral, phone: '', address: '', condition: '' };
    const e = buildReferralEmail(c);
    expect(referralPlaceholders(e)).toEqual(expect.arrayContaining(['[patient name]', '[DOB]', '[MRN]', '[contact details]', '[indication]']));
  });

  it('points to the screenshot when contact details are not typed', () => {
    const r = { ...emptyReferral(), images: [image({ patientInfo: true, label: '' })] };
    expect(contactText(r)).toBe('Contact details: see the patient details screenshot below');
    expect(contactText({ ...r, phone: '0400 000 000' })).toBe('Phone: 0400 000 000');
  });

  it('mentions an attached optometrist or GP referral', () => {
    const c = context();
    c.referral.otherReferral = "optometrist's referral";
    expect(fillReferral('{attachments}', c)).toBe("clinic notes and the optometrist's referral");
  });

  it('words the indication', () => {
    expect(indicationText('BRVO', 'left')).toBe('BRVO in the left eye');
    expect(indicationText('DMO', 'both')).toBe('DMO in both eyes');
    expect(indicationText('nAMD', '')).toBe('nAMD');
    expect(indicationText('', 'right')).toBe('[indication] in the right eye');
  });

  it('uses the destination’s own text when set, and leaves unknown tokens', () => {
    const c = context();
    c.dest.body = 'To {recipient}: {patient} {unknown}';
    expect(buildReferralEmail(c).text).toBe('To Dr B Sample: Sam Smith {unknown}');
  });

  it('signs off with name, provider number and hospital', () => {
    const c = context();
    expect(referralSignoff(c.settings, c.site)).toEqual(['Dr Alex Example, 1234567A', 'Example Eye Clinic']);
    expect(referralSignoff(c.settings, { id: 'x', name: 'Other Clinic', provider: '111A\nExtra line' })).toEqual(['Dr Alex Example, 111A', 'Extra line', 'Other Clinic']);
    expect(firstName('Dr Alex Example')).toBe('Alex');
    expect(firstName('Prof. Jo Sample')).toBe('Jo');
  });
});

describe('referral email output', () => {
  it('puts clinical images first, each under its label, then the patient details', () => {
    const c = context();
    c.referral.images = [image({ id: 'p', patientInfo: true, label: '' }), image({ id: 'a', label: '' }), image({ id: 'b', label: 'LE OCT', width: 300, height: 100 })];
    const e = buildReferralEmail(c);
    expect(e.images.map((i) => i.id)).toEqual(['a', 'b', 'p']);
    const html = referralHtml(e);
    expect(html.indexOf('<b>Image 1</b>')).toBeLessThan(html.indexOf('<b>LE OCT</b>'));
    expect(html.indexOf('<b>LE OCT</b>')).toBeLessThan(html.indexOf('<b>Patient details</b>'));
    expect(html).toContain('width="640" height="320"');
    expect(html).toContain('width="300" height="100"');
    expect(html).not.toMatch(/font-family/);
    expect(referralPlainText(e)).toContain('[Image: Image 1]\n[Image: LE OCT]\n[Image: Patient details]');
  });

  it('escapes typed text and marks prompts only in the preview', () => {
    const c = context({ patient: { ...emptyPatient(), first: '<b>', surname: 'O’Brien & Co' } });
    const e = buildReferralEmail(c);
    expect(referralHtml(e)).toContain('RE: &lt;b&gt; O’Brien &amp; Co');
    c.patient.mrn = '';
    expect(referralHtml(buildReferralEmail(c), { mark: true })).toContain('<mark class="ph">[MRN]</mark>');
    expect(referralHtml(buildReferralEmail(c))).not.toContain('<mark');
  });

  it('builds a compose link with addresses and subject only', () => {
    const e = buildReferralEmail(context());
    const web = composeLink(e, 'web');
    expect(web).toBe('https://outlook.office.com/mail/deeplink/compose?to=rooms@example.org,desk@example.org&subject=New%20referral%20for%20IVI');
    for (const secret of ['Smith', '1234567', '1950', '0400', 'Sampleton']) expect(web).not.toContain(secret);
    expect(composeLink({ ...e, cc: ['me@example.org'] }, 'mailto')).toBe('mailto:rooms@example.org,desk@example.org?cc=me@example.org&subject=New%20referral%20for%20IVI');
  });

  it('notices a destination with no addresses', () => {
    const c = context();
    c.dest.to = [];
    expect(referralPlaceholders(buildReferralEmail(c))).toContain('[no email addresses set for this destination]');
  });

  it('reads addresses typed with any separator', () => {
    expect(parseEmails('a@example.org; b@example.org,\n<c@example.org> not-an-address')).toEqual(['a@example.org', 'b@example.org', 'c@example.org']);
  });
});

describe('contact details from a screenshot', () => {
  it('reads labelled phones and a home address over two lines', () => {
    const text = [
      'SMITH, Sam   MRN:1234567   DOB:01-02-1950',
      'Home Address: 12 EXAMPLE STREET',
      'SAMPLETON NSW 2000',
      'Postal Address: PO Box 1, Otherplace NSW 2001',
      'Home Phone: (02) 9000 0000',
      'Mobile Phone: 0400111222',
      'Medicare: 1234 56789 0',
    ].join('\n');
    expect(parseContactDetails(text)).toEqual({ phone: '0400 111 222 (mobile), 02 9000 0000 (home)', address: '12 Example Street, Sampleton NSW 2000' });
  });

  it('finds an unlabelled number and an address line', () => {
    const text = 'Patient Information\nContact: +61 400 333 444\n5/7 Sample Rd, Exampleville NSW 2150\nGP: Example Medical Centre, 1 Main St, Town NSW 2000';
    expect(parseContactDetails(text)).toEqual({ phone: '0400 333 444', address: '5/7 Sample Rd, Exampleville NSW 2150' });
  });

  it('returns blanks when nothing looks like contact details', () => {
    expect(parseContactDetails('MRN:1234567 DOB:01-02-1950\nAllergies: none')).toEqual({ phone: '', address: '' });
  });

  it('tidies phone numbers', () => {
    expect(tidyPhone('0400-111-222')).toBe('0400 111 222');
    expect(tidyPhone('+61 2 9000 0000')).toBe('02 9000 0000');
    expect(tidyPhone('12345')).toBe('12345');
  });
});

describe('referral settings', () => {
  it('round-trips destinations and fills defaults for older settings', () => {
    const old = importSettings(JSON.stringify({ version: 1, signer: { name: 'Dr A Example' } }));
    expect(old.referrals).toEqual([]);
    expect(old.composeWith).toBe('web');
    const s = { ...defaultSettings(), referrals: [{ ...newDestination('r1'), label: 'Rooms', to: ['rooms@example.org'] }], composeWith: 'mailto' as const };
    expect(importSettings(exportSettings(s))).toEqual(s);
    const partial = importSettings(JSON.stringify({ referrals: [{ id: 'x', to: ['a@example.org'] }], composeUrl: 'javascript:alert(1)' }));
    expect(partial.referrals[0].subject).toBe('New referral for IVI');
    expect(partial.composeUrl).toBe('https://outlook.office.com/mail/deeplink/compose');
  });
});
