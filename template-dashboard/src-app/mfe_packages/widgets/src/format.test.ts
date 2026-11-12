import { describe, expect, it } from 'vitest';

import { formatValue } from './format';

/** 90 seconds as this runtime's ICU data writes it in English, so the test holds on any ICU version. */
const NINETY_SECONDS = new Intl.NumberFormat('en', { style: 'unit', unit: 'second' }).format(90);

describe('formatValue', () => {
  it('formats a plain number for the host language', () => {
    expect(formatValue(1234.5, undefined, 'en')).toBe('1,234.5');
    expect(formatValue(1234.5, undefined, 'de')).toBe('1.234,5');
  });

  it('formats percent and duration values for the host language', () => {
    expect(formatValue(0.25, { value_type: 'percent' }, 'en')).toBe('25%');
    expect(formatValue(90, { value_type: 'duration', unit: 's' }, 'en')).toBe(NINETY_SECONDS);
  });

  it('formats a currency value for the host language', () => {
    // Expected texts come from this runtime's ICU data, so the test holds on any ICU version.
    expect(formatValue(1234.5, { value_type: 'currency', currency: 'EUR' }, 'en')).toBe(new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' }).format(1234.5));
    expect(formatValue(1234.5, { value_type: 'currency', currency: 'EUR' }, 'de')).toBe(new Intl.NumberFormat('de', { style: 'currency', currency: 'EUR' }).format(1234.5));
    expect(formatValue(1234.5, { value_type: 'currency', currency: 'USD' }, 'en')).toBe('$1,234.50');
  });

  it('shows exactly decimals fraction digits for a number and a percent', () => {
    expect(formatValue(1234.567, { value_type: 'number', decimals: 0 }, 'en')).toBe('1,235');
    expect(formatValue(1234.5, { value_type: 'number', decimals: 2 }, 'en')).toBe('1,234.50');
    expect(formatValue(0.12345, { value_type: 'percent', decimals: 0 }, 'en')).toBe('12%');
    expect(formatValue(0.125, { value_type: 'percent', decimals: 2 }, 'en')).toBe('12.50%');
    expect(formatValue(1234.5, { value_type: 'currency', currency: 'USD', decimals: 0 }, 'en')).toBe('$1,235');
  });

  it('writes the unit label after a number, joined by a no-break space', () => {
    expect(formatValue(1234, { value_type: 'number', unit_label: 'lines' }, 'en')).toBe('1,234 lines');
    expect(formatValue(1234.5, { value_type: 'number', unit_label: 'lines', decimals: 2 }, 'de')).toBe('1.234,50 lines');
  });

  it('keeps compact notation with a currency, decimals and a unit label', () => {
    expect(formatValue(1_234_000, { value_type: 'currency', currency: 'USD' }, 'en', 'compact')).toBe('$1.2M');
    expect(formatValue(1_234_000, { value_type: 'number', decimals: 2 }, 'en', 'compact')).toBe('1.23M');
    expect(formatValue(0.5, { value_type: 'percent', decimals: 1 }, 'en', 'compact')).toBe('50.0%');
    expect(formatValue(12_300, { value_type: 'number', unit_label: 'PRs' }, 'en', 'compact')).toBe('12K PRs');
  });

  it('formats a number for a locale that is not a BCP-47 tag like en, without throwing', () => {
    // The locale property is a free string, so the host can deliver "pt_BR", which every Intl
    // constructor rejects with a RangeError; the widget still draws, with the English wording.
    expect(formatValue(1234.5, undefined, 'pt_BR')).toBe('1,234.5');
    expect(formatValue(0.25, { value_type: 'percent' }, 'pt_BR')).toBe('25%');
    expect(formatValue(90, { value_type: 'duration', unit: 's' }, 'pt_BR')).toBe(NINETY_SECONDS);
  });
});
