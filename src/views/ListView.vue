<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { usePopulationStore } from '@/stores/population'
import type { Level, Metric, Window } from '@/types/data'
import { formatNumber, formatPercent } from '@/utils/format'

const store = usePopulationStore()
const router = useRouter()
const { t, locale } = useI18n()

const LIST_LEVELS: Level[] = ['nuts1', 'nuts2', 'nuts3', 'district', 'municipality']
const METRICS: Metric[] = ['cagr', 'relative_change', 'absolute_change']
const WINDOWS: Window[] = [1, 5, 10, 24]

type Sort = 'growing' | 'shrinking' | 'largest'

const search = ref('')
const sort = ref<Sort>('growing')
const loading = ref(false)

const windowLabel = (w: Window) =>
  w === 24 ? t('metric.window_since', { year: 2002 }) : t('metric.window_years', { n: w })

async function load(level: Level) {
  loading.value = true
  await store.ensureLevel(level)
  loading.value = false
}

onMounted(() => load(store.level as Level))
watch(() => store.level, (value) => load(value as Level))

const rows = computed(() => {
  const base = store.ranked.map((row) => ({
    ...row,
    name: locale.value === 'en' ? row.region.name_en : row.region.name_de,
  }))

  const needle = search.value.trim().toLowerCase()
  const filtered = needle
    ? base.filter(
        (row) => row.name.toLowerCase().includes(needle) || row.code.toLowerCase().includes(needle),
      )
    : base

  // store.ranked is already sorted descending by the active metric.
  if (sort.value === 'shrinking') return [...filtered].reverse()
  if (sort.value === 'largest') return [...filtered].sort((a, b) => (b.latest ?? 0) - (a.latest ?? 0))
  return filtered
})

const latestDate = computed(() => {
  const dates = store.annual.get(store.level as Level)?.dates ?? []
  return dates[dates.length - 1]?.slice(0, 4) ?? ''
})

const headers = computed(() => [
  { title: t('list.code'), key: 'code', width: 96 },
  { title: t('list.name'), key: 'name' },
  { title: t('list.population', { date: latestDate.value }), key: 'latest', align: 'end' as const },
  { title: t(`metric.${store.metric}`), key: 'value', align: 'end' as const },
])

function open(code: string) {
  store.selected = code
  // A Gemeinde has no polygon of its own, so aim the map at the finest level that
  // does contain it. The chart and detail panel still describe the Gemeinde; the
  // map outlines its district.
  store.focusMapOn(code)
  router.push('/')
}
</script>

<template>
  <v-container fluid class="pa-4">
    <v-card flat border class="mb-4">
      <v-card-text class="d-flex flex-wrap ga-4 align-center py-3">
        <v-select
          v-model="store.level"
          :items="LIST_LEVELS.map((l) => ({ title: t(`levels.${l}`), value: l }))"
          :label="t('list.level')"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 230px"
        />

        <v-select
          v-model="store.metric"
          :items="METRICS.map((m) => ({ title: t(`metric.${m}`), value: m }))"
          :label="t('metric.label')"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 220px"
        />

        <v-select
          v-model="store.window"
          :items="WINDOWS.map((w) => ({ title: windowLabel(w), value: w }))"
          :label="t('metric.window')"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 160px"
        />

        <v-select
          v-model="sort"
          :items="[
            { title: t('list.fastest_growing'), value: 'growing' },
            { title: t('list.fastest_shrinking'), value: 'shrinking' },
            { title: t('list.largest'), value: 'largest' },
          ]"
          :label="t('list.sort')"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 220px"
        />

        <v-text-field
          v-model="search"
          :label="t('list.search')"
          prepend-inner-icon="mdi-magnify"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          style="min-width: 220px; flex: 1 1 220px"
        />
      </v-card-text>

      <!-- Without a floor, municipality rankings are entirely villages where a
           handful of people is a double-digit percentage. -->
      <v-card-text v-if="store.level === 'municipality'" class="pt-0">
        <div class="d-flex align-center ga-4">
          <div style="min-width: 220px; max-width: 320px; flex: 1 1 260px">
            <v-slider
              v-model="store.minPopulation"
              :min="0"
              :max="10000"
              :step="250"
              :label="t('list.min_population')"
              density="compact"
              hide-details
              thumb-label
            />
          </div>
          <span class="text-caption text-medium-emphasis">
            {{ t('list.min_population_hint') }}
          </span>
        </div>
      </v-card-text>
    </v-card>

    <v-card flat border>
      <v-data-table
        :headers="headers"
        :items="rows"
        :loading="loading"
        density="comfortable"
        items-per-page="25"
        hover
        @click:row="(_: unknown, { item }: { item: { code: string } }) => open(item.code)"
      >
        <template #item.latest="{ item }">
          <span class="tabular">{{ formatNumber(item.latest, locale) }}</span>
        </template>

        <template #item.value="{ item }">
          <span class="tabular">
            {{
              store.metric === 'absolute_change'
                ? formatNumber(item.value, locale)
                : formatPercent(item.value, locale)
            }}
          </span>
        </template>

        <template #no-data>
          <div class="pa-6 text-center text-medium-emphasis">{{ t('list.no_results') }}</div>
        </template>
      </v-data-table>
    </v-card>
  </v-container>
</template>

<style scoped>
.tabular {
  font-variant-numeric: tabular-nums;
}
</style>
