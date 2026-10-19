import { describe, expect, it } from 'vitest';
import { printablePage } from './TableQr';

/** The QR print page is written as HTML: a table's number is text, never markup. */
describe('the QR print page', () => {
  it('escapes the table number and the code', () => {
    const page = printablePage('<img src=x onerror=alert(1)>', 'data:image/png;base64,AA', 'a&b"c');
    expect(page).not.toContain('<img src=x');
    expect(page).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(page).toContain('a&amp;b&quot;c');
  });
});
