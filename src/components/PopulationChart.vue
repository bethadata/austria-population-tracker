<script setup lang="ts">
// The basic bundle carries scatter/bar and drops the 3D, geo and statistical
// trace families this dashboard never renders - roughly a quarter the weight
// of the full distribution.
import Plotly from 'plotly.js-basic-dist-min'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

import { useAppTheme } from '@/composables/useTheme'
import { usePopulationStore } from '@/stores/population'
import type { AnnualClass, QuarterlyClass } from '@/types/data'
import { formatDate } from '@/utils/format'
import { changeSeries, deltaSeries, indexSeries } from '@/utils/metrics'
import { CHROME, SERIES } from '@/utils/palette'

type ChartView = 'absolute' | 'change_relative' | 'change_absolute' | 'indexed'

const props = withDefaults(
  defineProps<{
    view: ChartView
    frequency: 'annual' | 'quarterly'
    byCitizenship: boolean
    /** Plot height in px. The side-by-side layout runs it shorter than default. */
    height?: number
  }>(),
  { height: 340 },
)

const store = usePopulationStore()
const { mode } = useAppTheme()
const { t, locale } = useI18n()
const display = useDisplay()

const container = ref<HTMLDivElement | null>(null)

const ANNUAL_CLASSES: AnnualClass[] = ['total', 'austrian', 'foreign']
const QUARTERLY_CLASSES: QuarterlyClass[] = [
  'total',
  'austrian',
  'foreign',
  'eu_efta_uk',
  'third_country',
]

const isQuarterly = computed(
  () => props.frequency === 'quarterly' && store.hasQuarterly(store.selected),
)

const classes = computed<string[]>(() => {
  if (!props.byCitizenship) return ['total']
  return isQuarterly.value ? QUARTERLY_CLASSES : ANNUAL_CLASSES
})

const dates = computed<string[]>(() =>
  isQuarterly.value ? (store.quarterly?.dates ?? []) : store.datesFor(store.selected),
)

function rawSeries(cls: string): (number | null)[] {
  if (isQuarterly.value) {
    return store.quarterly?.series[store.selected]?.[cls as QuarterlyClass] ?? []
  }
  return store.seriesFor(store.selected, cls as AnnualClass) ?? []
}

/** Apply the selected view transform. Absolute values pass through unchanged. */
function transform(values: (number | null)[]): (number | null)[] {
  if (props.view === 'change_relative') return changeSeries(values)
  if (props.view === 'change_absolute') return deltaSeries(values)
  if (props.view === 'indexed') return indexSeries(values)
  return values
}

const yTitle = computed(() => {
  if (props.view === 'change_relative') return '%'
  if (props.view === 'change_absolute') return t('chart.change_absolute')
  if (props.view === 'indexed') return t('chart.indexed')
  return t('chart.population')
})

function buildTraces() {
  const chrome = CHROME[mode.value]
  const palette = SERIES[mode.value]
  const x = dates.value.map((iso) => formatDate(iso, isQuarterly.value))

  const traces = classes.value.map((cls, index) => ({
    x,
    y: transform(rawSeries(cls)),
    name: t(`classes.${cls}`),
    type: 'scatter' as const,
    mode: 'lines' as const,
    // Fixed slot order: colour follows the citizenship class, so toggling the
    // breakdown never repaints a series that stayed on screen.
    line: { color: palette[index], width: 2, shape: 'linear' as const },
    hovertemplate: `%{y:,.0f}<extra>${t(`classes.${cls}`)}</extra>`,
  }))

  // Provisional quarters are drawn as a shaded band rather than a differently
  // coloured line, so the distinction never competes with series identity.
  const shapes: Partial<Plotly.Shape>[] = []
  if (isQuarterly.value && store.quarterly) {
    const first = store.quarterly.provisional.indexOf(true)
    if (first >= 0) {
      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'paper',
        x0: x[Math.max(first - 1, 0)],
        x1: x[x.length - 1],
        y0: 0,
        y1: 1,
        fillcolor: chrome.grid,
        opacity: 0.55,
        line: { width: 0 },
        layer: 'below',
      })
    }
  }

  return { traces, shapes }
}

