import './style.css';
import { chips, datalist, field, h, option, safeStorage, download } from './dom';
import {
  buildLetter,
  buildParagraphs,
  emptyPatient,
  emptySummary,
  fillTokens,
  findPlaceholders,
  toHtml,
  toPlainText,
  type LetterState,
} from './letter';
import { DOCX_MIME, fillTemplate, fromBase64, mergeTemplates, parseStoredTemplate, parseTemplateMap, readLetterhead, stripTemplate, TEMPLATE_KEY, TEMPLATES_KEY, TEMPLATES_UPDATED_KEY, toBase64, type StoredTemplate, type TemplateMap } from './docx';
import { copyPlain, copyRich, capturePristine, embeddedSavedAt, embeddedSettings, embeddedTemplate, printPage, withEmbeddedSettings } from './output';
import { readText } from './ocr';
import { foundAnything, parsePatientHeader } from './patientheader';
import { letterheadPage, plainPage } from './printhtml';
import { CLINICS, DIAGNOSES, DRUGS, EYES, FREQUENCIES, INTERVALS, LETTER_TYPES, SECTIONS, TITLES, VA_OPTIONS, type ClinicId, type LetterType } from './phrases';
import { effectivePhrases, exportSettings, loadSettings, phrasesFor, pickSettingsText, saveSettings, STORAGE_KEY, SYNC_APP, type Settings } from './settings';
import { openSettings } from './settings-view';
import { emptyReferral, type ReferralState } from './referral';
import { createReferralView, currentDest, type ReferralView } from './referral-view';
import { pullBeforeStart, pushSoon } from './sync.js';

// Captured before anything is drawn, so "download offline copy" can save a clean page.
const pristine = capturePristine();
const store = safeStorage();
const PREFS_KEY = 'letter-builder.prefs';

const SALUTATIONS = ['Dear Doctor,', 'Dear Optometrist,', 'To whom it may concern,'];
const DEFAULT_SALUTATION: Record<LetterType, string> = {
  review: 'Dear Doctor,',
  discharge: 'Dear Doctor,',
  referral: 'Dear Doctor,',
  support: 'To whom it may concern,',
};
const DEFAULT_INTERVAL: Record<LetterType, string> = { review: '6m', discharge: 'dc', referral: 'none', support: 'none' };

type Mode = 'letter' | 'referral';

interface Prefs {
  /** Which screen was last used: the letter or the email referral. */
  mode: Mode;
  siteId: string;
  /** Print with the letterhead drawn in (off for pre-printed paper). */
  printLetterhead: boolean;
  clinic: ClinicId;
  type: LetterType;
  consultantId: string;
}

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(store?.getItem(PREFS_KEY) || 'null') as Partial<Prefs> | null;
    return {
      mode: p?.mode === 'referral' ? 'referral' : 'letter',
      clinic: CLINICS.some((c) => c.id === p?.clinic) ? (p!.clinic as ClinicId) : 'general',
      type: LETTER_TYPES.some((t) => t.id === p?.type) ? (p!.type as LetterType) : 'review',
      consultantId: typeof p?.consultantId === 'string' ? p.consultantId : '',
      siteId: typeof p?.siteId === 'string' ? p.siteId : '',
      printLetterhead: p?.printLetterhead !== false,
    };
  } catch {
    return { mode: 'letter', clinic: 'general', type: 'review', consultantId: '', siteId: '', printLetterhead: true };
  }
}

