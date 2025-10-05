// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  vite: { server: { hmr: { host: "3000" } } },
  css: ["~/assets/css/main.css"],
  fonts: {
    provider: "google",
  },
  ui: {
    fonts: true,
  },
  modules: ["@nuxt/eslint", "@nuxt/ui", "@nuxt/content", "@nuxt/fonts"],
});
