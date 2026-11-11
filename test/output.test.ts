import { describe, expect, test } from 'vitest';
import { csvRow } from '../src/csv';
import { prefixedInput } from '../src/http/forms';
import { html, jsonBlock } from '../src/views/html';

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
