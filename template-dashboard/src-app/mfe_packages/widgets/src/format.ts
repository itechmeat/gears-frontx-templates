import { intlLocaleOf, type ValueFormat } from '@gears-frontx/frontx-dashboard-root/contract';

const UNIT: Record<string, Intl.NumberFormatOptions['unit']> = { ms: 'millisecond', s: 'second', min: 'minute', h: 'hour', d: 'day' };

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
