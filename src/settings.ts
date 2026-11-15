import { CLINICS, DEFAULT_PHRASES, SECTIONS, type ClinicId, type LetterType, type Phrase } from './phrases';

export interface Consultant {
  id: string;
  /** As written after "Registrar to", e.g. "Dr Jane Smith". */
  name: string;
  /** Lines under the registrar line, e.g. "Consultant Ophthalmologist, {hospital}". {hospital} becomes the chosen hospital's name. */
  /** Printed after the name on the registrar line; blank to omit. */
  provider: string;
  titles: string[];
  /** Clinics this consultant works in: listed first when that clinic is chosen. */
  clinics: ClinicId[];
}

/** A hospital or clinic site you write letters from. Its letterhead is stored separately, in the browser. */
export interface Site {
  id: string;
  /** Used wherever a consultant's lines say {hospital}, e.g. "Example Eye Hospital". */
  name: string;
  /** Your provider number at this hospital, printed after your name; blank to omit. */
  provider: string;
}

export interface Settings {
  version: 1;
  /** Hospitals to switch between. Consultants are shared across all of them. */
  sites: Site[];
  signer: { name: string; rolePrefix: string };
  consultants: Consultant[];
  /** Salutation names offered under "To", one per entry, e.g. "Dr Jones". */
  recipients: string[];
  /** Phrases added by the user. */
  customPhrases: Phrase[];
  /** Replacement wording for built-in phrases, by phrase id. */
  phraseEdits: Record<string, string>;
  /** Built-in phrases the user has hidden, by phrase id. */
  hiddenPhrases: string[];
  /** Extra drug suggestions per clinic. */
  extraDrugs: Record<ClinicId, string[]>;
  dateFormat: 'iso' | 'dmy';
  /** Blank space at the top of printed pages, for pre-printed letterhead. */
  topMarginMm: number;
}

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const STORAGE_KEY = 'letter-builder.settings';
/** Name of this app's record on the settings sync server. */
export const SYNC_APP = 'letter-builder';

function emptyDrugs(): Record<ClinicId, string[]> {
  return { general: [], uveitis: [], glaucoma: [], cornea: [], neuro: [], retina: [] };
}

export function defaultSettings(): Settings {
  return {
    version: 1,
    sites: [],
    signer: { name: '', rolePrefix: 'Registrar to' },
    consultants: [],
    recipients: [],
    customPhrases: [],
    phraseEdits: {},
    hiddenPhrases: [],
    extraDrugs: emptyDrugs(),
    dateFormat: 'iso',
    topMarginMm: 45,
  };
}

/** Built-in phrases minus hidden ones, with edits applied, plus the user's own. */
export function effectivePhrases(settings: Settings): Phrase[] {
  const hidden = new Set(settings.hiddenPhrases);
  const builtIn = DEFAULT_PHRASES.filter((ph) => !hidden.has(ph.id)).map((ph) => {
    const edit = settings.phraseEdits[ph.id];
    return edit ? { ...ph, text: edit } : ph;
  });
  return [...builtIn, ...settings.customPhrases];
}

