import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import AppLayout from '@/components/layout/AppLayout.vue';
import WelcomeView from '@/views/WelcomeView.vue';
import { useUserSettingsStore } from '@/stores/user-settings.ts';
import config from '@/config.ts';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'chat', component: AppLayout },
  { path: '/welcome', name: 'welcome', component: WelcomeView },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// First-visit guard: send users to /welcome when there is neither a saved
// nickname nor a persisted session. Skips itself to avoid loops. Runs before
// any store reactive state is hydrated, so we read localStorage directly for
// the session check (the irc store hasn't called restoreSession() yet).
router.beforeEach((to) => {
  if (to.name === 'welcome') return true;
  const hasNickname = !!useUserSettingsStore().getProfile().nickname;
  const hasSavedSession = !!localStorage.getItem(config.storageKeys.session);
  if (!hasNickname && !hasSavedSession) {
    return { name: 'welcome' };
  }
  return true;
});

export default router;
