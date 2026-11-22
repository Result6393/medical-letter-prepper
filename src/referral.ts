// Email referrals: a short referral email (e.g. for injections at private rooms that bulk bill),
// prepared for Outlook. The addresses and subject go in a compose link; the body, which holds the
// patient's details and the pasted images, goes by clipboard only, so it is never in a URL or the
// browser history.
//
// Tokens in a destination's email text (filled by fillReferral):
//   {patient}     the patient's first name and surname
//   {dob} {mrn}   as typed
//   {contact}     "Phone: …" and "Address: …" lines (or a pointer to the screenshot below)
//   {phone} {address}
//   {indication}  condition and eye, e.g. "CRVO in the right eye"
//   {treatment}   e.g. "intravitreal anti-VEGF injections"
//   {urgency}     e.g. "within a week"
//   {attachments} "clinic notes", plus the other referral when one is attached
//   {recipient}   who the destination is addressed to, e.g. "Dr A Example"
//   {hospital}    the chosen hospital's name
//   {name}        your first name
//   {signoff}     your full name and provider number, then the hospital
//   {date}        today's date
import { formatDate, PLACEHOLDER_RE, type PatientState } from './letter';
import type { Settings, Site } from './settings';

export interface ReferralDest {
  id: string;
  /** Shown on the referral screen, e.g. "Medical retina rooms (IVI)". */
  label: string;
  to: string[];
  cc: string[];
  /** Fills {recipient}, e.g. "Dr A Example". */
  recipient: string;
  /** Kept free of patient details: it goes in the compose link. */
  subject: string;
  /** Email text; blank uses DEFAULT_REFERRAL_BODY. */
  body: string;
  /** Reminders ticked off on the referral screen (attach the notes, hand over the card…). */
  checklist: string[];
  /** Shown on the referral screen, e.g. a fax number to use instead. */
  notes: string;
  /** Suggested treatment, e.g. "intravitreal anti-VEGF injections". */
  treatment: string;
}

export type ReferralEye = 'right' | 'left' | 'both' | '';

export interface ReferralImage {
  id: string;
  /** data: URL of the prepared (possibly shrunk) picture. */
  src: string;
  width: number;
  height: number;
  label: string;
  /** The screenshot of the patient's details (contact, address), as opposed to a clinical image. */
  patientInfo: boolean;
}

export interface ReferralState {
  destId: string;
  phone: string;
  address: string;
  condition: string;
  eye: ReferralEye;
  treatment: string;
  urgency: string;
  /** Other referral attached as well: '', "optometrist's referral", "GP's referral". */
  otherReferral: string;
  images: ReferralImage[];
  checks: Record<string, boolean>;
}

export const DEFAULT_REFERRAL_SUBJECT = 'New referral for IVI';
export const DEFAULT_TREATMENT = 'intravitreal anti-VEGF injections';
export const DEFAULT_URGENCY = 'within a week';

export const DEFAULT_REFERRAL_BODY = [
  'RE: {patient}',
  'DOB: {dob}',
  'MRN: {mrn}',
  '{contact}',
  '',
  'Hi All,',
  '',
  "I'm one of the ophthalmology registrars at {hospital}. I am hoping to refer the above patient to {recipient} for {treatment} for {indication}.",
  'I have attached {attachments}. This email can act as a referral. Please note that the patient is being referred from a public hospital.',
  '',
  'Could you please contact the patient to make an appointment. They should ideally be seen {urgency}.',
  'Please let me know if you need any further information.',
  '',
  'All the best,',
  '{name}',
  '',
  '{signoff}',
].join('\n');

export const DEFAULT_CHECKLIST = [
  'EMR notes PDF attached',
  'Optometrist / GP referral attached, if there is one',
  'Patient given the rooms’ business card',
];

export const CONDITIONS = [
  'CRVO',
  'BRVO',
  'hemi-retinal vein occlusion',
  'diabetic macular oedema',
  'proliferative diabetic retinopathy',
  'neovascular AMD',
  'macular oedema',
  'choroidal neovascularisation',
  'neovascular glaucoma',
];

export const TREATMENTS = ['intravitreal anti-VEGF injections', 'an intravitreal anti-VEGF injection', 'PRP laser', 'assessment and treatment'];

export const URGENCIES = ['within a week', 'within 2 weeks', 'within 4 weeks', 'as soon as possible'];

