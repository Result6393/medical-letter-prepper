// The "Email referral" screen: patient and contact details, indication, pasted images, and the
// email preview with the buttons that hand it to Outlook. Everything here is held in memory only.
import { chips, datalist, field, h, option } from './dom';
import { copyImage, prepareImage } from './images';
import type { LetterState } from './letter';
import { readText } from './ocr';
import { copyPlain, copyRich } from './output';
import { foundAnything, parsePatientHeader } from './patientheader';
import {
  buildReferralEmail,
  composeLink,
  CONDITIONS,
  IMAGE_LABELS,
  imageLabel,
  OTHER_REFERRALS,
  parseContactDetails,
  PATIENT_INFO_LABEL,
  referralHtml,
  referralPlaceholders,
  referralPlainText,
  TREATMENTS,
  URGENCIES,
  type ReferralDest,
  type ReferralEmail,
  type ReferralEye,
  type ReferralImage,
  type ReferralState,
} from './referral';
import type { Settings } from './settings';

export interface ReferralViewContext {
  settings: () => Settings;
  /** The letter's state: the patient, hospital and date are shared with the referral. */
  letter: () => LetterState;
  referral: () => ReferralState;
  say: (message: string, ms?: number) => void;
  /** The shared status line (what `say` writes to). */
  status: () => HTMLElement;
  /** Saves prefs and redraws the whole screen. */
  rebuild: () => void;
  /** Opens Settings at the email referrals tab. */
  openReferralSettings: () => void;
}

export interface ReferralView {
  controls: () => HTMLElement;
  output: () => HTMLElement;
  /** Refreshes the preview and the list of things still to fill. */
  update: () => void;
  /** A picture pasted anywhere on the page while this screen is showing. */
  paste: (file: Blob) => void;
}

export function currentDest(settings: Settings, referral: ReferralState): ReferralDest | undefined {
  return settings.referrals.find((d) => d.id === referral.destId) ?? settings.referrals[0];
}

