import { intlLocaleOf, type ValueFormat } from '@gears-frontx/frontx-dashboard-root/contract';

const UNIT: Record<string, Intl.NumberFormatOptions['unit']> = { ms: 'millisecond', s: 'second', min: 'minute', h: 'hour', d: 'day' };

/** The Intl options of a value format; `decimals` fixes the fraction digits of every value type. */
function optionsOf(format: ValueFormat | undefined): Intl.NumberFormatOptions {
  const digits = format?.decimals === undefined ? {} : { minimumFractionDigits: format.decimals, maximumFractionDigits: format.decimals };
  if (format?.value_type === 'percent') return { style: 'percent', maximumFractionDigits: 2, ...digits };
  if (format?.value_type === 'duration' && Object.hasOwn(UNIT, format.unit)) return { style: 'unit', unit: UNIT[format.unit], ...digits };
  if (format?.value_type === 'currency') return { style: 'currency', currency: format.currency, ...digits };
  return digits;
}

/** A number as the widget shows it: by `value_format`, for the host language. Null is an empty value. */
export function formatValue(value: number | null | undefined, format: ValueFormat | undefined, locale: string, notation?: 'standard' | 'compact'): string {
  if (value === null || value === undefined) return '';
  const text = new Intl.NumberFormat(intlLocaleOf(locale), { ...optionsOf(format), notation }).format(value);
  // A no-break space keeps the unit word on the number's line.
  return format?.value_type === 'number' && format.unit_label ? `${text} ${format.unit_label}` : text;
}

/** Any delivered value as text: numbers by `value_format`, the rest as given. */
export function textOf(value: string | number | null | undefined, format: ValueFormat | undefined, locale: string): string {
  return typeof value === 'number' ? formatValue(value, format, locale) : (value ?? '');
}
