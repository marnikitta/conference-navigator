import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { usePapersStore } from "./stores/papers";
import "./style.css";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");

document.getElementById("app")?.classList.add("mounted");

void usePapersStore().load();
