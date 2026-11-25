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

  it('shows at most max_decimals fraction digits for every value type, and a whole number with none', () => {
    expect(formatValue(47.25, { value_type: 'number', max_decimals: 1 }, 'en')).toBe('47.3');
    expect(formatValue(1234, { value_type: 'number', max_decimals: 1 }, 'en')).toBe('1,234');
    expect(formatValue(1234.5, { value_type: 'number', max_decimals: 2 }, 'de')).toBe('1.234,5');
    expect(formatValue(1, { value_type: 'percent', max_decimals: 1 }, 'en')).toBe('100%');
    expect(formatValue(0.0225, { value_type: 'percent', max_decimals: 1 }, 'en')).toBe('2.3%');
    expect(formatValue(1234, { value_type: 'currency', currency: 'USD', max_decimals: 2 }, 'en')).toBe('$1,234');
    expect(formatValue(1234.5, { value_type: 'currency', currency: 'USD', max_decimals: 2 }, 'en')).toBe('$1,234.5');
    expect(formatValue(90, { value_type: 'duration', unit: 's', max_decimals: 1 }, 'en')).toBe(NINETY_SECONDS);
    expect(formatValue(90.25, { value_type: 'duration', unit: 's', max_decimals: 1 }, 'en')).toBe(new Intl.NumberFormat('en', { style: 'unit', unit: 'second' }).format(90.3));
  });

  it('writes a value that shows as zero with no sign', () => {
    expect(formatValue(-0.004, { value_type: 'number', decimals: 2 }, 'en')).toBe('0.00');
    expect(formatValue(-0.04, { value_type: 'number', max_decimals: 1 }, 'en')).toBe('0');
  });

  it('writes the unit label after a number, joined by a no-break space', () => {
    expect(formatValue(1234, { value_type: 'number', unit_label: 'lines' }, 'en')).toBe('1,234 lines');
    expect(formatValue(1234.5, { value_type: 'number', unit_label: 'lines', decimals: 2 }, 'de')).toBe('1.234,50 lines');
    expect(formatValue(1234, { value_type: 'number', unit_label: 'lines', max_decimals: 2 }, 'en')).toBe('1,234 lines');
  });

  it('keeps compact notation with a currency, decimals, max_decimals and a unit label', () => {
    expect(formatValue(1_234_000, { value_type: 'currency', currency: 'USD' }, 'en', 'compact')).toBe('$1.2M');
    expect(formatValue(1_234_000, { value_type: 'number', decimals: 2 }, 'en', 'compact')).toBe('1.23M');
    expect(formatValue(0.5, { value_type: 'percent', decimals: 1 }, 'en', 'compact')).toBe('50.0%');
    expect(formatValue(1_234_000, { value_type: 'number', max_decimals: 2 }, 'en', 'compact')).toBe('1.23M');
    expect(formatValue(1_000_000, { value_type: 'number', max_decimals: 2 }, 'en', 'compact')).toBe('1M');
    expect(formatValue(0.5, { value_type: 'percent', max_decimals: 1 }, 'en', 'compact')).toBe('50%');
    expect(formatValue(12_300, { value_type: 'number', unit_label: 'PRs' }, 'en', 'compact')).toBe('12K PRs');
  });

  it.each<[number, 'ms' | 's' | 'min' | 'h' | 'd', string]>([
    [52, 'h', '2d 4h'],
    [48, 'h', '2d'],
    [200, 'min', '3h 20m'],
    [45, 's', '45s'],
    [120, 'ms', '120ms'],
    [1.5, 'd', '1d 12h'],
    [90, 's', '1m 30s'],
    [45.4, 's', '45s'],
    [59.6, 's', '1m'],
    [23.996, 'h', '1d'],
    [999.6, 'ms', '1s'],
    [0.4, 'ms', '0ms'],
    [-0.4, 'ms', '0ms'],
    [0, 'h', '0h'],
    [0, 'min', '0m'],
    [-52, 'h', '-2d 4h'],
    [3_600_000, 'ms', '1h'],
    [86_400, 's', '1d'],
    [1000, 'd', '1,000d'],
  ])('writes %d %s as the compound duration %s', (value, unit, text) => {
    expect(formatValue(value, { value_type: 'duration', unit, compound: true }, 'en')).toBe(text);
  });

  it('writes a compound duration with the narrow units and the unit list of the host language', () => {
    const narrow = (unit: string, amount: number) => new Intl.NumberFormat('de', { style: 'unit', unit, unitDisplay: 'narrow' }).format(amount);
    const list = new Intl.ListFormat('de', { type: 'unit', style: 'narrow' }).format([narrow('day', 2), narrow('hour', 4)]);
    expect(formatValue(52, { value_type: 'duration', unit: 'h', compound: true }, 'de')).toBe(list);
    expect(formatValue(52, { value_type: 'duration', unit: 'h', compound: true }, 'pt_BR')).toBe('2d 4h');
  });

  it('writes a compound duration in parts in compact notation too, and a duration that is not compound in its unit', () => {
    const fiftyTwoHours = new Intl.NumberFormat('en', { style: 'unit', unit: 'hour' }).format(52);
    expect(formatValue(52, { value_type: 'duration', unit: 'h', compound: true }, 'en', 'compact')).toBe('2d 4h');
    expect(formatValue(52, { value_type: 'duration', unit: 'h' }, 'en')).toBe(fiftyTwoHours);
    expect(formatValue(52, { value_type: 'duration', unit: 'h', compound: false }, 'en')).toBe(fiftyTwoHours);
  });

  it('writes a compound duration whose milliseconds overflow in its own unit', () => {
    expect(formatValue(1e305, { value_type: 'duration', unit: 'd', compound: true }, 'en')).toBe(formatValue(1e305, { value_type: 'duration', unit: 'd' }, 'en'));
  });

  it('formats a number for a locale that is not a BCP-47 tag like en, without throwing', () => {
    // The locale property is a free string, so the host can deliver "pt_BR", which every Intl
    // constructor rejects with a RangeError; the widget still draws, with the English wording.
    expect(formatValue(1234.5, undefined, 'pt_BR')).toBe('1,234.5');
    expect(formatValue(0.25, { value_type: 'percent' }, 'pt_BR')).toBe('25%');
    expect(formatValue(90, { value_type: 'duration', unit: 's' }, 'pt_BR')).toBe(NINETY_SECONDS);
  });
});
