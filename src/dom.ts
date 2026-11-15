type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown>;

const PROPERTIES = new Set(['value', 'checked', 'disabled', 'selected', 'textContent', 'open']);

/** Small element builder: h('button', { class: 'x', onClick: fn }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else if (PROPERTIES.has(key)) (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

/** A row of exclusive buttons. Returns the element and a function to re-sync it with the state. */
export function chips<T extends string>(
  options: ChipOption<T>[],
  get: () => T,
  set: (v: T) => void,
  className = 'chips',
): { el: HTMLElement; sync: () => void } {
  const buttons = options.map((o) =>
    h('button', {
      type: 'button',
      class: 'chip',
      title: o.title,
      onClick: () => {
        set(o.value);
        sync();
      },
    }, o.label),
  );
  const el = h('div', { class: className, role: 'group' }, ...buttons);
  const sync = () => {
    options.forEach((o, i) => {
      const on = get() === o.value;
      buttons[i].classList.toggle('on', on);
      buttons[i].setAttribute('aria-pressed', String(on));
    });
  };
  sync();
  return { el, sync };
}

export function field(label: string, control: HTMLElement, hint?: string, className = ''): HTMLElement {
  return h('label', { class: `field ${className}`.trim() }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
}

export function option(value: string, label: string, selected = false): HTMLOptionElement {
  return h('option', { value, selected }, label);
}

export function datalist(id: string, items: string[]): HTMLDataListElement {
  return h('datalist', { id }, ...items.map((i) => h('option', { value: i })));
}

export function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function download(filename: string, content: string | Uint8Array, type = 'text/plain'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: `${type};charset=utf-8` }) : new Blob([content as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
