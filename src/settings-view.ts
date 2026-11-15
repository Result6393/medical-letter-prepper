import { h, field, option, download } from './dom';
import { CLINICS, DEFAULT_PHRASES, LETTER_TYPES, SECTIONS, type ClinicId, type LetterType } from './phrases';
import { defaultSettings, exportSettings, importSettings, parseList, SYNC_APP, STORAGE_KEY, type Consultant, type Settings } from './settings';
import { mountSyncControl } from './sync.js';

export interface SettingsContext {
  get: () => Settings;
  /** Saves new settings and refreshes the letter screen. */
  commit: (next: Settings) => void;
  /** Downloads this page with the current settings built in. */
  downloadOffline: () => void;
  /** Name of the letterhead file loaded for a hospital, or null. */
  templateName: (siteId: string) => string | null;
  /** Stores a hospital's letterhead .docx (body text is stripped first). Throws with a readable message. */
  loadTemplate: (siteId: string, name: string, bytes: Uint8Array) => void;
  clearTemplate: (siteId: string) => void;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const TABS = [
  { id: 'you', label: 'You & consultants' },
  { id: 'recipients', label: 'Recipients' },
  { id: 'phrases', label: 'Phrases' },
  { id: 'drugs', label: 'Drug lists' },
  { id: 'print', label: 'Print & dates' },
  { id: 'letterhead', label: 'Hospitals' },
  { id: 'sync', label: 'Sync & backup' },
] as const;
type TabId = (typeof TABS)[number]['id'];

let lastTab: TabId = 'you';

export function openSettings(ctx: SettingsContext): void {
  const dialog = h('dialog', { class: 'settings' });
  const tabBar = h('div', { class: 'tabs', role: 'tablist' });
  const panel = h('div', { class: 'tab-panel' });

  const edit = (fn: (s: Settings) => void) => {
    const next = clone(ctx.get());
    fn(next);
    ctx.commit(next);
  };

  const renderers: Record<TabId, () => HTMLElement> = {
    you: () => youTab(ctx, edit, show),
    recipients: () => recipientsTab(ctx, edit),
    phrases: () => phrasesTab(ctx, edit, show),
    drugs: () => drugsTab(ctx, edit),
    print: () => printTab(ctx, edit),
    letterhead: () => letterheadTab(ctx, edit, show),
    sync: () => syncTab(ctx, show),
  };

  function show(tab: TabId = lastTab): void {
    lastTab = tab;
    tabBar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    panel.replaceChildren(renderers[tab]());
  }

  for (const t of TABS) {
    tabBar.append(h('button', { type: 'button', class: 'tab', 'data-tab': t.id, role: 'tab', onClick: () => show(t.id) }, t.label));
  }

  dialog.append(
    h('div', { class: 'settings-head' }, h('h2', null, 'Settings'), h('button', { type: 'button', class: 'btn', onClick: () => dialog.close() }, 'Close')),
    tabBar,
    panel,
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  show();
  dialog.showModal();
}

type Edit = (fn: (s: Settings) => void) => void;

function note(text: string): HTMLElement {
  return h('p', { class: 'note' }, text);
}

// ---------- You & consultants ----------

function youTab(ctx: SettingsContext, edit: Edit, show: (t?: TabId) => void): HTMLElement {
  const s = ctx.get();
  const text = (label: string, value: string, hint: string, set: (s: Settings, v: string) => void) => {
    const input = h('input', { type: 'text', value });
    input.addEventListener('change', () => edit((n) => set(n, input.value)));
    return field(label, input, hint);
  };

  const consultantRows = s.consultants.map((c, i) => {
    const name = h('input', { type: 'text', value: c.name, placeholder: 'Dr Jane Example' });
    name.addEventListener('change', () => edit((n) => (n.consultants[i].name = name.value.trim())));
    const provider = h('input', { type: 'text', value: c.provider });
    provider.addEventListener('change', () => edit((n) => (n.consultants[i].provider = provider.value.trim())));
    const titles = h('textarea', { rows: 2, placeholder: 'Consultant Ophthalmologist, {hospital}' });
    titles.value = c.titles.join('\n');
    titles.addEventListener('change', () => edit((n) => (n.consultants[i].titles = parseList(titles.value))));
    const clinics = h(
      'div',
      { class: 'check-row' },
      ...CLINICS.filter((cl) => cl.id !== 'general').map((cl) => {
        const box = h('input', { type: 'checkbox', checked: c.clinics.includes(cl.id) });
        box.addEventListener('change', () =>
          edit((n) => {
            const set = new Set<ClinicId>(n.consultants[i].clinics);
            if (box.checked) set.add(cl.id);
            else set.delete(cl.id);
            n.consultants[i].clinics = [...set];
          }),
        );
        return h('label', { class: 'check' }, box, cl.label);
      }),
    );
    return h(
      'div',
      { class: 'card-row' },
      field('Name (as after "Registrar to")', name),
      field('Provider number', provider, 'Printed after the name; leave blank to omit'),
      field('Lines under the name, one per line', titles, 'Write {hospital} where the hospital name goes: it follows the hospital chosen for each letter'),
      field('Clinics (listed first when that clinic is chosen)', clinics),
      h('button', { type: 'button', class: 'btn danger', onClick: () => { edit((n) => n.consultants.splice(i, 1)); show('you'); } }, 'Remove consultant'),
    );
  });

  return h(
    'div',
    null,
    note('These are saved in this browser (and synced if you sign in on the Sync tab). They are never part of the app’s code.'),
    h('h3', null, 'You'),
    text('Your name for the sign-off', s.signer.name, 'e.g. Dr A Example', (n, v) => (n.signer.name = v.trim())),
    text('Role line start', s.signer.rolePrefix, 'e.g. "Registrar to" or "Registrar for"', (n, v) => (n.signer.rolePrefix = v.trim())),
    h('h3', null, 'Consultants'),
    ...consultantRows,
    h('button', {
      type: 'button',
      class: 'btn',
      onClick: () => {
        edit((n) => n.consultants.push({ id: `c${Date.now().toString(36)}`, name: '', provider: '', titles: [], clinics: [] } satisfies Consultant));
        show('you');
      },
    }, 'Add consultant'),
  );
}

// ---------- Recipients ----------

function recipientsTab(ctx: SettingsContext, edit: Edit): HTMLElement {
  const box = h('textarea', { rows: 10, placeholder: 'Dr Jones\nDr Example' });
  box.value = ctx.get().recipients.join('\n');
  box.addEventListener('change', () => edit((n) => (n.recipients = parseList(box.value))));
  return h(
    'div',
    null,
    note('Doctors you write to often, one per line. They appear under “To” as “Dear Dr Jones,”. Type the title with the name.'),
    field('Recipients', box),
  );
}

// ---------- Phrases ----------

function phrasesTab(ctx: SettingsContext, edit: Edit, show: (t?: TabId) => void): HTMLElement {
  const s = ctx.get();
  const typeSel = h('select', null, ...LETTER_TYPES.map((t) => option(t.id, t.label, t.id === phraseType)));
  typeSel.addEventListener('change', () => {
    phraseType = typeSel.value as LetterType;
    show('phrases');
  });

  const sectionBlocks = SECTIONS[phraseType].map((sec) => {
    const builtIn = DEFAULT_PHRASES.filter((p) => p.type === phraseType && p.section === sec.id);
    const custom = s.customPhrases.filter((p) => p.type === phraseType && p.section === sec.id);

    const rows = builtIn.map((p) => {
      const hidden = s.hiddenPhrases.includes(p.id);
      const edited = s.phraseEdits[p.id] !== undefined;
      const shown = h('input', { type: 'checkbox', checked: !hidden, title: 'Show this phrase in the letter builder' });
      shown.addEventListener('change', () =>
        edit((n) => {
          n.hiddenPhrases = shown.checked ? n.hiddenPhrases.filter((x) => x !== p.id) : [...n.hiddenPhrases, p.id];
        }),
      );
      const area = h('textarea', { rows: 2 });
      area.value = s.phraseEdits[p.id] ?? p.text;
      area.addEventListener('change', () =>
        edit((n) => {
          const v = area.value.trim();
          if (!v || v === p.text) delete n.phraseEdits[p.id];
          else n.phraseEdits[p.id] = v;
        }),
      );
      return h(
        'div',
        { class: `phrase-row${hidden ? ' off' : ''}` },
        shown,
        area,
        p.clinics ? h('span', { class: 'tag' }, p.clinics.join(', ')) : null,
        edited ? h('button', { type: 'button', class: 'btn small', onClick: () => { edit((n) => delete n.phraseEdits[p.id]); show('phrases'); } }, 'Reset') : null,
      );
    });

    const customRows = custom.map((p) => {
      const area = h('textarea', { rows: 2 });
      area.value = p.text;
      area.addEventListener('change', () =>
        edit((n) => {
          const target = n.customPhrases.find((x) => x.id === p.id);
          if (target) target.text = area.value.trim();
        }),
      );
      return h(
        'div',
        { class: 'phrase-row' },
        h('span', { class: 'tag' }, 'yours'),
        area,
        p.clinics?.length ? h('span', { class: 'tag' }, p.clinics.join(', ')) : null,
        h('button', { type: 'button', class: 'btn small danger', onClick: () => { edit((n) => (n.customPhrases = n.customPhrases.filter((x) => x.id !== p.id))); show('phrases'); } }, 'Delete'),
      );
    });

    const newText = h('textarea', { rows: 2, placeholder: 'Add your own phrase for this section. Use {he} {his} {him} {pt} {reason} …' });
    const newClinic = h('select', null, option('', 'All clinics'), ...CLINICS.filter((c) => c.id !== 'general').map((c) => option(c.id, c.label)));
    const add = h('button', {
      type: 'button',
      class: 'btn small',
      onClick: () => {
        const text = newText.value.trim();
        if (!text) return;
        edit((n) =>
          n.customPhrases.push({
            id: `custom-${Date.now().toString(36)}`,
            type: phraseType,
            section: sec.id,
            text,
            custom: true,
            ...(newClinic.value ? { clinics: [newClinic.value as ClinicId] } : {}),
          }),
        );
        show('phrases');
      },
    }, 'Add phrase');

    return h('section', { class: 'phrase-section' }, h('h4', null, sec.label), ...rows, ...customRows, h('div', { class: 'phrase-add' }, newText, newClinic, add));
  });

  return h(
    'div',
    null,
    note('Untick to hide a phrase, edit its wording, or add your own. Edits are stored as changes from the built-in list, so they stay small to sync.'),
    h('details', { class: 'tokens' }, h('summary', null, 'Placeholders you can use in a phrase'), h('p', null, '{pt} patient (Mr Smith / first name / this patient) · {he} {his} {him} {himself} · {is} {has} {does} {s} (change for “they”) · {reason} · {eye} · {reviewtime} (6 months’ time) · {vaRE} {vaLE} · {dob}. Capital first letter ({He}) for the start of a sentence. Anything in [square brackets] stays highlighted in the letter for you to fill in.')),
    field('Letter type', typeSel),
    ...sectionBlocks,
  );
}
let phraseType: LetterType = 'review';

// ---------- Drugs ----------

function drugsTab(ctx: SettingsContext, edit: Edit): HTMLElement {
  const s = ctx.get();
  return h(
    'div',
    null,
    note('Extra suggestions for the drug box, one per line, added to the built-in list for that clinic. You can always type any drug in the box.'),
    ...CLINICS.map((c) => {
      const area = h('textarea', { rows: 3 });
      area.value = s.extraDrugs[c.id].join('\n');
      area.addEventListener('change', () => edit((n) => (n.extraDrugs[c.id] = parseList(area.value))));
      return field(c.label, area);
    }),
  );
}

// ---------- Print & dates ----------

function printTab(ctx: SettingsContext, edit: Edit): HTMLElement {
  const s = ctx.get();
  const margin = h('input', { type: 'number', min: 0, max: 120, step: 1, value: String(s.topMarginMm) });
  margin.addEventListener('change', () => {
    const v = Math.round(Number(margin.value));
    if (Number.isFinite(v) && v >= 0 && v <= 120) edit((n) => (n.topMarginMm = v));
  });
  const date = h('select', null, option('iso', '2026-01-05 (year first)', s.dateFormat === 'iso'), option('dmy', '05/01/2026 (day first)', s.dateFormat === 'dmy'));
  date.addEventListener('change', () => edit((n) => (n.dateFormat = date.value === 'dmy' ? 'dmy' : 'iso')));
  return h(
    'div',
    null,
    field('Space left at the top of the first page (mm)', margin, 'Room for pre-printed letterhead. Check with one test print and adjust. Later pages use a normal 20 mm margin.'),
    field('Date format', date),
  );
}

// ---------- Letterhead ----------

function letterheadTab(ctx: SettingsContext, edit: Edit, show: (t?: TabId) => void): HTMLElement {
  const s = ctx.get();

  const rows = s.sites.map((site, i) => {
    const loaded = ctx.templateName(site.id);
    const name = h('input', { type: 'text', value: site.name, placeholder: 'Example Eye Hospital' });
    name.addEventListener('change', () => edit((n) => (n.sites[i].name = name.value.trim())));
    const provider = h('input', { type: 'text', value: site.provider, placeholder: '0000000A' });
    provider.addEventListener('change', () => edit((n) => (n.sites[i].provider = provider.value.trim())));

    const fileInput = h('input', { type: 'file', accept: '.docx', hidden: true });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try {
        ctx.loadTemplate(site.id, file.name, new Uint8Array(await file.arrayBuffer()));
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Could not read that file.');
      }
      show('letterhead');
    });

    return h(
      'div',
      { class: 'card-row' },
      field('Hospital name (as it should read in the sign-off)', name),
      field('Your provider number at this hospital', provider, 'Printed after your name when this hospital is chosen; leave blank to omit'),
      h('p', { class: loaded ? 'note' : 'note warn' }, loaded ? `Letterhead loaded: ${loaded}` : 'No letterhead loaded yet.'),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onClick: () => fileInput.click() }, loaded ? 'Replace letterhead file' : 'Load letterhead file (.docx)'),
        loaded ? h('button', { type: 'button', class: 'btn', onClick: () => { ctx.clearTemplate(site.id); show('letterhead'); } }, 'Remove letterhead') : null,
        h('button', {
          type: 'button',
          class: 'btn danger',
          onClick: () => {
            if (!confirm(`Remove ${site.name || 'this hospital'} and its letterhead?`)) return;
            edit((n) => n.sites.splice(i, 1));
            show('letterhead');
          },
        }, 'Remove hospital'),
        fileInput,
      ),
    );
  });

  return h(
    'div',
    null,
    note('Add each hospital you write from, and load a Word file that has its letterhead (any letter on it will do). You then pick the hospital for each letter. Consultants are shared across all hospitals.'),
    note('“Download Word letter” and “Print / save PDF” use the chosen hospital’s header, footer and logos, always on A4.'),
    note('Privacy: the text of the file you load is removed as it is read, so only the letterhead is kept. Letterheads stay in this browser and are all included in the offline copy. They are not synced and are never part of the app’s code.'),
    ...rows,
    h('div', { class: 'btn-row' },
      h('button', {
        type: 'button',
        class: 'btn',
        onClick: () => {
          edit((n) => n.sites.push({ id: `s${Date.now().toString(36)}`, name: '', provider: '' }));
          show('letterhead');
        },
      }, 'Add hospital'),
    ),
  );
}

