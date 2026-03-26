import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import AppLayout from '@/components/layout/AppLayout.vue';

const routes: RouteRecordRaw[] = [{ path: '/', name: 'chat', component: AppLayout }];

export default createRouter({
  history: createWebHistory(),
  routes,
});