export function loadSettings(store: KeyValueStore | null, fallbackText?: string | null): Settings {
  try {
    const text = store?.getItem(STORAGE_KEY) || fallbackText;
    return text ? importSettings(text) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

/**
 * Which settings text to start with. Settings built into an offline copy win when they were saved
 * after the ones this browser holds (a newer copy of the file, opened where an older one was used
 * before); otherwise the browser's own win, so edits made in the file are kept.
 */
export function pickSettingsText(
  stored: string | null,
  storedUpdated: number,
  embedded: string | null,
  embeddedSavedAt: number,
): { text: string | null; fromEmbedded: boolean } {
  if (!embedded) return { text: stored || null, fromEmbedded: false };
  if (!stored) return { text: embedded, fromEmbedded: true };
  if (embeddedSavedAt > storedUpdated) return { text: embedded, fromEmbedded: true };
  return { text: stored, fromEmbedded: false };
}

export function saveSettings(store: KeyValueStore | null, settings: Settings): void {
  try {
    store?.setItem(STORAGE_KEY, exportSettings(settings));
  } catch {
    // Storage unavailable (private window, blocked site data): settings last for this visit only.
  }
}

export function exportSettings(settings: Settings): string {
  return JSON.stringify(settings, null, 2);
}

/** Reads settings JSON, filling anything missing or malformed with defaults. */
export function importSettings(text: string): Settings {
  const data: unknown = JSON.parse(text);
  if (!isObject(data)) throw new Error('This file isn’t a Letter Builder settings file.');
  const d = defaultSettings();

  const signer = isObject(data.signer) ? data.signer : {};
  const clinicIds = new Set<string>(CLINICS.map((c) => c.id));
  const typeIds = new Set<string>(Object.keys(SECTIONS));

  const extraDrugs = emptyDrugs();
  if (isObject(data.extraDrugs)) {
    for (const id of Object.keys(extraDrugs) as ClinicId[]) extraDrugs[id] = stringList(data.extraDrugs[id]);
  }

  return {
    version: 1,
    sites: Array.isArray(data.sites)
      ? data.sites
          .filter(isObject)
          // A single provider number saved by an earlier version is kept for hospitals without their own.
          .map((s, i): Site => ({ id: str(s.id, `site${i}`) || `site${i}`, name: str(s.name, '').trim(), provider: str(s.provider, '').trim() || str(signer.provider, '').trim() }))
          .filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i)
      : d.sites,
    signer: {
      name: str(signer.name, d.signer.name),
      rolePrefix: str(signer.rolePrefix, d.signer.rolePrefix),
    },
    consultants: Array.isArray(data.consultants)
      ? data.consultants.filter(isObject).map(
          (c, i): Consultant => ({
            id: str(c.id, `c${i}`),
            name: str(c.name, ''),
            provider: str(c.provider, '').trim(),
            titles: stringList(c.titles),
            clinics: stringList(c.clinics).filter((x): x is ClinicId => clinicIds.has(x)),
          }),
        )
      : d.consultants,
    recipients: stringList(data.recipients),
    customPhrases: Array.isArray(data.customPhrases)
      ? data.customPhrases
          .filter(isObject)
          .filter((c) => typeIds.has(String(c.type)) && typeof c.text === 'string' && c.text.trim())
          .map(
            (c, i): Phrase => ({
              id: str(c.id, `custom-${i}`),
              type: c.type as LetterType,
              section: str(c.section, 'open'),
              text: String(c.text),
              clinics: stringList(c.clinics).filter((x): x is ClinicId => clinicIds.has(x)),
              custom: true,
            }),
          )
          .map((ph) => (ph.clinics && ph.clinics.length ? ph : { ...ph, clinics: undefined }))
      : d.customPhrases,
    phraseEdits: isObject(data.phraseEdits)
      ? Object.fromEntries(Object.entries(data.phraseEdits).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== ''))
      : d.phraseEdits,
    hiddenPhrases: stringList(data.hiddenPhrases),
    extraDrugs,
    dateFormat: data.dateFormat === 'dmy' ? 'dmy' : 'iso',
    topMarginMm: typeof data.topMarginMm === 'number' && data.topMarginMm >= 0 && data.topMarginMm <= 120 ? data.topMarginMm : d.topMarginMm,
  };
}

/** Phrase list kept for the clinic: untagged phrases plus ones tagged for it (or everything). */
export function phrasesFor(all: Phrase[], type: LetterType, section: string, clinic: ClinicId, showAll: boolean): Phrase[] {
  return all.filter(
    (ph) => ph.type === type && ph.section === section && (showAll || !ph.clinics || ph.clinics.length === 0 || ph.clinics.includes(clinic)),
  );
}

export function parseList(text: string): string[] {
  return text
    .split(/[\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
