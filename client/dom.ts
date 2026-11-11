type Child = Node | string | null | undefined | false;
type Attrs = Record<
  string,
  string | number | boolean | EventListener | undefined
>;

/**
 * Creates an element. `on*` attributes become listeners, `true` booleans
 * become empty attributes, and children are appended as nodes or text, so
 * no markup string is ever parsed.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') el.addEventListener(name.slice(2), value);
    else if (name === 'value' && 'value' in el)
      (el as HTMLInputElement).value = String(value);
    else el.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

export function readJson<T>(id: string): T | null {
  const el = document.getElementById(id);
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as T;
  } catch {
    return null;
  }
}
