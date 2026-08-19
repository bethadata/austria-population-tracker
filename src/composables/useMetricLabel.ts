import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { usePopulationStore } from '@/stores/population'
import type { Window } from '@/types/data'

/**
 * Shared labelling for the active metric and window.
 *
 * The map fill, the ranking column and the region hero all describe the same
 * selection, so they read from one place - otherwise the hero could claim
 * "5 years" while the map is coloured by something else.
 */
export function useMetricLabel() {
  const store = usePopulationStore()
  const { t } = useI18n()

  function windowLabel(w: Window): string {
    return w === 24 ? t('metric.window_since', { year: 2002 }) : t('metric.window_years', { n: w })
  }

  const metricLabel = computed(() => t(`metric.${store.metric}`))

  /** e.g. "Jährliche Wachstumsrate · 5 Jahre" */
  const fullLabel = computed(() => `${metricLabel.value} · ${windowLabel(store.window as Window)}`)

  /** Absolute change is a head count; the other two are percentages. */
  const isPercent = computed(() => store.metric !== 'absolute_change')

  return { windowLabel, metricLabel, fullLabel, isPercent }
}
