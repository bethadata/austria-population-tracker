<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAppTheme } from '@/composables/useTheme'
import { setLocale, type Locale } from '@/i18n'
import { usePopulationStore } from '@/stores/population'

const store = usePopulationStore()
const { mode, toggle, restore } = useAppTheme()
const { t, locale } = useI18n()

const drawer = ref(true)

const NAV = [
  { to: '/', key: 'map', icon: 'mdi-map-outline' },
  { to: '/list', key: 'list', icon: 'mdi-format-list-bulleted' },
  { to: '/about', key: 'about', icon: 'mdi-information-outline' },
]

// v-btn-toggle emits the raw value, so narrow it here rather than casting
// at the call site.
function switchLocale(next: unknown) {
  if (next === 'de' || next === 'en') setLocale(next as Locale)
}

onMounted(async () => {
  restore()
  document.documentElement.lang = locale.value
  await store.init()
})
</script>

<template>
  <v-app>
    <v-app-bar flat density="comfortable" border="b">
      <v-app-bar-nav-icon @click="drawer = !drawer" />
      <v-app-bar-title class="font-weight-medium">{{ t('app.title') }}</v-app-bar-title>

      <v-spacer />

      <v-btn-toggle
        :model-value="locale"
        density="compact"
        variant="outlined"
        divided
        mandatory
        class="mr-2"
        @update:model-value="switchLocale"
      >
        <v-btn value="de" size="small">DE</v-btn>
        <v-btn value="en" size="small">EN</v-btn>
      </v-btn-toggle>

      <v-btn
        :icon="mode === 'dark' ? 'mdi-weather-sunny' : 'mdi-weather-night'"
        variant="text"
        :aria-label="t('nav.theme')"
        @click="toggle"
      />
    </v-app-bar>

    <v-navigation-drawer v-model="drawer" :width="220">
      <v-list nav density="comfortable">
        <v-list-item
          v-for="item in NAV"
          :key="item.to"
          :to="item.to"
          :prepend-icon="item.icon"
          :title="t(`nav.${item.key}`)"
          color="primary"
        />
      </v-list>

      <template #append>
        <div class="pa-4 text-caption text-medium-emphasis">
          <div>{{ t('footer.source') }}</div>
          <div v-if="store.manifest?.source_vintage">
            {{ t('footer.data_as_of', { date: store.manifest.source_vintage }) }}
          </div>
        </div>
      </template>
    </v-navigation-drawer>

    <v-main>
      <v-alert v-if="store.error" type="error" variant="tonal" class="ma-4">
        {{ t('app.error') }} — {{ store.error }}
      </v-alert>

      <div v-else-if="!store.ready" class="d-flex justify-center align-center pa-16">
        <v-progress-circular indeterminate size="42" class="mr-4" />
        <span class="text-medium-emphasis">{{ t('app.loading') }}</span>
      </div>

      <router-view v-else />
    </v-main>
  </v-app>
</template>
