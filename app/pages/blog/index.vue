<script setup lang="ts">
const { data: blogIndex } = await useAsyncData("blog-index", () =>
  queryCollection("blog").path("/blog").first()
);

useSeoMeta({
  title: blogIndex.value?.title,
  description: blogIndex.value?.description
})
</script>

<template>
  <ContentRenderer v-if="blogIndex" :value="blogIndex" />
</template>