function savePrefs(): void {
  try {
    store?.setItem(PREFS_KEY, JSON.stringify({ mode, clinic: state.clinic, type: state.type, consultantId: state.consultantId, siteId: state.siteId, printLetterhead } satisfies Prefs));
  } catch {
    // Not saved: fine.
  }
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function freshState(prefs: Prefs): LetterState {
  return {
    type: prefs.type,
    clinic: prefs.clinic,
    date: today(),
    salutation: DEFAULT_SALUTATION[prefs.type],
    patient: emptyPatient(),
    summary: { ...emptySummary(), interval: DEFAULT_INTERVAL[prefs.type] },
    reason: '',
    ticks: {},
    freeText: {},
    consultantId: prefs.consultantId,
    siteId: prefs.siteId,
    bodyOverride: null,
  };
}

let settings: Settings;
let state: LetterState;
let showAllClinics = false;
/** Letterheads by hospital id, body text already stripped. Kept in this browser only. */
let templates: TemplateMap = {};
let printLetterhead = true;
let mode: Mode = 'letter';
/** The email referral being prepared. Patient, hospital and date are shared with the letter. */
let referral: ReferralState;
let referralView: ReferralView;

const currentTemplate = (): StoredTemplate | null => templates[state.siteId] ?? null;
const currentSiteName = (): string => settings.sites.find((s) => s.id === state.siteId)?.name || 'this hospital';

/** Keeps the chosen hospital valid when hospitals are added or removed. */
function fixSite(): void {
  if (!settings.sites.some((s) => s.id === state.siteId)) state.siteId = settings.sites[0]?.id ?? '';
}

function saveTemplates(): boolean {
  try {
    store?.setItem(TEMPLATES_KEY, JSON.stringify(templates));
    store?.setItem(TEMPLATES_UPDATED_KEY, String(Date.now()));
    return Boolean(store);
  } catch {
    return false;
  }
}

// Pieces of the screen that need updating.
const app = document.getElementById('app')!;
let controlsEl: HTMLElement;
let outputEl: HTMLElement;
let modeChips: { el: HTMLElement; sync: () => void };
let newButton: HTMLButtonElement;
let paper: HTMLElement;
let statusEl: HTMLElement;
let overridePanel: HTMLElement;
let overrideBox: HTMLTextAreaElement;
let phraseLabels: { id: string; text: string; el: HTMLElement }[] = [];
let statusTimer: number | undefined;

function currentLetter() {
  return buildLetter(state, settings, effectivePhrases(settings));
}

function say(message: string, ms = 4000): void {
  statusEl.textContent = message;
  statusEl.classList.add('flash');
  clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    statusEl.classList.remove('flash');
    updatePreview();
  }, ms);
}

function updatePreview(): void {
  if (mode === 'referral') return referralView.update();
  const letter = currentLetter();
  paper.innerHTML = toHtml(letter, { mark: true, inline: false });
  for (const l of phraseLabels) l.el.textContent = fillTokens(l.text, state);
  if (!statusEl.classList.contains('flash')) {
    const left = findPlaceholders(letter);
    statusEl.textContent = left.length ? `Still to fill: ${left.join('  ·  ')}` : 'Nothing left to fill in.';
    statusEl.classList.toggle('warn', left.length > 0);
  }
  overridePanel.hidden = state.bodyOverride === null;
}

function touch(): void {
  savePrefs();
  updatePreview();
}

// ---------- Controls ----------

function card(title: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return h('section', { class: 'card' }, h('h2', null, title), ...children);
}

function bind<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(el: T, get: () => string, set: (v: string) => void): T {
  el.value = get();
  el.addEventListener('input', () => {
    set(el.value);
    touch();
  });
  return el;
}

