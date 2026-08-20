<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

import { useMetricLabel } from '@/composables/useMetricLabel'
import { usePopulationStore } from '@/stores/population'
import type { Metric, Window } from '@/types/data'
import { formatNumber, formatPercent, formatRefDate, formatSigned } from '@/utils/format'
import { computeMetric } from '@/utils/metrics'

const YEARS = 10

const store = usePopulationStore()
const { t, locale } = useI18n()
const { fullLabel, isPercent } = useMetricLabel()
const display = useDisplay()

/**
 * Orientation follows the available width.
 *
 * Years across the columns suits a wide full-width row, but on a phone it means
 * ~860px of horizontal swiping. Narrow screens get years down the rows instead,
 * newest first, so the newest figures are on top and scrolling is vertical -
 * which is the direction a phone scrolls anyway.
 */
const yearsAcross = computed(() => !display.smAndDown.value)

const region = computed(() => store.selectedRegion)
const displayName = computed(() =>
  region.value ? (locale.value === 'en' ? region.value.name_en : region.value.name_de) : '',
)

const series = computed(() => store.seriesFor(store.selected) ?? [])
const dates = computed(() => store.datesFor(store.selected))

/** The number the map is currently coloured by, for this region. */
const heroValue = computed(() =>
  computeMetric(series.value, store.metric as Metric, store.window as Window),
)

const heroText = computed(() =>
  isPercent.value
    ? formatPercent(heroValue.value, locale.value)
    : formatSigned(heroValue.value, locale.value),
)

const latest = computed(() => series.value[series.value.length - 1] ?? null)

/** Reference date of the newest point, so the headline figure is unambiguous. */
const latestDate = computed(() => {
  const iso = dates.value[dates.value.length - 1]
  return iso ? formatRefDate(iso, locale.value) : ''
})

interface YearColumn {
  year: string
  population: number | null
  deltaAbs: number | null
  deltaRel: number | null
}

/**
 * The last ten years, oldest first, each with its change against the preceding
 * year. Needs eleven data points to fill ten columns; the series carries 25.
 *
 * Oldest first because the years run along the horizontal axis here, and time
 * reading left to right is the only orientation that does not fight the reader.
 */
const columns = computed<YearColumn[]>(() => {
  const values = series.value
  const first = Math.max(values.length - YEARS, 0)
  const out: YearColumn[] = []

  for (let i = first; i < values.length; i += 1) {
    const current = values[i]
    const previous = i > 0 ? values[i - 1] : null
    out.push({
      year: dates.value[i]?.slice(0, 4) ?? '',
      population: current,
      deltaAbs: current !== null && previous !== null ? current - previous : null,
      deltaRel:
        current !== null && previous !== null && previous > 0
          ? ((current - previous) / previous) * 100
          : null,
    })
  }
  return out
})

/** Row definitions, so the transposed body stays declarative. */
const measures = computed(() => [
  {
    key: 'population',
    label: t('detail.population'),
    value: (c: YearColumn) => formatNumber(c.population, locale.value),
  },
  {
    key: 'abs',
    label: t('detail.change_abs'),
    value: (c: YearColumn) => formatSigned(c.deltaAbs, locale.value),
  },
  {
    key: 'rel',
    label: t('detail.change_rel'),
    value: (c: YearColumn) => formatPercent(c.deltaRel, locale.value),
  },
])
</script>

<template>
  <v-card flat border>
    <!-- Wide header: identity on the left, the map's own indicator beside it, so
         the panel and the map can never appear to describe different things. -->
    <div
      class="d-flex flex-wrap align-center px-4 pt-3 pb-2"
      :class="display.smAndDown.value ? 'ga-3' : 'ga-8'"
    >
      <div class="d-flex align-baseline ga-2 flex-wrap">
        <span class="region-name text-h6">{{ displayName || t('detail.no_selection') }}</span>
        <span v-if="region" class="text-caption text-medium-emphasis">
          {{ t(`levels_short.${region.level}`) }} · {{ region.code }}
        </span>
      </div>

      <div>
        <div class="text-caption text-medium-emphasis">
          {{ t('detail.map_indicator') }} · {{ fullLabel }}
        </div>
        <div class="hero">{{ heroText }}</div>
      </div>

      <div>
        <div class="text-caption text-medium-emphasis">
          {{ t('detail.population') }} · {{ t('detail.as_of', { date: latestDate }) }}
        </div>
        <div class="text-subtitle-1">{{ formatNumber(latest, locale) }}</div>
      </div>
    </div>

    <v-divider />

    <div class="px-4 pt-2 text-caption text-medium-emphasis">
      {{ t('detail.last_years', { n: YEARS }) }} · {{ t('detail.table_reference') }}
    </div>

    <!-- Two orientations of the same ten years; see `yearsAcross`. -->
    <div class="table-scroll">
      <table v-if="yearsAcross" class="detail-table">
        <thead>
          <tr>
            <th class="row-label">{{ t('detail.year') }}</th>
            <th v-for="col in columns" :key="col.year" class="tabular">{{ col.year }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="measure in measures" :key="measure.key">
            <th scope="row" class="row-label">{{ measure.label }}</th>
            <td v-for="col in columns" :key="col.year" class="tabular">
              {{ measure.value(col) }}
            </td>
          </tr>
        </tbody>
      </table>

      <table v-else class="detail-table">
        <thead>
          <tr>
            <th class="row-label">{{ t('detail.year') }}</th>
            <th v-for="measure in measures" :key="measure.key" class="tabular">
              {{ measure.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="col in [...columns].reverse()" :key="col.year">
            <th scope="row" class="row-label tabular">{{ col.year }}</th>
            <td v-for="measure in measures" :key="measure.key" class="tabular">
              {{ measure.value(col) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </v-card>
</template>

<style scoped>
.hero {
  /* Proportional figures: this is a standalone number, not a table column. */
  font-size: 1.65rem;
  line-height: 1.1;
  font-weight: 500;
}

.table-scroll {
  overflow-x: auto;
  padding: 4px 16px 12px;
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
}

.detail-table th,
.detail-table td {
  padding: 6px 10px;
  text-align: right;
  white-space: nowrap;
  font-size: 0.8rem;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.detail-table tbody tr:last-child th,
.detail-table tbody tr:last-child td {
  border-bottom: none;
}

.detail-table thead th {
  font-size: 0.72rem;
  font-weight: 600;
  opacity: 0.72;
}

/* The leftmost column carries the measure names, so it reads as a header and
   stays put when the year columns scroll. */
.row-label {
  text-align: left !important;
  font-weight: 500;
  position: sticky;
  left: 0;
  background: rgb(var(--v-theme-surface));
  z-index: 1;
}

/* Deltas stay in ink tokens rather than red/green: population decline is not
   inherently bad, and the explicit signs already carry direction. */
.tabular {
  font-variant-numeric: tabular-nums;
}

/* Four columns of six-figure numbers do not fit 320px at the default metrics,
   so the narrowest screens get tighter cells rather than sideways scrolling. */
@media (max-width: 400px) {
  .detail-table th,
  .detail-table td {
    padding: 6px 4px;
    font-size: 0.72rem;
  }

  .detail-table thead th {
    font-size: 0.66rem;
  }

  .table-scroll {
    padding-inline: 8px;
  }
}
</style>
