// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  vite: { server: { hmr: { host: "3000" } } } ,
  modules: ["@nuxt/content", "@nuxt/eslint"],
});
