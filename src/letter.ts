import { INTERVALS, SECTIONS, type ClinicId, type LetterType, type Phrase } from './phrases';
import { phrasesFor, type Consultant, type Settings, type Site } from './settings';

export type Sex = 'm' | 'f' | 'x';
export type ReferAs = 'title' | 'first' | 'this';

export interface PatientState {
  title: string;
  first: string;
  surname: string;
  dob: string;
  mrn: string;
  sex: Sex;
  refer: ReferAs;
}

export interface SummaryState {
  diagnosis: string;
  vaRE: string;
  vaLE: string;
  iopRE: string;
  iopLE: string;
  iopTarget: string;
  /** Eye used by {eye} in phrases. */
  eye: 'right' | 'left' | 'both';
  treatment: string;
  interval: string;
  planExtra: string;
}

export interface LetterState {
  type: LetterType;
  clinic: ClinicId;
  /** yyyy-mm-dd, as from a date input. */
  date: string;
  salutation: string;
  patient: PatientState;
  summary: SummaryState;
  /** What the patient was reviewed for; falls back to the first diagnosis line. */
  reason: string;
  ticks: Record<string, boolean>;
  /** Free text per section, keyed `${type}.${section}`. */
  freeText: Record<string, string>;
  consultantId: string;
  /** Which hospital the letter is from (a Site id), or '' when none are set up. */
  siteId: string;
  /** Hand-edited body paragraphs (blank-line separated); null = build from ticks. */
  bodyOverride: string | null;
}

export interface SummaryEntry {
  label: string;
  lines: string[];
}

export interface Letter {
  date: string;
  /** Patient lines; empty when nothing was entered. */
  patient: string[];
  summary: SummaryEntry[];
  salutation: string;
  paragraphs: string[];
  closing: string;
  signoff: string[];
}

export const PLACEHOLDER_PATIENT = 'PATIENT';

export function emptyPatient(): PatientState {
  return { title: 'Mr', first: '', surname: '', dob: '', mrn: '', sex: 'm', refer: 'title' };
}

export function emptySummary(): SummaryState {
  return { diagnosis: '', vaRE: '', vaLE: '', iopRE: '', iopLE: '', iopTarget: '', eye: 'both', treatment: '', interval: '6m', planExtra: '' };
}

// ---------- Token filling ----------

const PRONOUNS: Record<Sex, Record<string, string>> = {
  m: { he: 'he', his: 'his', him: 'him', himself: 'himself', is: 'is', has: 'has', does: 'does', was: 'was', s: 's' },
  f: { he: 'she', his: 'her', him: 'her', himself: 'herself', is: 'is', has: 'has', does: 'does', was: 'was', s: 's' },
  x: { he: 'they', his: 'their', him: 'them', himself: 'themselves', is: 'are', has: 'have', does: 'do', was: 'were', s: '' },
};

const EYE_WORDS = { right: 'right eye', left: 'left eye', both: 'both eyes' } as const;

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** How the patient is named in the body of the letter. */
export function patientRef(p: PatientState): string {
  if (p.refer === 'this') return 'this patient';
  if (p.refer === 'first') return p.first.trim() || PLACEHOLDER_PATIENT;
  const surname = p.surname.trim();
  if (!surname) return PLACEHOLDER_PATIENT;
  return [p.title.trim(), surname].filter(Boolean).join(' ');
}

export function reviewText(interval: string): string | null {
  return INTERVALS.find((i) => i.id === interval)?.review ?? null;
}

/** "6 months" -> "6 months' time"; "1 week" -> "1 week's time". */
export function possessiveTime(text: string): string {
  return `${text}${text.endsWith('s') ? "'" : "'s"} time`;
}

export function reasonFor(s: LetterState): string {
  const typed = s.reason.trim();
  if (typed) return typed;
  const firstLine = s.summary.diagnosis.split('\n')[0]?.trim();
  return firstLine || '[reason for review]';
}

/** Replaces {tokens} in a phrase. Unknown tokens are left as typed. */
export function fillTokens(text: string, s: LetterState): string {
  const pr = PRONOUNS[s.patient.sex];
  const review = reviewText(s.summary.interval);
  const values: Record<string, string> = {
    ...pr,
    pt: patientRef(s.patient),
    reason: reasonFor(s),
    eye: EYE_WORDS[s.summary.eye],
    review: review ?? '[review interval]',
    reviewtime: review ? possessiveTime(review) : '[review interval]',
    vare: s.summary.vaRE.trim() || '[RE VA]',
    vale: s.summary.vaLE.trim() || '[LE VA]',
    dob: s.patient.dob.trim() || '[DOB]',
  };
  return text.replace(/\{([A-Za-z]+)\}/g, (whole, key: string) => {
    const value = values[key.toLowerCase()];
    if (value === undefined) return whole;
    return key[0] === key[0].toUpperCase() ? cap(value) : value;
  });
}

