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

    <!-- Map and time series sit side by side so both are readable without
         scrolling; the right column stacks the chart above the region detail and
         matches the map's height exactly. -->
    <v-row class="content-row" no-gutters>
      <v-col cols="12" lg="6" class="pe-lg-3 pb-3 pb-lg-0 map-column">
        <v-card flat border class="map-card">
          <RegionMap />
        </v-card>
        <div class="text-caption text-medium-emphasis mt-2 flex-shrink-0">
          {{ t('map.hint') }}
        </div>
      </v-col>

      <v-col cols="12" lg="6" class="right-column">
        <v-card flat border class="chart-card mb-3 flex-shrink-0">
          <v-card-text class="pb-1">
            <div class="d-flex flex-wrap ga-3 align-center mb-1">
              <v-select
                v-model="view"
                :items="CHART_VIEWS.map((v) => ({ title: t(`chart.${v}`), value: v }))"
                :label="t('chart.view')"
                density="compact"
                variant="outlined"
                hide-details
                style="max-width: 200px"
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
                :label="t('chart.citizenship')"
                density="compact"
                color="primary"
                hide-details
              />
            </div>

            <PopulationChart
              :view="view"
              :frequency="frequency"
              :by-citizenship="byCitizenship"
              :height="200"
            />

            <div v-if="chartNote" class="text-caption text-medium-emphasis">
              {{ chartNote }}
            </div>
          </v-card-text>
        </v-card>

        <RegionDetail class="detail-fill" />
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.map-page {
  display: flex;
  flex-direction: column;
}

/* Side by side from lg up, so the map and the time series share one view. */
@media (min-width: 1280px) {
  .content-row {
    /* Vuetify's .v-row wraps by default, which makes the single flex line's
       cross size content-driven - so align-items: stretch would never cap the
       columns to the row height. nowrap is what actually constrains them. */
    flex-wrap: nowrap;
  }

  .map-column,
  .right-column {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* The map takes the column's leftover height; the hint keeps its own. */
  .map-card {
    flex: 1 1 auto;
    min-height: 0;
  }

  .detail-fill {
    flex: 1 1 auto;
    min-height: 0;
  }

}

/* Lock the whole page to one viewport only when the window is actually tall
   enough to hold it. Forcing this at 768px high squeezed the detail table down
   to zero visible rows, which is worse than letting the page scroll. */
@media (min-width: 1280px) and (min-height: 900px) {
  .content-row {
    height: calc(100vh - 236px);
  }
}

@media (min-width: 1280px) and (max-height: 899px) {
  .map-card {
    height: 520px;
  }
}

.map-card {
  min-height: 380px;
  overflow: hidden;
}

@media (max-width: 1279px) {
  .map-card {
    height: 460px;
  }
}
</style>
