import { describe, expect, it } from 'vitest';

import { formatValue } from './format';

describe('formatValue', () => {
  it('formats a plain number for the host language', () => {
    expect(formatValue(1234.5, undefined, 'en')).toBe('1,234.5');
    expect(formatValue(1234.5, undefined, 'de')).toBe('1.234,5');
  });

  it('formats percent and duration values for the host language', () => {
    expect(formatValue(0.25, { value_type: 'percent' }, 'en')).toBe('25%');
    expect(formatValue(90, { value_type: 'duration', unit: 's' }, 'en')).toBe('90 sec');
  });

  it('formats a number for a locale that is not a BCP-47 tag like en, without throwing', () => {
    // The locale property is a free string, so the host can deliver "pt_BR", which every Intl
    // constructor rejects with a RangeError; the widget still draws, with the English wording.
    expect(formatValue(1234.5, undefined, 'pt_BR')).toBe(formatValue(1234.5, undefined, 'en'));
    expect(formatValue(0.25, { value_type: 'percent' }, 'pt_BR')).toBe('25%');
    expect(formatValue(90, { value_type: 'duration', unit: 's' }, 'pt_BR')).toBe('90 sec');
  });
});
