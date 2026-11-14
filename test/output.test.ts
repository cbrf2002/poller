import { describe, expect, test } from 'vitest';
import { csvRow } from '../src/csv';
import { prefixedInput } from '../src/http/forms';
import { html, jsonBlock } from '../src/views/html';
import { clampedText } from '../src/views/parts';

describe('html', () => {
  test('escapes interpolated text, including attribute breakouts', () => {
    const name = `"><script>alert(1)</script>`;
    expect(html`<input value="${name}" />`.value).toBe(
      '<input value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;" />'
    );
  });

  test('renders false and null as nothing', () => {
    expect(html`a${false}${null}${undefined}b`.value).toBe('ab');
  });

  test('embedded JSON cannot close its script element', () => {
    expect(
      jsonBlock('d', { t: '</script><script>x()</script>' }).value
    ).not.toContain('</script><');
  });
});

describe('clampedText', () => {
  test('short answers stay plain, long or many-line ones get a toggle', () => {
    expect(clampedText('Ramen').value).toBe('Ramen');
    expect(clampedText('x'.repeat(61)).value).toContain('data-clamp');
    expect(clampedText(['a', 'b', 'c', 'd'].join('\n')).value).toContain(
      'data-clamp'
    );
  });

  test('a long answer is escaped inside the clamp', () => {
    const out = clampedText(`<img src=x onerror=alert(1)>${'y'.repeat(200)}`);
    expect(out.value).not.toContain('<img');
    expect(out.value).toContain('&lt;img');
  });
});

describe('csv', () => {
  test('neutralises spreadsheet formulas', () => {
    expect(csvRow(['=HYPERLINK("x")', '+1', '-1', '@cmd', 'plain'])).toBe(
      `"'=HYPERLINK(""x"")",'+1,'-1,'@cmd,plain\r\n`
    );
  });

  test('quotes commas and line breaks', () => {
    expect(csvRow(['a,b', 'line\nbreak'])).toBe('"a,b","line\nbreak"\r\n');
  });
});

describe('prefixedInput', () => {
  test('keeps only well-formed ids under the prefix', () => {
    expect(
      prefixedInput(
        {
          'q.abc': 'x',
          'q.multi': ['a', 'b'],
          'q.$bad': 'y',
          'f.abc': 'z',
          other: 'w',
          'q.n': 5,
        },
        'q.'
      )
    ).toEqual({ abc: 'x', multi: ['a', 'b'] });
  });
});
