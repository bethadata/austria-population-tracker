import { createRouter, createWebHashHistory } from 'vue-router'

// Hash history: GitHub Pages serves static files with no rewrite rules, so a
// deep link under history mode would 404 on reload.
export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'map', component: () => import('@/views/MapView.vue') },
    { path: '/list', name: 'list', component: () => import('@/views/ListView.vue') },
    { path: '/about', name: 'about', component: () => import('@/views/AboutView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
