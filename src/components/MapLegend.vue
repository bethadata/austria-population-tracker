<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAppTheme } from '@/composables/useTheme'
import { formatNumber } from '@/utils/format'
import { legendBands } from '@/utils/palette'

const { mode } = useAppTheme()
const { t, locale } = useI18n()

const bands = computed(() => legendBands(mode.value))

/** Only interior breaks get a printed number; the open ends read as < and >. */
function tick(band: { from: number | null; to: number | null }): string {
  if (band.from === null) return `< ${formatNumber(band.to, locale.value, 2)}`
  if (band.to === null) return `> ${formatNumber(band.from, locale.value, 2)}`
  return ''
}
</script>

<template>
  <div class="legend">
    <div class="legend-title text-medium-emphasis">
      {{ t('map.legend') }} <span class="legend-unit">({{ t('map.legend_unit') }})</span>
    </div>

    <div class="legend-scale">
      <div
        v-for="band in bands"
        :key="band.color"
        class="legend-swatch"
        :style="{ backgroundColor: band.color }"
        :title="tick(band)"
      />
    </div>

    <div class="legend-axis text-medium-emphasis">
      <span>{{ t('map.shrinking') }}</span>
      <span
        v-for="band in bands.slice(0, -1)"
        :key="`t-${band.color}`"
        class="legend-tick"
      >{{ band.to !== null ? formatNumber(band.to, locale, 2) : '' }}</span>
      <span>{{ t('map.growing') }}</span>
    </div>
  </div>
</template>

<style scoped>
.legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.legend-title {
  font-size: 0.75rem;
}

.legend-unit {
  opacity: 0.75;
}

.legend-scale {
  display: flex;
  /* A 2px surface gap between fills keeps adjacent bands from reading as one
     continuous smear, which is what makes the class breaks legible. */
  gap: 2px;
}

.legend-swatch {
  flex: 1 1 0;
  height: 12px;
  border-radius: 2px;
}

.legend-axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
}

.legend-tick {
  flex: 1 1 0;
  text-align: right;
}
</style>