function buildControls(): HTMLElement {
  const root = h('div', { class: 'controls' });
  phraseLabels = [];
  const clinicLabel = CLINICS.find((c) => c.id === state.clinic)?.label ?? '';

  // --- Letter ---
  const typeChips = chips(
    LETTER_TYPES.map((t) => ({ value: t.id, label: t.label, title: t.blurb })),
    () => state.type,
    (v) => {
      state.type = v;
      state.salutation = DEFAULT_SALUTATION[v];
      state.summary.interval = DEFAULT_INTERVAL[v];
      state.bodyOverride = null;
      rebuild();
    },
    'chips big',
  );
  const clinicSel = h('select', null, ...CLINICS.map((c) => option(c.id, c.label, c.id === state.clinic)));
  clinicSel.addEventListener('change', () => {
    state.clinic = clinicSel.value as ClinicId;
    rebuild();
  });
  const dateInput = bind(h('input', { type: 'date' }), () => state.date, (v) => (state.date = v));
  const siteChips = chips(
    settings.sites.map((s) => ({ value: s.id, label: s.name || '(unnamed hospital)' })),
    () => state.siteId,
    (v) => {
      state.siteId = v;
      rebuild();
    },
  );
  root.append(
    card(
      'Letter',
      settings.sites.length ? field('Hospital', siteChips.el, currentTemplate() ? undefined : 'No letterhead loaded for this hospital yet (Settings → Hospitals)') : null,
      typeChips.el,
      h('div', { class: 'grid2' }, field('Clinic', clinicSel, 'Changes which phrases and drugs are offered'), field('Date', dateInput)),
    ),
  );

  // --- To ---
  const salOptions = [...SALUTATIONS, ...settings.recipients.map((r) => `Dear ${r},`)];
  const salSel = h('select', null, ...salOptions.map((s) => option(s, s)), option('__custom__', 'Other…'));
  const salCustom = h('input', { type: 'text', placeholder: 'Dear Dr …,' });
  const syncSal = () => {
    const known = salOptions.includes(state.salutation);
    salSel.value = known ? state.salutation : '__custom__';
    salCustom.hidden = known;
    salCustom.value = known ? '' : state.salutation;
  };
  salSel.addEventListener('change', () => {
    state.salutation = salSel.value === '__custom__' ? 'Dear Dr ,' : salSel.value;
    syncSal();
    if (salSel.value === '__custom__') salCustom.focus();
    touch();
  });
  salCustom.addEventListener('input', () => {
    state.salutation = salCustom.value;
    touch();
  });
  syncSal();
  root.append(card('To', field('Salutation', salSel), salCustom));

  // --- Patient ---
  const sexChips = chips(
    [
      { value: 'm', label: 'He' },
      { value: 'f', label: 'She' },
      { value: 'x', label: 'They' },
    ],
    () => state.patient.sex,
    (v) => {
      state.patient.sex = v;
      if (v === 'm' && ['Ms', 'Mrs', 'Miss'].includes(state.patient.title)) titleSel.value = state.patient.title = 'Mr';
      if (v === 'f' && state.patient.title === 'Mr') titleSel.value = state.patient.title = 'Ms';
      touch();
    },
  );
  const titleSel = h('select', null, ...TITLES.map((t) => option(t, t, t === state.patient.title)));
  titleSel.addEventListener('change', () => {
    state.patient.title = titleSel.value;
    touch();
  });
  const referChips = chips(
    [
      { value: 'title', label: 'Mr Smith' },
      { value: 'first', label: 'First name' },
      { value: 'this', label: 'This patient' },
    ],
    () => state.patient.refer,
    (v) => {
      state.patient.refer = v;
      touch();
    },
  );
  root.append(
    card(
      'Patient',
      h('p', { class: 'note' }, 'Optional. Held only on this screen and gone when you close or refresh. Leave blank to use a sticker.'),
      h(
        'div',
        { class: 'paste-zone' },
        h('strong', null, 'Paste a screenshot of the patient banner (Ctrl+V)'),
        h('span', null, ' to fill name, MRN and DOB. It is read on this computer only and not kept. '),
        h('button', { type: 'button', class: 'btn small', onClick: () => screenshotInput.click() }, 'or choose a picture'),
      ),
      h('div', { class: 'grid2' }, field('Title', titleSel), field('Pronouns', sexChips.el)),
      h(
        'div',
        { class: 'grid2' },
        field('First name', bind(h('input', { type: 'text', autocomplete: 'off' }), () => state.patient.first, (v) => (state.patient.first = v))),
        field('Surname', bind(h('input', { type: 'text', autocomplete: 'off' }), () => state.patient.surname, (v) => (state.patient.surname = v))),
      ),
      h(
        'div',
        { class: 'grid2' },
        field('DOB', bind(h('input', { type: 'text', autocomplete: 'off', placeholder: 'dd/mm/yyyy' }), () => state.patient.dob, (v) => (state.patient.dob = v))),
        field('MRN', bind(h('input', { type: 'text', autocomplete: 'off' }), () => state.patient.mrn, (v) => (state.patient.mrn = v))),
      ),
      field('Called in the letter', referChips.el),
    ),
  );

  // --- Summary ---
  const dl = (id: string) => id;
  const drugs = [...DRUGS[state.clinic], ...settings.extraDrugs[state.clinic]];
  const dx = DIAGNOSES[state.clinic];
  const dxArea = bind(h('textarea', { rows: 3, placeholder: 'One diagnosis per line, e.g. RE anterior uveitis' }), () => state.summary.diagnosis, (v) => (state.summary.diagnosis = v));
  const dxAdd = h('input', { type: 'text', list: dl('dx-list'), placeholder: `Add a ${clinicLabel.toLowerCase()} diagnosis…` });
  dxAdd.addEventListener('change', () => {
    const v = dxAdd.value.trim();
    if (!v) return;
    state.summary.diagnosis = state.summary.diagnosis.trim() ? `${state.summary.diagnosis.trim()}\n${v}` : v;
    dxArea.value = state.summary.diagnosis;
    dxAdd.value = '';
    touch();
  });

  const va = (label: string, get: () => string, set: (v: string) => void) =>
    field(label, bind(h('input', { type: 'text', list: 'va-list', placeholder: '6/6', autocomplete: 'off' }), get, set));

  const iopHost = h(
    'div',
    { class: 'grid3' },
    field('IOP RE', bind(h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off' }), () => state.summary.iopRE, (v) => (state.summary.iopRE = v))),
    field('IOP LE', bind(h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off' }), () => state.summary.iopLE, (v) => (state.summary.iopLE = v))),
    field('Target', bind(h('input', { type: 'text', placeholder: '<=14', autocomplete: 'off' }), () => state.summary.iopTarget, (v) => (state.summary.iopTarget = v))),
  );
  const iopDetails = h('details', { class: 'more', open: state.clinic === 'glaucoma' || Boolean(state.summary.iopRE || state.summary.iopLE) }, h('summary', null, 'Intraocular pressure'), iopHost);

  const txArea = bind(h('textarea', { rows: 3, placeholder: 'One line each, e.g. Lumigan nocte OU' }), () => state.summary.treatment, (v) => (state.summary.treatment = v));
  const drugIn = h('input', { type: 'text', list: 'drug-list', placeholder: 'Drug', autocomplete: 'off' });
  const freqSel = h('select', null, option('', 'frequency'), ...FREQUENCIES.map((f) => option(f, f)));
  const eyeSel = h('select', null, option('', 'eye'), ...EYES.map((e) => option(e, e)));
  const addDrug = h(
    'button',
    {
      type: 'button',
      class: 'btn small',
      onClick: () => {
        const line = [drugIn.value.trim(), freqSel.value, eyeSel.value].filter(Boolean).join(' ');
        if (!drugIn.value.trim()) return drugIn.focus();
        state.summary.treatment = state.summary.treatment.trim() ? `${state.summary.treatment.trim()}\n${line}` : line;
        txArea.value = state.summary.treatment;
        drugIn.value = '';
        touch();
        drugIn.focus();
      },
    },
    'Add',
  );

  const intervalSel = h('select', null, ...INTERVALS.map((i) => option(i.id, i.label, i.id === state.summary.interval)));
  intervalSel.addEventListener('change', () => {
    state.summary.interval = intervalSel.value;
    touch();
  });
  const eyeChips = chips(
    [
      { value: 'right', label: 'Right' },
      { value: 'left', label: 'Left' },
      { value: 'both', label: 'Both' },
    ],
    () => state.summary.eye,
    (v) => {
      state.summary.eye = v;
      touch();
    },
  );

  root.append(
    card(
      'Summary block',
      datalist('va-list', VA_OPTIONS),
      datalist('drug-list', drugs),
      datalist('dx-list', dx),
      field('Diagnosis', dxArea),
      dx.length ? dxAdd : null,
      h('div', { class: 'grid2' }, va('Visual acuity RE', () => state.summary.vaRE, (v) => (state.summary.vaRE = v)), va('Visual acuity LE', () => state.summary.vaLE, (v) => (state.summary.vaLE = v))),
      iopDetails,
      field('Treatment', txArea),
      h('div', { class: 'drug-row' }, drugIn, freqSel, eyeSel, addDrug),
      h(
        'div',
        { class: 'grid2' },
        field('Plan / review in', intervalSel),
        field('Extra plan text', bind(h('input', { type: 'text', placeholder: 'e.g. Avoid vitamin A medications' }), () => state.summary.planExtra, (v) => (state.summary.planExtra = v))),
      ),
      field('Examined eye in sentences', eyeChips.el, 'Used where a phrase says “the right eye / left eye / both eyes”'),
    ),
  );

  // --- Body ---
  const phrases = effectivePhrases(settings);
  const sectionEls = SECTIONS[state.type].map((sec) => {
    const list = phrasesFor(phrases, state.type, sec.id, state.clinic, showAllClinics);
    const rows = list.map((ph) => {
      const box = h('input', { type: 'checkbox', checked: Boolean(state.ticks[ph.id]) });
      box.addEventListener('change', () => {
        state.ticks[ph.id] = box.checked;
        touch();
      });
      const text = h('span', null, fillTokens(ph.text, state));
      phraseLabels.push({ id: ph.id, text: ph.text, el: text });
      return h('label', { class: 'phrase' }, box, text);
    });
    const key = `${state.type}.${sec.id}`;
    const free = bind(h('textarea', { rows: 2, placeholder: sec.hint || 'Your own words…' }), () => state.freeText[key] ?? '', (v) => (state.freeText[key] = v));
    return h('div', { class: 'section' }, h('h3', null, sec.label), ...rows, free);
  });
  const allBox = h('input', { type: 'checkbox', checked: showAllClinics });
  allBox.addEventListener('change', () => {
    showAllClinics = allBox.checked;
    rebuild();
  });
  root.append(
    card(
      'Letter text',
      field('Reviewed for', bind(h('input', { type: 'text', placeholder: 'Defaults to the first diagnosis line' }), () => state.reason, (v) => (state.reason = v)), 'Fills “reviewed today for …”'),
      ...sectionEls,
      h('label', { class: 'check' }, allBox, 'Show phrases from every clinic'),
    ),
  );

  // --- Sign-off ---
  const ordered = [...settings.consultants].sort((a, b) => Number(b.clinics.includes(state.clinic)) - Number(a.clinics.includes(state.clinic)));
  const consSel = h('select', null, option('', '(none)'), ...ordered.map((c) => option(c.id, c.name || '(unnamed)', c.id === state.consultantId)));
  consSel.addEventListener('change', () => {
    state.consultantId = consSel.value;
    touch();
  });
  root.append(
    card(
      'Sign-off',
      settings.signer.name ? null : h('p', { class: 'note warn' }, 'Add your name in Settings → You & consultants.'),
      field('Registrar to', consSel, settings.consultants.length ? undefined : 'Add consultants in Settings'),
    ),
  );

  return root;
}

function rebuild(): void {
  const scroll = window.scrollY;
  const next = mode === 'referral' ? referralView.controls() : buildControls();
  controlsEl.replaceWith(next);
  controlsEl = next;
  const out = mode === 'referral' ? referralView.output() : letterOutput();
  outputEl.replaceWith(out);
  outputEl = out;
  modeChips.sync();
  newButton.textContent = mode === 'referral' ? 'New referral' : 'New letter';
  savePrefs();
  updatePreview();
  window.scrollTo(0, scroll);
}

// ---------- Patient banner screenshot ----------

const screenshotInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
screenshotInput.addEventListener('change', () => {
  const file = screenshotInput.files?.[0];
  screenshotInput.value = '';
  if (file) void fillFromScreenshot(file);
});

let reading = false;

/** Reads a screenshot of the patient banner and fills the patient fields. Nothing is stored. */
async function fillFromScreenshot(image: Blob): Promise<void> {
  if (reading) return;
  reading = true;
  say('Reading the screenshot…', 60000);
  try {
    const found = parsePatientHeader(await readText(image));
    if (!foundAnything(found)) {
      say('Could not find a name, MRN or DOB in that picture. Screenshot just the blue patient banner.', 7000);
      return;
    }
    if (found.first) state.patient.first = found.first;
    if (found.surname) state.patient.surname = found.surname;
    if (found.dob) state.patient.dob = found.dob;
    if (found.mrn) state.patient.mrn = found.mrn;
    rebuild();
    const got = [found.surname || found.first ? 'name' : '', found.mrn ? 'MRN' : '', found.dob ? 'DOB' : ''].filter(Boolean);
    const missed = [found.surname || found.first ? '' : 'name', found.mrn ? '' : 'MRN', found.dob ? '' : 'DOB'].filter(Boolean);
    say(`Filled ${got.join(', ')} from the screenshot${missed.length ? ` (could not read ${missed.join(', ')})` : ''}. Check them against the record.`, 8000);
  } catch {
    say('Could not read that picture.', 6000);
  } finally {
    reading = false;
  }
}

document.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
  const file = item?.getAsFile();
  // Only when a picture is pasted, and not while Settings is open.
  if (!file || document.querySelector('dialog[open]')) return;
  e.preventDefault();
  if (mode === 'referral') referralView.paste(file);
  else void fillFromScreenshot(file);
});

// ---------- Output actions ----------

async function doCopyWord(): Promise<void> {
  const letter = currentLetter();
  const ok = await copyRich(toHtml(letter, { mark: false, inline: true }), toPlainText(letter));
  say(ok ? 'Copied. Paste into your letterhead document.' : 'Copy was blocked by the browser. Try Print instead.');
}

async function doCopyPowerChart(): Promise<void> {
  const ok = await copyPlain(toPlainText(currentLetter()));
  say(ok ? 'Copied as plain text for PowerChart.' : 'Copy was blocked by the browser.');
}

function doPrint(): void {
  const letter = currentLetter();
  const left = findPlaceholders(letter);
  if (left.length && !confirm(`Still to fill in:\n${left.join('\n')}\n\nPrint anyway?`)) return;
  const html = toHtml(letter, { mark: false, inline: true });
  const template = currentTemplate();
  let page = plainPage(html, settings.topMarginMm);
  if (printLetterhead && template) {
    try {
      page = letterheadPage(readLetterhead(fromBase64(template.data)), html);
    } catch {
      say('Could not read the letterhead, so this prints without it.', 6000);
    }
  }
  void printPage(page.html, page.css);
}

function doEditBody(): void {
  const paragraphs = buildParagraphs(state, effectivePhrases(settings));
  state.bodyOverride = paragraphs.join('\n\n');
  overrideBox.value = state.bodyOverride;
  updatePreview();
  overrideBox.focus();
}

/** Clears the patient, the letter and the referral (they share the patient). */
function doNewLetter(): void {
  if (!confirm(mode === 'referral' ? 'Clear this referral (and the letter for this patient) and start again?' : 'Clear this letter (and any referral for this patient) and start a new one?')) return;
  state = freshState({ mode, clinic: state.clinic, type: state.type, consultantId: state.consultantId, siteId: state.siteId, printLetterhead });
  referral = emptyReferral(currentDest(settings, referral));
  rebuild();
}

function doDownloadOffline(): void {
  download(`letter-builder-v${__APP_VERSION__}-with-settings.html`, withEmbeddedSettings(pristine, exportSettings(settings), Object.keys(templates).length ? JSON.stringify(templates) : null), 'text/html');
}

function doDownloadWord(): void {
  const template = currentTemplate();
  if (!template) {
    say(settings.sites.length ? `Load a letterhead for ${currentSiteName()} first: Settings → Hospitals.` : 'Add a hospital and its letterhead first: Settings → Hospitals.', 6000);
    return;
  }
  try {
    const bytes = fillTemplate(fromBase64(template.data), currentLetter());
    // The file name carries no patient details.
    download(`Letter ${state.date || today()}.docx`, bytes, DOCX_MIME);
    say('Word letter downloaded. Check it before sending.');
  } catch (e) {
    say(e instanceof Error ? e.message : 'Could not build the Word file.', 6000);
  }
}

function loadTemplate(siteId: string, name: string, bytes: Uint8Array): void {
  templates[siteId] = { name, data: toBase64(stripTemplate(bytes)) };
  const saved = saveTemplates();
  rebuild();
  if (!saved) throw new Error('Loaded for this visit, but this browser would not save it. You will need to load it again next time.');
}

function clearTemplate(siteId: string): void {
  delete templates[siteId];
  saveTemplates();
  rebuild();
}

function commitSettings(next: Settings): void {
  settings = next;
  saveSettings(store, settings);
  pushSoon(SYNC_APP, STORAGE_KEY);
  if (!settings.consultants.some((c) => c.id === state.consultantId)) state.consultantId = '';
  // Drop letterheads of hospitals that were removed.
  const before = Object.keys(templates).length;
  for (const id of Object.keys(templates)) if (!settings.sites.some((s) => s.id === id)) delete templates[id];
  if (Object.keys(templates).length !== before) saveTemplates();
  fixSite();
  const dest = currentDest(settings, referral);
  if (dest && dest.id !== referral.destId) {
    referral.destId = dest.id;
    if (dest.treatment.trim()) referral.treatment = dest.treatment.trim();
  }
  rebuild();
}

function showSettings(tab?: Parameters<typeof openSettings>[1]): void {
  openSettings({ get: () => settings, commit: commitSettings, downloadOffline: doDownloadOffline, templateName: (siteId: string) => templates[siteId]?.name ?? null, loadTemplate, clearTemplate }, tab);
}

// ---------- Start ----------

/** The letter's buttons, status line and preview. */
function letterOutput(): HTMLElement {
  paper = h('div', { class: 'paper', 'aria-label': 'Letter preview' });
  overrideBox = h('textarea', { rows: 12, class: 'override-box' });
  overrideBox.value = state.bodyOverride ?? '';
  overrideBox.addEventListener('input', () => {
    state.bodyOverride = overrideBox.value;
    updatePreview();
  });
  overridePanel = h(
    'div',
    { class: 'override', hidden: true },
    h('p', null, 'You are editing the body by hand. Ticks above no longer change it. Blank line = new paragraph.'),
    overrideBox,
    h('button', { type: 'button', class: 'btn small', onClick: () => { state.bodyOverride = null; updatePreview(); } }, 'Discard edits and use the ticks again'),
  );

  const printBox = h('input', { type: 'checkbox', checked: printLetterhead });
  printBox.addEventListener('change', () => {
    printLetterhead = printBox.checked;
    savePrefs();
  });
  const toolbar = h(
    'div',
    { class: 'toolbar' },
    h('button', { type: 'button', class: 'btn primary', onClick: doDownloadWord }, 'Download Word letter'),
    h('button', { type: 'button', class: 'btn primary', onClick: doCopyWord }, 'Copy for Word'),
    h('button', { type: 'button', class: 'btn primary', onClick: doPrint, title: 'Choose “Save as PDF” in the print window to make a PDF' }, 'Print / save PDF'),
    h('button', { type: 'button', class: 'btn primary', onClick: doCopyPowerChart }, 'Copy for PowerChart'),
    h('button', { type: 'button', class: 'btn', onClick: doEditBody }, 'Edit body text'),
    h('label', { class: 'check print-opt', title: 'Untick when printing onto pre-printed letterhead paper' }, printBox, 'Print and PDF include the letterhead'),
  );
  return h('aside', { class: 'output' }, toolbar, statusEl, overridePanel, paper);
}

function buildApp(): void {
  statusEl = h('div', { class: 'status', role: 'status' });
  referralView = createReferralView({
    settings: () => settings,
    letter: () => state,
    referral: () => referral,
    say,
    status: () => statusEl,
    rebuild,
    openReferralSettings: () => showSettings('referrals'),
  });
  modeChips = chips<Mode>(
    [
      { value: 'letter', label: 'Letter', title: 'Clinic letters from tick boxes' },
      { value: 'referral', label: 'Email referral', title: 'A referral email with images, ready to paste into Outlook' },
    ],
    () => mode,
    (v) => {
      if (v === mode) return;
      mode = v;
      rebuild();
    },
    'chips mode',
  );
  newButton = h('button', { type: 'button', class: 'btn', onClick: doNewLetter }, 'New letter');
  controlsEl = h('div');
  outputEl = h('div');

  const header = h(
    'header',
    { class: 'top' },
    h('h1', null, 'Letter Builder', h('span', { class: 'ver' }, ` v${__APP_VERSION__}`)),
    modeChips.el,
    h('div', { class: 'top-actions' }, newButton, h('button', { type: 'button', class: 'btn', onClick: () => showSettings() }, 'Settings')),
  );

  app.replaceChildren(header, h('main', { class: 'cols' }, controlsEl, outputEl));
  rebuild();
}

async function start(): Promise<void> {
  // Bring down newer settings from the sync server first (does nothing unless signed in).
  try {
    await pullBeforeStart(SYNC_APP, STORAGE_KEY);
  } catch {
    // Offline: carry on with what is on this device.
  }
  const read = (key: string): string | null => {
    try {
      return store?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  // An offline copy saved after this browser's settings last changed wins; otherwise the browser's
  // own settings do (including edits made inside the file).
  const builtIn = embeddedSettings();
  const builtInAt = embeddedSavedAt();
  let storedAt = 0;
  try {
    storedAt = Number((JSON.parse(read(`${STORAGE_KEY}.sync`) || 'null') as { updated?: number } | null)?.updated) || 0;
  } catch {
    storedAt = 0;
  }
  const pick = pickSettingsText(read(STORAGE_KEY), storedAt, builtIn, builtInAt);
  settings = loadSettings(null, pick.text);
  if (pick.fromEmbedded) {
    saveSettings(store, settings);
    try {
      store?.setItem(`${STORAGE_KEY}.sync`, JSON.stringify({ updated: builtInAt, dirty: false }));
    } catch {
      // Not remembered: used for this visit.
    }
  }
  const fromBrowser = parseTemplateMap(read(TEMPLATES_KEY));
  const fromFile = parseTemplateMap(embeddedTemplate());
  templates = mergeTemplates(fromBrowser, fromFile, Number(read(TEMPLATES_UPDATED_KEY)) || 0, builtInAt);
  if (JSON.stringify(templates) !== JSON.stringify(fromBrowser)) saveTemplates();
  // A letterhead saved before hospitals existed moves to the first hospital without one.
  const legacy = parseStoredTemplate(read(TEMPLATE_KEY));
  const spare = settings.sites.find((s) => !templates[s.id]);
  if (legacy && spare) {
    templates[spare.id] = legacy;
    if (saveTemplates()) store?.removeItem(TEMPLATE_KEY);
  }
  const prefs = loadPrefs();
  printLetterhead = prefs.printLetterhead;
  mode = prefs.mode;
  state = freshState(prefs);
  referral = emptyReferral(settings.referrals[0]);
  if (!settings.consultants.some((c) => c.id === state.consultantId)) state.consultantId = '';
  fixSite();
  buildApp();
}

void start();
