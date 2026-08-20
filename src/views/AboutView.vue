<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { usePopulationStore } from '@/stores/population'
import { formatFullDate } from '@/utils/format'

const store = usePopulationStore()
const { t, locale } = useI18n()

const REPO = 'https://github.com/bethadata/austria-population-tracker'
const POWER_SIM = 'https://bethadata.github.io/austria-power-sim/'
const LICENCE = 'https://creativecommons.org/licenses/by/4.0/deed.de'

const generated = computed(() =>
  store.manifest ? formatFullDate(store.manifest.generated_at, locale.value) : null,
)
</script>

<template>
  <v-container fluid class="pa-4">
    <v-row>
      <v-col cols="12">
        <!-- ABOUT -->
        <v-card class="ps-4 mb-4" elevation="2">
          <v-card-title>{{ t('about_page.about.title') }}</v-card-title>

          <v-card-text>
            <p class="mb-3">{{ t('about_page.about.intro_1') }}</p>
            <p>{{ t('about_page.about.intro_2') }}</p>

            <v-alert type="info" variant="tonal" class="mb-6 mt-6">
              <i18n-t keypath="about_page.about.github_text" scope="global">
                <template #link>
                  <a
                    :href="REPO"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary font-weight-medium"
                  >
                    {{ t('about_page.about.github_link') }}
                  </a>
                </template>
              </i18n-t>
            </v-alert>

            <v-alert type="success" variant="tonal" class="mb-6 mt-6">
              <i18n-t keypath="about_page.about.tracker_text" scope="global">
                <template #link>
                  <a
                    :href="POWER_SIM"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary font-weight-medium"
                  >
                    {{ t('about_page.about.tracker_link') }}
                  </a>
                </template>
              </i18n-t>
            </v-alert>
          </v-card-text>
        </v-card>

        <!-- DATA -->
        <v-card class="ps-4 mb-4" elevation="2">
          <v-card-title>{{ t('about_page.data.title') }}</v-card-title>

          <v-card-text>
            <p class="mb-3">{{ t('about_page.data.source_text') }}</p>
            <p class="mb-3">{{ t('about_page.data.reference_text') }}</p>
            <p class="mb-3">{{ t('about_page.data.validation_text') }}</p>

            <i18n-t keypath="about_page.data.licence_text" tag="p" scope="global">
              <template #link>
                <a :href="LICENCE" target="_blank" rel="noopener noreferrer" class="text-primary">
                  {{ t('about_page.data.licence_link') }}
                </a>
              </template>
            </i18n-t>

            <v-list v-if="store.manifest" density="compact" class="mt-4 bg-transparent">
              <v-list-item>
                <v-list-item-title class="text-caption text-medium-emphasis">
                  {{ t('about_page.data.vintage') }}
                </v-list-item-title>
                <v-list-item-subtitle>{{ store.manifest.source_vintage }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <v-list-item-title class="text-caption text-medium-emphasis">
                  {{ t('about_page.data.generated') }}
                </v-list-item-title>
                <v-list-item-subtitle>{{ generated }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>

        <!-- PRIVACY -->
        <v-card class="ps-4 mb-4" elevation="2">
          <v-card-title>{{ t('about_page.privacy.title') }}</v-card-title>

          <v-card-text>
            <i18n-t keypath="about_page.privacy.text" tag="p" scope="global">
              <template #link1>
                <a
                  href="https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#data-collection"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ t('about_page.privacy.link1') }}
                </a>
              </template>
              <template #link2>
                <a
                  href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ t('about_page.privacy.link2') }}
                </a>
              </template>
            </i18n-t>
          </v-card-text>
        </v-card>

        <!-- DISCLAIMER -->
        <v-card class="ps-4 mb-4" elevation="2">
          <v-card-title>{{ t('about_page.disclaimer.title') }}</v-card-title>

          <v-card-text>
            <p class="mb-3">{{ t('about_page.disclaimer.text_1') }}</p>
            <p class="mb-3">{{ t('about_page.disclaimer.text_2') }}</p>
            <p>{{ t('about_page.disclaimer.text_3') }}</p>
          </v-card-text>
        </v-card>

        <!-- AI DISCLAIMER -->
        <v-card class="ps-4 mb-4" elevation="2">
          <v-card-title>{{ t('about_page.ai.title') }}</v-card-title>

          <v-card-text>
            <p>{{ t('about_page.ai.text') }}</p>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