// ---------- Body ----------

/** Body paragraphs built from ticked phrases and free text, in section order. */
export function buildParagraphs(s: LetterState, phrases: Phrase[]): string[] {
  const out: string[] = [];
  const sections = SECTIONS[s.type];
  const paraNumbers = [...new Set(sections.map((x) => x.para))];
  for (const para of paraNumbers) {
    const sentences: string[] = [];
    for (const section of sections.filter((x) => x.para === para)) {
      for (const ph of phrasesFor(phrases, s.type, section.id, s.clinic, true)) {
        if (s.ticks[ph.id]) sentences.push(fillTokens(ph.text, s).trim());
      }
      const free = (s.freeText[`${s.type}.${section.id}`] ?? '').trim();
      if (free) sentences.push(free);
    }
    if (sentences.length) out.push(sentences.join(' '));
  }
  return out;
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// ---------- Summary and sign-off ----------

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function buildSummary(sm: SummaryState): SummaryEntry[] {
  const out: SummaryEntry[] = [];
  const dx = lines(sm.diagnosis);
  if (dx.length) out.push({ label: 'Diagnosis', lines: dx });

  const va = [sm.vaRE.trim() && `RE ${sm.vaRE.trim()}`, sm.vaLE.trim() && `LE ${sm.vaLE.trim()}`].filter(Boolean).join(' ');
  if (va) out.push({ label: 'Visual Acuity', lines: [va] });

  const iop = [sm.iopRE.trim() && `RE ${sm.iopRE.trim()}`, sm.iopLE.trim() && `LE ${sm.iopLE.trim()}`].filter(Boolean).join(' ');
  const iopLines = [iop && `${iop} mmHg`, sm.iopTarget.trim() && `Target IOP ${sm.iopTarget.trim()}`].filter((x): x is string => Boolean(x));
  if (iopLines.length) out.push({ label: 'IOP', lines: iopLines });

  const tx = lines(sm.treatment);
  if (tx.length) out.push({ label: 'Treatment', lines: tx });

  const plan = [INTERVALS.find((i) => i.id === sm.interval)?.plan ?? '', sm.planExtra.trim()].filter(Boolean).join('. ');
  if (plan) out.push({ label: 'Plan', lines: [plan] });
  return out;
}

/** Fills {hospital} in a sign-off line; with no hospital chosen the placeholder and its comma are dropped. */
export function fillHospital(line: string, hospital: string): string {
  const name = hospital.trim();
  if (name) return line.replace(/\{hospital\}/gi, name).trim();
  return line
    .replace(/[,\s]*\{hospital\}/gi, '')
    .replace(/^[,\s]+/, '')
    .trim();
}

function providerLines(site?: Site): string[] {
  return (site?.provider ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/**
 * Signing in your own name (no consultant), once your position is set in settings:
 * name, position line(s), hospital, "Provider number: …", then any further provider lines.
 */
export function ownSignoff(settings: Settings, site?: Site): string[] {
  const hospital = site?.name.trim() ?? '';
  const position = settings.signer.position.split(/\r?\n/).map((l) => fillHospital(l, hospital)).filter(Boolean);
  const [firstProvider = '', ...moreProvider] = providerLines(site);
  const providerLine = !firstProvider || /provider/i.test(firstProvider) ? firstProvider : `Provider number: ${firstProvider}`;
  // The hospital gets its own line unless a position line already names it.
  const hospitalLine = hospital && !position.some((l) => l.includes(hospital)) ? hospital : '';
  return [settings.signer.name.trim() || '[Your name]', ...position, hospitalLine, providerLine, ...moreProvider].filter(Boolean);
}

/** Sign-off lines. Your provider number is the one set for the chosen hospital. */
export function buildSignoff(settings: Settings, consultant: Consultant | undefined, site?: Site): string[] {
  const { name, rolePrefix } = settings.signer;
  if (!consultant && settings.signer.position.trim()) return ownSignoff(settings, site);
  // The provider box can hold several lines: the first follows your name, the rest each get a line of their own.
  const [firstProvider = '', ...moreProvider] = (site?.provider ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [[name.trim() || '[Your name]', firstProvider].filter(Boolean).join(', '), ...moreProvider];
  if (consultant) {
    const who = [consultant.name.trim(), consultant.provider.trim()].filter(Boolean).join(', ');
    out.push(`${rolePrefix.trim() || 'Registrar to'} ${who}`.trim());
    out.push(...consultant.titles.map((t) => fillHospital(t, site?.name ?? '')).filter(Boolean));
  }
  return out;
}

export function formatDate(iso: string, format: 'iso' | 'dmy'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return format === 'dmy' ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function patientLines(p: PatientState): string[] {
  const name = [p.first.trim(), p.surname.trim()].filter(Boolean).join(' ');
  const out: string[] = [];
  if (name) out.push(`RE: ${name}`);
  if (p.dob.trim()) out.push(`DOB: ${p.dob.trim()}`);
  if (p.mrn.trim()) out.push(`MRN: ${p.mrn.trim()}`);
  return out;
}

/** Assembles the whole letter from the form state. */
export function buildLetter(s: LetterState, settings: Settings, phrases: Phrase[]): Letter {
  const consultant = settings.consultants.find((c) => c.id === s.consultantId);
  const site = settings.sites.find((x) => x.id === s.siteId);
  return {
    date: formatDate(s.date, settings.dateFormat),
    patient: patientLines(s.patient),
    summary: buildSummary(s.summary),
    salutation: s.salutation.trim() || 'Dear Doctor,',
    paragraphs: s.bodyOverride !== null ? splitParagraphs(s.bodyOverride) : buildParagraphs(s, phrases),
    closing: 'Yours sincerely,',
    signoff: buildSignoff(settings, consultant, site),
  };
}

// ---------- Output ----------

/**
 * Plain text for PowerChart: headings on their own line, left-aligned, blank line between blocks,
 * no symbols or formatting. The patient block is left out when no details were typed.
 */
export function toPlainText(l: Letter): string {
  const blocks: string[] = [l.date];
  if (l.patient.length) blocks.push(l.patient.join('\n'));
  for (const e of l.summary) blocks.push(`${e.label}:\n${e.lines.join('\n')}`);
  blocks.push(l.salutation);
  blocks.push(...l.paragraphs);
  blocks.push(`${l.closing}\n${l.signoff.join('\n')}`);
  return blocks.join('\n\n') + '\n';
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Anything still needing attention: a [bracketed prompt] or the PATIENT stand-in. */
export const PLACEHOLDER_RE = /\[[^\]\n]+\]|PATIENT/g;

export function findPlaceholders(l: Letter): string[] {
  const text = [l.date, ...l.patient, ...l.summary.flatMap((e) => e.lines), l.salutation, ...l.paragraphs, ...l.signoff].join('\n');
  return [...new Set(text.match(PLACEHOLDER_RE) ?? [])];
}

export interface HtmlOptions {
  /** Highlight placeholders (preview only). */
  mark: boolean;
  /** Fonts and spacing for pasting into Word. */
  inline: boolean;
}

function htmlText(text: string, opts: HtmlOptions): string {
  const safe = escapeHtml(text);
  return opts.mark ? safe.replace(PLACEHOLDER_RE, (m) => `<mark class="ph">${m}</mark>`) : safe;
}

/**
 * Letter as HTML. Left-aligned paragraphs and line breaks only: no tables or indents.
 * Leaves room for a patient sticker when no details were typed, and for a signature.
 */
export function toHtml(l: Letter, opts: HtmlOptions): string {
  const font = opts.inline ? 'font-family:Arial,Helvetica,sans-serif;font-size:11pt;' : '';
  const p = (inner: string, after = 10, align: 'left' | 'right' = 'left') =>
    `<p style="${font}margin:0 0 ${after}pt;text-align:${align};">${inner}</p>`;
  const t = (s: string) => htmlText(s, opts);

  // Date is right-aligned on the page; the PowerChart text stays left-aligned (toPlainText).
  const parts: string[] = [p(t(l.date), 10, 'right')];
  if (l.patient.length) parts.push(p(l.patient.map(t).join('<br>')));
  else parts.push(p('RE:<br><br><br><br>', 10));

  for (const [i, e] of l.summary.entries()) {
    const last = i === l.summary.length - 1;
    const head = `<strong>${t(e.label)}:</strong>`;
    const body = e.lines.length === 1 ? ` ${t(e.lines[0])}` : `<br>${e.lines.map(t).join('<br>')}`;
    parts.push(p(head + body, last ? 12 : 4));
  }

  parts.push(p(t(l.salutation)));
  for (const para of l.paragraphs) parts.push(p(t(para).replace(/\n/g, '<br>')));
  parts.push(p(`${t(l.closing)}<br><br><br>${l.signoff.map(t).join('<br>')}`, 0));
  return parts.join('\n');
}