// ---------- Sync & backup ----------

function syncTab(ctx: SettingsContext, show: (t?: TabId) => void): HTMLElement {
  const syncHost = h('div');
  mountSyncControl(syncHost, SYNC_APP, STORAGE_KEY, () => location.reload());

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const imported = importSettings(await file.text());
      if (confirm('Replace your current settings with this file?')) {
        ctx.commit(imported);
        show('sync');
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not read that file.');
    }
  });

  return h(
    'div',
    null,
    note('Only these settings are ever saved or synced: your sign-off, consultants, recipients and phrases. Patient details and letters are never stored.'),
    h('h3', null, 'Sync across devices'),
    location.protocol === 'file:' ? note('This is the offline copy, which cannot reach the sync server. Use the GitHub Pages version to sync, or move settings with the file buttons below.') : null,
    syncHost,
    h('h3', null, 'Move or back up settings'),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', onClick: () => download('letter-builder-settings.json', exportSettings(ctx.get()), 'application/json') }, 'Export settings file'),
      h('button', { type: 'button', class: 'btn', onClick: () => fileInput.click() }, 'Import settings file'),
      fileInput,
    ),
    h('h3', null, 'Offline copy for a machine that blocks the web version'),
    note('Saves this page as one HTML file with your settings and every hospital’s letterhead already inside. Open it from a USB stick or a shared drive. It contains your names, so keep it private.'),
    h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', onClick: ctx.downloadOffline }, 'Download offline copy with my settings')),
    h('h3', null, 'Start again'),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn danger', onClick: () => { if (confirm('Reset all settings to the built-in defaults? Export first if you want a backup.')) { ctx.commit(defaultSettings()); show('sync'); } } }, 'Reset all settings'),
    ),
  );
}
