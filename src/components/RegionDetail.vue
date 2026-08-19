<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useMetricLabel } from '@/composables/useMetricLabel'
import { usePopulationStore } from '@/stores/population'
import type { Metric, Window } from '@/types/data'
import { formatNumber, formatPercent, formatSigned } from '@/utils/format'
import { computeMetric } from '@/utils/metrics'

const YEARS = 10

const store = usePopulationStore()
const { t, locale } = useI18n()
const { fullLabel, isPercent } = useMetricLabel()

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

/**
 * The last ten years, newest first, each with its change against the preceding
 * year. Needs eleven data points to produce ten rows; the series carries 25.
 */
const rows = computed(() => {
  const values = series.value
  const out: {
    year: string
    population: number | null
    deltaAbs: number | null
    deltaRel: number | null
  }[] = []

  for (let i = values.length - 1; i >= 0 && out.length < YEARS; i -= 1) {
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
</script>

<template>
  <v-card flat border class="d-flex flex-column detail-card">
    <!-- Header and hero kept tight: every pixel here is a table row lost.
         The hero names the metric the map is coloured by, so the panel and the
         map can never appear to describe different things. -->
    <div class="px-4 pt-3">
      <div class="d-flex align-baseline ga-2 flex-wrap">
        <span class="region-name text-h6">{{ displayName || t('detail.no_selection') }}</span>
        <span v-if="region" class="text-caption text-medium-emphasis">
          {{ t(`levels_short.${region.level}`) }} · {{ region.code }}
        </span>
      </div>

      <div class="d-flex align-end ga-6 flex-wrap mt-1">
        <div>
          <div class="text-caption text-medium-emphasis">{{ t('detail.map_indicator') }}</div>
          <div class="hero">{{ heroText }}</div>
        </div>
        <div class="pb-1">
          <div class="text-caption text-medium-emphasis">
            {{ t('detail.population') }} {{ dates[dates.length - 1]?.slice(0, 4) }}
          </div>
          <div class="text-subtitle-1">{{ formatNumber(latest, locale) }}</div>
        </div>
      </div>
      <div class="text-caption text-medium-emphasis">{{ fullLabel }}</div>
    </div>

    <v-divider class="mt-2" />

    <div class="px-4 pt-2 text-caption text-medium-emphasis">
      {{ t('detail.last_years', { n: YEARS }) }}
    </div>

    <!-- Scrolls inside its own box so the column never drives page scroll. -->
    <div class="table-scroll">
      <v-table density="compact" class="detail-table">
        <thead>
          <tr>
            <th>{{ t('detail.year') }}</th>
            <th class="text-end">{{ t('detail.population') }}</th>
            <th class="text-end">{{ t('detail.change_abs') }}</th>
            <th class="text-end">{{ t('detail.change_rel') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.year">
            <td class="tabular">{{ row.year }}</td>
            <td class="text-end tabular">{{ formatNumber(row.population, locale) }}</td>
            <td class="text-end tabular">{{ formatSigned(row.deltaAbs, locale) }}</td>
            <td class="text-end tabular">{{ formatPercent(row.deltaRel, locale) }}</td>
          </tr>
        </tbody>
      </v-table>
    </div>
  </v-card>
</template>

<style scoped>
.detail-card {
  min-height: 0;
}

.hero {
  /* Proportional figures: this is a standalone number, not a table column. */
  font-size: 1.75rem;
  line-height: 1.1;
  font-weight: 500;
}

.table-scroll {
  flex: 1 1 auto;
  /* A floor so the table never collapses to a header with no rows, and a cap so
     it does not run away when the column height is unconstrained. */
  min-height: 132px;
  max-height: 460px;
  overflow-y: auto;
  /* Keeps the oldest row off the card edge instead of flush against it. */
  padding-bottom: 4px;
}

/* Deltas stay in ink tokens rather than red/green: population decline is not
   inherently bad, and the explicit signs already carry direction. */
.tabular {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.detail-table :deep(th) {
  font-size: 0.7rem !important;
  white-space: nowrap;
}

.detail-table :deep(td) {
  font-size: 0.78rem !important;
}
</style>
