<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { usePopulationStore } from '@/stores/population'
import { BLUESKY, REPO } from '@/utils/links'

const store = usePopulationStore()
const { t } = useI18n()
</script>

<template>
  <v-footer app border="t" class="footer-bar px-4 py-0">
    <div class="text-body-small text-medium-emphasis text-truncate">
      <span>{{ t('footer.source') }}</span>
      <!-- The vintage does not fit beside the source on a phone, and the About
           page states it too, so narrow screens get the source line alone. -->
      <span v-if="store.manifest?.source_vintage" class="d-none d-sm-inline">
        &middot; {{ t('footer.data_as_of', { date: store.manifest.source_vintage }) }}
      </span>
    </div>

    <v-spacer />

    <v-btn
      icon="mdi-github"
      variant="text"
      density="comfortable"
      size="small"
      :href="REPO"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="t('footer.github')"
    />

    <v-btn
      variant="text"
      density="comfortable"
      size="small"
      :href="BLUESKY"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="t('footer.bluesky')"
    >
      <!-- Inlined rather than loaded from an .svg file: an <img> renders the SVG as
           its own document, where fill="currentColor" resolves to black, so the icon
           vanishes against the dark theme. Inline it inherits the button's colour. -->
      <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M3.468 1.948C5.303 3.325 7.276 6.118 8 7.616c.725-1.498 2.698-4.29 4.532-5.668C13.855.955 16 .186 16 2.632c0 .489-.28 4.105-.444 4.692-.572 2.04-2.653 2.561-4.504 2.246 3.236.551 4.06 2.375 2.281 4.2-3.376 3.464-4.852-.87-5.23-1.98-.07-.204-.103-.3-.103-.218 0-.081-.033.014-.102.218-.379 1.11-1.855 5.444-5.231 1.98-1.778-1.825-.955-3.65 2.28-4.2-1.85.315-3.932-.205-4.503-2.246C.28 6.737 0 3.12 0 2.632 0 .186 2.145.955 3.468 1.948" />
      </svg>
    </v-btn>
  </v-footer>
</template>

<style scoped>
/* Kept slim deliberately: the map page is sized to fit the viewport and a taller
   bar pushes the map below the fold on a phone. */
.footer-bar {
  min-height: 36px;
}
</style>