function layout(shapes: Partial<Plotly.Shape>[]): Partial<Plotly.Layout> {
  const chrome = CHROME[mode.value]
  return {
    autosize: true,
    height: props.height,
    margin: { l: 58, r: 12, t: 8, b: 36 },
    paper_bgcolor: chrome.surface,
    plot_bgcolor: chrome.surface,
    font: {
      family: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      size: 12,
      color: chrome.secondary,
    },
    xaxis: {
      showgrid: false,
      zeroline: false,
      linecolor: chrome.axis,
      tickcolor: chrome.axis,
      tickfont: { color: chrome.muted },
      automargin: true,
      ...(isQuarterly.value ? quarterlyTicks() : {}),
    },
    yaxis: {
      title: { text: yTitle.value, font: { color: chrome.secondary } },
      gridcolor: chrome.grid,
      zeroline: props.view !== 'absolute',
      zerolinecolor: chrome.axis,
      zerolinewidth: 1,
      linecolor: chrome.axis,
      tickfont: { color: chrome.muted },
      separatethousands: true,
      automargin: true,
    },
    // A legend is always present for two or more series, so identity never
    // rests on colour alone.
    showlegend: classes.value.length > 1,
    legend: {
      orientation: 'h',
      yanchor: 'bottom',
      y: 1.02,
      xanchor: 'left',
      x: 0,
      font: { color: chrome.secondary },
    },
    dragmode: display.smAndDown.value ? false : 'zoom',
    hovermode: 'x unified',
    hoverlabel: {
      bgcolor: chrome.surface,
      bordercolor: chrome.axis,
      font: { color: chrome.primary },
    },
    shapes,
  }
}

/**
 * Year ticks for the quarterly axis, thinned to what actually fits.
 *
 * 67 quarters cannot all be labelled. Even one label per year overlaps once the
 * plot is narrow, so the step is derived from the measured width and the labels
 * are reduced to the bare year - the hover box carries the exact quarter.
 * Category axes take tick positions as indices, not as category names.
 */
function quarterlyTicks(): Partial<Plotly.LayoutAxis> {
  const labels = dates.value
  const yearStarts = labels
    .map((iso, index) => ({ index, year: iso.slice(0, 4), isFirst: iso.slice(5, 7) === '01' }))
    .filter((entry) => entry.isFirst)

  const width = container.value?.clientWidth ?? 600
  const perLabel = 42
  const maxLabels = Math.max(3, Math.floor((width - 70) / perLabel))
  const step = Math.max(1, Math.ceil(yearStarts.length / maxLabels))
  const picked = yearStarts.filter((_, i) => i % step === 0)

  return {
    tickmode: 'array',
    tickvals: picked.map((entry) => entry.index),
    ticktext: picked.map((entry) => entry.year),
    tickangle: 0,
  }
}

function chartConfig(): Partial<Plotly.Config> {
  const small = display.smAndDown.value
  return {
    displaylogo: false,
    responsive: true,
    // The mode bar is a row of small targets that is unusable by thumb, and
    // scroll-zoom would hijack the page scroll.
    displayModeBar: !small,
    scrollZoom: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
  }
}

async function render() {
  if (!container.value) return
  const { traces, shapes } = buildTraces()
  await Plotly.react(container.value, traces, layout(shapes), chartConfig())
}

let resizeObserver: ResizeObserver | null = null
let resizeTimer: number | undefined

onMounted(async () => {
  if (props.frequency === 'quarterly') await store.ensureQuarterly()
  await render()

  // Plotly's own responsive handling rescales the plot but cannot know that the
  // tick step depends on width, so a re-render is needed on resize.
  if (container.value) {
    resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(render, 150)
    })
    resizeObserver.observe(container.value)
  }
})

watch(
  () => props.frequency,
  async (value) => {
    if (value === 'quarterly') await store.ensureQuarterly()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.clearTimeout(resizeTimer)
  if (container.value) Plotly.purge(container.value)
})

// store.quarterly is in the list because it arrives asynchronously: switching to
// quarterly kicks off a fetch, and without a dependency on the loaded payload the
// chart would render once against an empty series and never recover.
watch(
  [
    () => store.selected,
    () => props.view,
    () => props.frequency,
    () => props.byCitizenship,
    () => store.quarterly,
    () => store.annual,
    () => props.height,
    display.smAndDown,
    mode,
    locale,
  ],
  render,
)
</script>

<template>
  <div>
    <div v-if="!dates.length" class="text-medium-emphasis pa-6 text-center">
      {{ t('chart.no_data') }}
    </div>
    <div v-show="dates.length" ref="container" />
  </div>
</template>