export const OTHER_REFERRALS = [
  { value: '', label: 'None' },
  { value: "optometrist's referral", label: 'Optometrist’s' },
  { value: "GP's referral", label: 'GP’s' },
];

export const IMAGE_LABELS = ['RE OCT', 'LE OCT', 'RE fundus photo', 'LE fundus photo', 'RE widefield', 'LE widefield', 'RE FFA', 'LE FFA', 'RE OCT angiography', 'LE OCT angiography'];

export const PATIENT_INFO_LABEL = 'Patient details';

export const DEFAULT_COMPOSE_URL = 'https://outlook.office.com/mail/deeplink/compose';

export function newDestination(id = `r${Date.now().toString(36)}`): ReferralDest {
  return {
    id,
    label: '',
    to: [],
    cc: [],
    recipient: '',
    subject: DEFAULT_REFERRAL_SUBJECT,
    body: '',
    checklist: [...DEFAULT_CHECKLIST],
    notes: '',
    treatment: DEFAULT_TREATMENT,
  };
}

export function emptyReferral(dest?: ReferralDest): ReferralState {
  return {
    destId: dest?.id ?? '',
    phone: '',
    address: '',
    condition: '',
    eye: '',
    treatment: dest?.treatment.trim() || DEFAULT_TREATMENT,
    urgency: DEFAULT_URGENCY,
    otherReferral: '',
    images: [],
    checks: {},
  };
}

// ---------- Filling the email ----------

const EYE_TEXT: Record<Exclude<ReferralEye, ''>, string> = { right: 'the right eye', left: 'the left eye', both: 'both eyes' };

/** "CRVO in the right eye"; "[indication]" when nothing is chosen. */
export function indicationText(condition: string, eye: ReferralEye): string {
  const c = condition.trim();
  if (!c) return eye ? `[indication] in ${EYE_TEXT[eye]}` : '[indication]';
  return eye ? `${c} in ${EYE_TEXT[eye]}` : c;
}

export function attachmentsText(otherReferral: string): string {
  const other = otherReferral.trim();
  return other ? `clinic notes and the ${other}` : 'clinic notes';
}

/** Contact lines for the top of the email. */
export function contactText(r: Pick<ReferralState, 'phone' | 'address' | 'images'>): string {
  const lines = [r.phone.trim() && `Phone: ${r.phone.trim()}`, r.address.trim() && `Address: ${r.address.trim().replace(/\s*\n\s*/g, ', ')}`].filter(Boolean);
  if (lines.length) return lines.join('\n');
  return r.images.some((i) => i.patientInfo) ? 'Contact details: see the patient details screenshot below' : '[contact details]';
}

export function firstName(fullName: string): string {
  return fullName.trim().replace(/^(dr\.?|doctor|prof\.?|professor|a\/prof\.?)\s+/i, '').split(/\s+/)[0] ?? '';
}

