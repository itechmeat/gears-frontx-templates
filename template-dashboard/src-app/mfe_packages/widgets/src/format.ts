import type { ValueFormat } from '@gears-frontx/frontx-dashboard-root/contract';

const UNIT: Record<string, Intl.NumberFormatOptions['unit']> = { ms: 'millisecond', s: 'second', min: 'minute', h: 'hour', d: 'day' };

/**
 * The host language as every Intl constructor takes it. The language property is a free string, so the host can
 * deliver one that is not a BCP-47 tag ("pt_BR", ""); Intl rejects it with a RangeError, so it falls back to `en`
 * and the widget keeps its numbers, dates and sorting.
 */
export function intlLocaleOf(locale: string | undefined): string {
  try {
    return Intl.getCanonicalLocales(locale ?? 'en')[0] ?? 'en';
  } catch {
    return 'en';
  }
}

/** A number as the widget shows it: by `value_format`, for the host language. Null is an empty value. */
export function formatValue(value: number | null | undefined, format: ValueFormat | undefined, locale: string, notation?: 'standard' | 'compact'): string {
  if (value === null || value === undefined) return '';
  const tag = intlLocaleOf(locale);
  if (format?.value_type === 'percent') return new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 2, notation }).format(value);
  if (format?.value_type === 'duration' && Object.hasOwn(UNIT, format.unit)) return new Intl.NumberFormat(tag, { style: 'unit', unit: UNIT[format.unit], notation }).format(value);
  return new Intl.NumberFormat(tag, { notation }).format(value);
}

/** Any delivered value as text: numbers by `value_format`, the rest as given. */
export function textOf(value: string | number | null | undefined, format: ValueFormat | undefined, locale: string): string {
  return typeof value === 'number' ? formatValue(value, format, locale) : (value ?? '');
}
