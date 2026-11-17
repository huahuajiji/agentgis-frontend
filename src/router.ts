import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import AppLayout from './layouts/AppLayout.vue';
import type { NavSection } from './types';

type NavRouteMeta = {
  section: NavSection;
};

const navRoutes = [
  { path: '/map', name: 'map', section: '地图' },
  { path: '/project', name: 'project', section: '项目' },
  { path: '/data', name: 'data', section: '数据' }
] satisfies Array<{ path: string; name: string; section: NavSection }>;

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/map' },
  ...navRoutes.map((route) => ({
    path: route.path,
    name: route.name,
    component: AppLayout,
    meta: { section: route.section } satisfies NavRouteMeta
  }))
];

export const router = createRouter({
  // GitHub Pages / 静态托管刷新兼容：用 hash 模式，路径形如 /#/map
  history: createWebHashHistory(),
  routes
});
