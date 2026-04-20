import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";
import Explore from "@/components/Explore.vue";
import Schedule from "@/components/Schedule.vue";
import PaperPage from "@/components/PaperPage.vue";
import ExportPage from "@/components/ExportPage.vue";
import TopicsPage from "@/components/TopicsPage.vue";
import SessionsPage from "@/components/SessionsPage.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "explore", component: Explore },
  { path: "/schedule", name: "schedule", component: Schedule },
  { path: "/paper/:id", name: "paper", component: PaperPage },
  { path: "/export", name: "export", component: ExportPage },
  { path: "/topics", name: "topics", component: TopicsPage },
  { path: "/sessions", name: "sessions", component: SessionsPage },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition || { top: 0 };
  },
});

export default router;
