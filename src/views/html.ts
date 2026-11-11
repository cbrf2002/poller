/** Markup that is already escaped and can be inserted as is. */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'`]/g, ch => ESCAPES[ch]!);
}

type Interpolation =
  SafeHtml | string | number | boolean | null | undefined | Interpolation[];

function render(value: Interpolation): string {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(String(value));
}

/**
 * Template tag that escapes every interpolated value unless it is SafeHtml.
 * `false`, `null` and `undefined` render as nothing, so `${cond && html`…`}`
 * works.
 */
export function html(
  strings: TemplateStringsArray,
  ...values: Interpolation[]
): SafeHtml {
  let out = strings[0]!;
  values.forEach((value, i) => {
    out += render(value) + strings[i + 1]!;
  });
  return new SafeHtml(out);
}

/** Embeds data for client scripts in a non-executing JSON script block. */
export function jsonBlock(id: string, data: unknown): SafeHtml {
  // Escaping `<` means the data can never close the script element early.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return new SafeHtml(
    `<script type="application/json" id="${escapeHtml(id)}">${json}</script>`
  );
}
