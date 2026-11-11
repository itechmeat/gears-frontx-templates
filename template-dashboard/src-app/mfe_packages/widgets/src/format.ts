import type { ValueFormat } from '@gears-frontx/frontx-dashboard-root/contract';

const UNIT: Record<string, Intl.NumberFormatOptions['unit']> = { ms: 'millisecond', s: 'second', min: 'minute', h: 'hour', d: 'day' };

/**
 * A number formatter for the locale. The locale property is a free string, so the host can deliver one that is
 * not a BCP-47 tag ("pt_BR"); Intl rejects it with a RangeError, and the widget falls back to `en` instead of
 * losing every number.
 */
function numberFormatOf(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, options);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return new Intl.NumberFormat('en', options);
  }
}

/** A number as the widget shows it: by `value_format`, for the host language. Null is an empty value. */
export function formatValue(value: number | null | undefined, format: ValueFormat | undefined, locale: string, notation?: 'standard' | 'compact'): string {
  if (value === null || value === undefined) return '';
  if (format?.value_type === 'percent') return numberFormatOf(locale, { style: 'percent', maximumFractionDigits: 2, notation }).format(value);
  if (format?.value_type === 'duration' && Object.hasOwn(UNIT, format.unit)) return numberFormatOf(locale, { style: 'unit', unit: UNIT[format.unit], notation }).format(value);
  return numberFormatOf(locale, { notation }).format(value);
}

/** Any delivered value as text: numbers by `value_format`, the rest as given. */
export function textOf(value: string | number | null | undefined, format: ValueFormat | undefined, locale: string): string {
  return typeof value === 'number' ? formatValue(value, format, locale) : (value ?? '');
}