/** Your name with the provider number for this hospital, any further provider lines, then the hospital. */
export function referralSignoff(settings: Settings, site?: Site): string[] {
  const [firstProvider = '', ...more] = (site?.provider ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const name = settings.signer.name.trim() || '[your name]';
  return [[name, firstProvider].filter(Boolean).join(', '), ...more, site?.name.trim() ?? ''].filter(Boolean);
}

export interface ReferralContext {
  patient: PatientState;
  referral: ReferralState;
  dest: ReferralDest;
  settings: Settings;
  site?: Site;
  /** yyyy-mm-dd */
  date: string;
}

/** The email text with every token filled. Blank values become [bracketed] prompts. */
export function fillReferral(template: string, c: ReferralContext): string {
  const p = c.patient;
  const name = [p.first.trim(), p.surname.trim()].filter(Boolean).join(' ');
  const values: Record<string, string> = {
    patient: name || '[patient name]',
    dob: p.dob.trim() || '[DOB]',
    mrn: p.mrn.trim() || '[MRN]',
    contact: contactText(c.referral),
    phone: c.referral.phone.trim() || '[phone]',
    address: c.referral.address.trim().replace(/\s*\n\s*/g, ', ') || '[address]',
    indication: indicationText(c.referral.condition, c.referral.eye),
    treatment: c.referral.treatment.trim() || '[treatment]',
    urgency: c.referral.urgency.trim() || '[how soon]',
    attachments: attachmentsText(c.referral.otherReferral),
    recipient: c.dest.recipient.trim() || '[recipient]',
    hospital: c.site?.name.trim() || '[hospital]',
    name: firstName(c.settings.signer.name) || '[your name]',
    signoff: referralSignoff(c.settings, c.site).join('\n'),
    date: formatDate(c.date, c.settings.dateFormat),
  };
  return template
    .replace(/\r\n?/g, '\n')
    .replace(/\{([A-Za-z]+)\}/g, (whole, key: string) => values[key.toLowerCase()] ?? whole)
    .trimEnd();
}

export interface ReferralEmail {
  to: string[];
  cc: string[];
  subject: string;
  /** Plain text of the body (images are not in it). */
  text: string;
  /** Images in the order they go in the email: clinical images first, then the patient details. */
  images: ReferralImage[];
}

export function buildReferralEmail(c: ReferralContext): ReferralEmail {
  const clinical = c.referral.images.filter((i) => !i.patientInfo);
  const info = c.referral.images.filter((i) => i.patientInfo);
  return {
    to: c.dest.to,
    cc: c.dest.cc,
    subject: c.dest.subject.trim() || DEFAULT_REFERRAL_SUBJECT,
    text: fillReferral(c.dest.body.trim() ? c.dest.body : DEFAULT_REFERRAL_BODY, c),
    images: [...clinical, ...info],
  };
}

export function imageLabel(img: ReferralImage, index: number): string {
  return img.label.trim() || (img.patientInfo ? PATIENT_INFO_LABEL : `Image ${index + 1}`);
}

/** Things still to fill in, as listed under the buttons. */
export function referralPlaceholders(e: ReferralEmail): string[] {
  const left = new Set(e.text.match(PLACEHOLDER_RE) ?? []);
  if (!e.to.length) left.add('[no email addresses set for this destination]');
  return [...left];
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Widest an image is shown in the email; the full-size picture is still sent. */
export const EMAIL_IMAGE_WIDTH = 640;

/**
 * Body as HTML for pasting into Outlook: the text, then each image under its label in bold.
 * No fonts are set, so the email keeps Outlook's own.
 */
export function referralHtml(e: ReferralEmail, opts: { mark?: boolean } = {}): string {
  const text = (s: string) => {
    const safe = escapeHtml(s);
    return opts.mark ? safe.replace(PLACEHOLDER_RE, (m) => `<mark class="ph">${m}</mark>`) : safe;
  };
  const paragraphs = e.text
    .split(/\n\s*\n/)
    .map((para) => `<p>${para.split('\n').map(text).join('<br>')}</p>`);
  const images = e.images.map((img, i) => {
    const w = Math.min(EMAIL_IMAGE_WIDTH, img.width);
    const hgt = Math.round((img.height * w) / Math.max(1, img.width));
    const label = escapeHtml(imageLabel(img, i));
    return `<p><b>${label}</b><br><img src="${img.src}" alt="${label}" width="${w}" height="${hgt}"></p>`;
  });
  return [...paragraphs, ...images].join('\n');
}

/** Plain-text body, with a line for each image. */
export function referralPlainText(e: ReferralEmail): string {
  const images = e.images.map((img, i) => `[Image: ${imageLabel(img, i)}]`);
  return [e.text, ...(images.length ? ['', images.join('\n')] : [])].join('\n') + '\n';
}

/**
 * Opens a new email with the addresses and subject only. Outlook on the web takes comma-separated
 * addresses; a mailto: link is for whatever mail app the computer opens.
 */
export function composeLink(e: Pick<ReferralEmail, 'to' | 'cc' | 'subject'>, how: 'web' | 'mailto', baseUrl = DEFAULT_COMPOSE_URL): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/%40/g, '@');
  const list = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).map(enc).join(',');
  const params = [e.cc.length ? `cc=${list(e.cc)}` : '', `subject=${enc(e.subject)}`].filter(Boolean);
  if (how === 'mailto') return `mailto:${list(e.to)}?${params.join('&')}`;
  return `${baseUrl.trim() || DEFAULT_COMPOSE_URL}?${[`to=${list(e.to)}`, ...params].join('&')}`;
}

export function parseEmails(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim().replace(/^<|>$/g, ''))
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

// ---------- Reading contact details from a screenshot ----------

export interface ContactDetails {
  phone: string;
  address: string;
}

const STATES = '(?:NSW|VIC|QLD|ACT|SA|WA|TAS|NT)';
const STATE_POSTCODE = new RegExp(`\\b${STATES}\\b[ ,]*\\d{4}\\b`, 'i');

