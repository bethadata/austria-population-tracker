/** Locale-aware formatting helpers shared by charts, tables and tooltips. */

const LOCALES: Record<string, string> = { de: 'de-AT', en: 'en-GB' }

export function intlLocale(locale: string): string {
  return LOCALES[locale] ?? 'de-AT'
}

export function formatNumber(value: number | null, locale: string, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '–'
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

/** Always carries an explicit sign - these are deltas, and direction is the point. */
export function formatSigned(value: number | null, locale: string, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '–'
  const formatted = formatNumber(Math.abs(value), locale, digits)
  if (value > 0) return `+${formatted}`
  if (value < 0) return `\u2212${formatted}`
  return formatted
}

export function formatPercent(value: number | null, locale: string, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '–'
  return `${formatSigned(value, locale, digits)} %`
}

/**
 * ISO date -> short display form. Quarterly points read as e.g. 'Q3 2026'.
 *
 * Deliberately locale-independent: both forms are numeric, and a localised
 * month name would break the even tick spacing the axis relies on.
 */
export function formatDate(iso: string, quarterly = false): string {
  const [year, month] = iso.split('-')
  if (!quarterly) return year
  const quarter = Math.floor((Number(month) - 1) / 3) + 1
  return `Q${quarter} ${year}`
}

/**
 * The reference date of a data point, compact enough to sit inline.
 *
 * Every figure on this site is a stock measured on one day, not an average over
 * a period: annual points are 1 January, quarterly points are the first day of
 * the quarter. Showing that date is the difference between "2026" meaning the
 * start of 2026 and it being read as some figure for the year as a whole.
 */
export function formatRefDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

export function formatFullDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'long' }).format(new Date(iso))
}
