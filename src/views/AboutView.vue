<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { usePopulationStore } from '@/stores/population'
import { formatFullDate } from '@/utils/format'
import { LICENCE, POWER_SIM, REPO, TRANSITION_TRACKER } from '@/utils/links'

const store = usePopulationStore()
const { t, locale } = useI18n()

const generated = computed(() =>
  store.manifest ? formatFullDate(store.manifest.generated_at, locale.value) : null,
)
</script>

<!--
  The About page of all three sites shares one skeleton: a full-width lead card,
  then the site-specific content cards, then privacy, disclaimer and the AI note
  as a row of three. Nothing here is centred in a reading column -- the page is
  cards, and a card of prose keeps its own measure without narrowing the page
  around it.
-->
<template>
  <v-container fluid class="about-page pa-4 pa-md-6">
    <h1 class="text-headline-small mb-4">{{ t('nav.about') }}</h1>

    <!-- ABOUT -->
    <v-card flat border class="mb-4">
      <v-card-title tag="h2" class="text-title-medium pt-4">
        {{ t('about_page.about.title') }}
      </v-card-title>

      <v-card-text class="prose text-body-medium">
        <p>{{ t('about_page.about.intro_1') }}</p>
        <p>{{ t('about_page.about.intro_2') }}</p>

        <!-- One alert, not two: the repository and the sibling projects are the
             same kind of pointer, and stacking two tonal blocks made the card
             read as mostly callout. -->
        <v-alert type="info" variant="tonal" class="mt-4">
          <i18n-t keypath="about_page.about.links_text" scope="global">
            <template #repo>
              <a
                :href="REPO"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary font-weight-medium"
              >
                {{ t('about_page.about.repo_link') }}
              </a>
            </template>
            <template #transition>
              <a
                :href="TRANSITION_TRACKER"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary font-weight-medium"
              >
                {{ t('about_page.about.transition_link') }}
              </a>
            </template>
            <template #power>
              <a
                :href="POWER_SIM"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary font-weight-medium"
              >
                {{ t('about_page.about.power_link') }}
              </a>
            </template>
          </i18n-t>
        </v-alert>
      </v-card-text>
    </v-card>

    <!-- DATA -->
    <v-card flat border class="mb-4">
      <v-card-title tag="h2" class="text-title-medium pt-4">
        {{ t('about_page.data.title') }}
      </v-card-title>

      <v-card-text class="prose text-body-medium">
        <i18n-t keypath="about_page.data.source_text" tag="p" scope="global">
          <template #link>
            <a :href="LICENCE" target="_blank" rel="noopener noreferrer" class="text-primary">
              {{ t('about_page.data.licence_link') }}
            </a>
          </template>
        </i18n-t>

        <p>{{ t('about_page.data.reference_text') }}</p>

        <v-list v-if="store.manifest" density="compact" class="mt-2 bg-transparent">
          <v-list-item>
            <v-list-item-title class="text-body-small text-medium-emphasis">
              {{ t('about_page.data.vintage') }}
            </v-list-item-title>
            <v-list-item-subtitle>{{ store.manifest.source_vintage }}</v-list-item-subtitle>
          </v-list-item>
          <v-list-item>
            <v-list-item-title class="text-body-small text-medium-emphasis">
              {{ t('about_page.data.generated') }}
            </v-list-item-title>
            <v-list-item-subtitle>{{ generated }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <!--
      Privacy, disclaimer and the AI note are short and of equal standing, so
      they sit side by side rather than as three more full-width bands. `h-100`
      is what makes the three cards in a row end at the same edge.
    -->
    <v-row>
      <v-col cols="12" md="4">
        <v-card flat border class="h-100">
          <v-card-title tag="h2" class="text-title-medium pt-4">
            {{ t('about_page.privacy.title') }}
          </v-card-title>

          <v-card-text class="prose text-body-medium">
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
      </v-col>

      <v-col cols="12" md="4">
        <v-card flat border class="h-100">
          <v-card-title tag="h2" class="text-title-medium pt-4">
            {{ t('about_page.disclaimer.title') }}
          </v-card-title>

          <v-card-text class="prose text-body-medium">
            <p>{{ t('about_page.disclaimer.text_1') }}</p>
            <p>{{ t('about_page.disclaimer.text_2') }}</p>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card flat border class="h-100">
          <v-card-title tag="h2" class="text-title-medium pt-4">
            {{ t('about_page.ai.title') }}
          </v-card-title>

          <v-card-text class="prose text-body-medium">
            <p>{{ t('about_page.ai.text') }}</p>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
