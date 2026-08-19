<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MapLegend from '@/components/MapLegend.vue'
import PopulationChart from '@/components/PopulationChart.vue'
import RegionDetail from '@/components/RegionDetail.vue'
import RegionMap from '@/components/RegionMap.vue'
import { useMetricLabel } from '@/composables/useMetricLabel'
import { usePopulationStore } from '@/stores/population'
import type { Level, Metric, Window } from '@/types/data'

const store = usePopulationStore()
const { t } = useI18n()
const { windowLabel } = useMetricLabel()

// Only these two levels have boundary geometry; everything else is list-only.
const MAP_LEVELS: Level[] = ['nuts2', 'district']
const METRICS: Metric[] = ['cagr', 'relative_change', 'absolute_change']
const WINDOWS: Window[] = [1, 5, 10, 24]

type ChartView = 'absolute' | 'change_relative' | 'change_absolute' | 'indexed'
const CHART_VIEWS: ChartView[] = ['absolute', 'change_relative', 'change_absolute', 'indexed']

const view = ref<ChartView>('absolute')
const frequency = ref<'annual' | 'quarterly'>('annual')
const byCitizenship = ref(false)

// Rendered only when non-empty, so an absent note costs no vertical space.
const chartNote = computed(() => {
  if (frequency.value === 'quarterly') return t('chart.provisional_note')
  if (!store.hasQuarterly(store.selected)) return t('chart.quarterly_hint')
  return ''
})

// Quarterly detail only exists at Bundesland level, so a selection below that
// falls back to annual rather than silently rendering an empty chart.
watch(
  () => store.selected,
  () => {
    if (!store.hasQuarterly(store.selected)) frequency.value = 'annual'
  },
)
</script>

<template>
  <v-container fluid class="pa-4 map-page">
    <!-- Filters in one row above everything, never interleaved with the views. -->
    <v-card flat border class="mb-3 flex-shrink-0">
      <v-card-text class="d-flex flex-wrap ga-4 align-center py-3">
        <v-btn-toggle v-model="store.mapLevel" density="compact" variant="outlined" divided mandatory>
          <v-btn v-for="lvl in MAP_LEVELS" :key="lvl" :value="lvl" size="small">
            {{ t(`levels.${lvl}`) }}
          </v-btn>
        </v-btn-toggle>

        <v-select
          v-model="store.metric"
          :items="METRICS.map((m) => ({ title: t(`metric.${m}`), value: m }))"
          :label="t('metric.label')"
          density="compact"
          variant="outlined"
          hide-details
          style="min-width: 265px"
        />

        <v-select
          v-model="store.window"
          :items="WINDOWS.map((w) => ({ title: windowLabel(w), value: w }))"
          :label="t('metric.window')"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 165px"
        />

        <v-spacer />

        <div style="min-width: 250px; max-width: 330px; flex: 1 1 250px">
          <MapLegend />
        </div>
      </v-card-text>
    </v-card>

    <!-- Row one: map and time series beside each other. Row two: the year table
         across the full width. Splitting it this way keeps the map from being
         stretched to the full page height just to match a tall side column. -->
    <v-row class="content-row" no-gutters>
      <v-col cols="12" lg="7" class="pe-lg-3 pb-3 pb-lg-0 map-column">
        <v-card flat border class="map-card">
          <RegionMap />
        </v-card>
        <div class="text-caption text-medium-emphasis mt-2 flex-shrink-0">
          {{ t('map.hint') }}
        </div>
      </v-col>

      <v-col cols="12" lg="5" class="chart-column">
        <v-card flat border class="chart-card">
          <v-card-text class="pb-1">
            <div class="d-flex flex-wrap ga-3 align-center mb-1">
              <v-select
                v-model="view"
                :items="CHART_VIEWS.map((v) => ({ title: t(`chart.${v}`), value: v }))"
                :label="t('chart.view')"
                density="compact"
                variant="outlined"
                hide-details
                style="max-width: 190px"
              />

              <v-btn-toggle
                v-model="frequency"
                density="compact"
                variant="outlined"
                divided
                mandatory
                :disabled="!store.hasQuarterly(store.selected)"
              >
                <v-btn value="annual" size="small">{{ t('chart.annual') }}</v-btn>
                <v-btn value="quarterly" size="small">{{ t('chart.quarterly') }}</v-btn>
              </v-btn-toggle>

              <v-switch
                v-model="byCitizenship"
                :label="t('chart.citizenship_short')"
                :title="t('chart.citizenship')"
                density="compact"
                color="primary"
                hide-details
              />
            </div>

            <PopulationChart
              :view="view"
              :frequency="frequency"
              :by-citizenship="byCitizenship"
              :height="230"
            />

            <div v-if="chartNote" class="text-caption text-medium-emphasis">
              {{ chartNote }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <RegionDetail class="mt-3" />
  </v-container>
</template>

<style scoped>
.map-page {
  display: flex;
  flex-direction: column;
}

@media (min-width: 1280px) {
  /* No fixed row height. Pinning it to a viewport fraction meant that on shorter
     windows the row was smaller than the chart card needed, and overflow: hidden
     clipped the bottom of the plot where the table card began. The row now takes
     its height from the chart's own content and the map matches it exactly, so
     neither card can ever be cut off. */
  .content-row {
    flex-wrap: nowrap;
    align-items: stretch;
  }

  .map-column,
  .chart-column {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* The map takes the column's leftover height; the hint keeps its own. */
  .map-card {
    flex: 1 1 auto;
    min-height: 280px;
    max-height: 460px;
  }

  .chart-card {
    flex: 1 1 auto;
  }
}

.map-card {
  overflow: hidden;
}

@media (max-width: 1279px) {
  .map-card {
    height: 420px;
  }

  .chart-column {
    margin-top: 12px;
  }
}
</style>
