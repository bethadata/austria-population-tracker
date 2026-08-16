/**
 * Visualization palette.
 *
 * Both modes are selected rather than derived: the dark column is the same hues
 * re-stepped for the dark surface, not an automatic flip. The categorical order
 * is the CVD-safety mechanism and must not be re-ordered or cycled - a sixth
 * series folds into "other" rather than generating a hue.
 *
 * Validated (OKLab dE x100, adjacent pairlist):
 *   light  worst CVD 9.1, worst normal-vision 19.6
 *   dark   worst CVD 8.4, worst normal-vision 19.3
 * Three light-mode slots sit below 3:1 on the light surface, so the relief rule
 * applies: charts always carry a legend, and the list view is the table view.
 */

export type Mode = 'light' | 'dark'

/** Categorical slots, in fixed order. Index = citizenship class order. */
export const SERIES: Record<Mode, string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
}

/**
 * Diverging ramp for the population-change choropleth.
 *
 * Growth reads blue, decline reads red, and the midpoint is a neutral gray so
 * that "no change" reads as nothing rather than as a third category. Arms carry
 * equal step counts and are lightness-matched pairwise, so a -2% region is
 * exactly as visually heavy as a +2% one.
 */
export const DIVERGING: Record<Mode, { decline: string[]; neutral: string; growth: string[] }> = {
  light: {
    decline: ['#a82a29', '#e34948', '#efa09e', '#f8d0cf'],
    neutral: '#f0efec',
    growth: ['#b7d3f6', '#86b6ef', '#3987e5', '#1c5cab'],
  },
  dark: {
    decline: ['#7d1f1f', '#b03230', '#e34948', '#efa09e'],
    neutral: '#383835',
    growth: ['#184f95', '#256abf', '#3987e5', '#86b6ef'],
  },
}

/** Chart chrome. Text always wears ink tokens, never a series color. */
export const CHROME: Record<Mode, Record<string, string>> = {
  light: {
    surface: '#fcfcfb',
    plane: '#f9f9f7',
    primary: '#0b0b0b',
    secondary: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    border: 'rgba(11,11,11,0.10)',
  },
  dark: {
    surface: '#1a1a19',
    plane: '#0d0d0d',
    primary: '#ffffff',
    secondary: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
    border: 'rgba(255,255,255,0.10)',
  },
}

/**
 * Break points for the choropleth, expressed as annualised percent change.
 *
 * Fixed rather than data-driven on purpose: a quantile scale would repaint every
 * region whenever the level or period changed, so a district could shift colour
 * without its own value moving. Fixed breaks keep colour meaning stable across
 * every view, and the bands match the real spread of Austrian regional growth.
 */
export const BREAKS = [-1.5, -0.75, -0.25, 0.25, 0.75, 1.5]

/** Build MapLibre `step` expression stops: [color, stop, color, stop, ...]. */
export function divergingStops(mode: Mode): (string | number)[] {
  const { decline, neutral, growth } = DIVERGING[mode]
  const colors = [...decline, neutral, ...growth]
  const stops: (string | number)[] = [colors[0]]
  BREAKS.forEach((brk, i) => stops.push(brk, colors[i + 1]))
  return stops
}

/** Legend rows, coarse-to-fine, for rendering the map key. */
export function legendBands(mode: Mode): { color: string; from: number | null; to: number | null }[] {
  const { decline, neutral, growth } = DIVERGING[mode]
  const colors = [...decline, neutral, ...growth]
  return colors.map((color, i) => ({
    color,
    from: i === 0 ? null : BREAKS[i - 1],
    to: i === colors.length - 1 ? null : BREAKS[i],
  }))
}
