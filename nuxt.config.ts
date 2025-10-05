// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  vite: { server: { hmr: { host: "3000" } } },
  css: ["~/assets/css/main.css"],
  fonts: {
    provider: "local",
    families: [{ name: "Sansation", provider: "local" }],
  },
  ui: {
    fonts: true,
  },
  content: {
    build: {
      markdown: {
        highlight: {
          theme: "github-dark",
          langs: ["sql", "ts", "php"],
        },
      },
    },
  },
  modules: ["@nuxt/eslint", "@nuxt/ui", "@nuxt/content", "@nuxt/fonts"],
});
