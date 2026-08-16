<script setup lang="ts">
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAppTheme } from '@/composables/useTheme'
import { usePopulationStore } from '@/stores/population'
import type { Level } from '@/types/data'
import { formatNumber, formatPercent } from '@/utils/format'
import { CHROME, divergingStops } from '@/utils/palette'

const store = usePopulationStore()
const { mode } = useAppTheme()
const { t, locale } = useI18n()

const container = ref<HTMLDivElement | null>(null)
const map = shallowRef<MapLibreMap | null>(null)
const hovered = ref<string | null>(null)
const loading = ref(true)

const SOURCE = 'regions'
const FILL = 'regions-fill'
const LINE = 'regions-line'
const SELECTED = 'regions-selected'

// Austria's bounding box, with a little slack so the outline is not flush
// against the canvas edge.
const BOUNDS: [[number, number], [number, number]] = [
  [9.3, 46.2],
  [17.4, 49.2],
]

/**
 * No basemap layer by design: the map shows administrative polygons only. That
 * removes any external tile provider, API key or network dependency, which
 * matters for a static GitHub Pages deployment - and a raster basemap under a
 * choropleth mostly competes with the data for attention anyway.
 */
function baseStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': CHROME[mode.value].plane } },
    ],
  }
}

/** Merge the active metric into the geometry so the fill can read it directly. */
const decorated = computed<GeoJSON.FeatureCollection | null>(() => {
  const geometry = store.geo.get(store.level as Level)
  if (!geometry) return null
  const values = store.metricByCode
  return {
    type: 'FeatureCollection',
    features: geometry.features.map((feature) => {
      const code = String(feature.properties?.code ?? '')
      const region = store.byCode.get(code)
      const value = values.get(code)
      return {
        ...feature,
        id: code,
        properties: {
          code,
          value: value ?? null,
          name: locale.value === 'en' ? region?.name_en : region?.name_de,
        },
      }
    }),
  }
})

function addLayers() {
  const instance = map.value
  if (!instance || !decorated.value) return

  instance.addSource(SOURCE, {
    type: 'geojson',
    data: decorated.value as never,
    promoteId: 'code',
  })

  instance.addLayer({
    id: FILL,
    type: 'fill',
    source: SOURCE,
    paint: {
      // Regions with no computable value (window longer than their series) fall
      // through to the neutral surface rather than to an arbitrary ramp end.
      'fill-color': [
        'case',
        ['==', ['get', 'value'], null],
        CHROME[mode.value].grid,
        ['step', ['get', 'value'], ...divergingStops(mode.value)],
      ] as never,
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.9] as never,
    },
  })

  instance.addLayer({
    id: LINE,
    type: 'line',
    source: SOURCE,
    paint: {
      'line-color': CHROME[mode.value].surface,
      'line-width': 0.6,
    },
  })

  // Selection is drawn as its own layer above the fills so the ring is never
  // clipped by a neighbouring polygon painted after it.
  instance.addLayer({
    id: SELECTED,
    type: 'line',
    source: SOURCE,
    paint: {
      'line-color': CHROME[mode.value].primary,
      'line-width': 2.5,
    },
    filter: ['==', ['get', 'code'], store.selected] as never,
  })
}

const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 8 })

