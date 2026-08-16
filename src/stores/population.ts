import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import type {
  AnnualClass,
  AnnualFile,
  Level,
  Manifest,
  Metric,
  QuarterlyFile,
  Region,
  RegionsFile,
  Window,
} from '@/types/data'
import { computeMetric } from '@/utils/metrics'

const BASE = import.meta.env.BASE_URL

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}data/${path}`)
  if (!response.ok) throw new Error(`failed to load ${path}: ${response.status}`)
  return (await response.json()) as T
}

export const usePopulationStore = defineStore('population', () => {
  const manifest = shallowRef<Manifest | null>(null)
  const regions = shallowRef<Region[]>([])
  const byCode = shallowRef<Map<string, Region>>(new Map())
  const annual = shallowRef<Map<Level, AnnualFile>>(new Map())
  const quarterly = shallowRef<QuarterlyFile | null>(null)
  const geo = shallowRef<Map<Level, GeoJSON.FeatureCollection>>(new Map())

  const ready = ref(false)
  const error = ref<string | null>(null)

  // View state, shared between the map and list pages so that a region selected
  // on one is still selected on the other.
  const level = ref<Level>('nuts2')
  const selected = ref<string>('AT')
  const metric = ref<Metric>('cagr')
  const window = ref<Window>(5)
  const minPopulation = ref(1000)

  async function init() {
    if (ready.value) return
    try {
      const [manifestFile, regionsFile] = await Promise.all([
        loadJson<Manifest>('manifest.json'),
        loadJson<RegionsFile>('regions.json'),
      ])
      manifest.value = manifestFile
      regions.value = regionsFile.regions
      byCode.value = new Map(regionsFile.regions.map((r) => [r.code, r]))
      // The country series backs the default chart, so it is never lazy.
      await ensureLevel('country')
      ready.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  /** Load one level's series on demand; municipality is the only heavy file. */
  async function ensureLevel(target: Level) {
    if (annual.value.has(target)) return
    const file = await loadJson<AnnualFile>(`annual/${target}.json`)
    annual.value = new Map(annual.value).set(target, file)
  }

  async function ensureGeo(target: Level) {
    if (geo.value.has(target)) return
    const file = await loadJson<GeoJSON.FeatureCollection>(`geo/${target}.geojson`)
    geo.value = new Map(geo.value).set(target, file)
  }

  async function ensureQuarterly() {
    if (quarterly.value) return
    quarterly.value = await loadJson<QuarterlyFile>('quarterly.json')
  }

  function levelOf(code: string): Level | null {
    return byCode.value.get(code)?.level ?? null
  }

  function seriesFor(code: string, cls: AnnualClass = 'total'): (number | null)[] | null {
    const target = levelOf(code)
    if (!target) return null
    return annual.value.get(target)?.series[code]?.[cls] ?? null
  }

  function datesFor(code: string): string[] {
    const target = levelOf(code)
    return (target && annual.value.get(target)?.dates) || []
  }

  /** Quarterly detail exists only at Bundesland level and for Austria. */
  function hasQuarterly(code: string): boolean {
    return code === 'AT' || levelOf(code) === 'nuts2'
  }

  /** Metric value per region for one level - drives both map fill and ranking. */
  const metricByCode = computed<Map<string, number | null>>(() => {
    const file = annual.value.get(level.value)
    const result = new Map<string, number | null>()
    if (!file) return result
    for (const [code, series] of Object.entries(file.series)) {
      result.set(code, computeMetric(series.total, metric.value, window.value))
    }
    return result
  })

  /** Regions of the active level, ranked by the active metric. */
  const ranked = computed(() => {
    const file = annual.value.get(level.value)
    if (!file) return []
    const rows = Object.entries(file.series).map(([code, series]) => {
      const latest = series.total[series.total.length - 1]
      return {
        code,
        region: byCode.value.get(code)!,
        latest,
        value: computeMetric(series.total, metric.value, window.value),
      }
    })
    const floor = level.value === 'municipality' ? minPopulation.value : 0
    return rows
      .filter((row) => row.value !== null && (row.latest ?? 0) >= floor)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  })

  const selectedRegion = computed(() => byCode.value.get(selected.value) ?? null)

  return {
    manifest,
    regions,
    byCode,
    annual,
    quarterly,
    geo,
    ready,
    error,
    level,
    selected,
    metric,
    window,
    minPopulation,
    init,
    ensureLevel,
    ensureGeo,
    ensureQuarterly,
    levelOf,
    seriesFor,
    datesFor,
    hasQuarterly,
    metricByCode,
    ranked,
    selectedRegion,
  }
})