export function createReferralView(ctx: ReferralViewContext): ReferralView {
  let preview: HTMLElement | undefined;
  let patientZone: HTMLElement | null = null;
  let reading = false;

  const r = () => ctx.referral();
  const p = () => ctx.letter().patient;

  function email(): ReferralEmail | null {
    const settings = ctx.settings();
    const dest = currentDest(settings, r());
    if (!dest) return null;
    const letter = ctx.letter();
    return buildReferralEmail({ patient: letter.patient, referral: r(), dest, settings, site: settings.sites.find((s) => s.id === letter.siteId), date: letter.date });
  }

  function update(): void {
    if (!preview) return;
    const statusEl = ctx.status();
    const e = email();
    if (!e) {
      preview.replaceChildren(h('p', { class: 'note' }, 'Set up where referrals go first: Settings → Email referrals.'));
      statusEl.textContent = '';
      return;
    }
    preview.replaceChildren(
      h('div', { class: 'email-head' }, h('div', null, h('strong', null, 'To: '), e.to.join('; ') || '(none set)'), e.cc.length ? h('div', null, h('strong', null, 'Cc: '), e.cc.join('; ')) : null, h('div', null, h('strong', null, 'Subject: '), e.subject)),
    );
    const body = h('div', { class: 'email-body' });
    body.innerHTML = referralHtml(e, { mark: true });
    preview.append(body);
    if (!statusEl.classList.contains('flash')) {
      const left = referralPlaceholders(e);
      statusEl.textContent = left.length ? `Still to fill: ${left.join('  ·  ')}` : 'Nothing left to fill in.';
      statusEl.classList.toggle('warn', left.length > 0);
    }
  }

  const bind = <T extends HTMLInputElement | HTMLTextAreaElement>(el: T, get: () => string, set: (v: string) => void): T => {
    el.value = get();
    el.addEventListener('input', () => {
      set(el.value);
      update();
    });
    return el;
  };

  // ---------- Pictures ----------

  async function addImage(file: Blob, patientInfo: boolean): Promise<void> {
    try {
      const img = await prepareImage(file);
      const entry: ReferralImage = { id: `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...img, label: patientInfo ? PATIENT_INFO_LABEL : '', patientInfo };
      const state = r();
      // Only one patient details screenshot: a new one replaces the old.
      state.images = patientInfo ? [...state.images.filter((i) => !i.patientInfo), entry] : [...state.images, entry];
      ctx.rebuild();
      if (patientInfo) void readPatientInfo(file);
      else ctx.say('Image added. Give it a label (e.g. RE OCT).', 4000);
    } catch {
      ctx.say('Could not read that picture.', 6000);
    }
  }

  /** Reads name, MRN, DOB, phone and address from the patient details screenshot. */
  async function readPatientInfo(file: Blob): Promise<void> {
    if (reading) return;
    reading = true;
    ctx.say('Reading the patient details…', 60000);
    try {
      const text = await readText(file);
      const header = parsePatientHeader(text);
      const contact = parseContactDetails(text);
      const patient = p();
      if (header.first) patient.first = header.first;
      if (header.surname) patient.surname = header.surname;
      if (header.dob) patient.dob = header.dob;
      if (header.mrn) patient.mrn = header.mrn;
      if (contact.phone) r().phone = contact.phone;
      if (contact.altPhone) r().altPhone = contact.altPhone;
      if (contact.address) r().address = contact.address;
      ctx.rebuild();
      const got = [header.surname || header.first ? 'name' : '', header.mrn ? 'MRN' : '', header.dob ? 'DOB' : '', contact.phone ? 'phone' : '', contact.address ? 'address' : ''].filter(Boolean);
      const missed = [header.surname || header.first ? '' : 'name', header.mrn ? '' : 'MRN', header.dob ? '' : 'DOB', contact.phone ? '' : 'phone', contact.address ? '' : 'address'].filter(Boolean);
      ctx.say(
        foundAnything(header) || contact.phone || contact.address
          ? `Filled ${got.join(', ')}${missed.length ? ` (could not read ${missed.join(', ')})` : ''}. Check them against the record. The screenshot goes in the email too.`
          : 'Could not read any details from that picture. Type them in; the screenshot still goes in the email.',
        9000,
      );
    } catch {
      ctx.say('Could not read that picture. Type the details in; the screenshot still goes in the email.', 7000);
    } finally {
      reading = false;
    }
  }

  function paste(file: Blob): void {
    const toPatient = patientZone !== null && document.activeElement === patientZone;
    void addImage(file, toPatient);
  }

  function dropZone(el: HTMLElement, patientInfo: boolean): HTMLElement {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('over');
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return ctx.say('Only pictures can go in the email. Attach PDFs in Outlook.', 5000);
      for (const f of patientInfo ? files.slice(0, 1) : files) void addImage(f, patientInfo);
    });
    return el;
  }

  function fileButton(label: string, patientInfo: boolean): HTMLElement {
    const input = h('input', { type: 'file', accept: 'image/*', multiple: !patientInfo, hidden: true });
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])];
      input.value = '';
      for (const f of files) void addImage(f, patientInfo);
    });
    return h('span', null, h('button', { type: 'button', class: 'btn small', onClick: () => input.click() }, label), input);
  }

  function thumb(img: ReferralImage, index: number, all: ReferralImage[]): HTMLElement {
    const remove = () => {
      r().images = r().images.filter((i) => i.id !== img.id);
      ctx.rebuild();
    };
    const label = h('input', { type: 'text', list: 'image-labels', placeholder: img.patientInfo ? PATIENT_INFO_LABEL : `Image ${index + 1} (e.g. RE OCT)`, autocomplete: 'off' });
    label.value = img.label;
    label.addEventListener('input', () => {
      img.label = label.value;
      update();
    });
    const moveUp = () => {
      const list = r().images;
      const at = list.indexOf(img);
      const prev = list.slice(0, at).reverse().find((i) => i.patientInfo === img.patientInfo);
      if (!prev) return;
      const to = list.indexOf(prev);
      list.splice(at, 1);
      list.splice(to, 0, img);
      ctx.rebuild();
    };
    return h(
      'div',
      { class: 'thumb' },
      h('img', { src: img.src, alt: imageLabel(img, index) }),
      h(
        'div',
        { class: 'thumb-side' },
        field('Label', label),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn small', title: 'Copy this picture on its own, to paste into the email', onClick: async () => ctx.say((await copyImage(img.src)) ? `Copied “${imageLabel(img, index)}”. Paste it into the email.` : 'The browser would not copy the picture.') }, 'Copy picture'),
          !img.patientInfo && index > 0 && all.length > 1 ? h('button', { type: 'button', class: 'btn small', onClick: moveUp }, 'Move up') : null,
          h('button', { type: 'button', class: 'btn small danger', onClick: remove }, 'Remove'),
        ),
      ),
    );
  }

  // ---------- Controls ----------

  function card(title: string, ...children: (HTMLElement | null)[]): HTMLElement {
    return h('section', { class: 'card' }, h('h2', null, title), ...children);
  }

  function controls(): HTMLElement {
    const settings = ctx.settings();
    const letter = ctx.letter();
    const state = r();
    const dest = currentDest(settings, state);
    const root = h('div', { class: 'controls' });

    // --- Where to ---
    const destSel = h('select', null, ...settings.referrals.map((d) => option(d.id, d.label || d.recipient || '(unnamed destination)', d.id === dest?.id)));
    destSel.addEventListener('change', () => {
      state.destId = destSel.value;
      const next = currentDest(settings, state);
      if (next?.treatment.trim()) state.treatment = next.treatment.trim();
      ctx.rebuild();
    });
    const siteChips = chips(
      settings.sites.map((s) => ({ value: s.id, label: s.name || '(unnamed hospital)' })),
      () => letter.siteId,
      (v) => {
        letter.siteId = v;
        ctx.rebuild();
      },
    );
    root.append(
      card(
        'Referral to',
        dest
          ? settings.referrals.length > 1
            ? field('Destination', destSel)
            : h('p', { class: 'dest-name' }, dest.label || dest.recipient || '(unnamed destination)')
          : h('div', { class: 'note warn' }, 'No referral destinations yet. ', h('button', { type: 'button', class: 'btn small', onClick: ctx.openReferralSettings }, 'Set one up')),
        dest?.notes.trim() ? h('p', { class: 'note' }, dest.notes.trim()) : null,
        settings.sites.length > 1 ? field('From hospital', siteChips.el) : null,
        settings.sites.length ? null : h('p', { class: 'note warn' }, 'Add your hospital and provider number in Settings → Hospitals.'),
      ),
    );

    // --- Patient ---
    patientZone = dropZone(
      h(
        'div',
        { class: 'paste-zone target', tabindex: '0', title: 'Click here, then paste (Ctrl+V)' },
        h('strong', null, 'Patient details: click here, then paste (Ctrl+V)'),
        h('span', null, ' a screenshot of the patient information tab. It fills the fields below and goes in the email as well. '),
        fileButton('or choose a picture', true),
      ),
      true,
    );
    const infoImages = state.images.filter((i) => i.patientInfo);
    root.append(
      card(
        'Patient',
        h('p', { class: 'note' }, 'Held only on this screen and gone when you close or refresh. The rooms need full contact details: DOB, address and phone.'),
        patientZone,
        ...infoImages.map((img, i) => thumb(img, i, infoImages)),
        h(
          'div',
          { class: 'grid2' },
          field('First name', bind(h('input', { type: 'text', autocomplete: 'off' }), () => p().first, (v) => (p().first = v))),
          field('Surname', bind(h('input', { type: 'text', autocomplete: 'off' }), () => p().surname, (v) => (p().surname = v))),
        ),
        h(
          'div',
          { class: 'grid2' },
          field('DOB', bind(h('input', { type: 'text', autocomplete: 'off', placeholder: 'dd/mm/yyyy' }), () => p().dob, (v) => (p().dob = v))),
          field('MRN', bind(h('input', { type: 'text', autocomplete: 'off' }), () => p().mrn, (v) => (p().mrn = v))),
        ),
        h(
          'div',
          { class: 'grid2' },
          field('Phone', bind(h('input', { type: 'text', autocomplete: 'off', placeholder: '0400 000 000' }), () => state.phone, (v) => (state.phone = v))),
          field('Alternative phone', bind(h('input', { type: 'text', autocomplete: 'off', placeholder: 'Optional, e.g. a relative' }), () => state.altPhone, (v) => (state.altPhone = v))),
        ),
        field('Address', bind(h('textarea', { rows: 2, autocomplete: 'off', placeholder: '1 Example St, Suburb NSW 2000' }), () => state.address, (v) => (state.address = v))),
      ),
    );

    // --- Referral ---
    const eyeChips = chips<ReferralEye>(
      [
        { value: 'right', label: 'Right' },
        { value: 'left', label: 'Left' },
        { value: 'both', label: 'Both' },
      ],
      () => state.eye,
      (v) => {
        state.eye = state.eye === v ? '' : v;
        update();
      },
    );
    const otherChips = chips(
      OTHER_REFERRALS,
      () => state.otherReferral,
      (v) => {
        state.otherReferral = v;
        update();
      },
    );
    const treatments = [...new Set([dest?.treatment.trim() ?? '', ...TREATMENTS].filter(Boolean))];
    root.append(
      card(
        'Referral',
        datalist('ref-conditions', CONDITIONS),
        datalist('ref-treatments', treatments),
        datalist('ref-urgency', URGENCIES),
        datalist('image-labels', IMAGE_LABELS),
        h(
          'div',
          { class: 'grid2' },
          field('Condition', bind(h('input', { type: 'text', list: 'ref-conditions', placeholder: 'e.g. CRVO', autocomplete: 'off' }), () => state.condition, (v) => (state.condition = v))),
          field('Eye', eyeChips.el),
        ),
        field('Treatment', bind(h('input', { type: 'text', list: 'ref-treatments', autocomplete: 'off' }), () => state.treatment, (v) => (state.treatment = v))),
        field('Should be seen', bind(h('input', { type: 'text', list: 'ref-urgency', autocomplete: 'off' }), () => state.urgency, (v) => (state.urgency = v))),
        field('Other referral attached as well', otherChips.el, 'Attach it in Outlook; this just mentions it in the email'),
      ),
    );

    // --- Images ---
    const clinical = state.images.filter((i) => !i.patientInfo);
    root.append(
      card(
        'Images',
        dropZone(
          h(
            'div',
            { class: 'paste-zone' },
            h('strong', null, 'Paste OCT or fundus images (Ctrl+V)'),
            h('span', null, ' anywhere outside the patient box, or drop them here. Each goes in the email under its label. '),
            fileButton('or choose pictures', false),
          ),
          false,
        ),
        ...clinical.map((img, i) => thumb(img, i, clinical)),
      ),
    );
    return root;
  }

  // ---------- Output ----------

  async function copyBody(e: ReferralEmail): Promise<boolean> {
    return copyRich(referralHtml(e), referralPlainText(e));
  }

  function openCompose(e: ReferralEmail): boolean {
    const settings = ctx.settings();
    const link = composeLink(e, settings.composeWith, settings.composeUrl);
    if (settings.composeWith === 'mailto') {
      const a = h('a', { href: link });
      document.body.append(a);
      a.click();
      a.remove();
      return true;
    }
    const win = window.open(link, '_blank');
    if (!win) return false;
    win.opener = null;
    return true;
  }

  async function prepare(): Promise<void> {
    const e = email();
    if (!e) return ctx.openReferralSettings();
    const left = referralPlaceholders(e);
    if (left.length && !confirm(`Still to fill in:\n${left.join('\n')}\n\nPrepare the email anyway?`)) return;
    const copied = await copyBody(e);
    const opened = openCompose(e);
    if (!copied) return ctx.say('The browser would not copy the email. Try “Copy email body” again.', 7000);
    ctx.say(
      opened
        ? 'Email body copied and a new email opened. Click in its body and paste (Ctrl+V), attach the PDFs, then send.'
        : 'Email body copied. The new email was blocked: click “Open new email”, then paste (Ctrl+V) into its body.',
      12000,
    );
  }

  function output(): HTMLElement {
    const state = r();
    const dest = currentDest(ctx.settings(), state);
    preview = h('div', { class: 'paper email', 'aria-label': 'Email preview' });
    const checklist = (dest?.checklist ?? []).map((item) => {
      const box = h('input', { type: 'checkbox', checked: Boolean(state.checks[item]) });
      box.addEventListener('change', () => (state.checks[item] = box.checked));
      return h('label', { class: 'check' }, box, item);
    });
    const withEmail = (fn: (e: ReferralEmail) => Promise<void> | void) => () => {
      const e = email();
      if (!e) return ctx.openReferralSettings();
      void fn(e);
    };
    const toolbar = h(
      'div',
      { class: 'toolbar' },
      h('button', { type: 'button', class: 'btn primary', onClick: prepare, title: 'Copies the email body and opens a new email with the addresses and subject filled in' }, 'Prepare email'),
      h('button', { type: 'button', class: 'btn', onClick: withEmail(async (e) => ctx.say((await copyBody(e)) ? 'Email body copied, with the images. Paste it into the email.' : 'Copy was blocked by the browser.')) }, 'Copy email body'),
      h('button', { type: 'button', class: 'btn', onClick: withEmail((e) => { if (!openCompose(e)) ctx.say('The browser blocked the new window. Allow pop-ups for this page.', 7000); }) }, 'Open new email'),
      h('button', { type: 'button', class: 'btn', title: 'If pasting drops the images: paste this, then use “Copy picture” on each image', onClick: withEmail(async (e) => ctx.say((await copyPlain(e.text)) ? 'Text copied without images. Use “Copy picture” for each image.' : 'Copy was blocked by the browser.')) }, 'Copy text only'),
    );
    const out = h(
      'aside',
      { class: 'output' },
      toolbar,
      checklist.length ? h('div', { class: 'checklist' }, h('strong', null, 'Before sending'), ...checklist) : null,
      ctx.status(),
      preview,
    );
    update();
    return out;
  }

  return { controls, output, update, paste };
}