function bindInteractions() {
  const instance = map.value
  if (!instance) return

  instance.on('mousemove', FILL, (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    if (!feature) return
    const code = String(feature.properties?.code)

    if (hovered.value && hovered.value !== code) {
      instance.setFeatureState({ source: SOURCE, id: hovered.value }, { hover: false })
    }
    hovered.value = code
    instance.setFeatureState({ source: SOURCE, id: code }, { hover: true })
    instance.getCanvas().style.cursor = 'pointer'

    const value = feature.properties?.value
    const series = store.annual.get(store.level as Level)?.series[code]?.total
    const latest = series ? series[series.length - 1] : null
    popup
      .setLngLat(event.lngLat)
      .setHTML(
        `<div class="map-tip">
           <strong>${feature.properties?.name ?? code}</strong>
           <span>${t('chart.population')}: ${formatNumber(latest ?? null, locale.value)}</span>
           <span>${t('map.legend')}: ${formatPercent(
             typeof value === 'number' ? value : null,
             locale.value,
           )}</span>
         </div>`,
      )
      .addTo(instance)
  })

  instance.on('mouseleave', FILL, () => {
    if (hovered.value) {
      instance.setFeatureState({ source: SOURCE, id: hovered.value }, { hover: false })
    }
    hovered.value = null
    instance.getCanvas().style.cursor = ''
    popup.remove()
  })

  instance.on('click', FILL, (event: MapLayerMouseEvent) => {
    const code = event.features?.[0]?.properties?.code
    if (code) store.selected = String(code)
  })
}

async function ensureData() {
  loading.value = true
  await Promise.all([store.ensureLevel(store.level as Level), store.ensureGeo(store.level as Level)])
  loading.value = false
}

onMounted(async () => {
  await ensureData()
  if (!container.value) return

  const instance = new MapLibreMap({
    container: container.value,
    style: baseStyle(),
    bounds: BOUNDS,
    fitBoundsOptions: { padding: 24 },
    attributionControl: false,
  })
  instance.addControl(new NavigationControl({ showCompass: false }), 'top-right')
  instance.addControl(
    new AttributionControl({ compact: true, customAttribution: '© Statistik Austria' }),
  )

  instance.on('load', () => {
    map.value = instance
    addLayers()
    bindInteractions()
  })
})

onBeforeUnmount(() => {
  popup.remove()
  map.value?.remove()
  map.value = null
})

// Level change swaps both geometry and values; rebuild the source data wholesale.
watch(
  () => store.level,
  async () => {
    await ensureData()
    const source = map.value?.getSource(SOURCE) as GeoJSONSource | undefined
    if (source && decorated.value) source.setData(decorated.value as never)
  },
)

// Metric / window changes only alter values, so a setData is enough.
watch(decorated, (value) => {
  const source = map.value?.getSource(SOURCE) as GeoJSONSource | undefined
  if (source && value) source.setData(value as never)
})

watch(
  () => store.selected,
  (code) => {
    if (map.value?.getLayer(SELECTED)) {
      map.value.setFilter(SELECTED, ['==', ['get', 'code'], code] as never)
    }
  },
)

// Theme is a full repaint: background, fills and strokes all move together.
watch(mode, (value) => {
  const instance = map.value
  if (!instance) return
  instance.setPaintProperty('bg', 'background-color', CHROME[value].plane)
  instance.setPaintProperty(FILL, 'fill-color', [
    'case',
    ['==', ['get', 'value'], null],
    CHROME[value].grid,
    ['step', ['get', 'value'], ...divergingStops(value)],
  ] as never)
  instance.setPaintProperty(LINE, 'line-color', CHROME[value].surface)
  instance.setPaintProperty(SELECTED, 'line-color', CHROME[value].primary)
})

function resetView() {
  map.value?.fitBounds(BOUNDS, { padding: 24 })
}

defineExpose({ resetView })
</script>

<template>
  <div class="map-wrap">
    <div ref="container" class="map-canvas" />
    <v-overlay :model-value="loading" contained persistent class="align-center justify-center">
      <v-progress-circular indeterminate size="40" />
    </v-overlay>
    <v-btn
      class="map-reset"
      size="small"
      variant="tonal"
      prepend-icon="mdi-fit-to-screen-outline"
      @click="resetView"
    >
      {{ t('map.reset') }}
    </v-btn>
  </div>
</template>

<style scoped>
.map-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 380px;
}

.map-canvas {
  width: 100%;
  height: 100%;
}

.map-reset {
  position: absolute;
  left: 8px;
  bottom: 8px;
}
</style>

<style>
.map-tip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font: 12px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif;
}

.maplibregl-popup-content {
  padding: 8px 10px;
  border-radius: 6px;
}
</style>
