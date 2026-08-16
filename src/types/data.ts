export type Level = 'country' | 'nuts1' | 'nuts2' | 'nuts3' | 'district' | 'municipality'

export type AnnualClass = 'total' | 'austrian' | 'foreign'
export type QuarterlyClass = AnnualClass | 'eu_efta_uk' | 'third_country'

export interface Region {
  code: string
  name_de: string
  name_en: string
  level: Level
  parent: string | null
}

export interface RegionsFile {
  levels: Level[]
  mapped_levels: Level[]
  regions: Region[]
}

export interface AnnualFile {
  level: Level
  dates: string[]
  series: Record<string, Record<AnnualClass, (number | null)[]>>
}

export interface QuarterlyFile {
  dates: string[]
  /** Marks periods published as preliminary under a different residence rule. */
  provisional: boolean[]
  series: Record<string, Record<QuarterlyClass, (number | null)[]>>
}

export interface Correction {
  region: string
  name: string
  series: string
  periods: string[]
  max_delta: number
}

export interface Manifest {
  generated_at: string
  source_vintage: string | null
  annual: { first: string; last: string; n_periods: number; classes: AnnualClass[] }
  quarterly: {
    first: string
    last: string
    n_periods: number
    classes: QuarterlyClass[]
    n_provisional: number
  }
  region_counts: Record<string, number>
  sources: Record<string, string>
  corrections: Correction[]
  license: string
}

/** How the map colours regions and how rankings are ordered. */
export type Metric = 'cagr' | 'absolute_change' | 'relative_change'

/** Trailing window, in years, over which change is measured. */
export type Window = 1 | 5 | 10 | 24
