import type { Metric } from '@/types/data'

/**
 * Compound annual growth rate over a trailing window, in percent per year.
 *
 * Annualising is what makes windows comparable: a 5-year and a 10-year figure
 * both read as "percent per year", so switching the window rescales the map
 * rather than changing what the numbers mean. Returns null where the window
 * runs off the start of the series or the base is zero.
 */
export function cagr(values: (number | null)[], window: number): number | null {
  const end = values.length - 1
  const start = end - window
  if (start < 0) return null
  const a = values[start]
  const b = values[end]
  if (a === null || b === null || a <= 0 || b <= 0) return null
  return (Math.pow(b / a, 1 / window) - 1) * 100
}

/** Absolute head-count change over the trailing window. */
export function absoluteChange(values: (number | null)[], window: number): number | null {
  const end = values.length - 1
  const start = end - window
  if (start < 0) return null
  const a = values[start]
  const b = values[end]
  if (a === null || b === null) return null
  return b - a
}

/** Total (not annualised) percent change over the trailing window. */
export function relativeChange(values: (number | null)[], window: number): number | null {
  const end = values.length - 1
  const start = end - window
  if (start < 0) return null
  const a = values[start]
  const b = values[end]
  if (a === null || b === null || a <= 0) return null
  return ((b - a) / a) * 100
}

export function computeMetric(
  values: (number | null)[],
  metric: Metric,
  window: number,
): number | null {
  if (metric === 'absolute_change') return absoluteChange(values, window)
  if (metric === 'relative_change') return relativeChange(values, window)
  return cagr(values, window)
}

/** Period-over-period percent change, aligned to the input (first entry null). */
export function changeSeries(values: (number | null)[]): (number | null)[] {
  return values.map((value, i) => {
    if (i === 0) return null
    const prev = values[i - 1]
    if (prev === null || value === null || prev <= 0) return null
    return ((value - prev) / prev) * 100
  })
}

/** Period-over-period absolute change, aligned to the input. */
export function deltaSeries(values: (number | null)[]): (number | null)[] {
  return values.map((value, i) => {
    if (i === 0) return null
    const prev = values[i - 1]
    if (prev === null || value === null) return null
    return value - prev
  })
}

/** Rebase a series to 100 at its first non-null point. */
export function indexSeries(values: (number | null)[]): (number | null)[] {
  const base = values.find((v) => v !== null && v > 0)
  if (base === undefined || base === null) return values.map(() => null)
  return values.map((v) => (v === null ? null : (v / base) * 100))
}