/** 0412345678 -> 0412 345 678; 0298765432 -> 02 9876 5432; anything else as read. */
export function tidyPhone(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+61')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('61') && digits.length === 11) digits = '0' + digits.slice(2);
  if (/^04\d{8}$/.test(digits)) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (/^0[2378]\d{8}$/.test(digits)) return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  return raw.trim();
}

const PHONE_RE = /(?:\+?61[\s-]?|\(?0)[2-478]\)?(?:[\s-]?\d){8}\b/g;
const PHONE_LABEL = /\b(mobile|mob|cell|home|work|business|bus|day|evening|phone|ph|tel|contact)\b/i;

function tidyAddress(text: string): string {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/^[,:;.\s-]+|[,;\s-]+$/g, '')
    .trim();
  if (cleaned !== cleaned.toUpperCase()) return cleaned;
  // ALL CAPS: title case the words, keep the state in capitals.
  return cleaned.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(new RegExp(`\\b${STATES}\\b`, 'gi'), (m) => m.toUpperCase());
}

/**
 * Picks phone numbers and an address out of text read from a screenshot of the patient's details.
 * A best guess: always checked by the user, and the screenshot itself goes in the email too.
 */
export function parseContactDetails(text: string): ContactDetails {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const labelName = (l: string) => (/^(mobile|mob|cell)$/.test(l) ? 'mobile' : l === 'home' ? 'home' : /^(work|business|bus|day)$/.test(l) ? 'work' : '');
  // Phones: labelled numbers first (mobile before others), then any Australian-looking number.
  const found: { number: string; label: string }[] = [];
  for (const line of lines) {
    if (/\b(MRN|DOB|Medicare|IHI|DVA|Fax)\b/i.test(line)) continue;
    let from = 0;
    for (const m of line.matchAll(PHONE_RE)) {
      const number = tidyPhone(m[0]);
      // The words between the previous number and this one, e.g. "Mobile Phone:".
      const words = (line.slice(from, m.index).match(new RegExp(PHONE_LABEL.source, 'gi')) ?? []).map((w) => w.toLowerCase());
      from = (m.index ?? 0) + m[0].length;
      if (found.some((f) => f.number === number)) continue;
      found.push({ number, label: words.map(labelName).find(Boolean) ?? '' });
    }
  }
  const ordered = [...found].sort((a, b) => Number(b.number.startsWith('04')) - Number(a.number.startsWith('04')));
  const phone = ordered
    .slice(0, 3)
    .map((f) => (f.label ? `${f.number} (${f.label})` : f.number))
    .join(', ');

  // Address: a labelled line (home / residential before postal), carried onto the next lines
  // until the state and postcode; otherwise any line ending in a state and postcode.
  const labelRe = /\b(?:(home|residential|street|usual|postal|mailing)\s+)?address\b\s*[:;-]?\s*/i;
  let address = '';
  let best = -1;
  lines.forEach((line, i) => {
    const m = labelRe.exec(line);
    if (!m) return;
    if (/\b(email|e-mail)\b/i.test(line.slice(0, m.index + m[0].length))) return;
    const rank = m[1] && /postal|mailing/i.test(m[1]) ? 0 : 1;
    if (rank <= best) return;
    const parts = [line.slice(m.index + m[0].length)];
    for (let j = i + 1; j < Math.min(lines.length, i + 3) && !STATE_POSTCODE.test(parts.join(' ')); j++) {
      if (/:/.test(lines[j]) && !STATE_POSTCODE.test(lines[j])) break;
      parts.push(lines[j]);
    }
    const joined = parts.join(', ');
    const end = STATE_POSTCODE.exec(joined);
    const value = end ? joined.slice(0, end.index + end[0].length) : joined;
    if (value.replace(/[^A-Za-z0-9]/g, '').length < 6) return;
    address = tidyAddress(value);
    best = rank;
  });
  if (!address) {
    const line = lines.find((l) => STATE_POSTCODE.test(l) && /\d+[A-Za-z]?\s+[A-Za-z]/.test(l) && !/\b(hospital|clinic|GP|practice|medical)\b/i.test(l));
    if (line) {
      const end = STATE_POSTCODE.exec(line)!;
      address = tidyAddress(line.slice(0, end.index + end[0].length).replace(/^.*?:\s*/, ''));
    }
  }
  return { phone, address };
}
