<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAppTheme } from '@/composables/useTheme'
import { formatNumber } from '@/utils/format'
import { legendBands } from '@/utils/palette'

const { mode } = useAppTheme()
const { t, locale } = useI18n()

const bands = computed(() => legendBands(mode.value))

/** Full range for each swatch, shown on hover so the ramp stays uncluttered. */
function swatchTitle(band: { from: number | null; to: number | null }): string {
  const unit = t('map.legend_unit')
  if (band.from === null) return `< ${formatNumber(band.to, locale.value, 2)} ${unit}`
  if (band.to === null) return `> ${formatNumber(band.from, locale.value, 2)} ${unit}`
  return `${formatNumber(band.from, locale.value, 2)} … ${formatNumber(band.to, locale.value, 2)} ${unit}`
}

/**
 * Selective ticks, not one per break. Printing all eight collided with the
 * end labels and turned the ramp into a wall of digits; the exact band of any
 * swatch is available on hover, and per-region values in the map tooltip.
 * The extremes carry words rather than numbers because those bands are
 * open-ended anyway.
 */
const ticks = computed(() => [
  t('map.shrinking'),
  formatNumber(-1, locale.value, 2),
  '0',
  formatNumber(1, locale.value, 2),
  t('map.growing'),
])
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
        :title="swatchTitle(band)"
      />
    </div>

    <div class="legend-axis text-medium-emphasis">
      <span v-for="(label, i) in ticks" :key="i">{{ label }}</span>
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
  font-size: 0.7rem;
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
  gap: 6px;
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
