<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MapLegend from '@/components/MapLegend.vue'
import PopulationChart from '@/components/PopulationChart.vue'
import RegionMap from '@/components/RegionMap.vue'
import { usePopulationStore } from '@/stores/population'
import type { Level, Metric, Window } from '@/types/data'
import { formatNumber, formatPercent } from '@/utils/format'
import { computeMetric } from '@/utils/metrics'

const store = usePopulationStore()
const { t, locale } = useI18n()

// Only these two levels have boundary geometry; everything else is list-only.
const MAP_LEVELS: Level[] = ['nuts2', 'district']
const METRICS: Metric[] = ['cagr', 'relative_change', 'absolute_change']
const WINDOWS: Window[] = [1, 5, 10, 24]

const view = ref<'absolute' | 'change_relative' | 'change_absolute' | 'indexed'>('absolute')
const frequency = ref<'annual' | 'quarterly'>('annual')
const byCitizenship = ref(false)

const region = computed(() => store.selectedRegion)
const displayName = computed(() =>
  region.value ? (locale.value === 'en' ? region.value.name_en : region.value.name_de) : '',
)

const series = computed(() => store.seriesFor(store.selected) ?? [])
const dates = computed(() => store.datesFor(store.selected))

const latest = computed(() => series.value[series.value.length - 1] ?? null)
const latestDate = computed(() => dates.value[dates.value.length - 1] ?? '')

const headlineChange = computed(() =>
  computeMetric(series.value, store.metric as Metric, store.window as Window),
)

const windowLabel = (w: Window) =>
  w === 24
    ? t('metric.window_since', { year: 2002 })
    : t('metric.window_years', { n: w })

// Quarterly detail only exists at Bundesland level, so a selection below that
// falls back to annual rather than silently rendering an empty chart.
watch(
  () => store.selected,
  () => {
    if (!store.hasQuarterly(store.selected)) frequency.value = 'annual'
  },
)

watch(frequency, async (value) => {
  if (value === 'quarterly') await store.ensureQuarterly()
})
</script>

<template>
  <v-container fluid class="pa-4">
    <!-- Controls sit in one row above the map, never interleaved with it. -->
    <v-card flat border class="mb-4">
      <v-card-text class="d-flex flex-wrap ga-4 align-center py-3">
        <v-btn-toggle v-model="store.level" density="compact" variant="outlined" divided mandatory>
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
          style="max-width: 240px"
        />

        <v-select
          v-model="store.window"
          :items="WINDOWS.map((w) => ({ title: windowLabel(w), value: w }))"
          :label="t('metric.window')"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 170px"
        />

        <v-spacer />

        <div style="min-width: 260px; max-width: 340px; flex: 1 1 260px">
          <MapLegend />
        </div>
      </v-card-text>
    </v-card>

    <v-row>
      <v-col cols="12" md="7">
        <v-card flat border class="map-card">
          <RegionMap />
        </v-card>
        <div class="text-caption text-medium-emphasis mt-2">{{ t('map.hint') }}</div>
      </v-col>

      <v-col cols="12" md="5">
        <v-card flat border class="h-100">
          <v-card-item>
            <v-card-title class="text-h6">{{ displayName }}</v-card-title>
            <v-card-subtitle>
              {{ t(`levels_short.${region?.level}`) }} · {{ region?.code }}
            </v-card-subtitle>
          </v-card-item>

          <v-card-text>
            <!-- Two figures, not a chart: a single value each, so a stat pair
                 reads faster than any plot would. -->
            <div class="d-flex ga-8 mb-2">
              <div>
                <div class="text-caption text-medium-emphasis">
                  {{ t('chart.population') }} {{ latestDate.slice(0, 4) }}
                </div>
                <div class="text-h5">{{ formatNumber(latest, locale) }}</div>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis">
                  {{ t(`metric.${store.metric}`) }}
                </div>
                <div class="text-h5">
                  {{
                    store.metric === 'absolute_change'
                      ? formatNumber(headlineChange, locale)
                      : formatPercent(headlineChange, locale)
                  }}
                </div>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card flat border class="mt-4">
      <v-card-text>
        <div class="d-flex flex-wrap ga-4 align-center mb-3">
          <v-btn-toggle v-model="view" density="compact" variant="outlined" divided mandatory>
            <v-btn value="absolute" size="small">{{ t('chart.absolute') }}</v-btn>
            <v-btn value="change_relative" size="small">{{ t('chart.change_relative') }}</v-btn>
            <v-btn value="change_absolute" size="small">{{ t('chart.change_absolute') }}</v-btn>
            <v-btn value="indexed" size="small">{{ t('chart.indexed') }}</v-btn>
          </v-btn-toggle>

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

        <PopulationChart :view="view" :frequency="frequency" :by-citizenship="byCitizenship" />

        <div
          v-if="frequency === 'quarterly'"
          class="text-caption text-medium-emphasis mt-2"
        >
          {{ t('chart.provisional_note') }}
        </div>
        <div
          v-else-if="!store.hasQuarterly(store.selected)"
          class="text-caption text-medium-emphasis mt-2"
        >
          {{ t('chart.quarterly_hint') }}
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped>
.map-card {
  height: 520px;
  overflow: hidden;
}
</style>
